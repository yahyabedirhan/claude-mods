// Resume, /clear and /compact: which status the session holds after each.

import { expect, test } from 'claude-code/testing'
import type { Engine } from 'claude-code/testing'

import {
  PLUGIN,
  SESSION_ID,
  START,
  SURFACES,
  blockedDecision,
  callStatusTool,
  endSession,
  reviewLaterDecision,
  sectionText,
  start,
  surprise,
  world,
} from './world'
import type { World } from './world'

const NEW_SESSION = 'session-new'

function sessionStart($: Engine, source: 'startup' | 'resume' | 'clear' | 'compact', sessionId: string) {
  return $.classic.SessionStart({ source, session_id: sessionId })
}

/** A status saved by an earlier run of the session, with one of everything. */
function savedStatus(sessionId: string, updatedAt = START - 60_000) {
  return {
    version: 1,
    sessionId,
    doingNow: { tool: 'Bash', text: 'Run the tests', at: updatedAt },
    items: [
      {
        kind: 'decision',
        id: 'D1',
        urgency: 'blocked',
        question: 'Which database do we use?',
        options: ['Postgres', 'SQLite'],
        default: 'Postgres',
        unblocks: 'Pick one database',
        recordedAt: updatedAt,
      },
      {
        kind: 'decision',
        id: 'D2',
        urgency: 'review_later',
        question: 'Which name does the flag get?',
        options: ['--fast', '--quick'],
        default: '--fast',
        unblocks: 'Confirm or change the name',
        recordedAt: updatedAt,
        resolvedAt: updatedAt,
      },
      {
        kind: 'surprise',
        id: 'S1',
        occurred: 'The API has no batch endpoint',
        changed: 'Each item is sent in its own request',
        recordedAt: updatedAt,
      },
    ],
    tasks: [{ id: '1', subject: 'Build the pane', status: 'in_progress', at: updatedAt }],
    progress: { done: 0, total: 1, current: 'Build the pane' },
    links: [
      {
        kind: 'pr',
        repo: 'octo/repo',
        number: 7,
        url: 'https://github.com/octo/repo/pull/7',
        at: updatedAt,
      },
    ],
    subagents: { running: [], finished: ['agent-1'] },
    updatedAt,
  }
}

test('resume restores the saved status of the resumed session', async ($, on) => {
  world(on, { saved: { [SESSION_ID]: savedStatus(SESSION_ID) } })
  await start($)
  await sessionStart($, 'resume', SESSION_ID)

  for (const surface of SURFACES) {
    expect(await sectionText($, surface, 'blocked')).toContain('Which database do we use?')
    expect(await sectionText($, surface, 'surprises')).toContain('The API has no batch endpoint')
    expect(await sectionText($, surface, 'links')).toContain('repo#7')
    expect(await sectionText($, surface, 'counters')).toContain('1 finished')
  }
})

test('the first change after a resume builds on the saved status', async ($, on) => {
  const { saved } = world(on, { saved: { [SESSION_ID]: savedStatus(SESSION_ID) } })
  await start($)
  await $.tool.call({ tool: 'Bash', command: 'git status' })

  expect(saved[SESSION_ID]).toMatchObject({
    items: savedStatus(SESSION_ID).items,
    tasks: savedStatus(SESSION_ID).tasks,
    links: savedStatus(SESSION_ID).links,
    doingNow: { text: 'git status' },
    updatedAt: START,
  })
})

test('a decision recorded after a resume takes the next id', async ($, on) => {
  world(on, { saved: { [SESSION_ID]: savedStatus(SESSION_ID) } })
  await start($)
  await sessionStart($, 'resume', SESSION_ID)

  expect(await callStatusTool($, blockedDecision({ question: 'Ship today?' }))).toMatchObject({
    result: expect.stringContaining('D3'),
  })
})

test('/clear starts a new status that keeps only the open decisions', async ($, on) => {
  const { saved, switchSession } = world(on, { saved: { [SESSION_ID]: savedStatus(SESSION_ID) } })
  await start($)
  await sessionStart($, 'resume', SESSION_ID)
  switchSession(NEW_SESSION)
  await sessionStart($, 'clear', NEW_SESSION)

  expect(saved[NEW_SESSION]).toEqual({
    version: 1,
    sessionId: NEW_SESSION,
    doingNow: null,
    items: [savedStatus(SESSION_ID).items[0]],
    tasks: [],
    progress: null,
    links: [],
    subagents: { running: [], finished: [] },
    endListPostedAt: null,
    observer: { checks: 0, seen: [] },
    effort: null,
    updatedAt: START,
  })
  for (const surface of SURFACES) {
    expect(await sectionText($, surface, 'blocked')).toContain('Which database do we use?')
    expect(await sectionText($, surface, 'surprises')).toBeUndefined()
    expect(await sectionText($, surface, 'links')).toBeUndefined()
  }
})

test('a resumed status with items opens the pane', async ($, on) => {
  const { panes } = world(on, { saved: { [SESSION_ID]: savedStatus(SESSION_ID) } })
  await start($)
  expect(panes.has(PLUGIN)).toBe(false)

  await sessionStart($, 'resume', SESSION_ID)

  expect(panes.has(PLUGIN)).toBe(true)
})

test('/clear carries the effort over to the new session', async ($, on) => {
  const { saved, switchSession } = world(on, {
    saved: { [SESSION_ID]: { ...savedStatus(SESSION_ID), effort: { name: 'session-status', from: 'label' } } },
  })
  await start($)
  await sessionStart($, 'resume', SESSION_ID)
  switchSession(NEW_SESSION)
  await sessionStart($, 'clear', NEW_SESSION)

  expect(saved[NEW_SESSION]).toMatchObject({ effort: { name: 'session-status', from: 'label' } })
})

/**
 * Records D1 (blocked), D2 (review later, then resolved) and S1 under the
 * first session, then runs a `/clear` that empties `$.state`: the old
 * session ends, the process moves to NEW_SESSION.
 */
async function clearWithEmptyState($: Engine, w: World) {
  await callStatusTool($, blockedDecision())
  await callStatusTool($, reviewLaterDecision())
  await callStatusTool($, surprise())
  await callStatusTool($, { action: 'resolve', id: 'D2' })
  await endSession($, SESSION_ID)
  w.switchSession(NEW_SESSION)
  w.forgetState()
}

test('/clear carries the open decisions when $.state comes through empty', async ($, on) => {
  const w = world(on)
  const { saved, panes } = w
  await start($)
  await clearWithEmptyState($, w)
  panes.clear()

  await sessionStart($, 'clear', NEW_SESSION)

  expect(saved[NEW_SESSION]).toMatchObject({
    sessionId: NEW_SESSION,
    items: [{ kind: 'decision', id: 'D1', urgency: 'blocked' }],
  })
  expect((saved[NEW_SESSION] as { items: unknown[] }).items).toHaveLength(1)
  expect(saved['clear-carry']).toBeUndefined()
  // The carried decision opens the pane again.
  expect(panes.has(PLUGIN)).toBe(true)
  for (const surface of SURFACES) {
    expect(await sectionText($, surface, 'blocked')).toContain('Which database do we use?')
    expect(await sectionText($, surface, 'surprises')).toBeUndefined()
  }
})

test('/clear carries the effort when $.state comes through empty', async ($, on) => {
  const w = world(on)
  const { saved } = w
  await start($)
  await $.tool.call({ tool: 'Bash', command: 'gh issue list --label effort:session-status' })
  await clearWithEmptyState($, w)

  await sessionStart($, 'clear', NEW_SESSION)

  expect(saved[NEW_SESSION]).toMatchObject({ effort: { name: 'session-status' } })
})

test('a change before the SessionStart of a /clear still gets the carry', async ($, on) => {
  const w = world(on)
  const { saved } = w
  await start($)
  await clearWithEmptyState($, w)
  await $.tool.call({ tool: 'Bash', command: 'git diff' })

  await sessionStart($, 'clear', NEW_SESSION)

  expect(saved[NEW_SESSION]).toMatchObject({
    items: [{ kind: 'decision', id: 'D1' }],
    doingNow: { text: 'git diff' },
  })
})

test('a startup never takes the carry a /clear left', async ($, on) => {
  const w = world(on)
  const { saved } = w
  await start($)
  await clearWithEmptyState($, w)

  await sessionStart($, 'startup', NEW_SESSION)
  await $.tool.call({ tool: 'Bash', command: 'git status' })

  expect(saved[NEW_SESSION]).toMatchObject({ items: [] })
})

test('a carry older than a minute is not taken', async ($, on) => {
  const w = world(on)
  const { clock, saved } = w
  await start($)
  await clearWithEmptyState($, w)
  await clock.advance(61_000)

  await sessionStart($, 'clear', NEW_SESSION)
  await $.tool.call({ tool: 'Bash', command: 'git status' })

  expect(saved[NEW_SESSION]).toMatchObject({ items: [] })
  expect(saved['clear-carry']).toBeUndefined()
})

test('a /clear with nothing open leaves no carry behind', async ($, on) => {
  const w = world(on)
  const { saved } = w
  await start($)
  await clearWithEmptyState($, w)
  // The new session ends by /clear too before it takes the carry: it has nothing open.
  await endSession($, NEW_SESSION)

  expect(saved['clear-carry']).toBeUndefined()
})

test('an exit leaves no carry', async ($, on) => {
  const { saved } = world(on)
  await start($)
  await callStatusTool($, blockedDecision())

  await endSession($, SESSION_ID, 'prompt_input_exit')

  expect(saved['clear-carry']).toBeUndefined()
})

test('/clear leaves the old session saved as it was', async ($, on) => {
  const { saved, switchSession } = world(on)
  await start($)
  await callStatusTool($, blockedDecision())
  await callStatusTool($, surprise())
  const before = saved[SESSION_ID]
  switchSession(NEW_SESSION)
  await sessionStart($, 'clear', NEW_SESSION)
  await callStatusTool($, reviewLaterDecision())

  expect(saved[SESSION_ID]).toEqual(before)
  expect(saved[NEW_SESSION]).toMatchObject({
    sessionId: NEW_SESSION,
    items: [
      { kind: 'decision', id: 'D1', urgency: 'blocked' },
      { kind: 'decision', id: 'D2', urgency: 'review_later' },
    ],
  })
})

test('a change under a new session id starts a new status even without its SessionStart', async ($, on) => {
  const { saved, switchSession } = world(on)
  await start($)
  await callStatusTool($, blockedDecision())
  await callStatusTool($, surprise())
  await $.tool.call({ tool: 'Bash', command: 'git status' })
  const before = saved[SESSION_ID]
  switchSession(NEW_SESSION)
  await $.tool.call({ tool: 'Bash', command: 'git diff' })

  expect(saved[SESSION_ID]).toEqual(before)
  expect(saved[NEW_SESSION]).toMatchObject({
    sessionId: NEW_SESSION,
    items: [{ kind: 'decision', id: 'D1' }],
    doingNow: { text: 'git diff' },
  })
})

test('/compact keeps all status', async ($, on) => {
  const { saved } = world(on)
  await start($)
  await callStatusTool($, blockedDecision())
  await callStatusTool($, surprise())
  await $.classic.TaskCreated({ task_id: '1', task_subject: 'Build the pane' })
  const before = saved[SESSION_ID]
  await $.classic.PreCompact({ trigger: 'manual', custom_instructions: null })
  await sessionStart($, 'compact', SESSION_ID)
  await $.classic.PostCompact({ trigger: 'manual', compact_summary: 'Summary' })

  expect(saved[SESSION_ID]).toEqual(before)
  for (const surface of SURFACES) {
    expect(await sectionText($, surface, 'blocked')).toContain('Which database do we use?')
    expect(await sectionText($, surface, 'surprises')).toContain('The API has no batch endpoint')
    expect(await sectionText($, surface, 'progress')).toContain('0/1')
  }
})

test('a session start that runs again keeps one age timer', async ($, on) => {
  const { clock } = world(on)
  let ticks = 0
  on('state.set', (_$, e, next) => {
    if (e.key === 'tick') {
      ticks += 1
    }

    return next(e)
  })
  await start($)
  await start($)
  // The first recorded decision opens the pane.
  await callStatusTool($, blockedDecision())
  await clock.advance(15_000)

  expect(ticks).toBe(1)
})

test('the store keeps the newest 30 sessions', async ($, on) => {
  const older: Record<string, unknown> = {}
  for (let n = 1; n <= 30; n += 1) {
    older[`old-${n}`] = savedStatus(`old-${n}`, START - 1_000_000 + n)
  }
  const { saved } = world(on, { saved: older })
  await start($)
  await $.tool.call({ tool: 'Bash', command: 'git status' })

  const keys = Object.keys(saved)
  expect(keys).toHaveLength(30)
  expect(keys).toContain(SESSION_ID)
  expect(keys).not.toContain('old-1')
  expect(keys).toContain('old-2')
})

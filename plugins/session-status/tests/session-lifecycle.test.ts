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
  decisionBeforeSettling,
  sectionText,
  start,
  surprise,
  world,
} from './world'

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
        urgency: 'before_settling',
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

test('/clear starts a new, empty status and leaves the old session saved as it was', async ($, on) => {
  const w = world(on)
  const { saved, switchSession } = w
  await start($)
  await $.tool.call({ tool: 'Bash', command: 'gh issue list --label effort:session-status' })
  await callStatusTool($, blockedDecision())
  await callStatusTool($, surprise())
  const before = saved[SESSION_ID]
  switchSession(NEW_SESSION)
  w.forgetState()

  await sessionStart($, 'clear', NEW_SESSION)

  expect(saved[NEW_SESSION]).toBeUndefined()
  for (const surface of SURFACES) {
    expect(await sectionText($, surface, 'blocked')).toBeUndefined()
    expect(await sectionText($, surface, 'surprises')).toBeUndefined()
  }

  await callStatusTool($, decisionBeforeSettling())

  expect(saved[SESSION_ID]).toEqual(before)
  expect(saved[NEW_SESSION]).toMatchObject({
    sessionId: NEW_SESSION,
    items: [{ kind: 'decision', id: 'D1', urgency: 'before_settling' }],
    effort: null,
    ticketReports: [],
    sessionItems: [],
  })
  expect((saved[NEW_SESSION] as { items: unknown[] }).items).toHaveLength(1)
})


test('a resumed status with items opens the pane', async ($, on) => {
  const { panes } = world(on, { saved: { [SESSION_ID]: savedStatus(SESSION_ID) } })
  await start($)
  expect(panes.has(PLUGIN)).toBe(false)

  await sessionStart($, 'resume', SESSION_ID)

  expect(panes.has(PLUGIN)).toBe(true)
})


test('a change under a new session id without a /clear starts an empty status', async ($, on) => {
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
    items: [],
    doingNow: { text: 'git diff' },
  })
})

test('a resume of a session with no saved status takes none of the open decisions', async ($, on) => {
  const { saved, switchSession } = world(on)
  await start($)
  await callStatusTool($, blockedDecision())
  switchSession(NEW_SESSION)

  await sessionStart($, 'resume', NEW_SESSION)

  for (const surface of SURFACES) {
    expect(await sectionText($, surface, 'blocked')).toBeUndefined()
  }
  await $.tool.call({ tool: 'Bash', command: 'git status' })
  expect(saved[NEW_SESSION]).toMatchObject({ sessionId: NEW_SESSION, items: [] })
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
    expect(await sectionText($, surface, 'session')).toContain('Tasks 0/1')
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

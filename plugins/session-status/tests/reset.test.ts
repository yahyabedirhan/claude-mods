import { expect, test } from 'claude-code/testing'

import type { SessionStatus, StatusItem } from '../types'
import { INSTRUCTIONS } from '../hooks/instructions'
import { listText, matchesFilter } from '../hooks/reset'
import type { ListFilter, ListKind } from '../hooks/reset'
import { emptyStatus } from '../hooks/status'
import { readStatusToolInput } from '../hooks/status-tool'

import {
  SESSION_ID,
  STATUS_TOOL,
  callStatusTool,
  decisionBeforeSettling,
  ghIssue,
  runCommand,
  sectionText,
  start,
  subagentToolCall,
  world,
} from './world'

const EFFORT = 'launch'

/** A session with two items, an effort with a reported ticket and an open decision. */
async function sessionWithProgress($: Parameters<typeof start>[0]) {
  await start($)
  await callStatusTool($, { action: 'item', state: 'added', title: 'Write the parser' })
  await callStatusTool($, { action: 'item', state: 'added', title: 'Ship it' })
  await callStatusTool($, { action: 'item', state: 'done', id: 'I1' })
  await callStatusTool($, { action: 'ticket', state: 'landed', number: 3, title: 'Play a video', effort: EFFORT })
  await callStatusTool($, decisionBeforeSettling())
}

test('/session-status reset clears everything, open decisions too, and ids start over', async ($, on) => {
  const w = world(on, { issues: [ghIssue(3, 'Play a video', 'OPEN', EFFORT), ghIssue(4, 'Pause', 'OPEN', EFFORT)] })
  await sessionWithProgress($)
  expect(await sectionText($, 'terminal', 'session')).toContain('Ship it')

  const reply = await runCommand($, 'reset')

  expect(reply.text).toBe(
    'Session status reset: removed 2 session items, 1 decision, surprise or blocker, 1 ticket report and the effort launch. Everything starts over.',
  )
  expect(w.saved[SESSION_ID]).toMatchObject({ sessionItems: [], ticketReports: [], effort: null, tickets: null })
  expect(w.saved[SESSION_ID]).toMatchObject({ items: [], links: [], endListPostedAt: null })
  const session = (await sectionText($, 'terminal', 'session')) ?? ''
  expect(session).not.toContain('Progress')
  expect(session).not.toContain('Ship it')
  expect(await sectionText($, 'terminal', 'effort')).toBeUndefined()
  expect((await callStatusTool($, { action: 'item', state: 'added', title: 'Fresh' })).result).toBe(
    'Added item I1 Fresh. Session: 0/1 done.',
  )
  expect((await callStatusTool($, decisionBeforeSettling())).result).toMatch(/^Recorded decision D1/)
})

test('a reset with no progress says that nothing changed', async ($, on) => {
  world(on)
  await start($)

  expect((await runCommand($, 'reset')).text).toBe('Session status was empty already. Nothing changed.')
})

test('/session-status with an unknown argument names the two forms and leaves the pane closed', async ($, on) => {
  const { panes } = world(on)
  await start($)

  const reply = await runCommand($, 'wipe')

  expect(reply.text).toMatch(/Unknown argument "wipe"/)
  expect(reply.text).toMatch(/\/session-status reset/)
  expect(panes.size).toBe(0)
})

test('the reset action does what the command does, and a subagent cannot call it', async ($, on) => {
  const w = world(on)
  await sessionWithProgress($)

  expect((await subagentToolCall($, 'agent-1', { tool: STATUS_TOOL, action: 'reset' } as never)).deny).toMatch(
    /Only the main session/,
  )
  expect((await callStatusTool($, { action: 'reset' })).result).toMatch(/^Session status reset: removed 2 session items/)
  expect(w.saved[SESSION_ID]).toMatchObject({ sessionItems: [], effort: null })
})

test('list names the open and closed ids of the session', async ($, on) => {
  world(on)
  await sessionWithProgress($)

  const reply = (await callStatusTool($, { action: 'list' })).result

  expect(reply).toBe(
    [
      'Session items:',
      '- I2 Ship it (open)',
      '- I1 Write the parser (done)',
      'Decisions:',
      `- D1 ${decisionBeforeSettling().question} (before_settling)`,
      'Effort:',
      '- launch',
      'Reported tickets:',
      '- #3 Play a video (landed)',
    ].join('\n'),
  )
})

test('list on an empty status says so, and changes nothing', async ($, on) => {
  const w = world(on)
  await start($)

  expect((await callStatusTool($, { action: 'list' })).result).toBe('Nothing is open, and the session has no progress.')
  expect(w.saved[SESSION_ID]).toBeUndefined()
})

test('the status tool and the prompt describe list and reset', async ($, on) => {
  const { tools } = world(on)
  await start($)

  const tool = tools.get(STATUS_TOOL)
  expect(tool?.inputSchema).toMatchObject({ properties: { action: { enum: expect.arrayContaining(['list', 'reset']) } } })
  expect(tool?.description).toMatch(/`reset`: only when the user explicitly asks/)
  expect(tool?.description).toMatch(/never because of `\/clear`/)
  expect(tool?.description).toMatch(/Give `filter` to read only what the user asks for/)
  expect(tool?.inputSchema).toMatchObject({ properties: { filter: { properties: { kind: {}, state: {}, id: {} } } } })
  expect(INSTRUCTIONS.text).toMatch(/call `list` with a `filter`/)
})

/** A status with an entry of each kind, open and closed. */
function statusOfEveryKind(): SessionStatus {
  const at = 1
  const decision = (id: string, question: string, resolvedAt?: number): StatusItem => ({
    kind: 'decision',
    id,
    urgency: 'before_settling',
    question,
    options: ['Yes', 'No'],
    default: 'Yes',
    unblocks: 'Say yes or no.',
    recordedAt: at,
    ...(resolvedAt === undefined ? {} : { resolvedAt }),
  })
  const surprise = (id: string, occurred: string, extra: { source?: 'observer'; resolvedAt?: number } = {}): StatusItem => ({
    kind: 'surprise',
    id,
    occurred,
    changed: 'The plan changed.',
    recordedAt: at,
    ...extra,
  })

  return {
    ...emptyStatus(SESSION_ID),
    sessionItems: [
      { id: 'I1', title: 'Write the parser', state: 'done', addedAt: at, at },
      { id: 'I2', title: 'Ship it', state: 'added', addedAt: at, at },
      { id: 'I3', title: 'Old plan', state: 'dropped', addedAt: at, at },
    ],
    items: [
      decision('D1', 'Merge now?'),
      decision('D2', 'Use bun?', at),
      { kind: 'blocker', id: 'B1', failed: 'The push was denied.', needs: 'Allow the push.', recordedAt: at },
      { kind: 'blocker', id: 'B2', failed: 'The tests did not run.', needs: 'Restart.', recordedAt: at, resolvedAt: at },
      surprise('S1', 'The API changed.'),
      surprise('S2', 'The cache was stale.', { resolvedAt: at }),
      surprise('S3', 'The agent looped on a test.', { source: 'observer' }),
      surprise('S4', 'The agent skipped the review.', { source: 'observer', resolvedAt: at }),
    ],
    effort: { name: EFFORT } as SessionStatus['effort'],
    ticketReports: [
      { number: 3, title: 'Play a video', state: 'landed', at, effort: EFFORT },
      { number: 4, title: 'Pause', state: 'started', at, effort: EFFORT },
    ],
  }
}

const filter = (f: { kinds?: ListKind[]; state?: ListFilter['state']; ids?: string[] }): ListFilter => ({
  kinds: f.kinds === undefined ? null : new Set(f.kinds),
  state: f.state ?? 'open',
  ids: f.ids === undefined ? null : new Set(f.ids),
})

test('list without a filter keeps its text, with observations in their own group', () => {
  expect(listText(statusOfEveryKind(), null)).toBe(
    [
      'Session items:',
      '- I2 Ship it (open)',
      '- I1 Write the parser (done)',
      'Decisions:',
      '- D1 Merge now? (before_settling)',
      'Blockers:',
      '- B1 The push was denied.',
      'Surprises:',
      '- S1 The API changed.',
      'Observations:',
      '- S3 The agent looped on a test.',
      'Effort:',
      '- launch',
      'Reported tickets:',
      '- #3 Play a video (landed)',
      '- #4 Pause (started)',
    ].join('\n'),
  )
})

test('a filter with no keys lists every open entry and the effort', () => {
  expect(listText(statusOfEveryKind(), filter({}))).toBe(
    [
      'Session items:',
      '- I2 Ship it (open)',
      'Decisions:',
      '- D1 Merge now? (before_settling)',
      'Blockers:',
      '- B1 The push was denied.',
      'Surprises:',
      '- S1 The API changed.',
      'Observations:',
      '- S3 The agent looped on a test.',
      'Effort:',
      '- launch',
      'Reported tickets:',
      '- #4 Pause (started)',
    ].join('\n'),
  )
})

test('kind keeps the entries of the kinds it names, and observations are not surprises', () => {
  const status = statusOfEveryKind()

  expect(listText(status, filter({ kinds: ['observation'] }))).toBe('Observations:\n- S3 The agent looped on a test.')
  expect(listText(status, filter({ kinds: ['surprise'] }))).toBe('Surprises:\n- S1 The API changed.')
  expect(listText(status, filter({ kinds: ['blocker', 'ticket'] }))).toBe(
    'Blockers:\n- B1 The push was denied.\nReported tickets:\n- #4 Pause (started)',
  )
})

test('state closed keeps the resolved, dismissed, done, dropped and landed entries', () => {
  expect(listText(statusOfEveryKind(), filter({ state: 'closed', kinds: ['item', 'decision', 'blocker', 'surprise', 'observation', 'ticket'] }))).toBe(
    [
      'Session items:',
      '- I1 Write the parser (done)',
      '- I3 Old plan (dropped)',
      'Decisions:',
      '- D2 Use bun? (before_settling, resolved)',
      'Blockers:',
      '- B2 The tests did not run. (resolved)',
      'Surprises:',
      '- S2 The cache was stale. (dismissed)',
      'Observations:',
      '- S4 The agent skipped the review. (dismissed)',
      'Reported tickets:',
      '- #3 Play a video (landed)',
    ].join('\n'),
  )
})

test('state all keeps open and closed entries', () => {
  expect(listText(statusOfEveryKind(), filter({ state: 'all', kinds: ['item'] }))).toBe(
    ['Session items:', '- I2 Ship it (open)', '- I1 Write the parser (done)', '- I3 Old plan (dropped)'].join('\n'),
  )
})

test('the effort has no state: kind effort shows it with any state', () => {
  expect(listText(statusOfEveryKind(), filter({ kinds: ['effort'], state: 'closed' }))).toBe('Effort:\n- launch')
})

test('id keeps the entries it names, in any case, and #3 or 3 names ticket 3', () => {
  const status = statusOfEveryKind()

  expect(listText(status, filter({ ids: ['S1', 's2'], state: 'all' }))).toBe(
    'Surprises:\n- S1 The API changed.\n- S2 The cache was stale. (dismissed)',
  )
  expect(listText(status, filter({ ids: ['3'], state: 'all' }))).toBe('Reported tickets:\n- #3 Play a video (landed)')
  expect(listText(status, filter({ ids: ['#4'] }))).toBe('Reported tickets:\n- #4 Pause (started)')
})

test('different keys must all match', () => {
  expect(listText(statusOfEveryKind(), filter({ kinds: ['decision'], ids: ['D1', 'D2', 'B1'], state: 'closed' }))).toBe(
    'Decisions:\n- D2 Use bun? (before_settling, resolved)',
  )
})

test('a filter that matches nothing says so', () => {
  expect(listText(statusOfEveryKind(), filter({ ids: ['D9'] }))).toBe('Nothing matches the filter.')
})

test('matchesFilter checks kind, state and id together', () => {
  const entry = { kind: 'decision' as const, id: 'D1', open: true }

  expect(matchesFilter(entry, filter({}))).toBe(true)
  expect(matchesFilter(entry, filter({ state: 'closed' }))).toBe(false)
  expect(matchesFilter(entry, filter({ kinds: ['blocker'] }))).toBe(false)
  expect(matchesFilter(entry, filter({ ids: ['d1'] }))).toBe(true)
  expect(matchesFilter({ kind: 'effort', id: 'launch', open: null }, filter({ state: 'closed' }))).toBe(true)
})

test('the list action reads the examples of the filter', async ($, on) => {
  world(on)
  await sessionWithProgress($)
  await callStatusTool($, { action: 'record_surprise', occurred: 'The API changed.', changed: 'Use v2.' })
  await callStatusTool($, { action: 'record_surprise', occurred: 'The cache was stale.', changed: 'Clear it.' })
  await callStatusTool($, { action: 'dismiss', id: 'S2' })
  await callStatusTool($, { action: 'resolve', id: 'D1' })

  expect((await callStatusTool($, { action: 'list', filter: { kind: ['observation'] } })).result).toBe(
    'Nothing matches the filter.',
  )
  expect((await callStatusTool($, { action: 'list', filter: { id: ['S1', 'S2'], state: 'all' } })).result).toBe(
    'Surprises:\n- S1 The API changed.\n- S2 The cache was stale. (dismissed)',
  )
  expect((await callStatusTool($, { action: 'list', filter: { kind: ['decision'], state: 'closed' } })).result).toBe(
    `Decisions:\n- D1 ${decisionBeforeSettling().question} (before_settling, resolved)`,
  )
})

test('the list action refuses an unknown kind or state and names the allowed values', () => {
  expect(readStatusToolInput({ action: 'list', filter: { kind: ['note'] } })).toEqual({
    error: 'Unknown filter kind "note". Use some of: item, decision, blocker, surprise, observation, ticket, effort, link, task, cron, place.',
  })
  expect(readStatusToolInput({ action: 'list', filter: { state: 'resolved' } })).toEqual({
    error: 'Unknown filter state "resolved". Use one of: open, closed, all.',
  })
  expect(readStatusToolInput({ action: 'list', filter: 'open' })).toEqual({
    error: 'A filter is an object with `kind`, `state` and `id`, each optional.',
  })
  expect(readStatusToolInput({ action: 'list', filter: { kind: [5] } })).toEqual({
    error: "A filter's `kind` is an array of kinds: item, decision, blocker, surprise, observation, ticket, effort, link, task, cron, place.",
  })
  expect(readStatusToolInput({ action: 'list', filter: { id: [''] } })).toEqual({
    error: "A filter's `id` is an array of ids, such as D1, S2 or #3.",
  })
  expect(readStatusToolInput({ action: 'list', filter: { kind: [] } })).toEqual({
    list: { kinds: null, state: 'open', ids: null },
  })
  expect(readStatusToolInput({ action: 'list' })).toEqual({ list: null })
  expect(readStatusToolInput({ action: 'list', filter: { kind: 'blocker', id: ['B1'] } })).toEqual({
    list: { kinds: new Set(['blocker']), state: 'open', ids: new Set(['B1']) },
  })
})

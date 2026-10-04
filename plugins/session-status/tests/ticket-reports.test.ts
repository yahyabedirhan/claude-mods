import { expect, test } from 'claude-code/testing'
import type { Engine } from 'claude-code/testing'

import { CAP, emptyStatus, withinBounds } from '../hooks/status'
import { reportTicket } from '../hooks/ticket-reports'
import {
  SESSION_ID,
  START,
  STATUS_TOOL,
  SURFACES,
  bandText,
  callStatusTool,
  endSession,
  ghIssue,
  sectionText,
  start,
  world,
} from './world'

const NEW_SESSION = 'session-b'
const EFFORT = 'video-review-v1'

/** A `ticket` call, as the orchestrator makes it. */
function ticket($: Engine, state: 'started' | 'landed' | 'stopped', number: number, title?: string, effort?: string) {
  return callStatusTool($, {
    action: 'ticket',
    state,
    number,
    ...(title === undefined ? {} : { title }),
    ...(effort === undefined ? {} : { effort }),
  })
}

/** Lets the ticket read the mod queued with `$.clock.after(0, ...)` run. */
async function settle(clock: { advance: (ms: number) => Promise<void> }) {
  await clock.advance(0)
}

/** A run's thirteen tickets and its spec: one ticket closed before the run. */
function runIssues() {
  return [
    ghIssue(1, 'Spec: Video Review v1', 'OPEN', EFFORT),
    ghIssue(2, 'Player: Open a video', 'CLOSED', EFFORT),
    ghIssue(3, 'Control: Play a video', 'OPEN', EFFORT),
    ghIssue(4, 'Comment: Queue a comment', 'OPEN', EFFORT),
    ...[5, 6, 7, 8, 9, 10, 11, 12, 13, 14].map(n => ghIssue(n, `Ticket ${n}`, 'OPEN', EFFORT)),
  ]
}

test('the status tool describes the ticket action and its fields', async ($, on) => {
  const { tools } = world(on)
  await start($)

  const tool = tools.get(STATUS_TOOL)
  expect(tool?.inputSchema).toMatchObject({
    properties: {
      state: { enum: ['started', 'landed', 'stopped'] },
      number: { type: 'integer' },
      title: { type: 'string' },
      effort: { type: 'string' },
    },
  })
  expect(tool?.description).toMatch(/`ticket`/)
  expect(tool?.description).toMatch(/never for a delegate/i)
})

test('the Session section counts the landed tickets of the reported ones, apart from the closed issues', async ($, on) => {
  const w = world(on, { issues: runIssues() })
  await start($)

  await ticket($, 'started', 4, 'Comment: Queue a comment', EFFORT)
  await ticket($, 'landed', 4)
  const answer = await ticket($, 'started', 3, 'Control: Play a video')
  await settle(w.clock)

  expect(answer.result).toContain('Ticket #3 Control: Play a video is started.')
  expect(w.saved[SESSION_ID]).toMatchObject({
    effort: { name: EFFORT, from: 'report' },
    tickets: { effort: EFFORT, done: 1, total: 13 },
    ticketReports: [
      { number: 4, title: 'Comment: Queue a comment', state: 'landed', at: START, effort: EFFORT },
      { number: 3, title: 'Control: Play a video', state: 'started', at: START, effort: EFFORT },
    ],
  })
  for (const surface of SURFACES) {
    const session = (await sectionText($, surface, 'session')) ?? ''
    expect(session).toContain('Landed 1/2')
    expect(session).toContain('Building: #3')
    expect(session).not.toContain('#4')
    // The tracker's count stays in the Effort section: one closed before the run.
    expect(await sectionText($, surface, 'effort')).toContain('Closed 1/13')
  }
})

test('a ticket both closed and landed counts once in each section', async ($, on) => {
  const w = world(on, { issues: runIssues() })
  await start($)

  await ticket($, 'landed', 2, 'Player: Open a video', EFFORT)
  await settle(w.clock)

  for (const surface of SURFACES) {
    expect(await sectionText($, surface, 'session')).toContain('Landed 1/1')
    expect(await sectionText($, surface, 'effort')).toContain('Closed 1/13')
  }
})

test('the ticket result tells the model the Session progress the pane shows', async ($, on) => {
  const w = world(on, { issues: runIssues() })
  await start($)
  await ticket($, 'started', 4, 'Comment: Queue a comment', EFFORT)
  await ticket($, 'started', 5, 'Ticket 5')
  await settle(w.clock)

  const answer = await ticket($, 'landed', 4)

  expect(answer.result).toBe('Ticket #4 Comment: Queue a comment is landed. Session: 1/2 tickets landed, building #5.')
  expect((await ticket($, 'landed', 4)).result).toContain('is landed already.')
})

test('the reply names at most four tickets in progress, then how many more', async ($, on) => {
  world(on)
  await start($)
  for (const n of [2, 3, 4, 5, 6]) {
    await ticket($, 'started', n, `Ticket ${n}`)
  }

  expect((await ticket($, 'started', 7, 'Ticket 7')).result).toContain('building #2, #3, #4, #5, +2 more.')
})

test('without gh the Session section still counts the reports, and no Effort section shows', async ($, on) => {
  const w = world(on, { failRuns: true })
  await start($)

  await ticket($, 'landed', 2, 'Player: Open a video')
  await ticket($, 'started', 3, 'Control: Play a video')
  const answer = await ticket($, 'started', 4, 'Comment: Queue a comment')
  await settle(w.clock)

  expect(answer.result).toContain('Session: 1/3 tickets landed, building #3, #4.')
  expect(w.saved[SESSION_ID]).toMatchObject({ tickets: null })
  for (const surface of SURFACES) {
    const text = (await sectionText($, surface, 'session')) ?? ''
    expect(text).toContain('Landed 1/3')
    expect(text).toContain('Building: #3, #4')
    expect(await sectionText($, surface, 'effort')).toBeUndefined()
  }
})

test('a ticket report names the effort and starts the ticket read', async ($, on) => {
  const w = world(on, { issues: runIssues() })
  await start($)

  await ticket($, 'started', 3, 'Control: Play a video', `effort:${EFFORT}`)
  await settle(w.clock)

  expect(w.runs).toContainEqual(expect.arrayContaining(['gh', 'issue', 'list', '--label', `effort:${EFFORT}`]))
  expect(w.saved[SESSION_ID]).toMatchObject({ effort: { name: EFFORT, from: 'report' }, tickets: { total: 13 } })
  expect(w.panes.has('session-status')).toBe(true)
})

test('a ticket report without an effort name takes the branch as the effort', async ($, on) => {
  const w = world(on, { branch: 'proto-1', issues: [] })
  await start($)

  await ticket($, 'started', 3, 'Control: Play a video')
  await settle(w.clock)

  expect(w.saved[SESSION_ID]).toMatchObject({ effort: { name: 'proto-1', from: 'branch' } })
})

test('a report naming another effort switches the session to it, and Session counts only its tickets', async ($, on) => {
  const w = world(on)
  await start($)
  await ticket($, 'landed', 2, 'Player: Open a video', EFFORT)
  await ticket($, 'started', 3, 'Control: Play a video')
  // A label in a command does not take the effort from a report.
  await $.tool.call({ tool: 'Bash', command: 'gh issue list --label effort:other' })

  const answer = await ticket($, 'started', 3, 'Search: Find a video', 'search-v1')

  expect(answer.result).toContain('Session: 0/1 tickets landed, building #3.')
  expect(w.saved[SESSION_ID]).toMatchObject({
    effort: { name: 'search-v1', from: 'report' },
    ticketReports: [
      { number: 2, effort: EFFORT },
      { number: 3, effort: EFFORT, title: 'Control: Play a video' },
      { number: 3, effort: 'search-v1', title: 'Search: Find a video' },
    ],
  })
  for (const surface of SURFACES) {
    expect(await sectionText($, surface, 'session')).toContain('Landed 0/1')
  }

  // Back to the first effort: its reports count again.
  await ticket($, 'landed', 3, undefined, EFFORT)
  for (const surface of SURFACES) {
    expect(await sectionText($, surface, 'session')).toContain('Landed 2/2')
  }
})

test('stopped takes a started ticket back and leaves a landed one landed', async ($, on) => {
  const w = world(on)
  await start($)
  await ticket($, 'started', 3, 'Control: Play a video')
  await ticket($, 'landed', 4, 'Comment: Queue a comment')

  expect((await ticket($, 'stopped', 3)).result).toContain('is no longer in progress')
  expect((await ticket($, 'stopped', 4)).result).toContain('already landed')

  expect(w.saved[SESSION_ID]).toMatchObject({ ticketReports: [{ number: 4, state: 'landed' }] })
  for (const surface of SURFACES) {
    const text = (await sectionText($, surface, 'session')) ?? ''
    expect(text).toContain('Landed 1/1')
    expect(text).not.toContain('Building')
  }
})

test('stopped after rework puts the ticket back to landed', async ($, on) => {
  const w = world(on)
  await start($)
  await ticket($, 'landed', 4, 'Comment: Queue a comment')
  await w.clock.advance(60_000)
  await ticket($, 'started', 4)
  for (const surface of SURFACES) {
    expect(await sectionText($, surface, 'session')).toContain('Landed 0/1')
  }

  expect((await ticket($, 'stopped', 4)).result).toContain('Ticket #4 Comment: Queue a comment is landed again')

  expect(w.saved[SESSION_ID]).toMatchObject({ ticketReports: [{ number: 4, state: 'landed', at: START }] })
  expect((w.saved[SESSION_ID] as { ticketReports: object[] }).ticketReports[0]).not.toHaveProperty('landedAt')
  for (const surface of SURFACES) {
    expect(await sectionText($, surface, 'session')).toContain('Landed 1/1')
  }
})

test('stopped for a ticket never reported is a harmless answer, not a refusal', async ($, on) => {
  const w = world(on)
  await start($)

  const answer = await ticket($, 'stopped', 9)

  expect(answer.deny).toBeUndefined()
  expect(answer.result).toBe('Ticket #9 was not in progress.')
  expect(w.saved[SESSION_ID]).toMatchObject({ ticketReports: [] })
})

test('a ticket without an issue number is reported by its title', async ($, on) => {
  const w = world(on)
  await start($)

  await callStatusTool($, { action: 'ticket', state: 'started', title: 'Add the login page' })
  await callStatusTool($, { action: 'ticket', state: 'landed', title: 'Add the login page' })
  await callStatusTool($, { action: 'ticket', state: 'started', title: 'Add the logout button' })

  expect(w.saved[SESSION_ID]).toMatchObject({
    ticketReports: [
      { title: 'Add the login page', state: 'landed' },
      { title: 'Add the logout button', state: 'started' },
    ],
  })
  for (const surface of SURFACES) {
    const text = (await sectionText($, surface, 'session')) ?? ''
    expect(text).toContain('Landed 1/2')
    expect(text).toContain('Building: Add the logout button')
  }
})

test('the status tool refuses a ticket it cannot name or place', async ($, on) => {
  const w = world(on)
  await start($)

  expect((await callStatusTool($, { action: 'ticket', number: 3, title: 'x' })).deny).toContain('state')
  expect((await callStatusTool($, { action: 'ticket', state: 'done', number: 3 })).deny).toContain('state')
  expect((await callStatusTool($, { action: 'ticket', state: 'started' })).deny).toContain('`number`')
  expect((await callStatusTool($, { action: 'ticket', state: 'started', number: 'three' })).deny).toContain('positive integer')
  expect((await ticket($, 'landed', 3)).deny).toContain('`title`')
  expect((w.saved[SESSION_ID] as { ticketReports?: unknown[] } | undefined)?.ticketReports ?? []).toEqual([])

  // `#3` and `"3"` both read as the issue number 3.
  await callStatusTool($, { action: 'ticket', state: 'started', number: '#3', title: 'Control: Play a video' })
  expect(w.saved[SESSION_ID]).toMatchObject({ ticketReports: [{ number: 3 }] })
})

test('the section names at most four tickets in progress', async ($, on) => {
  world(on)
  await start($)
  for (const n of [2, 3, 4, 5, 6, 7]) {
    await ticket($, 'started', n, `Ticket ${n}`)
  }

  for (const surface of SURFACES) {
    expect(await sectionText($, surface, 'session')).toContain('Building: #2, #3, #4, #5, +2 more')
  }
})

test('the band shows the landed and closed counts, never ticket names', async ($, on) => {
  const w = world(on, { isNarrow: true, issues: runIssues() })
  await start($)
  await ticket($, 'landed', 4, 'Comment: Queue a comment', EFFORT)
  await ticket($, 'started', 3, 'Control: Play a video')
  await settle(w.clock)

  for (const surface of SURFACES) {
    expect(await bandText($, surface)).toBe('0 blocked · 0 review · landed 1/2 · closed 1/13 · 0 surprise')
  }
})

test('a ticket report opens the pane and leaves doing now on the work', async ($, on) => {
  const w = world(on)
  await start($)
  await $.tool.call({ tool: 'Bash', command: 'git cherry-pick abc', description: 'Integrate the ticket' })
  expect(w.panes.has('session-status')).toBe(false)

  await ticket($, 'started', 3, 'Control: Play a video')

  expect(w.panes.has('session-status')).toBe(true)
  expect(w.saved[SESSION_ID]).toMatchObject({ doingNow: { tool: 'Bash', text: 'Integrate the ticket' } })
})

/** Ends the session by /clear and starts the new one, `$.state` emptied as a /clear leaves it. */
async function clear($: Engine, w: ReturnType<typeof world>) {
  await endSession($, SESSION_ID)
  w.forgetState()
  w.switchSession(NEW_SESSION)
  await $.classic.SessionStart({ source: 'clear', session_id: NEW_SESSION } as never)
}

test('/clear carries the Session progress over while the effort stays the same', async ($, on) => {
  const w = world(on)
  await start($)
  await ticket($, 'landed', 4, 'Comment: Queue a comment', EFFORT)
  await ticket($, 'started', 3, 'Control: Play a video')

  await clear($, w)

  expect(w.saved[NEW_SESSION]).toMatchObject({
    effort: { name: EFFORT },
    ticketReports: [
      { number: 4, state: 'landed' },
      { number: 3, state: 'started' },
    ],
  })
  await ticket($, 'landed', 3, undefined, EFFORT)
  for (const surface of SURFACES) {
    expect(await sectionText($, surface, 'session')).toContain('Landed 2/2')
  }
})

test('after /clear a report for a different effort starts the Session progress from zero', async ($, on) => {
  const w = world(on)
  await start($)
  await ticket($, 'landed', 4, 'Comment: Queue a comment', EFFORT)

  await clear($, w)
  await ticket($, 'started', 1, 'Search: Find a video', 'search-v1')

  for (const surface of SURFACES) {
    expect(await sectionText($, surface, 'session')).toContain('Landed 0/1')
  }
})

test('a resume restores the reported tickets', async ($, on) => {
  const saved = {
    ...emptyStatus(SESSION_ID),
    ticketReports: [{ number: 3, title: 'Control: Play a video', state: 'started', at: START }],
    updatedAt: START,
  }
  world(on, { saved: { [SESSION_ID]: saved } })
  await start($)
  await $.classic.SessionStart({ source: 'resume', session_id: SESSION_ID } as never)

  for (const surface of SURFACES) {
    expect(await sectionText($, surface, 'session')).toContain('Building: #3')
  }
})

test('a report keeps its place and the time it reached its state', () => {
  const first = reportTicket(emptyStatus(SESSION_ID), { state: 'started', number: 3, title: 'Play' }, 10)
  if ('error' in first) throw new Error(first.error)
  const second = reportTicket(first.status, { state: 'started', number: 4, title: 'Queue' }, 20)
  if ('error' in second) throw new Error(second.error)
  const landed = reportTicket(second.status, { state: 'landed', number: 3 }, 30)
  if ('error' in landed) throw new Error(landed.error)

  expect(landed.status.ticketReports).toEqual([
    { number: 3, title: 'Play', state: 'landed', at: 30 },
    { number: 4, title: 'Queue', state: 'started', at: 20 },
  ])
  expect(reportTicket(landed.status, { state: 'landed', number: 3 }, 40)).toMatchObject({ change: 'same' })
})

test('past the cap the reports that changed last stay, a landed one among them', () => {
  const reports = Array.from({ length: CAP + 1 }, (_, n) => ({
    number: n + 1,
    title: `Ticket ${n + 1}`,
    state: 'started' as const,
    at: n + 1,
  }))
  // The first ticket was named first but landed last.
  reports[0] = { ...reports[0]!, state: 'started', at: CAP + 10 }

  const kept = withinBounds({ ...emptyStatus(SESSION_ID), ticketReports: reports }).ticketReports

  expect(kept).toHaveLength(CAP)
  expect(kept[0]).toMatchObject({ number: 1 })
  expect(kept.some(report => report.number === 2)).toBe(false)
})

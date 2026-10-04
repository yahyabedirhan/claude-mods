import { expect, test } from 'claude-code/testing'
import type { Engine } from 'claude-code/testing'

import { ticketProgress } from '../hooks/effort-progress'
import { emptyStatus } from '../hooks/status'
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

test('a landed ticket counts as done while its issue is still open, and the started one is named', async ($, on) => {
  const w = world(on, { issues: runIssues() })
  await start($)

  await ticket($, 'started', 4, 'Comment: Queue a comment', EFFORT)
  await ticket($, 'landed', 4)
  const answer = await ticket($, 'started', 3, 'Control: Play a video')
  await settle(w.clock)

  expect(answer.result).toContain('Ticket #3 Control: Play a video is started.')
  expect(w.saved[SESSION_ID]).toMatchObject({
    effort: { name: EFFORT, from: 'label' },
    tickets: { effort: EFFORT, done: 1, total: 13 },
    ticketReports: [
      { number: 4, title: 'Comment: Queue a comment', state: 'landed', at: START },
      { number: 3, title: 'Control: Play a video', state: 'started', at: START },
    ],
  })
  for (const surface of SURFACES) {
    const text = (await sectionText($, surface, 'progress')) ?? ''
    expect(text).toContain('Tickets 2/13 done')
    expect(text).toContain('Building: #3 Control: Play a video')
    expect(text).not.toContain('Building: #4')
  }
})

test('a ticket both closed and landed counts once', async ($, on) => {
  const w = world(on, { issues: runIssues() })
  await start($)

  await ticket($, 'landed', 2, 'Player: Open a video', EFFORT)
  await settle(w.clock)

  for (const surface of SURFACES) {
    expect(await sectionText($, surface, 'progress')).toContain('Tickets 1/13 done')
  }
})

test('the ticket result tells the model the progress the pane shows', async ($, on) => {
  const w = world(on, { issues: runIssues() })
  await start($)
  await ticket($, 'started', 4, 'Comment: Queue a comment', EFFORT)
  await settle(w.clock)

  const answer = await ticket($, 'landed', 4)

  expect(answer.result).toBe('Ticket #4 Comment: Queue a comment is landed. Progress: 2/13 tickets done.')
  expect((await ticket($, 'landed', 4)).result).toContain('is landed already.')
})

test('without gh the reported tickets alone give done, total and the tickets in progress', async ($, on) => {
  const w = world(on, { failRuns: true })
  await start($)

  await ticket($, 'landed', 2, 'Player: Open a video')
  await ticket($, 'started', 3, 'Control: Play a video')
  const answer = await ticket($, 'started', 4, 'Comment: Queue a comment')
  await settle(w.clock)

  expect(answer.result).toContain('Progress: 1/3 tickets done, building #3, #4.')
  expect(w.saved[SESSION_ID]).toMatchObject({ tickets: null })
  for (const surface of SURFACES) {
    const text = (await sectionText($, surface, 'progress')) ?? ''
    expect(text).toContain('Tickets 1/3 done')
    expect(text).toContain('Building: #3 Control: Play a video')
    expect(text).toContain('Building: #4 Comment: Queue a comment')
  }
})

test('a ticket report names the effort and starts the ticket read', async ($, on) => {
  const w = world(on, { issues: runIssues() })
  await start($)

  await ticket($, 'started', 3, 'Control: Play a video', `effort:${EFFORT}`)
  await settle(w.clock)

  expect(w.runs).toContainEqual(expect.arrayContaining(['gh', 'issue', 'list', '--label', `effort:${EFFORT}`]))
  expect(w.saved[SESSION_ID]).toMatchObject({ effort: { name: EFFORT, from: 'label' }, tickets: { total: 13 } })
  expect(w.panes.has('session-status')).toBe(true)
})

test('a ticket report without an effort name takes the branch as the effort', async ($, on) => {
  const w = world(on, { branch: 'proto-1', issues: [] })
  await start($)

  await ticket($, 'started', 3, 'Control: Play a video')
  await settle(w.clock)

  expect(w.saved[SESSION_ID]).toMatchObject({ effort: { name: 'proto-1', from: 'branch' } })
})

test('stopped takes a started ticket back and leaves a landed one landed', async ($, on) => {
  const w = world(on)
  await start($)
  await ticket($, 'started', 3, 'Control: Play a video')
  await ticket($, 'landed', 4, 'Comment: Queue a comment')

  expect((await ticket($, 'stopped', 3)).result).toContain('is no longer in progress')
  expect((await ticket($, 'stopped', 4)).result).toContain('already landed')
  expect((await ticket($, 'stopped', 9, 'Never started')).result).toContain('was not in progress')

  expect(w.saved[SESSION_ID]).toMatchObject({ ticketReports: [{ number: 4, state: 'landed' }] })
  for (const surface of SURFACES) {
    const text = (await sectionText($, surface, 'progress')) ?? ''
    expect(text).toContain('Tickets 1/1 done')
    expect(text).not.toContain('Building')
  }
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
    const text = (await sectionText($, surface, 'progress')) ?? ''
    expect(text).toContain('Tickets 1/2 done')
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
    const text = (await sectionText($, surface, 'progress')) ?? ''
    expect(text).toContain('Building: #5 Ticket 5')
    expect(text).not.toContain('Building: #6')
    expect(text).toContain('+2 more building')
  }
})

test('the band shows the landed tickets as done and names the tickets in progress', async ($, on) => {
  const w = world(on, { isNarrow: true, issues: runIssues() })
  await start($)
  await ticket($, 'landed', 4, 'Comment: Queue a comment', EFFORT)
  await ticket($, 'started', 3, 'Control: Play a video')
  await settle(w.clock)

  for (const surface of SURFACES) {
    expect(await bandText($, surface)).toBe('0 blocked · 0 review · 2/13 done · building #3 · 0 surprise')
  }

  for (const n of [5, 6, 7]) {
    await ticket($, 'started', n, `Ticket ${n}`)
  }
  for (const surface of SURFACES) {
    expect(await bandText($, surface)).toBe('0 blocked · 0 review · 2/13 done · building #3, #5, #6, +1 · 0 surprise')
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

test('/clear carries the reported tickets over to the new session', async ($, on) => {
  const w = world(on)
  await start($)
  await ticket($, 'landed', 4, 'Comment: Queue a comment', EFFORT)
  await ticket($, 'started', 3, 'Control: Play a video')

  await endSession($, SESSION_ID)
  w.forgetState()
  w.switchSession(NEW_SESSION)
  await $.classic.SessionStart({ source: 'clear', session_id: NEW_SESSION } as never)

  expect(w.saved[NEW_SESSION]).toMatchObject({
    effort: { name: EFFORT },
    ticketReports: [
      { number: 4, state: 'landed' },
      { number: 3, state: 'started' },
    ],
  })
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
    expect(await sectionText($, surface, 'progress')).toContain('Building: #3 Control: Play a video')
  }
})

test('done and total join the count and the reports, each ticket once', () => {
  const count = { effort: 'e', done: 1, total: 3, closed: [2], open: [3, 4], at: 0 }
  const report = (number: number | undefined, state: 'started' | 'landed') => ({
    ...(number === undefined ? {} : { number }),
    title: `Ticket ${number ?? 'x'}`,
    state,
    at: 0,
  })

  expect(ticketProgress(count, [])).toEqual({ done: 1, total: 3 })
  expect(ticketProgress(count, [report(2, 'landed'), report(3, 'landed'), report(4, 'started')])).toEqual({ done: 2, total: 3 })
  // A reported ticket the count does not hold adds to the total.
  expect(ticketProgress(count, [report(9, 'landed'), report(undefined, 'started')])).toEqual({ done: 2, total: 5 })
  expect(ticketProgress(null, [report(3, 'landed'), report(4, 'started')])).toEqual({ done: 1, total: 2 })
  // A count saved before it kept numbers.
  expect(ticketProgress({ effort: 'e', done: 1, total: 3, at: 0 }, [report(3, 'landed'), report(4, 'landed')])).toEqual({
    done: 2,
    total: 3,
  })
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
  expect(reportTicket(landed.status, { state: 'landed', number: 3 }, 40)).toMatchObject({ changed: false })
})

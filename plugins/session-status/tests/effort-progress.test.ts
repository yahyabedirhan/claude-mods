import { expect, test } from 'claude-code/testing'
import type { Engine } from 'claude-code/testing'

import {
  TICKET_REFRESH_MS,
  TICKET_RETRY_MS,
  changesTickets,
  isTicketReadDue,
  parseTicketList,
  shownProgress,
  ticketListArgv,
} from '../hooks/effort-progress'
import { emptyStatus } from '../hooks/status'
import { SESSION_ID, SURFACES, ghIssue, sectionText, start, world } from './world'

const LABEL = 'gh issue list --label effort:session-status --state all'

/** Lets the ticket read the mod queued with `$.clock.after(0, ...)` run. */
async function settle(clock: { advance: (ms: number) => Promise<void> }) {
  await clock.advance(0)
}

/** The `gh issue list` runs the mod made. */
function ticketReads(runs: string[][]) {
  return runs.filter(argv => argv.slice(0, 3).join(' ') === 'gh issue list')
}

/** A Bash call, as the model makes it. */
function bash($: Engine, command: string) {
  return $.tool.call({ tool: 'Bash', command })
}

/** Starts a task through the TaskCreated event and puts it in progress. */
async function runTask($: Engine, id: string, subject: string) {
  await $.classic.TaskCreated({ task_id: id, task_subject: subject })
  await $.tool.call({ tool: 'TaskUpdate', taskId: id, status: 'in_progress' })
}

test('the ticket list command reads every issue of the effort', () => {
  expect(ticketListArgv('session-status')).toEqual([
    'gh',
    'issue',
    'list',
    '--label',
    'effort:session-status',
    '--state',
    'all',
    '--limit',
    '200',
    '--json',
    'number,title,state,labels',
  ])
})

test('the count is closed tickets of all tickets, without the spec issue', () => {
  const issues = [
    ghIssue(1, 'Spec: the session status', 'OPEN'),
    ghIssue(2, 'The pane', 'CLOSED'),
    ghIssue(3, 'The band', 'CLOSED'),
    ghIssue(4, 'Effort progress from tickets'),
    ghIssue(5, 'SPEC: an older spec', 'CLOSED'),
  ]
  expect(parseTicketList(JSON.stringify(issues))).toEqual({ done: 2, total: 3 })
  expect(parseTicketList('[]')).toEqual({ done: 0, total: 0 })
  expect(parseTicketList('not json')).toBeNull()
  expect(parseTicketList('{"number":1}')).toBeNull()
})

test('closing, reopening or editing an issue, or merging a PR, changes tickets', () => {
  const changing = ['gh issue close 4', 'gh issue reopen 4', 'gh issue edit 4 --add-label x', 'cd x && gh pr merge 12 --squash']
  for (const command of changing) {
    expect(changesTickets({ tool: 'Bash', command } as never)).toBe(true)
  }
  for (const command of ['gh issue view 4', 'gh pr create', 'echo gh issue']) {
    expect(changesTickets({ tool: 'Bash', command } as never)).toBe(false)
  }
  expect(changesTickets({ tool: 'Read', command: 'gh issue close 4' } as never)).toBe(false)
})

test('a ticket read is due first, after a ticket change, and every two minutes', () => {
  const status = {
    ...emptyStatus(SESSION_ID),
    effort: { name: 'e' },
    tickets: { effort: 'e', done: 0, total: 1, at: 1000 },
  }
  const other = { tool: 'Read' }
  const last = { effort: 'e', at: 1000 }
  expect(isTicketReadDue(emptyStatus(SESSION_ID), null, other, 0)).toBe(false)
  expect(isTicketReadDue(status, null, other, 0)).toBe(true)
  expect(isTicketReadDue(status, { effort: 'other', at: 1000 }, other, 1001)).toBe(true)
  expect(isTicketReadDue(status, last, other, 1000 + TICKET_REFRESH_MS - 1)).toBe(false)
  expect(isTicketReadDue(status, last, other, 1000 + TICKET_REFRESH_MS)).toBe(true)
  expect(isTicketReadDue(status, last, { tool: 'Bash', command: 'gh issue close 3' } as never, 1001)).toBe(true)
})

test('without a count for the effort, a read is due again after thirty seconds', () => {
  const status = { ...emptyStatus(SESSION_ID), effort: { name: 'e' } }
  const last = { effort: 'e', at: 1000 }
  expect(isTicketReadDue(status, last, { tool: 'Read' }, 1000 + TICKET_RETRY_MS - 1)).toBe(false)
  expect(isTicketReadDue(status, last, { tool: 'Read' }, 1000 + TICKET_RETRY_MS)).toBe(true)
})

test('tickets show only for the effort they were counted for', () => {
  const tasks = { done: 1, total: 4, current: 'Write tests' }
  const base = { ...emptyStatus(SESSION_ID), progress: tasks }
  const tickets = { effort: 'e', done: 3, total: 9, at: 0 }
  expect(shownProgress({ ...base, effort: { name: 'e' }, tickets })).toEqual({
    source: 'tickets',
    done: 3,
    total: 9,
    current: 'Write tests',
  })
  expect(shownProgress({ ...base, effort: { name: 'f' }, tickets })).toEqual({ source: 'tasks', ...tasks })
  expect(shownProgress({ ...base, tickets })).toEqual({ source: 'tasks', ...tasks })
  expect(shownProgress(emptyStatus(SESSION_ID))).toBeNull()
})

test("during an effort the progress section counts the effort's tickets", async ($, on) => {
  const w = world(on, {
    issues: [
      ghIssue(1, 'Spec: session status'),
      ghIssue(2, 'The pane', 'CLOSED'),
      ghIssue(3, 'The band', 'CLOSED'),
      ghIssue(4, 'Effort progress'),
    ],
  })
  await start($)
  await runTask($, 't1', 'Build ticket 4')
  await bash($, LABEL)
  await settle(w.clock)

  expect(ticketReads(w.runs)).toEqual([ticketListArgv('session-status')])
  expect(w.saved[SESSION_ID]).toMatchObject({ tickets: { effort: 'session-status', done: 2, total: 3 } })
  for (const surface of SURFACES) {
    const text = (await sectionText($, surface, 'progress')) ?? ''
    expect(text).toContain('Tickets 2/3 done')
    expect(text).toContain('Current: Build ticket 4')
  }
})

test('outside an effort progress comes from the task list and gh never runs', async ($, on) => {
  const w = world(on, { issues: [ghIssue(2, 'The pane', 'CLOSED')] })
  await start($)
  await runTask($, 't1', 'Write the parser')
  await $.classic.TaskCreated({ task_id: 't2', task_subject: 'Write the tests' })
  await bash($, 'gh issue close 2')
  await w.clock.advance(TICKET_REFRESH_MS)
  await bash($, 'ls')
  await settle(w.clock)

  expect(ticketReads(w.runs)).toEqual([])
  for (const surface of SURFACES) {
    const text = (await sectionText($, surface, 'progress')) ?? ''
    expect(text).toContain('Tasks 0/2 done')
    expect(text).toContain('Current: Write the parser')
  }
})

test('closing a ticket reads the tickets again; other calls wait two minutes', async ($, on) => {
  const w = world(on, { issues: [ghIssue(2, 'The pane'), ghIssue(3, 'The band')] })
  await start($)
  await bash($, LABEL)
  await settle(w.clock)
  expect(w.saved[SESSION_ID]).toMatchObject({ tickets: { done: 0, total: 2 } })

  // Another call soon after reads nothing.
  await bash($, 'ls')
  await settle(w.clock)
  expect(ticketReads(w.runs)).toHaveLength(1)

  // A ticket closed: read again at once.
  w.issues([ghIssue(2, 'The pane', 'CLOSED'), ghIssue(3, 'The band')])
  await bash($, 'gh issue close 2')
  await settle(w.clock)
  expect(ticketReads(w.runs)).toHaveLength(2)
  expect(w.saved[SESSION_ID]).toMatchObject({ tickets: { done: 1, total: 2 } })

  // Two minutes on, any call reads again.
  w.issues([ghIssue(2, 'The pane', 'CLOSED'), ghIssue(3, 'The band', 'CLOSED')])
  await w.clock.advance(TICKET_REFRESH_MS)
  await bash($, 'ls')
  await settle(w.clock)
  expect(ticketReads(w.runs)).toHaveLength(3)
  expect(w.saved[SESSION_ID]).toMatchObject({ tickets: { done: 2, total: 2 } })
})

test('a failed read keeps the last good count and never fails the tool call', async ($, on) => {
  const w = world(on, { issues: [ghIssue(2, 'The pane', 'CLOSED'), ghIssue(3, 'The band')] })
  await start($)
  await bash($, LABEL)
  await settle(w.clock)
  expect(w.saved[SESSION_ID]).toMatchObject({ tickets: { done: 1, total: 2 } })

  w.issues(undefined)
  const answer = await bash($, 'gh pr merge 7')
  await settle(w.clock)
  expect(answer).toMatchObject({ result: 'ok' })
  expect(ticketReads(w.runs)).toHaveLength(2)
  expect(w.saved[SESSION_ID]).toMatchObject({ tickets: { done: 1, total: 2 } })
  for (const surface of SURFACES) {
    expect(await sectionText($, surface, 'progress')).toContain('Tickets 1/2 done')
  }
})

test('a process that throws leaves the tool call and the status alone', async ($, on) => {
  const w = world(on, { failRuns: true })
  await start($)
  const answer = await bash($, LABEL)
  await settle(w.clock)
  expect(answer).toMatchObject({ result: 'ok' })
  expect(ticketReads(w.runs)).toHaveLength(1)
  expect(w.saved[SESSION_ID]).toMatchObject({ tickets: null })
})

test('a read due while one runs waits for it, then runs once', async ($, on) => {
  const w = world(on, { issues: [ghIssue(2, 'The pane')] })
  const release = w.holdIssues()
  await start($)
  await bash($, LABEL)
  await settle(w.clock)
  expect(ticketReads(w.runs)).toHaveLength(1)

  w.issues([ghIssue(2, 'The pane', 'CLOSED')])
  await bash($, 'gh issue close 2')
  await bash($, 'gh issue edit 2 --add-label x')
  await settle(w.clock)
  // The first read still runs: no second one starts beside it.
  expect(ticketReads(w.runs)).toHaveLength(1)

  release()
  await settle(w.clock)
  await settle(w.clock)
  expect(ticketReads(w.runs)).toHaveLength(2)
  expect(w.saved[SESSION_ID]).toMatchObject({ tickets: { done: 1, total: 1 } })
})

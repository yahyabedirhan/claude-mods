// The status tool's generic actions: `create`, `read`, `update` and `delete`
// on every kind of entry, and how a value the agent set meets the automatic
// sources: it stays until its source reports a new change, and a deleted
// entry does not come back.

import { expect, test } from 'claude-code/testing'
import type { Engine } from 'claude-code/testing'

import type { SessionStatus } from '../types'
import { createEntry, updateEntry } from '../hooks/crud'
import { withEffort } from '../hooks/effort'
import { withLinkStates } from '../hooks/link-states'
import { emptyStatus } from '../hooks/status'
import { readStatusToolInput } from '../hooks/status-tool'
import { taskUpdated, todosWritten } from '../hooks/tasks'
import { expireCrons } from '../hooks/crons'
import {
  SESSION_ID,
  START,
  blockedDecision,
  callStatusTool,
  decisionBeforeSettling,
  start,
  subagentToolCall,
  surprise,
  world,
} from './world'
import type { World } from './world'

const PR_URL = 'https://github.com/octo/skills/pull/88'

function saved(w: World): SessionStatus {
  return w.saved[SESSION_ID] as SessionStatus
}

/** The `shipyard ping` commands the mod ran: `ping` for a new ping, `withdraw` for a removed one. */
function pingRuns(w: World): string[] {
  return w.runs.filter(argv => argv[0] === 'shipyard').map(argv => (argv[2] === 'withdraw' ? 'withdraw' : 'ping'))
}

/** A record action's input as `create` fields: without its `action`. */
function fieldsOf({ action: _action, ...fields }: Record<string, unknown>) {
  return fields
}

async function settle($: Engine, w: World) {
  await w.clock.advance(0)
  await w.clock.advance(0)
}

// create

test('create adds one entry of each kind the agent can create', async ($, on) => {
  const w = world(on)
  await start($)

  expect((await callStatusTool($, { action: 'create', kind: 'item', fields: { title: 'Write tests' } })).result).toBe('Item I1 created.')
  expect((await callStatusTool($, { action: 'create', kind: 'decision', fields: fieldsOf(decisionBeforeSettling()) })).result).toBe('Decision D1 created.')
  expect((await callStatusTool($, { action: 'create', kind: 'surprise', fields: fieldsOf(surprise()) })).result).toBe('Surprise S1 created.')
  expect((await callStatusTool($, { action: 'create', kind: 'blocker', fields: { failed: 'npm install was denied', needs: 'Allow npm install' } })).result).toBe('Blocker B1 created.')
  expect((await callStatusTool($, { action: 'create', kind: 'ticket', fields: { number: 4, title: 'Add CRUD', effort: 'crud' } })).result).toBe('Ticket #4 created.')
  expect((await callStatusTool($, { action: 'create', kind: 'link', fields: { url: PR_URL } })).result).toBe('Link skills#88 created.')
  expect((await callStatusTool($, { action: 'create', kind: 'effort', fields: { name: 'launch' } })).result).toBe('Effort launch created.')
  expect((await callStatusTool($, { action: 'create', kind: 'task', fields: { subject: 'Run the suite', status: 'in_progress' } })).result).toBe('Task manual-1 created.')

  const status = saved(w)
  expect(status.sessionItems).toMatchObject([{ id: 'I1', title: 'Write tests', state: 'added' }])
  expect(status.items.map(item => item.id)).toEqual(['D1', 'S1', 'B1'])
  expect(status.ticketReports).toMatchObject([{ number: 4, title: 'Add CRUD', state: 'started' }])
  expect(status.links).toMatchObject([{ repo: 'octo/skills', number: 88, setBy: 'manual' }])
  expect(status.effort).toMatchObject({ name: 'launch', setBy: 'manual' })
  expect(status.tasks).toMatchObject([{ id: 'manual-1', subject: 'Run the suite', status: 'in_progress', setBy: 'manual' }])
  // The blocker pings the person, as `record_blocker` does.
  await settle($, w)
  expect(pingRuns(w)).toEqual(['ping'])
})

test('create refuses a cron job or a place, and names the kinds it creates', async ($, on) => {
  world(on)
  await start($)

  const cron = await callStatusTool($, { action: 'create', kind: 'cron', fields: {} })
  const place = await callStatusTool($, { action: 'create', kind: 'place', fields: {} })

  expect(cron.deny).toContain('CronCreate')
  expect(cron.deny).toContain('item, decision, surprise, blocker, ticket, link, effort, task')
  expect(place.deny).toContain('created only by')
})

// read

test('read without a filter returns everything; with one, only what matches', async ($, on) => {
  world(on)
  await start($)
  await callStatusTool($, { action: 'item', state: 'added', title: 'Write tests' })
  await callStatusTool($, { action: 'item', state: 'dropped', id: 'I1' })
  await callStatusTool($, { action: 'link', url: PR_URL })
  await $.tool.call({ tool: 'Bash', command: 'gh pr close 88 --repo octo/skills' })

  const all = (await callStatusTool($, { action: 'read' })).result as string
  expect(all).toContain('I1 Write tests (dropped)')
  expect(all).toContain('skills#88 https://github.com/octo/skills/pull/88 (closed)')

  const links = (await callStatusTool($, { action: 'read', filter: { kind: ['link'], state: 'closed' } })).result as string
  expect(links).toBe('Links:\n- skills#88 https://github.com/octo/skills/pull/88 (closed)')

  // `list` without a filter still leaves the pane's own lists out.
  expect((await callStatusTool($, { action: 'list' })).result).not.toContain('Links')
})

// update

test('update changes the given fields, and a closed entry opens again', async ($, on) => {
  const w = world(on)
  await start($)
  await callStatusTool($, { action: 'item', state: 'added', title: 'Write tests' })
  await callStatusTool($, { action: 'item', state: 'done', id: 'I1' })
  await callStatusTool($, decisionBeforeSettling())
  await callStatusTool($, { action: 'resolve', id: 'D1' })

  const item = await callStatusTool($, { action: 'update', kind: 'item', id: 'i1', fields: { title: 'Write more tests', state: 'added' } })
  const decision = await callStatusTool($, { action: 'update', kind: 'decision', id: 'D1', fields: { state: 'open', default: '--quick' } })

  expect(item.result).toBe('Item I1 updated: title Write more tests, state added.')
  expect(decision.result).toBe('Decision D1 updated: state open, default --quick.')
  expect(saved(w).sessionItems).toMatchObject([{ id: 'I1', title: 'Write more tests', state: 'added' }])
  expect(saved(w).items[0]).toMatchObject({ id: 'D1', default: '--quick' })
  expect(saved(w).items[0]).not.toHaveProperty('resolvedAt')
})

test('update to resolved withdraws a ping, and opening a blocked decision again pings again', async ($, on) => {
  const w = world(on)
  await start($)
  await callStatusTool($, blockedDecision())
  await settle($, w)
  expect(pingRuns(w)).toEqual(['ping'])

  await callStatusTool($, { action: 'update', kind: 'decision', id: 'D1', fields: { state: 'resolved' } })
  await settle($, w)
  expect(saved(w).items[0]).toHaveProperty('resolvedAt')
  expect(pingRuns(w)).toEqual(['ping', 'withdraw'])

  await callStatusTool($, { action: 'update', kind: 'decision', id: 'D1', fields: { state: 'open' } })
  await settle($, w)
  expect(pingRuns(w)).toEqual(['ping', 'withdraw', 'ping'])
})

test('update sets a ticket, a link, the effort, a task and a cron job', async ($, on) => {
  const w = world(on)
  w.answer('CronCreate', () => ({ id: 'job1', humanSchedule: '0 * * * *', recurring: true }))
  await start($)
  await callStatusTool($, { action: 'ticket', state: 'started', number: 4, title: 'Add CRUD', effort: 'crud' })
  await callStatusTool($, { action: 'link', url: PR_URL })
  await callStatusTool($, { action: 'create', kind: 'task', fields: { subject: 'Run the suite' } })
  await $.tool.call({ tool: 'CronCreate', cron: '0 * * * *', prompt: 'Check CI', recurring: true } as never)

  expect((await callStatusTool($, { action: 'update', kind: 'ticket', id: '#4', fields: { state: 'landed' } })).result).toBe('Ticket #4 updated: state landed.')
  expect((await callStatusTool($, { action: 'update', kind: 'link', id: 'skills#88', fields: { state: 'closed' } })).result).toBe('Link skills#88 updated: state closed.')
  expect((await callStatusTool($, { action: 'update', kind: 'effort', id: 'crud', fields: { name: 'session-status-crud' } })).result).toBe(
    'Effort crud updated: name session-status-crud.',
  )
  expect((await callStatusTool($, { action: 'update', kind: 'task', id: 'manual-1', fields: { status: 'completed' } })).result).toBe(
    'Task manual-1 updated: status completed.',
  )
  expect((await callStatusTool($, { action: 'update', kind: 'cron', id: 'job1', fields: { state: 'cancelled' } })).result).toBe(
    'Cron job job1 updated: state cancelled.',
  )

  const status = saved(w)
  expect(status.ticketReports).toMatchObject([{ number: 4, state: 'landed' }])
  expect(status.links).toMatchObject([{ state: 'closed', fieldsSetBy: { state: { setBy: 'manual', lastAuto: 'open' } } }])
  expect(status.effort).toMatchObject({ name: 'session-status-crud', fieldsSetBy: { name: { setBy: 'manual', lastAuto: 'crud' } } })
  expect(status.tasks).toMatchObject([{ status: 'completed' }])
  expect(status.progress).toMatchObject({ done: 1, total: 1 })
  expect(status.crons).toMatchObject([{ id: 'job1', state: 'cancelled' }])
})

// delete

test('delete removes one entry of each kind', async ($, on) => {
  const w = world(on, { repos: [{ root: '/other', remote: 'git@github.com:octo/other.git' }] })
  w.answer('CronCreate', () => ({ id: 'job1', humanSchedule: '0 * * * *', recurring: true }))
  w.answer('TaskCreate', () => ({ task: { id: '7', subject: 'Lint' } }))
  await start($)
  await callStatusTool($, { action: 'item', state: 'added', title: 'Write tests' })
  await callStatusTool($, surprise())
  await callStatusTool($, { action: 'ticket', state: 'started', number: 4, title: 'Add CRUD', effort: 'crud' })
  await callStatusTool($, { action: 'link', url: PR_URL })
  await $.tool.call({ tool: 'TaskCreate', subject: 'Lint' } as never)
  await $.tool.call({ tool: 'CronCreate', cron: '0 * * * *', prompt: 'Check CI', recurring: true } as never)
  await $.tool.call({ tool: 'Edit', file_path: '/other/README.md', old_string: 'a', new_string: 'b' } as never)
  await settle($, w)
  expect(saved(w).places).toHaveLength(1)

  const replies = []
  for (const [kind, id] of [
    ['item', 'I1'],
    ['surprise', 'S1'],
    ['ticket', '#4'],
    ['link', 'skills#88'],
    ['effort', 'crud'],
    ['task', '7'],
    ['cron', 'job1'],
    ['place', 'octo/other'],
  ]) {
    replies.push((await callStatusTool($, { action: 'delete', kind, id })).result)
  }

  expect(replies).toEqual([
    'Item I1 deleted.',
    'Surprise S1 deleted.',
    'Ticket #4 deleted.',
    'Link skills#88 deleted.',
    'Effort crud deleted.',
    'Task 7 deleted.',
    'Cron job job1 deleted.',
    'Place octo/other deleted.',
  ])
  const status = saved(w)
  expect([status.sessionItems, status.items, status.ticketReports, status.links, status.tasks, status.crons, status.places]).toEqual([[], [], [], [], [], [], []])
  expect(status.effort).toBeNull()
})

test('a deleted id is not given again', async ($, on) => {
  world(on)
  await start($)
  await callStatusTool($, { action: 'item', state: 'added', title: 'One' })
  await callStatusTool($, surprise())
  await callStatusTool($, { action: 'delete', kind: 'item', id: 'I1' })
  await callStatusTool($, { action: 'delete', kind: 'surprise', id: 'S1' })

  expect((await callStatusTool($, { action: 'item', state: 'added', title: 'Two' })).result).toContain('I2')
  expect((await callStatusTool($, surprise())).result).toBe('Recorded surprise S2.')
})

test('deleting a blocker withdraws its ping', async ($, on) => {
  const w = world(on)
  await start($)
  await callStatusTool($, { action: 'record_blocker', failed: 'npm install was denied', needs: 'Allow npm install' })
  await callStatusTool($, { action: 'delete', kind: 'blocker', id: 'B1' })
  await settle($, w)

  expect(pingRuns(w)).toEqual(['ping', 'withdraw'])
})

// manual and automatic changes

test('a link the agent closed stays closed until GitHub reports another state change', () => {
  const linked = createEntry(emptyStatus(SESSION_ID), 'link', { url: PR_URL }, { now: START })
  if ('error' in linked) {
    throw new Error(linked.error)
  }
  const closed = updateEntry(linked.status, 'link', 'skills#88', { state: 'closed' }, { now: START })
  if ('error' in closed) {
    throw new Error(closed.error)
  }

  const stillOpen = withLinkStates(closed.status, new Map([[PR_URL, 'open']]))
  expect(stillOpen.links[0]?.state).toBe('closed')

  const merged = withLinkStates(stillOpen, new Map([[PR_URL, 'merged']]))
  expect(merged.links[0]?.state).toBe('merged')
  expect(merged.links[0]).not.toHaveProperty('fieldsSetBy')
})

test('a gh command is a new change: it overwrites a state the agent set', async ($, on) => {
  const w = world(on)
  await start($)
  await callStatusTool($, { action: 'link', url: PR_URL })
  await callStatusTool($, { action: 'update', kind: 'link', id: 'skills#88', fields: { state: 'closed' } })

  await $.tool.call({ tool: 'Bash', command: 'gh pr reopen 88 --repo octo/skills' })

  expect(saved(w).links[0]?.state).toBe('open')
})

test('a deleted link does not come back from the next gh command or GitHub read; link adds it again', async ($, on) => {
  const w = world(on)
  w.answer('Bash', () => ({ stdout: `${PR_URL}\n`, stderr: '', interrupted: false }))
  await start($)
  await $.tool.call({ tool: 'Bash', command: 'gh pr create --fill' })
  expect(saved(w).links).toHaveLength(1)

  await callStatusTool($, { action: 'delete', kind: 'link', id: 'skills#88' })
  await $.tool.call({ tool: 'Bash', command: 'gh pr create --fill' })
  expect(saved(w).links).toEqual([])
  expect(saved(w).deleted).toMatchObject([{ kind: 'link', key: PR_URL }])

  await callStatusTool($, { action: 'link', url: PR_URL })
  expect(saved(w).links).toHaveLength(1)
  expect(saved(w).deleted).toEqual([])
})

test('a deleted effort does not come back from a label; a new label names a new one', async ($, on) => {
  const w = world(on)
  await start($)
  await $.tool.call({ tool: 'Bash', command: 'gh issue list --label effort:false-one' })
  expect(saved(w).effort?.name).toBe('false-one')

  await callStatusTool($, { action: 'delete', kind: 'effort', id: 'false-one' })
  await $.tool.call({ tool: 'Bash', command: 'gh issue list --label effort:false-one' })
  expect(saved(w).effort).toBeNull()

  await $.tool.call({ tool: 'Bash', command: 'gh issue list --label effort:real' })
  expect(saved(w).effort?.name).toBe('real')
})

test('an effort name the agent set stays until a label names another effort', () => {
  const found = withEffort(emptyStatus(SESSION_ID), { name: 'crud', from: 'branch' })
  const renamed = updateEntry(found, 'effort', 'crud', { name: 'session-status-crud' }, { now: START })
  if ('error' in renamed) {
    throw new Error(renamed.error)
  }

  expect(withEffort(renamed.status, { name: 'crud', from: 'label' }).effort?.name).toBe('session-status-crud')
  expect(withEffort(renamed.status, { name: 'launch', from: 'label' }).effort).toEqual({ name: 'launch', from: 'label' })
})

test('a task the agent set stays over a TodoWrite list that states it again, not over a task event', () => {
  const listed = todosWritten(emptyStatus(SESSION_ID), [{ content: 'Lint', status: 'pending' }], undefined, START)
  const done = updateEntry(listed, 'task', 'todo:main:0', { status: 'completed' }, { now: START })
  if ('error' in done) {
    throw new Error(done.error)
  }

  const again = todosWritten(done.status, [{ content: 'Lint', status: 'pending' }], undefined, START + 1)
  expect(again.tasks[0]?.status).toBe('completed')

  const moved = todosWritten(again, [{ content: 'Lint', status: 'in_progress' }], undefined, START + 2)
  expect(moved.tasks[0]?.status).toBe('in_progress')

  const event = taskUpdated(done.status, { id: 'todo:main:0', status: 'pending' }, START + 3)
  expect(event.tasks[0]?.status).toBe('pending')
})

test('a deleted task does not come back from the next TodoWrite list', () => {
  const listed = todosWritten(emptyStatus(SESSION_ID), [{ content: 'Lint', status: 'pending' }], undefined, START)
  const status = { ...listed, deleted: [{ kind: 'task' as const, key: 'todo:main:0', at: START }], tasks: [] }

  expect(todosWritten(status, [{ content: 'Lint', status: 'pending' }], undefined, START + 1).tasks).toEqual([])
})

test('a cron job the agent set active after it expired stays active', () => {
  const job = { id: 'job1', schedule: 'hourly', prompt: 'Check CI', recurring: true, state: 'expired' as const, fires: 0, createdAt: START, at: START }
  const status = { ...emptyStatus(SESSION_ID), crons: [job] }
  const active = updateEntry(status, 'cron', 'job1', { state: 'active' }, { now: START })
  if ('error' in active) {
    throw new Error(active.error)
  }

  expect(expireCrons(active.status.crons, START + 8 * 24 * 3_600_000)[0]?.state).toBe('active')
})

test('a deleted place is not counted again', async ($, on) => {
  const w = world(on, { repos: [{ root: '/other', remote: 'git@github.com:octo/other.git' }] })
  await start($)
  await $.tool.call({ tool: 'Edit', file_path: '/other/a.md', old_string: 'a', new_string: 'b' } as never)
  await settle($, w)
  await callStatusTool($, { action: 'delete', kind: 'place', id: 'octo/other' })

  await $.tool.call({ tool: 'Edit', file_path: '/other/b.md', old_string: 'a', new_string: 'b' } as never)
  await settle($, w)

  expect(saved(w).places).toEqual([])
})

// rules

test('an unknown kind, id or field names the allowed values', async ($, on) => {
  world(on)
  await start($)
  await callStatusTool($, { action: 'link', url: PR_URL })

  expect((await callStatusTool($, { action: 'delete', kind: 'note', id: 'N1' })).deny).toBe(
    '`delete` needs `kind`: one of item, decision, surprise, blocker, ticket, link, effort, task, cron, place.',
  )
  expect((await callStatusTool($, { action: 'delete', kind: 'link', id: 'skills#1' })).deny).toBe('No link skills#1. Use one of: skills#88.')
  expect((await callStatusTool($, { action: 'update', kind: 'link', id: 'skills#88', fields: { title: 'x' } })).deny).toBe(
    'A link has no field `title` that `update` can set. Use: state.',
  )
  expect((await callStatusTool($, { action: 'update', kind: 'link', id: 'skills#88', fields: { state: 'gone' } })).deny).toBe(
    "A link's `state` is one of: open, merged, closed.",
  )
  expect((await callStatusTool($, { action: 'update', kind: 'place', id: 'x', fields: { name: 'y' } })).deny).toBe(
    'A place has no field that `update` can set. Use `delete` to remove it.',
  )
})

test('a subagent can change only the entries that it created', async ($, on) => {
  const w = world(on)
  await start($)
  await callStatusTool($, surprise())
  await subagentToolCall($, 'agent-1', { tool: 'mcp__session-status__status', action: 'record_surprise', occurred: 'Mine', changed: 'Nothing' } as never)

  const other = await subagentToolCall($, 'agent-1', { tool: 'mcp__session-status__status', action: 'delete', kind: 'surprise', id: 'S1' } as never)
  const own = await subagentToolCall($, 'agent-1', { tool: 'mcp__session-status__status', action: 'delete', kind: 'surprise', id: 'S2' } as never)

  expect(other.deny).toBe('A subagent can change only the entries that it created. Surprise S1 is not one of them.')
  expect(own.result).toBe('Surprise S2 deleted.')
  expect(saved(w).items.map(item => item.id)).toEqual(['S1'])
})

test('the shortcuts and the generic actions read their input the same way', () => {
  expect(readStatusToolInput({ action: 'record_surprise', occurred: 'x' })).toEqual({ error: 'A surprise needs `changed`: what it changed in the work or the plan.' })
  expect(readStatusToolInput({ action: 'create', kind: 'surprise', fields: { occurred: 'x', changed: 'y', when: 'now' } })).toEqual({
    error: 'A surprise has no field `when` that `create` can set. Use: occurred, changed.',
  })
  expect(readStatusToolInput({ action: 'read' })).toEqual({ crud: { action: 'read', filter: null } })
})

test('reset still deletes all entries at one time', async ($, on) => {
  const w = world(on)
  await start($)
  await callStatusTool($, { action: 'link', url: PR_URL })
  await callStatusTool($, { action: 'delete', kind: 'link', id: 'skills#88' })
  await callStatusTool($, { action: 'item', state: 'added', title: 'One' })

  await callStatusTool($, { action: 'reset' })

  expect(saved(w)).toMatchObject({ sessionItems: [], links: [], deleted: [] })
})

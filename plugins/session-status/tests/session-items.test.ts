import { expect, test } from 'claude-code/testing'
import type { Engine } from 'claude-code/testing'

import { INSTRUCTIONS } from '../hooks/instructions'
import { reportItem } from '../hooks/session-items'
import { sessionProgress } from '../hooks/session-progress'
import { CAP, emptyStatus, withinBounds } from '../hooks/status'
import type { SessionItem } from '../types'
import {
  SESSION_ID,
  START,
  STATUS_TOOL,
  SURFACES,
  bandText,
  callStatusTool,
  ghIssue,
  mountPane,
  sectionText,
  start,
  subagentToolCall,
  world,
} from './world'

const EFFORT = 'video-review-v1'

/** Adds an item as the main session does. */
function add($: Engine, title: string) {
  return callStatusTool($, { action: 'item', state: 'added', title })
}

/** Marks an item done or dropped by its id. */
function mark($: Engine, state: 'done' | 'dropped', id: string) {
  return callStatusTool($, { action: 'item', state, id })
}

/** An effort with 13 build tickets, one QA ticket and its spec. */
function effortIssues() {
  return [
    ghIssue(1, 'Spec: Video Review v1', 'OPEN', EFFORT),
    ...Array.from({ length: 13 }, (_, n) => ghIssue(n + 2, `Ticket ${n + 2}`, 'OPEN', EFFORT)),
    ghIssue(15, 'QA: Video Review v1', 'OPEN', EFFORT),
  ]
}

test('the status tool describes the item action and its states', async ($, on) => {
  const { tools } = world(on)
  await start($)

  const tool = tools.get(STATUS_TOOL)
  expect(tool?.inputSchema).toMatchObject({
    properties: {
      action: { enum: expect.arrayContaining(['item']) },
      state: { enum: expect.arrayContaining(['added', 'done', 'dropped']) },
    },
  })
  expect(tool?.description).toMatch(/`item`/)
  expect(tool?.description).toMatch(/never for a subagent/i)
  expect(INSTRUCTIONS.text).toMatch(/action `item`/)
  expect(INSTRUCTIONS.text).toMatch(/state `dropped`/)
})

test('items added one by one grow the total, and done ones count as done', async ($, on) => {
  const w = world(on)
  await start($)

  expect((await add($, 'Open the repository from the header')).result).toBe(
    'Added item I1 Open the repository from the header. Session: 0/1 done.',
  )
  await add($, 'Open each count chip on GitHub')
  expect((await mark($, 'done', 'I1')).result).toBe(
    'Item I1 Open the repository from the header is done. Session: 1/2 done.',
  )
  // A later request grows the total.
  await add($, 'Commit the work')

  expect(w.saved[SESSION_ID]).toMatchObject({
    sessionItems: [
      { id: 'I1', title: 'Open the repository from the header', state: 'done', addedAt: START, at: START },
      { id: 'I2', state: 'added' },
      { id: 'I3', state: 'added' },
    ],
  })
  for (const surface of SURFACES) {
    const text = (await sectionText($, surface, 'session')) ?? ''
    expect(text).toContain('Progress 1/3')
    expect(text).toContain('○ I2 Open each count chip on GitHub')
    expect(text).toContain('○ I3 Commit the work')
    expect(text).not.toContain('I1')
    expect(text).toContain('+1 more')
  }
  expect(w.panes.has('session-status')).toBe(true)
})

test('a dropped item leaves the total, even after it was done', async ($, on) => {
  world(on)
  await start($)
  await add($, 'Make the icon bigger')
  await mark($, 'done', 'I1')
  await add($, 'Make all the buttons the same size')
  await mark($, 'done', 'I2')

  expect((await mark($, 'dropped', 'i1')).result).toBe('Item I1 Make the icon bigger is dropped. Session: 1/1 done.')
  for (const surface of SURFACES) {
    expect(await sectionText($, surface, 'session')).toContain('Progress 1/1')
  }
})

test('a done item never goes back, a dropped item stays dropped, and the tool says what is wrong', async ($, on) => {
  world(on)
  await start($)
  await add($, 'One')
  await mark($, 'dropped', 'I1')

  expect((await mark($, 'done', 'I1')).deny).toContain('is dropped')
  expect((await mark($, 'dropped', 'I1')).result).toContain('is dropped already')
  expect((await mark($, 'done', 'I9')).deny).toContain('No item I9')
  expect((await callStatusTool($, { action: 'item', state: 'added' })).deny).toContain('`title`')
  expect((await callStatusTool($, { action: 'item', state: 'done' })).deny).toContain('`id`')
  expect((await callStatusTool($, { action: 'item', state: 'landed', id: 'I1' })).deny).toContain('state')
  // `added` always adds a new item: it never reopens one.
  expect((await callStatusTool($, { action: 'item', state: 'added', id: 'I1', title: 'One again' })).result).toContain(
    'Added item I2',
  )
})

test('a subagent cannot report items', async ($, on) => {
  const w = world(on)
  await start($)

  const answer = await subagentToolCall($, 'agent-1', { tool: STATUS_TOOL, action: 'item', state: 'added', title: 'x' } as never)

  expect(answer.deny).toContain('Only the main session')
  expect((w.saved[SESSION_ID] as { sessionItems?: unknown[] } | undefined)?.sessionItems ?? []).toEqual([])
})

test("during an effort the session total holds every build ticket, QA left out, and the session's items", async ($, on) => {
  const w = world(on, { isNarrow: true, issues: effortIssues() })
  await start($)
  for (const title of ['Review the branch', 'Open the pull request', 'Get the approval', 'Merge', 'Follow up', 'Settle']) {
    await add($, title)
  }
  await callStatusTool($, { action: 'ticket', state: 'started', number: 2, title: 'Ticket 2', effort: EFFORT })
  const answer = await callStatusTool($, { action: 'ticket', state: 'landed', number: 2 })
  await w.clock.advance(0)

  expect(w.saved[SESSION_ID]).toMatchObject({ tickets: { effort: EFFORT, done: 0, total: 14, builds: 13 } })
  // The tracker's count arrives after the reply: until then the reported ticket stands for the tickets.
  expect(answer.result).toBe('Ticket #2 Ticket 2 is landed. Session: 1/7 done.')
  for (const surface of SURFACES) {
    expect(await sectionText($, surface, 'session')).toContain('Progress 1/19')
    // The effort keeps counting its QA ticket: it is not finished until QA closes.
    expect(await sectionText($, surface, 'effort')).toContain('Closed 0/14')
    expect(await bandText($, surface)).toBe('0 blocked · 0 decide · progress 1/19 · closed 0/14 · 0 surprise')
  }
})

test('a QA ticket the orchestrator reports does not count in the session', () => {
  const status = {
    ...emptyStatus(SESSION_ID),
    ticketReports: [
      { number: 2, title: 'Ticket 2', state: 'landed' as const, at: 0 },
      { number: 3, title: 'QA: Check it by hand', state: 'started' as const, at: 0 },
    ],
  }

  expect(sessionProgress(status)).toMatchObject({ done: 1, total: 1, building: [] })
})

test('the task list keeps a line of its own beside the items', async ($, on) => {
  world(on, { isNarrow: true })
  await start($)
  await $.classic.TaskCreated({ task_id: '1', task_subject: 'Build the pane' })
  await add($, 'Show the items')

  for (const surface of SURFACES) {
    const text = (await sectionText($, surface, 'session')) ?? ''
    expect(text).toContain('Progress 0/1')
    expect(text).toContain('Tasks 0/1')
    expect(await bandText($, surface)).toBe('0 blocked · 0 decide · progress 0/1 · tasks 0/1 · 0 surprise')
  }
})

test('the section lists two items, open ones first, then a "+N more" that opens them all', async ($, on) => {
  world(on)
  await start($)
  for (const n of [1, 2, 3, 4]) {
    await add($, `Item ${n}`)
  }
  await mark($, 'done', 'I1')
  await mark($, 'done', 'I2')
  await mark($, 'dropped', 'I4')

  for (const surface of SURFACES) {
    const ui = await mountPane($, surface)
    const text = (await ui.find({ key: 'session' }))?.text ?? ''
    expect(text).toContain('Progress 2/3')
    expect(text).toContain('○ I3 Item 3')
    expect(text).toContain('✓ I2 Item 2')
    expect(text).not.toContain('I1')
    expect(text).not.toContain('I4')
    expect((await ui.find({ key: 'items-more' }))?.text).toBe('+1 more')

    await ui.press({ key: 'items-more' })
    const list = (await ui.find({ key: 'list-view' }))?.text ?? ''
    expect(list).toContain('Session items (2/3 done)')
    expect(list.indexOf('○ I3 Item 3')).toBeLessThan(list.indexOf('✓ I2 Item 2'))
    expect(list.indexOf('✓ I2 Item 2')).toBeLessThan(list.indexOf('✓ I1 Item 1'))
    expect(list).not.toContain('I4')
    await ui.press({ key: 'back' })
    await ui.unmount()
  }
})

test('with two items or fewer the section shows no "+N more"', async ($, on) => {
  world(on)
  await start($)
  await add($, 'One')
  await add($, 'Two')
  await mark($, 'done', 'I1')

  for (const surface of SURFACES) {
    const text = (await sectionText($, surface, 'session')) ?? ''
    expect(text).toContain('○ I2 Two')
    expect(text).toContain('✓ I1 One')
    expect(text).not.toContain('more')
  }
})

test('past the cap the open items and the newest item stay', () => {
  const items: SessionItem[] = Array.from({ length: CAP + 5 }, (_, n) => ({
    id: `I${n + 1}`,
    title: `Item ${n + 1}`,
    state: n === 0 ? 'added' : 'done',
    addedAt: n,
    at: n,
  }))

  const kept = withinBounds({ ...emptyStatus(SESSION_ID), sessionItems: items }).sessionItems

  expect(kept).toHaveLength(CAP)
  expect(kept[0]).toMatchObject({ id: 'I1', state: 'added' })
  expect(kept.at(-1)).toMatchObject({ id: `I${CAP + 5}` })
  const next = reportItem({ ...emptyStatus(SESSION_ID), sessionItems: kept }, { state: 'added', title: 'x' }, 0)
  expect(next).toMatchObject({ item: { id: `I${CAP + 6}` } })
})

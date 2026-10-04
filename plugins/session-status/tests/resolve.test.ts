import { expect, test } from 'claude-code/testing'

import {
  SESSION_ID,
  START,
  STATUS_TOOL,
  SURFACES,
  blockedDecision,
  callStatusTool,
  mountPane,
  reviewLaterDecision,
  sectionText,
  start,
  surprise,
  world,
} from './world'

type Saved = {
  items: { id: string; resolvedAt?: number }[]
  endListPostedAt: number | null
}

test('the status tool offers resolve, dismiss and post_end_list, and tells the agent how to use them', async ($, on) => {
  const { tools } = world(on)
  await start($)

  const tool = tools.get(STATUS_TOOL)
  expect(tool?.inputSchema).toMatchObject({
    properties: {
      action: { enum: ['record_decision', 'record_surprise', 'resolve', 'dismiss', 'post_end_list', 'ticket'] },
      id: { type: 'string' },
    },
  })
  const description = tool?.description ?? ''
  expect(description).toMatch(/safe default/i)
  expect(description).toMatch(/stop only when no safe default exists/i)
  expect(description).toMatch(/`resolve`/)
  expect(description).toMatch(/`dismiss`/)
  expect(description).toMatch(/`post_end_list`/)
  expect(description).toMatch(/numbered list/i)
})

test('resolve marks a decision resolved and keeps it in the status', async ($, on) => {
  const { saved, clock } = world(on)
  await start($)
  await callStatusTool($, blockedDecision())
  await clock.advance(5_000)

  const answer = await callStatusTool($, { action: 'resolve', id: 'D1' })

  expect(answer.deny).toBeUndefined()
  expect(answer.result).toContain('D1')
  expect(saved[SESSION_ID]).toMatchObject({ items: [{ id: 'D1', resolvedAt: START + 5_000 }] })
})

test('dismiss marks a surprise dismissed and keeps it in the status', async ($, on) => {
  const { saved } = world(on)
  await start($)
  await callStatusTool($, surprise())

  const answer = await callStatusTool($, { action: 'dismiss', id: 'S1' })

  expect(answer.result).toContain('S1')
  expect(saved[SESSION_ID]).toMatchObject({ items: [{ id: 'S1', resolvedAt: START }] })
})

test('resolve and dismiss refuse an unknown id, an item already closed and an item of the other kind', async ($, on) => {
  const { saved } = world(on)
  await start($)
  await callStatusTool($, blockedDecision())
  await callStatusTool($, surprise())
  await callStatusTool($, { action: 'resolve', id: 'D1' })

  expect((await callStatusTool($, { action: 'resolve', id: 'D9' })).deny).toContain('No decision D9')
  expect((await callStatusTool($, { action: 'resolve', id: 'D1' })).deny).toContain('already resolved')
  expect((await callStatusTool($, { action: 'resolve', id: 'S1' })).deny).toContain('dismiss')
  expect((await callStatusTool($, { action: 'dismiss', id: 'D1' })).deny).toContain('resolve')
  expect((await callStatusTool($, { action: 'dismiss', id: 'S7' })).deny).toContain('No surprise S7')
  expect((await callStatusTool($, { action: 'resolve' })).deny).toContain('id')
  expect((saved[SESSION_ID] as Saved).items.find(item => item.id === 'S1')?.resolvedAt).toBeUndefined()
})

test('a resolved decision and a dismissed surprise leave their sections for the collapsed answered history', async ($, on) => {
  world(on)
  await start($)
  await callStatusTool($, blockedDecision())
  await callStatusTool($, reviewLaterDecision())
  await callStatusTool($, surprise())
  await callStatusTool($, { action: 'resolve', id: 'D1' })
  await callStatusTool($, { action: 'resolve', id: 'D2' })
  await callStatusTool($, { action: 'dismiss', id: 'S1' })

  for (const surface of SURFACES) {
    const ui = await mountPane($, surface)
    expect(await ui.find({ key: 'blocked' })).toBeUndefined()
    expect(await ui.find({ key: 'review-later' })).toBeUndefined()
    expect(await ui.find({ key: 'surprises' })).toBeUndefined()
    const history = (await ui.find({ key: 'history' }))?.text ?? ''
    expect(history).toBe('Answered (3)')
    expect(history).not.toContain('Which database')
    await ui.unmount()
  }
})

test('the history comes before the last update and stays out while nothing is answered', async ($, on) => {
  world(on)
  await start($)
  await callStatusTool($, blockedDecision())

  for (const surface of SURFACES) {
    expect(await sectionText($, surface, 'history')).toBeUndefined()
  }
  await callStatusTool($, { action: 'resolve', id: 'D1' })

  for (const surface of SURFACES) {
    const ui = await mountPane($, surface)
    const keys = (await ui.findAll({ type: 'Box' })).map(box => box.key)
    expect(keys.indexOf('history')).toBeGreaterThan(-1)
    expect(keys.indexOf('history')).toBe(keys.indexOf('last-update') - 1)
    await ui.unmount()
  }
})

test('the sections count open items only, "+N more" included', async ($, on) => {
  world(on)
  await start($)
  for (let n = 1; n <= 5; n++) {
    await callStatusTool($, reviewLaterDecision({ question: `Name ${n}?` }))
  }
  for (let n = 1; n <= 4; n++) {
    await callStatusTool($, surprise({ occurred: `Event ${n}` }))
  }
  await callStatusTool($, blockedDecision())
  await callStatusTool($, blockedDecision({ question: 'Which cache?' }))
  await callStatusTool($, { action: 'resolve', id: 'D5' })
  await callStatusTool($, { action: 'resolve', id: 'D1' })
  await callStatusTool($, { action: 'dismiss', id: 'S4' })
  await callStatusTool($, { action: 'resolve', id: 'D6' })

  for (const surface of SURFACES) {
    const ui = await mountPane($, surface)
    expect((await ui.find({ key: 'blocked' }))?.text).toContain('Blocked on you (1)')
    expect(await ui.find({ key: 'blocked-D6' })).toBeUndefined()
    expect((await ui.find({ key: 'review-later' }))?.text).toContain('Review later (3)')
    expect(await ui.find({ key: 'review-later-more' })).toBeUndefined()
    expect(await ui.find({ key: 'review-later-D5' })).toBeUndefined()
    expect((await ui.find({ key: 'surprises' }))?.text).toContain('Surprises (3)')
    expect((await ui.find({ key: 'surprises-more' }))?.text).toBe('+1 more')
    expect(await ui.find({ key: 'surprise-S4' })).toBeUndefined()
    expect((await ui.find({ key: 'history' }))?.text).toBe('Answered (4)')
    await ui.unmount()
  }
})

test('open review-later decisions stay in the saved status until they are resolved', async ($, on) => {
  const { saved } = world(on)
  await start($)
  await callStatusTool($, reviewLaterDecision())
  await callStatusTool($, reviewLaterDecision({ question: 'Which port?' }))
  await callStatusTool($, { action: 'post_end_list' })
  await callStatusTool($, { action: 'resolve', id: 'D2' })

  const open = (saved[SESSION_ID] as Saved).items.filter(item => item.resolvedAt === undefined)
  expect(open.map(item => item.id)).toEqual(['D1'])
  expect((saved[SESSION_ID] as Saved).items.map(item => item.id)).toEqual(['D1', 'D2'])
})

test('post_end_list records when the list was posted and names the open decisions', async ($, on) => {
  const { saved, clock } = world(on)
  await start($)
  await callStatusTool($, reviewLaterDecision())
  await callStatusTool($, reviewLaterDecision({ question: 'Which port?' }))
  await clock.advance(2_000)

  const answer = await callStatusTool($, { action: 'post_end_list' })

  expect(answer.result).toContain('D1, D2')
  expect((saved[SESSION_ID] as Saved).endListPostedAt).toBe(START + 2_000)
})

test('post_end_list with no open review-later decision records nothing', async ($, on) => {
  const { saved } = world(on)
  await start($)
  await callStatusTool($, reviewLaterDecision())
  await callStatusTool($, { action: 'resolve', id: 'D1' })

  const answer = await callStatusTool($, { action: 'post_end_list' })

  expect(answer.result).toContain('No open review-later decisions')
  expect((saved[SESSION_ID] as Saved).endListPostedAt).toBeNull()
})

test('after the end-of-work list the pane highlights every listed open decision until it is resolved', async ($, on) => {
  const { clock } = world(on)
  await start($)
  for (let n = 1; n <= 5; n++) {
    await callStatusTool($, reviewLaterDecision({ question: `Name ${n}?` }))
  }

  for (const surface of SURFACES) {
    const ui = await mountPane($, surface)
    expect(await ui.find({ key: 'review-later-listed' })).toBeUndefined()
    await ui.unmount()
  }

  await callStatusTool($, { action: 'post_end_list' })
  await callStatusTool($, { action: 'resolve', id: 'D2' })
  await clock.advance(1_000)
  await callStatusTool($, reviewLaterDecision({ question: 'Name 6?' }))

  for (const surface of SURFACES) {
    const ui = await mountPane($, surface)
    expect((await ui.find({ key: 'review-later' }))?.text).toContain('Review later (5)')
    expect((await ui.find({ key: 'review-later-listed' }))?.text).toContain('In your end-of-work list (4)')
    const listed = (await ui.findAll({ type: 'Box' }))
      .map(box => box.key)
      .filter(key => key?.startsWith('review-later-listed-D'))
    expect(listed).toEqual(['review-later-listed-D1', 'review-later-listed-D3', 'review-later-listed-D4', 'review-later-listed-D5'])
    expect((await ui.find({ key: 'review-later-listed-D1' }))?.text).toContain('Default: --fast')
    expect(await ui.find({ key: 'review-later-D6' })).toBeDefined()
    expect(await ui.find({ key: 'review-later-D1' })).toBeUndefined()
    expect(await ui.find({ key: 'review-later-more' })).toBeUndefined()
    await ui.unmount()
  }
})

test('resolve and post_end_list check the status of the session that runs now', async ($, on) => {
  const w = world(on)
  await start($)
  await callStatusTool($, blockedDecision())
  await callStatusTool($, reviewLaterDecision())
  await w.clock.advance(0)
  w.runs.length = 0
  // A resume moves the process to a session with no saved status.
  w.switchSession('session-b')

  const resolved = await callStatusTool($, { action: 'resolve', id: 'D1' })
  const listed = await callStatusTool($, { action: 'post_end_list' })
  await w.clock.advance(0)

  expect(resolved.deny).toContain('No decision D1')
  expect(listed.result).toBe('No open review-later decisions. No end-of-work list was marked as posted.')
  expect(w.runs).toEqual([])
})

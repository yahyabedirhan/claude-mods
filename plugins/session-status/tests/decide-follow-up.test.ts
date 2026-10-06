import { expect, test } from 'claude-code/testing'

import { emptyStatus, savedStatus } from '../hooks/status'
import {
  SESSION_ID,
  START,
  SURFACES,
  bandText,
  callStatusTool,
  decisionBeforeSettling,
  mountPane,
  sectionText,
  start,
  world,
} from './world'

/** A decision that can wait until after the session settles. */
function followUp(fields: Record<string, unknown> = {}) {
  return decisionBeforeSettling({ urgency: 'after_settling', question: 'Should observations be dismissable?', ...fields })
}

test('a decision that can wait shows under Follow-up after settling, not under Decide before settling', async ($, on) => {
  const w = world(on, { isNarrow: true })
  await start($)

  const answer = await callStatusTool($, followUp())
  await callStatusTool($, decisionBeforeSettling())
  await w.clock.advance(0)

  expect(answer.result).toBe('Recorded decision D1 (follow-up after settling). Default: --fast.')
  expect(w.runs.filter(argv => argv[0] === 'shipyard')).toEqual([])
  for (const surface of SURFACES) {
    const followUps = (await sectionText($, surface, 'follow-up')) ?? ''
    expect(followUps).toContain('Follow-up after settling (1)')
    expect(followUps).toContain('D1 · Should observations be dismissable?')
    expect(followUps).toContain('Default: --fast')
    const decide = (await sectionText($, surface, 'decide')) ?? ''
    expect(decide).toContain('Decide before settling (1)')
    expect(decide).not.toContain('D1')
    expect(await bandText($, surface)).toBe('0 blocked · 1 decide · 1 follow-up · 0 surprise')
  }
})

test('follow-ups stay off the decide list', async ($, on) => {
  world(on)
  await start($)
  await callStatusTool($, followUp())

  const answer = await callStatusTool($, { action: 'post_decide_list' })

  expect(answer.result).toBe('No open decisions before settling. No decide list was marked as posted.')
})

test('Follow-up after settling shows the newest three, then a "+N more" that opens them all', async ($, on) => {
  world(on)
  await start($)
  for (const n of [1, 2, 3, 4, 5]) {
    await callStatusTool($, followUp({ question: `Follow-up ${n}?` }))
  }

  for (const surface of SURFACES) {
    const ui = await mountPane($, surface)
    expect((await ui.find({ key: 'follow-up-more' }))?.text).toBe('+2 more')
    await ui.press({ key: 'follow-up-more' })
    const list = (await ui.find({ key: 'list-view' }))?.text ?? ''
    expect(list).toContain('Follow-up after settling (5)')
    expect(list).toContain('Follow-up 1?')
    await ui.press({ key: 'back' })
    await ui.unmount()
  }
})

test('the old urgency name still reads as a decision before settling', async ($, on) => {
  world(on)
  await start($)

  await callStatusTool($, decisionBeforeSettling({ urgency: 'review_later' }))

  for (const surface of SURFACES) {
    expect(await sectionText($, surface, 'decide')).toContain('Decide before settling (1)')
  }
  const old = {
    ...emptyStatus(SESSION_ID),
    items: [{ ...decisionBeforeSettling(), kind: 'decision', id: 'D1', urgency: 'review_later', recordedAt: START }],
  }
  expect(savedStatus(old, SESSION_ID)?.items[0]).toMatchObject({ urgency: 'before_settling' })
})

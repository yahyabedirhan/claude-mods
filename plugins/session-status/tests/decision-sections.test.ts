import { expect, test } from 'claude-code/testing'

import {
  SURFACES,
  blockedDecision,
  callStatusTool,
  mountPane,
  decisionBeforeSettling,
  start,
  surprise,
  world,
} from './world'

test('blocked on you shows every blocked decision with what unblocks it and the recommended answer', async ($, on) => {
  world(on)
  await start($)
  for (let n = 1; n <= 5; n++) {
    await callStatusTool(
      $,
      blockedDecision({ question: `Question ${n}?`, unblocks: `Say yes ${n}`, default: `Yes ${n}`, options: [`Yes ${n}`, 'No'] }),
    )
  }

  for (const surface of SURFACES) {
    const ui = await mountPane($, surface)
    const section = (await ui.find({ key: 'blocked' }))?.text ?? ''
    expect(section).toContain('Blocked on you (5)')
    for (let n = 1; n <= 5; n++) {
      const item = (await ui.find({ key: `blocked-D${n}` }))?.text ?? ''
      expect(item).toContain(`Question ${n}?`)
      expect(item).toContain(`Unblocks: Say yes ${n}`)
      expect(item).toContain(`Recommended: Yes ${n}`)
    }
    expect(section).not.toContain('more')
    await ui.unmount()
  }
})

test('decide before settling shows the newest five decisions and "+N more"', async ($, on) => {
  world(on)
  await start($)
  for (let n = 1; n <= 7; n++) {
    await callStatusTool($, decisionBeforeSettling({ question: `Name ${n}?`, default: `name-${n}`, options: [`name-${n}`, 'other'] }))
  }

  for (const surface of SURFACES) {
    const ui = await mountPane($, surface)
    const section = (await ui.find({ key: 'decide' }))?.text ?? ''
    expect(section).toContain('Decide before settling (7)')
    const shown = (await ui.findAll({ type: 'Box' }))
      .map(box => box.key)
      .filter(key => key?.startsWith('decide-D'))
    expect(shown).toEqual(['decide-D7', 'decide-D6', 'decide-D5', 'decide-D4', 'decide-D3'])
    expect((await ui.find({ key: 'decide-D7' }))?.text).toContain('Default: name-7')
    expect((await ui.find({ key: 'decide-more' }))?.text).toBe('+2 more')
    await ui.unmount()
  }
})

test('surprises shows the newest two with what each changed, and "+N more"', async ($, on) => {
  world(on)
  await start($)
  for (let n = 1; n <= 4; n++) {
    await callStatusTool($, surprise({ occurred: `Event ${n}`, changed: `Change ${n}` }))
  }

  for (const surface of SURFACES) {
    const ui = await mountPane($, surface)
    expect((await ui.find({ key: 'surprises' }))?.text).toContain('Surprises (4)')
    const shown = (await ui.findAll({ type: 'Box' }))
      .map(box => box.key)
      .filter(key => key?.startsWith('surprise-S'))
    expect(shown).toEqual(['surprise-S4', 'surprise-S3'])
    const newest = (await ui.find({ key: 'surprise-S4' }))?.text ?? ''
    expect(newest).toContain('Event 4')
    expect(newest).toContain('Changed: Change 4')
    expect((await ui.find({ key: 'surprises-more' }))?.text).toBe('+2 more')
    await ui.unmount()
  }
})

test('a section within its limit shows no "+N more"', async ($, on) => {
  world(on)
  await start($)
  await callStatusTool($, decisionBeforeSettling())
  await callStatusTool($, surprise())

  for (const surface of SURFACES) {
    const ui = await mountPane($, surface)
    expect(await ui.find({ key: 'decide-more' })).toBeUndefined()
    expect(await ui.find({ key: 'surprises-more' })).toBeUndefined()
    await ui.unmount()
  }
})

test('a blocked decision stays out of decide before settling, and a before-settling one out of blocked on you', async ($, on) => {
  world(on)
  await start($)
  await callStatusTool($, blockedDecision())
  await callStatusTool($, decisionBeforeSettling())

  for (const surface of SURFACES) {
    const ui = await mountPane($, surface)
    expect(await ui.find({ key: 'blocked-D1' })).toBeDefined()
    expect(await ui.find({ key: 'decide-D1' })).toBeUndefined()
    expect(await ui.find({ key: 'decide-D2' })).toBeDefined()
    expect(await ui.find({ key: 'blocked-D2' })).toBeUndefined()
    await ui.unmount()
  }
})

test('the three sections stay out of the pane while they hold nothing', async ($, on) => {
  world(on)
  await start($)

  for (const surface of SURFACES) {
    const ui = await mountPane($, surface)
    expect(await ui.find({ key: 'blocked' })).toBeUndefined()
    expect(await ui.find({ key: 'decide' })).toBeUndefined()
    expect(await ui.find({ key: 'surprises' })).toBeUndefined()
    await ui.unmount()
  }
})

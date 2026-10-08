// Quick reply: a decision's options and Discuss as buttons in the pane. A
// press answers in the chat as the user's own words.

import { expect, test } from 'claude-code/testing'

import { INSTRUCTIONS } from '../hooks/instructions'
import { pingId, withdrawPing } from '../hooks/pings'
import {
  SESSION_ID,
  SURFACES,
  blockedDecision,
  callStatusTool,
  decisionBeforeSettling,
  mountPane,
  start,
  world,
} from './world'

test('a decision with short options shows a button for each, the default marked, and Discuss', async ($, on) => {
  world(on)
  await start($)
  await callStatusTool($, decisionBeforeSettling())

  for (const surface of SURFACES) {
    const ui = await mountPane($, surface)
    expect((await ui.find({ key: 'decide-D1-option-1' }))?.text).toBe('--fast ✓')
    expect((await ui.find({ key: 'decide-D1-option-2' }))?.text).toBe('--quick')
    expect((await ui.find({ key: 'decide-D1-discuss' }))?.text).toBe('Discuss')
    await ui.unmount()
  }
})

test('a decision with a long option shows only Discuss', async ($, on) => {
  world(on)
  await start($)
  await callStatusTool(
    $,
    decisionBeforeSettling({ options: ['--fast', 'Rename every flag to match the new style guide first'] }),
  )

  const ui = await mountPane($, 'terminal')
  expect(await ui.find({ key: 'decide-D1-option-1' })).toBeUndefined()
  expect((await ui.find({ key: 'decide-D1-discuss' }))?.text).toBe('Discuss')
  await ui.unmount()
})

test('pressing an option resolves the decision and sends the answer as the user', async ($, on) => {
  const w = world(on)
  await start($)
  await callStatusTool($, decisionBeforeSettling())

  const ui = await mountPane($, 'terminal')
  await ui.press({ key: 'decide-D1-option-2' })
  expect(await ui.find({ key: 'decide' })).toBeUndefined()
  expect((await ui.find({ key: 'history' }))?.text).toContain('Answered (1)')
  await ui.unmount()

  expect(w.prompts.map(prompt => prompt.text)).toEqual(['D1: --quick'])
  expect(w.prompts[0]?.origin).toMatchObject({ kind: 'plugin', asUser: true })
})

test('pressing an option of a blocked decision withdraws its ping', async ($, on) => {
  const w = world(on)
  await start($)
  await callStatusTool($, blockedDecision())

  const ui = await mountPane($, 'terminal')
  expect((await ui.find({ key: 'blocked-D1-option-1' }))?.text).toBe('Postgres ✓')
  await ui.press({ key: 'blocked-D1-option-2' })
  expect(await ui.find({ key: 'blocked' })).toBeUndefined()
  await ui.unmount()
  await w.clock.advance(0)

  expect(w.runs.filter(argv => argv[0] === 'shipyard').at(-1)).toEqual(withdrawPing(pingId(SESSION_ID, 'D1')))
  expect(w.prompts.map(prompt => prompt.text)).toEqual(['D1: SQLite'])
})

test('pressing Discuss keeps the decision open, marked, with its options, and asks to discuss it', async ($, on) => {
  const w = world(on)
  await start($)
  await callStatusTool($, decisionBeforeSettling())

  const ui = await mountPane($, 'terminal')
  await ui.press({ key: 'decide-D1-discuss' })
  expect((await ui.find({ key: 'decide-D1' }))?.text).toContain('discussing')
  expect(await ui.find({ key: 'decide-D1-discuss' })).toBeUndefined()
  expect((await ui.find({ key: 'decide-D1-option-1' }))?.text).toBe('--fast ✓')
  await ui.unmount()

  expect(w.prompts.map(prompt => prompt.text)).toEqual(["Let's discuss D1: Which name does the flag get?"])

  // After the talk the agent resolves it, or a button still answers it.
  const result = await callStatusTool($, { action: 'resolve', id: 'D1' })
  expect(result).toMatchObject({ result: expect.stringContaining('Resolved decision D1') })
})

test('the prompt section tells the agent how the pane answers and asks to discuss', async ($, on) => {
  world(on)
  expect(INSTRUCTIONS.text).toContain('Write each option in a few words')
  expect(INSTRUCTIONS.text).toContain("Let's discuss")
})

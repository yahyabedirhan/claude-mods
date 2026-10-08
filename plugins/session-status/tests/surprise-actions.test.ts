// Surprise actions: a surprise's or an observation's suggested action,
// File issue, Discuss and Dismiss as buttons in the pane. A press other than
// Dismiss asks in the chat as the user's own words.

import { expect, test } from 'claude-code/testing'

import type { Engine } from 'claude-code/testing'

import {
  SURFACES,
  callStatusTool,
  mountPane,
  runCommand,
  spawnSubagent,
  start,
  subagentStop,
  surprise,
  world,
} from './world'
import type { World } from './world'

const PIN = {
  occurred: 'The agent reinstalled Node 3 times',
  changed: 'Each install drops the cache',
  action: 'Pin Node 22',
}

/** A subagent that finishes, then a settle: the observer's check runs unawaited. */
async function finishSubagent($: Engine, w: World, agentId: string) {
  await spawnSubagent($, agentId)
  await subagentStop($, agentId)
  await w.clock.settle()
}

test('a surprise with an action shows it, File issue, Discuss and Dismiss as buttons', async ($, on) => {
  world(on)
  await start($)
  await callStatusTool($, surprise({ suggested_action: 'Pin Node 22' }))

  for (const surface of SURFACES) {
    const ui = await mountPane($, surface)
    expect((await ui.find({ key: 'surprise-S1-action' }))?.text).toBe('Pin Node 22')
    expect((await ui.find({ key: 'surprise-S1-file-issue' }))?.text).toBe('File issue')
    expect((await ui.find({ key: 'surprise-S1-discuss' }))?.text).toBe('Discuss')
    expect((await ui.find({ key: 'surprise-S1-dismiss' }))?.text).toBe('Dismiss')
    await ui.unmount()
  }
})

test('a surprise without an action, or with one over 30 characters, shows no action button', async ($, on) => {
  world(on)
  await start($)
  await callStatusTool($, surprise())
  await callStatusTool($, surprise({ suggested_action: 'a'.repeat(31) }))
  await callStatusTool($, surprise({ suggested_action: 'a'.repeat(30) }))

  const ui = await mountPane($, 'terminal')
  await ui.press({ key: 'surprises-more' })
  expect(await ui.find({ key: 'all-S1-action' })).toBeUndefined()
  expect((await ui.find({ key: 'all-S1-file-issue' }))?.text).toBe('File issue')
  expect(await ui.find({ key: 'all-S2-action' })).toBeUndefined()
  expect((await ui.find({ key: 'all-S3-action' }))?.text).toBe('a'.repeat(30))
  await ui.unmount()
})

test('pressing Dismiss dismisses the surprise and sends nothing', async ($, on) => {
  const w = world(on)
  await start($)
  await callStatusTool($, surprise())

  const ui = await mountPane($, 'terminal')
  await ui.press({ key: 'surprise-S1-dismiss' })
  expect(await ui.find({ key: 'surprises' })).toBeUndefined()
  expect((await ui.find({ key: 'history' }))?.text).toContain('Answered (1)')
  await ui.unmount()

  expect(w.prompts).toEqual([])
})

test('pressing File issue dismisses the surprise and asks for an issue as the user', async ($, on) => {
  const w = world(on)
  await start($)
  await callStatusTool($, surprise())

  const ui = await mountPane($, 'terminal')
  await ui.press({ key: 'surprise-S1-file-issue' })
  expect(await ui.find({ key: 'surprises' })).toBeUndefined()
  await ui.unmount()

  expect(w.prompts.map(prompt => prompt.text)).toEqual(['File an issue for S1: The API has no batch endpoint'])
  expect(w.prompts[0]?.origin).toMatchObject({ kind: 'plugin', asUser: true })
  // The pane dismissed it already.
  const result = await callStatusTool($, { action: 'dismiss', id: 'S1' })
  expect(result).toMatchObject({ deny: 'Surprise S1 is already dismissed.' })
})

test('pressing the action dismisses the surprise and sends the action as the user', async ($, on) => {
  const w = world(on)
  await start($)
  await callStatusTool($, surprise({ suggested_action: 'Pin Node 22' }))

  const ui = await mountPane($, 'terminal')
  await ui.press({ key: 'surprise-S1-action' })
  expect(await ui.find({ key: 'surprises' })).toBeUndefined()
  await ui.unmount()

  expect(w.prompts.map(prompt => prompt.text)).toEqual(['S1: Pin Node 22'])
  expect(w.prompts[0]?.origin).toMatchObject({ kind: 'plugin', asUser: true })
})

test('pressing Discuss keeps the surprise open, marked, with its buttons, and asks to discuss it', async ($, on) => {
  const w = world(on)
  await start($)
  await callStatusTool($, surprise({ suggested_action: 'Pin Node 22' }))

  const ui = await mountPane($, 'terminal')
  await ui.press({ key: 'surprise-S1-discuss' })
  expect((await ui.find({ key: 'surprise-S1' }))?.text).toContain('(discussing)')
  expect((await ui.find({ key: 'surprise-S1-action' }))?.text).toBe('Pin Node 22')
  expect((await ui.find({ key: 'surprise-S1-dismiss' }))?.text).toBe('Dismiss')
  await ui.press({ key: 'surprise-S1-file-issue' })
  expect(await ui.find({ key: 'surprises' })).toBeUndefined()
  await ui.unmount()

  expect(w.prompts.map(prompt => prompt.text)).toEqual([
    "Let's discuss S1: The API has no batch endpoint",
    'File an issue for S1: The API has no batch endpoint',
  ])
})

test('two quick presses send one prompt', async ($, on) => {
  const w = world(on)
  await start($)
  await callStatusTool($, surprise({ suggested_action: 'Pin Node 22' }))

  const ui = await mountPane($, 'terminal')
  await Promise.all([ui.press({ key: 'surprise-S1-action' }), ui.press({ key: 'surprise-S1-file-issue' })])
  await ui.unmount()

  expect(w.prompts).toHaveLength(1)
})

test('an observation shows the action the observer gave as a button', async ($, on) => {
  const w = world(on)
  w.model(() => JSON.stringify({ findings: [PIN] }))
  await start($)
  await runCommand($)
  await finishSubagent($, w, 'agent-1')

  const ui = await mountPane($, 'terminal')
  expect((await ui.find({ key: 'observation-S1-action' }))?.text).toBe('Pin Node 22')
  expect((await ui.find({ key: 'observation-S1-dismiss' }))?.text).toBe('Dismiss')
  await ui.press({ key: 'observation-S1-action' })
  expect(await ui.find({ key: 'observations' })).toBeUndefined()
  await ui.unmount()

  expect(w.prompts.map(prompt => prompt.text)).toEqual(['S1: Pin Node 22'])
})

test('an observation acted on does not slow the observer; one dismissed does', async ($, on) => {
  const w = world(on)
  let n = 0
  w.model(() => JSON.stringify({ findings: [{ ...PIN, occurred: `Finding ${'abcd'[n++]}` }] }))
  await start($)
  await runCommand($)
  await finishSubagent($, w, 'agent-1')
  expect(w.modelCalls).toHaveLength(1)

  // File issue: acted on, so the next finished subagent checks at once.
  const ui = await mountPane($, 'terminal')
  await ui.press({ key: 'observation-S1-file-issue' })
  await finishSubagent($, w, 'agent-2')
  expect(w.modelCalls).toHaveLength(2)

  // Dismiss: the next finished subagent waits for the turn interval.
  await ui.press({ key: 'observation-S2-dismiss' })
  await finishSubagent($, w, 'agent-3')
  expect(w.modelCalls).toHaveLength(2)
  await ui.unmount()
})

import { expect, test } from 'claude-code/testing'

import { PLUGIN, runCommand, start, world } from './world'

test('the mod registers /session-status when the session starts', async ($, on) => {
  const { commands } = world(on)
  await start($)

  expect(commands).toContain(PLUGIN)
})

test('/session-status opens the pane, and a second /session-status closes it', async ($, on) => {
  const { panes } = world(on)
  await start($)

  await runCommand($)
  expect(panes.has(PLUGIN)).toBe(true)

  await runCommand($)
  expect(panes.has(PLUGIN)).toBe(false)

  await runCommand($)
  expect(panes.has(PLUGIN)).toBe(true)
})

test('the pane stays closed until the person asks for it', async ($, on) => {
  const { panes } = world(on)
  await start($)
  await $.tool.call({ tool: 'Bash', command: 'ls', description: 'List files' })

  expect(panes.has(PLUGIN)).toBe(false)
})

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

test('the pane asks for a dock 48 columns wide, opened by hand or by itself', async ($, on) => {
  const { opens } = world(on)
  await start($)

  await runCommand($)
  await runCommand($)
  await $.classic.TaskCreated({ task_id: '1', task_subject: 'Build the pane' })

  expect(opens.length).toBeGreaterThan(0)
  for (const open of opens) {
    expect(open).toEqual({ id: PLUGIN, title: 'Session status', columns: 48 })
  }
})

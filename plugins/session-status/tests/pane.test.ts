import { expect, test } from 'claude-code/testing'

import {
  SURFACES,
  blockedDecision,
  callStatusTool,
  mountPane,
  reviewLaterDecision,
  runCommand,
  start,
  surprise,
  world,
} from './world'

test('the pane shows doing now from the last tool call', async ($, on) => {
  world(on)
  await start($)
  await $.tool.call({ tool: 'Read', file_path: '/work/src/main.ts' })
  await $.tool.call({ tool: 'Bash', command: 'npm test', description: 'Run the tests' })

  for (const surface of SURFACES) {
    const ui = await mountPane($, surface)
    const line = (await ui.find({ key: 'doing-now' }))?.text ?? ''
    expect(line).toContain('Bash')
    expect(line).toContain('Run the tests')
    expect(line).not.toContain('main.ts')
    await ui.unmount()
  }
})

test('doing now names the file of a file tool, not its whole path', async ($, on) => {
  world(on)
  await start($)
  await $.tool.call({ tool: 'Read', file_path: '/work/src/main.ts' })

  for (const surface of SURFACES) {
    const ui = await mountPane($, surface)
    const line = (await ui.find({ key: 'doing-now' }))?.text ?? ''
    expect(line).toContain('main.ts')
    expect(line).not.toContain('/work/src')
    await ui.unmount()
  }
})

test('the pane says when nothing has happened yet', async ($, on) => {
  world(on)
  await start($)

  for (const surface of SURFACES) {
    const ui = await mountPane($, surface)
    expect((await ui.find({ key: 'doing-now' }))?.text).toContain('Nothing yet')
    expect((await ui.find({ key: 'last-update' }))?.text).toContain('No update yet')
    await ui.unmount()
  }
})

test('the pane shows the time of the last update and its age', async ($, on) => {
  const { clock } = world(on)
  await start($)
  await $.tool.call({ tool: 'Read', file_path: '/work/src/main.ts' })
  await clock.advance(90_000)

  for (const surface of SURFACES) {
    const ui = await mountPane($, surface)
    const line = (await ui.find({ key: 'last-update' }))?.text ?? ''
    expect(line).toMatch(/\d\d:\d\d:\d\d/)
    expect(line).toContain('1m 30s ago')
    await ui.unmount()
  }
})

test('the age moves on while the pane stays open', async ($, on) => {
  const { clock } = world(on)
  await start($)
  await $.tool.call({ tool: 'Read', file_path: '/work/src/main.ts' })
  await runCommand($)

  for (const surface of SURFACES) {
    const ui = await mountPane($, surface)
    const before = (await ui.find({ key: 'last-update' }))?.text ?? ''
    await clock.advance(5 * 60_000)
    const after = (await ui.find({ key: 'last-update' }))?.text ?? ''
    expect(after).not.toBe(before)
    expect(after).toMatch(/\dm ago/)
    await ui.unmount()
  }
})

test('the pane draws its sections in the agreed order', async ($, on) => {
  const w = world(on)
  w.answer('Bash', () => ({ stdout: 'https://github.com/octo/widgets/pull/12\n', stderr: '' }))
  await start($)
  await $.tool.call({ tool: 'Read', file_path: '/work/src/main.ts' })
  await callStatusTool($, surprise())
  await callStatusTool($, reviewLaterDecision())
  await callStatusTool($, blockedDecision())

  await $.classic.TaskCreated({ task_id: '1', task_subject: 'Build the pane' })
  await $.tool.call({ tool: 'Bash', command: 'gh pr create --fill' })
  await $.classic.SubagentStart({ agent_id: 'agent-1', agent_type: 'general-purpose' })

  const order = [
    'doing-now',
    'blocked',
    'review-later',
    'progress',
    'links',
    'surprises',
    'counters',
    'last-update',
  ]
  for (const surface of SURFACES) {
    const ui = await mountPane($, surface)
    const keys = (await ui.findAll({ type: 'Box' }))
      .map(box => box.key)
      .filter(key => key !== undefined && order.includes(key))
    expect(keys).toEqual(order)
    await ui.unmount()
  }
})

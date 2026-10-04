import { expect, test } from 'claude-code/testing'

import { SURFACES, internalAgent, sectionText, spawnSubagent, start, subagentStop, world } from './world'

test('the counters show running and finished subagents', async ($, on) => {
  world(on)
  await start($)
  await spawnSubagent($, 'agent-1')
  await spawnSubagent($, 'agent-2')
  await spawnSubagent($, 'agent-3')
  await subagentStop($, 'agent-2')

  for (const surface of SURFACES) {
    expect(await sectionText($, surface, 'counters')).toContain('2 running · 1 finished')
  }
})

test('a stop that arrives twice counts once', async ($, on) => {
  world(on)
  await start($)
  await spawnSubagent($, 'agent-1')
  await subagentStop($, 'agent-1')
  await subagentStop($, 'agent-1')

  for (const surface of SURFACES) {
    expect(await sectionText($, surface, 'counters')).toContain('0 running · 1 finished')
  }
})

test('the counters stay out of the pane before the first subagent', async ($, on) => {
  world(on)
  await start($)
  await $.tool.call({ tool: 'Bash', command: 'ls' })

  for (const surface of SURFACES) {
    expect(await sectionText($, surface, 'counters')).toBeUndefined()
  }
})

test("the counters leave out Claude Code's own agents", async ($, on) => {
  world(on)
  await start($)
  await spawnSubagent($, 'agent-1')
  await internalAgent($, 'compact-1')
  await internalAgent($, 'compact-2')

  for (const surface of SURFACES) {
    expect(await sectionText($, surface, 'counters')).toContain('1 running · 0 finished')
  }
})

test('a stop of an agent no Agent tool call started counts nothing', async ($, on) => {
  world(on)
  await start($)
  await subagentStop($, 'agent-unknown')

  for (const surface of SURFACES) {
    expect(await sectionText($, surface, 'counters')).toBeUndefined()
  }
})

test('a refused spawn counts nothing', async ($, on) => {
  world(on, { denySpawns: true })
  await start($)
  await spawnSubagent($, 'agent-1')

  for (const surface of SURFACES) {
    expect(await sectionText($, surface, 'counters')).toBeUndefined()
  }
})

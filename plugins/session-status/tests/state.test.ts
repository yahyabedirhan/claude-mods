import { expect, test } from 'claude-code/testing'

import {
  SURFACES,
  blockedDecision,
  callStatusTool,
  endTurn,
  runCommand,
  sectionText,
  spawnSubagent,
  start,
  startTurn,
  subagentStop,
  world,
} from './world'

test('the top line follows the turns: in progress, then waiting for reply', async ($, on) => {
  world(on)
  await start($)
  await runCommand($)

  await startTurn($)
  for (const surface of SURFACES) {
    expect(await sectionText($, surface, 'state')).toBe('● In progress')
  }

  await endTurn($)
  for (const surface of SURFACES) {
    expect(await sectionText($, surface, 'state')).toBe('● Waiting for reply')
  }
})

test('an open blocked decision shows Blocked over every other state', async ($, on) => {
  world(on)
  await start($)
  await startTurn($)
  await callStatusTool($, blockedDecision())

  for (const surface of SURFACES) {
    expect(await sectionText($, surface, 'state')).toBe('● Blocked')
  }

  await endTurn($)
  await callStatusTool($, { action: 'resolve', id: 'D1' })
  for (const surface of SURFACES) {
    expect(await sectionText($, surface, 'state')).toBe('● Waiting for reply')
  }
})

test('a running subagent keeps the session in progress after the turn ends', async ($, on) => {
  world(on)
  await start($)
  await startTurn($)
  await spawnSubagent($, 'agent-1')
  await endTurn($)

  for (const surface of SURFACES) {
    expect(await sectionText($, surface, 'state')).toBe('● In progress')
  }

  await subagentStop($, 'agent-1')
  for (const surface of SURFACES) {
    expect(await sectionText($, surface, 'state')).toBe('● Waiting for reply')
  }
})

test('a turn that runs a settle skill ends settled, and the next turn clears it', async ($, on) => {
  world(on)
  await start($)
  await runCommand($)
  await startTurn($)
  await $.tool.call({ tool: 'Skill', skill: 'settle-session' })

  for (const surface of SURFACES) {
    expect(await sectionText($, surface, 'state')).toBe('● In progress')
  }

  await endTurn($)
  for (const surface of SURFACES) {
    expect(await sectionText($, surface, 'state')).toBe('● Settled')
  }

  await startTurn($)
  for (const surface of SURFACES) {
    expect(await sectionText($, surface, 'state')).toBe('● In progress')
  }
})

test("a plugin's settle-effort skill settles too; another skill does not", async ($, on) => {
  world(on)
  await start($)
  await runCommand($)
  await startTurn($)
  await $.tool.call({ tool: 'Skill', skill: 'tdd' })
  await endTurn($)
  for (const surface of SURFACES) {
    expect(await sectionText($, surface, 'state')).toBe('● Waiting for reply')
  }

  await startTurn($)
  await $.tool.call({ tool: 'Skill', skill: 'skills:settle-effort' })
  await endTurn($)
  for (const surface of SURFACES) {
    expect(await sectionText($, surface, 'state')).toBe('● Settled')
  }
})

test('the state line waits for the first turn, and the next section is headed Now', async ($, on) => {
  world(on)
  await start($)
  await runCommand($)

  for (const surface of SURFACES) {
    expect(await sectionText($, surface, 'state')).toBeUndefined()
    expect(await sectionText($, surface, 'doing-now')).toMatch(/^Now/)
  }
})

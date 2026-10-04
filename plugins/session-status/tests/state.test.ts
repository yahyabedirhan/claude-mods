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

test('a turn that runs a settle skill shows Settling, ends settled, and the next turn clears it', async ($, on) => {
  world(on)
  await start($)
  await runCommand($)
  await startTurn($)
  await $.tool.call({ tool: 'Skill', skill: 'settle-session' })

  for (const surface of SURFACES) {
    expect(await sectionText($, surface, 'state')).toBe('● Settling')
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

test('a turn started with /settle-session or /settle-effort ends settled', async ($, on) => {
  world(on)
  await start($)
  await runCommand($)

  const typed = [
    '<command-message>settle-session</command-message>\n<command-name>/settle-session</command-name>',
    '<command-message>skills:settle-effort</command-message>\n<command-name>/skills:settle-effort</command-name>\n<command-args>merge it</command-args>',
    '/settle-session',
  ]
  for (const prompt of typed) {
    await startTurn($, prompt)
    for (const surface of SURFACES) {
      expect(await sectionText($, surface, 'state')).toBe('● Settling')
    }
    await endTurn($)
    for (const surface of SURFACES) {
      expect(await sectionText($, surface, 'state')).toBe('● Settled')
    }
  }
})

test('a prompt that only mentions settling does not settle', async ($, on) => {
  world(on)
  await start($)
  await runCommand($)

  const mentions = [
    'run /settle-session later',
    '/settle-sessions',
    '<command-message>show-me</command-message>\n<command-name>/show-me</command-name>\n<command-args>/settle-session</command-args>',
  ]
  for (const prompt of mentions) {
    await startTurn($, prompt)
    await endTurn($)
    for (const surface of SURFACES) {
      expect(await sectionText($, surface, 'state')).toBe('● Waiting for reply')
    }
  }
})

test('an interrupted settle turn waits for a reply instead of settling', async ($, on) => {
  world(on)
  await start($)
  await runCommand($)
  await startTurn($, '/settle-session')
  await $.turn.complete({ answer: '', durationMs: 1000, isAborted: true, turnId: 'turn', reason: 'aborted' })

  for (const surface of SURFACES) {
    expect(await sectionText($, surface, 'state')).toBe('● Waiting for reply')
  }
})

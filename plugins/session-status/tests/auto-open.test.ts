import { expect, test } from 'claude-code/testing'

import {
  PLUGIN,
  SESSION_ID,
  blockedDecision,
  callStatusTool,
  internalAgent,
  runCommand,
  spawnSubagent,
  start,
  subagentToolCall,
  surprise,
  world,
} from './world'

test('the first subagent start opens the pane', async ($, on) => {
  const { panes } = world(on)
  await start($)
  expect(panes.has(PLUGIN)).toBe(false)

  await spawnSubagent($, 'agent-1')

  expect(panes.has(PLUGIN)).toBe(true)
})

test("Claude Code's own agents do not open the pane", async ($, on) => {
  const { panes } = world(on)
  await start($)

  await internalAgent($, 'compact-1')

  expect(panes.has(PLUGIN)).toBe(false)
})

test('the first TaskCreated opens the pane', async ($, on) => {
  const { panes } = world(on)
  await start($)

  await $.classic.TaskCreated({ task_id: '1', task_subject: 'Build the pane' })

  expect(panes.has(PLUGIN)).toBe(true)
})

test('the first TaskCreate call opens the pane', async ($, on) => {
  const w = world(on)
  w.answer('TaskCreate', () => ({ task: { id: '1', subject: 'Build the pane' } }))
  await start($)

  await $.tool.call({ tool: 'TaskCreate', subject: 'Build the pane', description: 'The pane' })

  expect(w.panes.has(PLUGIN)).toBe(true)
})

test('the first TodoWrite list opens the pane', async ($, on) => {
  const { panes } = world(on)
  await start($)

  await $.tool.call({
    tool: 'TodoWrite',
    todos: [{ content: 'Build the pane', status: 'pending', activeForm: 'Building the pane' }],
  })

  expect(panes.has(PLUGIN)).toBe(true)
})

test('the first recorded decision opens the pane', async ($, on) => {
  const { panes } = world(on)
  await start($)

  await callStatusTool($, blockedDecision())

  expect(panes.has(PLUGIN)).toBe(true)
})

test('the first surprise a subagent records opens the pane', async ($, on) => {
  const { panes } = world(on)
  await start($)

  await subagentToolCall($, 'agent-1', { tool: 'mcp__session-status__status', ...surprise() })

  expect(panes.has(PLUGIN)).toBe(true)
})

for (const skill of ['orchestrate-effort', 'orchestrate-with-handoff', 'skills:orchestrate-effort']) {
  test(`a Skill call to ${skill} opens the pane and names the effort from the branch`, async ($, on) => {
    const { panes, saved } = world(on, { branch: 'session-status' })
    await start($)

    await $.tool.call({ tool: 'Skill', skill })

    expect(panes.has(PLUGIN)).toBe(true)
    expect(saved[SESSION_ID]).toMatchObject({ effort: { name: 'session-status' } })
  })
}

test('an effort skill opens the pane even when the branch is unknown', async ($, on) => {
  const { panes } = world(on)
  await start($)

  await $.tool.call({ tool: 'Skill', skill: 'orchestrate-effort' })

  expect(panes.has(PLUGIN)).toBe(true)
})

test('another skill does not open the pane', async ($, on) => {
  const { panes } = world(on, { branch: 'main' })
  await start($)

  await $.tool.call({ tool: 'Skill', skill: 'tdd' })

  expect(panes.has(PLUGIN)).toBe(false)
})

test('a Bash command with an effort label opens the pane and names the effort', async ($, on) => {
  const { panes, saved } = world(on)
  await start($)

  await $.tool.call({
    tool: 'Bash',
    command: 'gh issue list --label "effort:session-status" --state all',
  })

  expect(panes.has(PLUGIN)).toBe(true)
  expect(saved[SESSION_ID]).toMatchObject({ effort: { name: 'session-status' } })
})

test('an effort label names the effort over the branch', async ($, on) => {
  const { saved } = world(on, { branch: 'main' })
  await start($)

  await $.tool.call({ tool: 'Skill', skill: 'orchestrate-effort' })
  expect(saved[SESSION_ID]).toMatchObject({ effort: { name: 'main' } })

  await $.tool.call({ tool: 'Bash', command: 'gh issue list --label effort:session-status' })
  expect(saved[SESSION_ID]).toMatchObject({ effort: { name: 'session-status' } })
})

test('a long run of plain tool calls does not open the pane', async ($, on) => {
  const { panes } = world(on)
  await start($)

  for (let turn = 0; turn < 30; turn += 1) {
    await $.tool.call({ tool: 'Read', file_path: '/work/src/main.ts' })
    await $.tool.call({ tool: 'Bash', command: 'npm test', description: 'Run the tests' })
  }

  expect(panes.has(PLUGIN)).toBe(false)
})

test('the pane stays open after later triggers and events', async ($, on) => {
  const { panes } = world(on)
  await start($)

  await spawnSubagent($, 'agent-1')
  await $.classic.SubagentStop({
    agent_id: 'agent-1',
    agent_type: 'general-purpose',
    agent_transcript_path: '',
    stop_hook_active: false,
  })
  await callStatusTool($, blockedDecision())
  await $.classic.TaskCreated({ task_id: '1', task_subject: 'Build the pane' })
  await $.tool.call({ tool: 'Read', file_path: '/work/src/main.ts' })

  expect(panes.has(PLUGIN)).toBe(true)
})

test('a reload that drops the open pane opens it again', async ($, on) => {
  const { panes } = world(on)
  await start($)
  await callStatusTool($, blockedDecision())
  panes.delete(PLUGIN)

  await start($)

  expect(panes.has(PLUGIN)).toBe(true)
})

test('a pane the person closed stays closed when a trigger comes', async ($, on) => {
  const { panes } = world(on)
  await start($)
  await callStatusTool($, blockedDecision())
  await runCommand($)
  expect(panes.has(PLUGIN)).toBe(false)

  await callStatusTool($, surprise())
  await spawnSubagent($, 'agent-2')

  expect(panes.has(PLUGIN)).toBe(false)
})

test('/session-status on a pane that waits undrawn opens it instead of closing it', async ($, on) => {
  const { panes } = world(on, { isNarrow: true })
  await start($)
  await callStatusTool($, blockedDecision())
  expect(panes.get(PLUGIN)?.isPlaced).toBe(false)

  const answer = await runCommand($)

  expect(answer).toMatchObject({ text: 'Session status pane opened.' })
  expect(panes.has(PLUGIN)).toBe(true)
})

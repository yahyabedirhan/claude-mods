import { expect, test } from 'claude-code/testing'

import {
  SESSION_ID,
  START,
  STATUS_TOOL,
  blockedDecision,
  callStatusTool,
  decisionBeforeSettling,
  start,
  surprise,
  world,
} from './world'

test('the mod registers the status tool for the model when the session starts', async ($, on) => {
  const { tools } = world(on)
  await start($)

  const tool = tools.get(STATUS_TOOL)
  expect(tool?.description).toContain('decision')
  expect(tool?.description).toContain('surprise')
  expect(tool?.inputSchema).toMatchObject({
    type: 'object',
    required: ['action'],
    properties: { action: { enum: ['record_decision', 'record_surprise', 'record_blocker', 'resolve', 'dismiss', 'post_decide_list', 'ticket', 'item'] } },
  })
})

test('the status tool records a blocked decision with a stable id', async ($, on) => {
  const { saved, clock } = world(on)
  await start($)
  await clock.advance(1_000)

  const answer = await callStatusTool($, blockedDecision())

  expect(answer.result).toContain('D1')
  expect(saved[SESSION_ID]).toMatchObject({
    items: [
      {
        kind: 'decision',
        id: 'D1',
        urgency: 'blocked',
        question: 'Which database do we use?',
        options: ['Postgres', 'SQLite'],
        default: 'Postgres',
        unblocks: 'Pick one database',
        recordedAt: START + 1_000,
      },
    ],
  })
})

test('the status tool records a decision to make before settling', async ($, on) => {
  const { saved } = world(on)
  await start($)

  await callStatusTool($, decisionBeforeSettling())

  expect(saved[SESSION_ID]).toMatchObject({
    items: [{ kind: 'decision', id: 'D1', urgency: 'before_settling', default: '--fast' }],
  })
})

test('the status tool records a surprise with what it changed', async ($, on) => {
  const { saved } = world(on)
  await start($)

  const answer = await callStatusTool($, surprise())

  expect(answer.result).toContain('S1')
  expect(saved[SESSION_ID]).toMatchObject({
    items: [
      {
        kind: 'surprise',
        id: 'S1',
        occurred: 'The API has no batch endpoint',
        changed: 'Each item is sent in its own request',
        recordedAt: START,
      },
    ],
  })
})

test('each item keeps its own id: decisions count D1, D2 and surprises S1, S2', async ($, on) => {
  const { saved } = world(on)
  await start($)

  await callStatusTool($, blockedDecision())
  await callStatusTool($, surprise())
  await callStatusTool($, decisionBeforeSettling())
  await callStatusTool($, surprise({ occurred: 'The cache is cold' }))

  const status = saved[SESSION_ID] as { items: { id: string }[] }
  expect(status.items.map(item => item.id)).toEqual(['D1', 'S1', 'D2', 'S2'])
})

test('an item a subagent records names the subagent', async ($, on) => {
  const { saved } = world(on)
  await start($)

  await callStatusTool($, { ...surprise(), agentId: 'agent-7' })

  expect(saved[SESSION_ID]).toMatchObject({ items: [{ id: 'S1', agentId: 'agent-7' }] })
})

test('a status tool call leaves doing now on the work', async ($, on) => {
  const { saved } = world(on)
  await start($)
  await $.tool.call({ tool: 'Bash', command: 'npm test', description: 'Run the tests' })

  await callStatusTool($, surprise())

  expect(saved[SESSION_ID]).toMatchObject({ doingNow: { tool: 'Bash', text: 'Run the tests' } })
})

test('the status tool refuses a decision without two to four options', async ($, on) => {
  const { saved } = world(on)
  await start($)

  const one = await callStatusTool($, blockedDecision({ options: ['Postgres'] }))
  const five = await callStatusTool($, blockedDecision({ options: ['a', 'b', 'c', 'd', 'e'] }))

  expect(one.deny).toContain('two to four options')
  expect(five.deny).toContain('two to four options')
  expect((saved[SESSION_ID] as { items?: unknown[] } | undefined)?.items ?? []).toEqual([])
})

test('the status tool refuses a decision without a question, a default or what unblocks it', async ($, on) => {
  world(on)
  await start($)

  expect((await callStatusTool($, blockedDecision({ question: ' ' }))).deny).toContain('question')
  expect((await callStatusTool($, blockedDecision({ default: undefined }))).deny).toContain('default')
  expect((await callStatusTool($, blockedDecision({ unblocks: '' }))).deny).toContain('unblocks')
  expect((await callStatusTool($, blockedDecision({ urgency: 'soon' }))).deny).toContain('urgency')
})

test('the status tool refuses a surprise without what occurred or what it changed', async ($, on) => {
  world(on)
  await start($)

  expect((await callStatusTool($, surprise({ occurred: '' }))).deny).toContain('occurred')
  expect((await callStatusTool($, surprise({ changed: undefined }))).deny).toContain('changed')
})

test('the status tool refuses an action it does not know', async ($, on) => {
  world(on)
  await start($)

  const answer = await callStatusTool($, { action: 'shout' })

  expect(answer.deny).toContain('record_decision')
})

import { expect, test } from 'claude-code/testing'

import { SESSION_ID, START, start, world } from './world'

test('the status store saves the status to $.store with the session id as the key', async ($, on) => {
  const { saved } = world(on)
  await start($)
  await $.tool.call({ tool: 'Bash', command: 'git status', description: 'Show the tree' })

  expect(saved[SESSION_ID]).toEqual({
    version: 1,
    sessionId: SESSION_ID,
    doingNow: { tool: 'Bash', text: 'Show the tree', at: START },
    updatedAt: START,
  })
})

test('the saved status is plain JSON', async ($, on) => {
  const { saved } = world(on)
  await start($)
  await $.tool.call({ tool: 'Bash', command: 'git status' })

  const status = saved[SESSION_ID]
  expect(JSON.parse(JSON.stringify(status))).toEqual(status)
})

test('each change saves the status again with the new update time', async ($, on) => {
  const { clock, saved } = world(on)
  await start($)
  await $.tool.call({ tool: 'Bash', command: 'git status' })
  await clock.advance(30_000)
  await $.tool.call({ tool: 'Bash', command: 'git diff' })

  expect(saved[SESSION_ID]).toMatchObject({
    doingNow: { text: 'git diff', at: START + 30_000 },
    updatedAt: START + 30_000,
  })
})

test('a status is saved under the session it belongs to', async ($, on) => {
  const { saved } = world(on, { sessionId: 'session-b' })
  await start($)
  await $.tool.call({ tool: 'Bash', command: 'git status' })

  expect(Object.keys(saved)).toEqual(['session-b'])
  expect(saved['session-b']).toMatchObject({ sessionId: 'session-b' })
})

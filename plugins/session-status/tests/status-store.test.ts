import { expect, test } from 'claude-code/testing'

import type { SessionLink, SessionStatus, StatusItem } from '../types'
import { emptyStatus } from '../hooks/status'
import { SESSION_ID, START, blockedDecision, callStatusTool, mountPane, start, world } from './world'

test('the status store saves the status to $.store with the session id as the key', async ($, on) => {
  const { saved } = world(on)
  await start($)
  await $.tool.call({ tool: 'Bash', command: 'git status', description: 'Show the tree' })

  expect(saved[SESSION_ID]).toEqual({
    version: 1,
    sessionId: SESSION_ID,
    doingNow: { tool: 'Bash', text: 'Show the tree', at: START },
    items: [],
    tasks: [],
    progress: null,
    links: [],
    subagents: { running: [], finished: [] },
    endListPostedAt: null,
    observer: { checks: 0, seen: [] },
    effort: null,
    tickets: null,
    ticketReports: [],
    sessionItems: [],
    place: null,
    places: [],
    crons: [],
    activity: null,
    deleted: [],
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

test('a status keeps the newest 200 finished subagents, links and closed items of each kind, and every open item', async ($, on) => {
  const link = (n: number): SessionLink => ({
    kind: 'pr',
    repo: 'octo/repo',
    number: n,
    url: `https://github.com/octo/repo/pull/${n}`,
    at: n,
  })
  const decision = (n: number, isOpen: boolean): StatusItem => ({
    kind: 'decision',
    id: `D${n}`,
    urgency: 'before_settling',
    question: 'Which name?',
    options: ['a', 'b'],
    default: 'a',
    unblocks: 'Pick one',
    recordedAt: n,
    ...(isOpen ? {} : { resolvedAt: n }),
  })
  const surpriseItem = (n: number): StatusItem => ({
    kind: 'surprise',
    id: `S${n}`,
    occurred: 'x',
    changed: 'y',
    recordedAt: n,
    resolvedAt: n,
  })
  const range = (count: number) => Array.from({ length: count }, (_, i) => i + 1)
  const big: SessionStatus = {
    ...emptyStatus(SESSION_ID),
    subagents: { running: ['agent-run'], finished: range(250).map(n => `agent-${n}`) },
    links: range(250).map(link),
    // D1 and D2 stay open; D3..D252 are resolved; S1..S250 are dismissed.
    items: [...range(252).map(n => decision(n, n <= 2)), ...range(250).map(surpriseItem)],
  }

  const { saved } = world(on, { saved: { [SESSION_ID]: big } })
  await start($)

  await $.tool.call({ tool: 'Bash', command: 'git status' })
  const kept = saved[SESSION_ID] as SessionStatus

  expect(kept.subagents.finished).toHaveLength(200)
  expect(kept.subagents.finished[0]).toBe('agent-51')
  expect(kept.subagents.running).toEqual(['agent-run'])
  expect(kept.links).toHaveLength(200)
  expect(kept.links[0]?.number).toBe(51)
  const decisions = kept.items.filter(item => item.kind === 'decision').map(item => item.id)
  expect(decisions.slice(0, 3)).toEqual(['D1', 'D2', 'D53'])
  expect(decisions).toHaveLength(202)
  expect(decisions.at(-1)).toBe('D252')
  const surprises = kept.items.filter(item => item.kind === 'surprise').map(item => item.id)
  expect(surprises).toHaveLength(200)
  expect(surprises[0]).toBe('S51')
  // The newest id of each kind stays, so the next one does not repeat an old one.
  expect(await callStatusTool($, blockedDecision())).toMatchObject({ result: expect.stringContaining('D253') })
})

test('a store that refuses a write leaves the status call answered and logs why', async ($, on) => {
  const { storeWrites } = world(on, { failStoreWrites: true })
  const logs: string[] = []
  on('ui.log', (_$, e) => {
    logs.push(e.text)

    return { value: undefined } as never
  })
  await start($)

  const answer = await callStatusTool($, blockedDecision())
  await $.tool.call({ tool: 'Bash', command: 'git status' })

  expect(storeWrites.length).toBeGreaterThan(0)
  expect(answer.deny).toBeUndefined()
  expect(answer.result).toContain('D1')
  expect(logs.some(line => line.includes('the status was not saved'))).toBe(true)
})

test('a tool call saves the status once, after the tool answers', async ($, on) => {
  const w = world(on)
  w.answer('Bash', () => ({ stdout: 'https://github.com/octo/repo/pull/7\n', stderr: '', interrupted: false }))
  await start($)

  await $.tool.call({ tool: 'Bash', command: 'gh pr create --fill' })

  const writes = w.storeWrites.filter(write => write.key === SESSION_ID).map(write => write.value)
  expect(writes).toHaveLength(1)
  expect(writes[0]).toMatchObject({ doingNow: { text: 'gh pr create' }, links: [{ number: 7 }] })
})

test('doing now shows while a long tool runs', async ($, on) => {
  const w = world(on)
  const release = w.holdTool('Bash')
  await start($)

  const call = $.tool.call({ tool: 'Bash', command: 'npm test', description: 'Run the tests' })
  await w.clock.settle()
  const ui = await mountPane($, 'terminal')
  const line = (await ui.find({ key: 'doing-now' }))?.text ?? ''
  await ui.unmount()
  release()
  await call

  expect(line).toContain('Run the tests')
})

import { expect, test } from 'claude-code/testing'

import { blockedPing, endListPing, pingId, withdrawPing } from '../hooks/pings'
import {
  blockedDecision,
  callStatusTool,
  endSession,
  decisionBeforeSettling,
  start,
  surprise,
  world,
} from './world'

const SESSION = '3F2A9C1E-77b0-4d2e-9a10-5c3e8d1f0a42'
const PING = 'ss-3f2a9c1e-d1'

/** The shipyard commands among the runs: the session's git reads are not pings. */
function pingRuns(runs: string[][]) {
  return runs.filter(argv => argv[0] === 'shipyard')
}

/** Lets the pings the mod queued with `$.clock.after(0, ...)` run. */
async function settle(clock: { advance: (ms: number) => Promise<void> }) {
  await clock.advance(0)
}

test('the ping id joins the session and the decision, lowercase, and stays a valid shipyard id', () => {
  expect(pingId(SESSION, 'D1')).toBe(PING)
  expect(pingId(SESSION, 'D12')).toBe('ss-3f2a9c1e-d12')
  expect(pingId('session-a', 'D1')).toBe('ss-session-d1')
  expect(pingId(SESSION, 'end')).toBe('ss-3f2a9c1e-end')
  for (const id of [pingId(SESSION, 'D1'), pingId('__--__--', 'D3'), pingId('', 'end')]) {
    expect(id).toMatch(/^[a-z0-9][a-z0-9_-]{0,63}$/)
  }
})

test('a blocked ping names the question, the recommended answer and what unblocks it', () => {
  const argv = blockedPing(SESSION, {
    id: 'D1',
    question: 'Which database do we use?',
    default: 'Postgres',
    unblocks: 'Pick one database',
  })

  expect(argv).toEqual([
    'shipyard',
    'ping',
    'Which database do we use?',
    '--body',
    'Recommended: Postgres. To unblock: Pick one database',
    '--from',
    'session-status',
    '--id',
    PING,
    '--herdr',
  ])
})

test('a long question is cut to a short title', () => {
  const argv = blockedPing(SESSION, { id: 'D1', question: 'x'.repeat(300), default: 'a', unblocks: 'b' })

  expect(argv[2]?.length).toBeLessThanOrEqual(100)
  expect(argv[2]?.endsWith('…')).toBe(true)
})

test('the withdraw and decide-list commands', () => {
  expect(withdrawPing(PING)).toEqual(['shipyard', 'ping', 'withdraw', PING])
  expect(endListPing(SESSION, ['D2', 'D3'])).toEqual([
    'shipyard',
    'ping',
    '2 decisions before settling',
    '--body',
    'To decide before the session settles: D2, D3',
    '--from',
    'session-status',
    '--id',
    'ss-3f2a9c1e-end',
    '--herdr',
  ])
  expect(endListPing(SESSION, ['D1'])[2]).toBe('1 decision before settling')
})

test('a new blocking decision sends one ping with its id and --herdr', async ($, on) => {
  const { runs, clock } = world(on, { sessionId: SESSION })
  await start($)

  await callStatusTool($, blockedDecision())
  await settle(clock)

  expect(pingRuns(runs)).toEqual([
    [
      'shipyard',
      'ping',
      'Which database do we use?',
      '--body',
      'Recommended: Postgres. To unblock: Pick one database',
      '--from',
      'session-status',
      '--id',
      PING,
      '--herdr',
    ],
  ])
})

test('resolving a blocking decision withdraws its ping', async ($, on) => {
  const { runs, clock } = world(on, { sessionId: SESSION })
  await start($)
  await callStatusTool($, blockedDecision())
  await settle(clock)
  runs.length = 0

  await callStatusTool($, { action: 'resolve', id: 'D1' })
  await settle(clock)

  expect(pingRuns(runs)).toEqual([['shipyard', 'ping', 'withdraw', PING]])
})

test('resolving a blocked decision carried over /clear withdraws the ping the first session sent', async ($, on) => {
  const { runs, clock, switchSession } = world(on, { sessionId: SESSION })
  await start($)
  await callStatusTool($, blockedDecision())
  await endSession($, SESSION)
  switchSession('9b7d5e3a-0000-4000-8000-000000000000')
  await $.classic.SessionStart({ source: 'clear', session_id: '9b7d5e3a-0000-4000-8000-000000000000' })
  await settle(clock)
  runs.length = 0

  await callStatusTool($, { action: 'resolve', id: 'D1' })
  await settle(clock)

  expect(pingRuns(runs)).toEqual([['shipyard', 'ping', 'withdraw', PING]])
})

test('before-settling decisions and surprises send no ping, and resolving them withdraws nothing', async ($, on) => {
  const { runs, clock } = world(on, { sessionId: SESSION })
  await start($)

  await callStatusTool($, decisionBeforeSettling())
  await callStatusTool($, surprise())
  await callStatusTool($, { action: 'resolve', id: 'D1' })
  await callStatusTool($, { action: 'dismiss', id: 'S1' })
  await settle(clock)

  expect(pingRuns(runs)).toEqual([])
})

test('a refused status call sends no ping', async ($, on) => {
  const { runs, clock } = world(on, { sessionId: SESSION })
  await start($)

  await callStatusTool($, { action: 'resolve', id: 'D9' })
  await callStatusTool($, blockedDecision({ question: '' }))
  await settle(clock)

  expect(pingRuns(runs)).toEqual([])
})

test('the decide list sends one ping with the count of open decisions on it', async ($, on) => {
  const { runs, clock } = world(on, { sessionId: SESSION })
  await start($)
  await callStatusTool($, decisionBeforeSettling())
  await callStatusTool($, decisionBeforeSettling({ question: 'Which port?' }))
  await callStatusTool($, decisionBeforeSettling({ question: 'Which log level?' }))
  await callStatusTool($, { action: 'resolve', id: 'D2' })

  await callStatusTool($, { action: 'post_decide_list' })
  await settle(clock)

  expect(pingRuns(runs)).toEqual([
    [
      'shipyard',
      'ping',
      '2 decisions before settling',
      '--body',
      'To decide before the session settles: D1, D3',
      '--from',
      'session-status',
      '--id',
      'ss-3f2a9c1e-end',
      '--herdr',
    ],
  ])
})

test('a decide list with no open decision sends no ping', async ($, on) => {
  const { runs, clock } = world(on, { sessionId: SESSION })
  await start($)

  await callStatusTool($, { action: 'post_decide_list' })
  await settle(clock)

  expect(pingRuns(runs)).toEqual([])
})

test('a failing shipyard leaves the status call answered', async ($, on) => {
  const { runs, clock } = world(on, { sessionId: SESSION, failRuns: true })
  await start($)

  const recorded = await callStatusTool($, blockedDecision())
  await settle(clock)
  const resolved = await callStatusTool($, { action: 'resolve', id: 'D1' })
  await settle(clock)

  expect(pingRuns(runs).map(argv => argv[2])).toEqual(['Which database do we use?', 'withdraw'])
  expect(recorded.deny).toBeUndefined()
  expect(recorded.result).toContain('D1')
  expect(resolved.deny).toBeUndefined()
  expect(resolved.result).toContain('D1')
})

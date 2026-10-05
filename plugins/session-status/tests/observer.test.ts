import { expect, test } from 'claude-code/testing'
import type { Engine } from 'claude-code/testing'

import type { SessionStatus } from '../types'
import { isCheckDue } from '../hooks/observer'
import { emptyStatus } from '../hooks/status'
import {
  BASE_SECTIONS,
  STATUS_TOOL,
  SURFACES,
  callStatusTool,
  endTurn,
  mountPane,
  internalAgent,
  runCommand,
  spawnSubagent,
  start,
  subagentStop,
  surprise,
  world,
} from './world'
import type { World } from './world'

const LOOP = { occurred: 'The agent ran the same failing test 4 times', changed: 'Read the error before running it again' }

function findings(...list: { occurred: string; changed: string }[]) {
  return JSON.stringify({ findings: list })
}

/**
 * The session's events, each followed by a settle: the observer's checks
 * run unawaited, so the test lets them finish before it looks.
 */
function session($: Engine, w: World) {
  return {
    turns: async (count: number) => {
      for (let n = 0; n < count; n++) {
        await endTurn($)
        await w.clock.settle()
      }
    },
    stop: async (agentId: string) => {
      await spawnSubagent($, agentId)
      await subagentStop($, agentId)
      await w.clock.settle()
    },
  }
}

async function surpriseCount($: Engine) {
  const counts: (string | undefined)[] = []
  for (const surface of SURFACES) {
    const ui = await mountPane($, surface)
    counts.push((await ui.find({ key: 'observations' }))?.text)
    await ui.unmount()
  }

  return counts
}

test('the observer checks every 5 turns, only while the pane is open', async ($, on) => {
  const w = world(on)
  const s = session($, w)
  await start($)
  await s.turns(10)
  expect(w.modelCalls).toHaveLength(0)

  await runCommand($)
  await s.turns(4)
  expect(w.modelCalls).toHaveLength(0)
  await s.turns(1)
  expect(w.modelCalls).toHaveLength(1)
  await s.turns(5)
  expect(w.modelCalls).toHaveLength(2)

  await runCommand($)
  await s.turns(10)
  expect(w.modelCalls).toHaveLength(2)
})

test("a subagent's turn does not count toward the interval", async ($, on) => {
  const w = world(on)
  await start($)
  await runCommand($)
  for (let n = 0; n < 6; n++) {
    await $.turn.complete({ answer: '', durationMs: 1, isAborted: false, turnId: 't', reason: 'answer', agentId: 'agent-1' })
    await w.clock.settle()
  }

  expect(w.modelCalls).toHaveLength(0)
})

test('the observer checks when a subagent finishes, only while the pane is open', async ($, on) => {
  const w = world(on)
  const s = session($, w)
  await start($)
  // The person opens the pane and closes it: a finished subagent leaves it closed.
  await runCommand($)
  await runCommand($)
  await s.stop('agent-1')
  expect(w.modelCalls).toHaveLength(0)

  await runCommand($)
  await s.stop('agent-2')
  expect(w.modelCalls).toHaveLength(1)
  await s.stop('agent-3')
  expect(w.modelCalls).toHaveLength(2)
})

test("Claude Code's own agents do not start a check", async ($, on) => {
  const w = world(on)
  await start($)
  await runCommand($)
  await internalAgent($, 'compact-1')
  await w.clock.settle()

  expect(w.modelCalls).toHaveLength(0)
})

test('a subagent check starts the turn interval again', async ($, on) => {
  const w = world(on)
  const s = session($, w)
  await start($)
  await runCommand($)
  await s.turns(3)
  await s.stop('agent-1')
  await s.turns(4)
  expect(w.modelCalls).toHaveLength(1)
  await s.turns(1)
  expect(w.modelCalls).toHaveLength(2)
})

test('a check asks a small model with the recent steps, the task list and the effort phase', async ($, on) => {
  const w = world(on)
  w.messages.push(
    { role: 'user', text: 'Fix the build', toolUses: [] },
    {
      role: 'assistant',
      text: 'Running the tests.',
      toolUses: [{ tool_use_id: 'u1', tool: 'Bash', input: { command: 'npm test' }, text: '1 failed', isError: true }],
    },
  )
  await start($)
  // The first task opens the pane.
  await $.classic.TaskCreated({ task_id: '1', task_subject: 'Fix the build' })
  await session($, w).stop('agent-1')

  const [request] = w.modelCalls
  expect(request?.model).toBe('haiku')
  expect(request?.prompt).toContain('Effort phase: none')
  expect(request?.prompt).toContain('[pending] Fix the build')
  expect(request?.prompt).toContain('user: Fix the build')
  expect(request?.prompt).toContain('tool Bash {"command":"npm test"} -> error: 1 failed')
  expect(request?.system).toContain('Small details, style, single errors and errors the agent fixed are not findings')
  expect(request?.system).toContain('When you are not sure, give no findings')
  expect(request?.system).toMatch(/one short, clear sentence.*active voice.*one idea per sentence.*no lists.*no filler/is)
})

test('a check reads at most the newest 30 messages, each cut short', async ($, on) => {
  const w = world(on)
  for (let n = 1; n <= 40; n++) {
    w.messages.push({ role: 'assistant', text: `step ${n} ${'x'.repeat(1000)}`, toolUses: [] })
  }
  await start($)
  await runCommand($)
  await session($, w).stop('agent-1')

  const prompt = w.modelCalls[0]?.prompt ?? ''
  expect(prompt).not.toContain('step 10 ')
  expect(prompt).toContain('step 11 ')
  expect(prompt).toContain('step 40 ')
  expect(prompt.length).toBeLessThan(30 * 400)
})

test('a check reads at most 12000 characters of steps, the newest kept', async ($, on) => {
  const w = world(on)
  const call = (n: number) => ({ tool_use_id: `u${n}`, tool: 'Read', input: { file_path: `/f${n} ${'y'.repeat(400)}` }, text: 'z'.repeat(400) })
  w.messages.push({ role: 'assistant', text: '', toolUses: Array.from({ length: 40 }, (_, n) => call(n)) })
  await start($)
  await runCommand($)
  await session($, w).stop('agent-1')

  const prompt = w.modelCalls[0]?.prompt ?? ''
  expect(prompt).toContain('/f39 ')
  expect(prompt).not.toContain('/f0 ')
  expect(prompt.length).toBeLessThan(13_000)
})

test("findings show as observations, apart from the agent's surprises", async ($, on) => {
  const w = world(on)
  w.model(() => findings(LOOP))
  await start($)
  // The first surprise opens the pane.
  await callStatusTool($, surprise({ occurred: 'The API has no batch endpoint' }))
  await session($, w).stop('agent-1')

  for (const surface of SURFACES) {
    const ui = await mountPane($, surface)
    const surprises = (await ui.find({ key: 'surprises' }))?.text ?? ''
    expect(surprises).toContain('Surprises (1)')
    expect(surprises).not.toContain(LOOP.occurred)
    expect((await ui.find({ key: 'observations' }))?.text).toContain('Observations (1)')
    const found = (await ui.find({ key: 'observation-S2' }))?.text ?? ''
    expect(found).toContain(LOOP.occurred)
    expect(found).toContain(`Changed: ${LOOP.changed}`)
    await ui.unmount()
  }
})

test('malformed replies and failed calls add nothing', async ($, on) => {
  const w = world(on)
  const s = session($, w)
  const replies = ['not json', '{"findings":"x"}', '{"findings":[{"occurred":3}]}', undefined]
  w.model(() => replies.shift())
  await start($)
  await runCommand($)
  for (let n = 1; n <= 4; n++) {
    await s.stop(`agent-${n}`)
  }

  expect(w.modelCalls).toHaveLength(4)
  expect(await surpriseCount($)).toEqual([undefined, undefined])
  expect((w.saved['session-a'] as SessionStatus).observer.checks).toBe(4)
})

test('a reply in a code fence still counts', async ($, on) => {
  const w = world(on)
  w.model(() => `\`\`\`json\n${findings(LOOP)}\n\`\`\``)
  await start($)
  await runCommand($)
  await session($, w).stop('agent-1')

  for (const text of await surpriseCount($)) {
    expect(text).toContain('Observations (1)')
  }
})

test('a refused model request counts as a check that found nothing', async ($, on) => {
  const w = world(on)
  w.model(() => {
    throw new Error('model not allowed')
  })
  await start($)
  await runCommand($)
  await session($, w).stop('agent-1')

  expect(w.modelCalls).toHaveLength(1)
  expect((w.saved['session-a'] as SessionStatus).observer.checks).toBe(1)
})

test('the observer does not repeat a finding it showed', async ($, on) => {
  const w = world(on)
  const s = session($, w)
  const again = { occurred: 'The agent ran the same failing test 7 times!', changed: 'Stop and read the error' }
  w.model(() => findings(LOOP, again))
  await start($)
  await runCommand($)
  await s.stop('agent-1')
  await s.stop('agent-2')

  expect(w.modelCalls).toHaveLength(2)
  expect(w.modelCalls[1]?.prompt).toContain(`- ${LOOP.occurred}`)
  for (const text of await surpriseCount($)) {
    expect(text).toContain('Observations (1)')
  }
  expect((w.saved['session-a'] as SessionStatus).observer.seen).toEqual(['the agent ran the same failing test times'])
})

test('each dismissed observer finding doubles the turn interval, up to 40 turns', async ($, on) => {
  const w = world(on)
  const s = session($, w)
  let n = 0
  w.model(() => findings({ occurred: `Finding ${'abcdefgh'[n++]}`, changed: 'Change it' }))
  await start($)
  await callStatusTool($, surprise())
  await callStatusTool($, { action: 'dismiss', id: 'S1' })
  // The first surprise opened the pane.

  await s.turns(5)
  expect(w.modelCalls).toHaveLength(1)
  await callStatusTool($, { action: 'dismiss', id: 'S2' })
  await s.turns(9)
  expect(w.modelCalls).toHaveLength(1)
  await s.turns(1)
  expect(w.modelCalls).toHaveLength(2)

  await callStatusTool($, { action: 'dismiss', id: 'S3' })
  await s.turns(19)
  expect(w.modelCalls).toHaveLength(2)
  await s.turns(1)
  expect(w.modelCalls).toHaveLength(3)

  await callStatusTool($, { action: 'dismiss', id: 'S4' })
  await s.turns(39)
  expect(w.modelCalls).toHaveLength(3)
  await s.turns(1)
  expect(w.modelCalls).toHaveLength(4)
  await callStatusTool($, { action: 'dismiss', id: 'S5' })
  await s.turns(39)
  expect(w.modelCalls).toHaveLength(4)
  await s.turns(1)
  expect(w.modelCalls).toHaveLength(5)
})

test('after a dismissal a finished subagent waits for the turn interval too', async ($, on) => {
  const w = world(on)
  const s = session($, w)
  w.model(() => findings(LOOP))
  await start($)
  await runCommand($)
  await s.stop('agent-1')
  expect(w.modelCalls).toHaveLength(1)
  await callStatusTool($, { action: 'dismiss', id: 'S1' })

  // One dismissal: the interval is 10 turns, and a subagent stop waits for it.
  await s.stop('agent-2')
  expect(w.modelCalls).toHaveLength(1)
  await s.turns(9)
  await s.stop('agent-3')
  expect(w.modelCalls).toHaveLength(1)
  await s.turns(1)
  expect(w.modelCalls).toHaveLength(2)
})

test('the observer stops at 20 checks for the session', async ($, on) => {
  const w = world(on)
  const s = session($, w)
  await start($)
  await runCommand($)
  for (let n = 1; n <= 25; n++) {
    await s.stop(`agent-${n}`)
  }
  await s.turns(10)

  expect(w.modelCalls).toHaveLength(20)
  expect((w.saved['session-a'] as SessionStatus).observer.checks).toBe(20)
})

test('the observer runs one check at a time', async ($, on) => {
  const w = world(on)
  const s = session($, w)
  let release: () => void = () => undefined
  const held = new Promise<void>(resolve => {
    release = resolve
  })
  w.model(async () => {
    await held

    return findings()
  })
  await start($)
  await runCommand($)
  await s.stop('agent-1')
  await s.stop('agent-2')
  release()
  await w.clock.settle()

  expect(w.modelCalls).toHaveLength(1)
  expect((w.saved['session-a'] as SessionStatus).observer.checks).toBe(1)
})

test('the observer adds no context for the main agent', async ($, on) => {
  const w = world(on)
  const s = session($, w)
  w.model(() => findings(LOOP))
  await start($)
  await runCommand($)
  await s.turns(4)
  expect((await endTurn($, 'All done.')).text).toBe('All done.')
  await w.clock.settle()
  await spawnSubagent($, 'agent-1')
  expect(await subagentStop($, 'agent-1')).toEqual({})
  await w.clock.settle()
  expect(w.modelCalls).toHaveLength(2)

  const { sections } = await $.prompt.compose({
    model: 'claude-test',
    promptModel: 'claude-test',
    surfaces: ['terminal'],
    tools: ['Bash', STATUS_TOOL],
    outputStyle: null,
    traits: [],
  })
  expect(sections.map(section => section.id)).toEqual([...BASE_SECTIONS.map(section => section.id), 'session-status:status'])
  expect(sections.map(section => section.text).join('\n')).not.toContain(LOOP.occurred)
  expect(await callStatusTool($, surprise())).toMatchObject({ result: 'Recorded surprise S2.' })
})

test('a subagent check after a dismissal is due once the turns since the last check reach the interval', () => {
  const dismissed: SessionStatus = {
    ...emptyStatus('session-a'),
    items: [{ kind: 'surprise', id: 'S1', occurred: 'x', changed: 'y', recordedAt: 0, source: 'observer', resolvedAt: 1 }],
  }

  expect(isCheckDue(emptyStatus('session-a'), 0, 'subagent')).toBe(true)
  expect(isCheckDue(dismissed, 9, 'subagent')).toBe(false)
  expect(isCheckDue(dismissed, 10, 'subagent')).toBe(true)
})

// The pane's colours carry meaning, from the theme, the same on every surface.

import { expect, test } from 'claude-code/testing'
import type { Engine } from 'claude-code/testing'

import {
  SURFACES,
  blockedDecision,
  callStatusTool,
  endTurn,
  mountPane,
  decisionBeforeSettling,
  runCommand,
  start,
  startTurn,
  world,
} from './world'
import type { Surface } from './world'

/** The style props of the innermost Text that shows exactly `text`. */
async function styleOf($: Engine, surface: Surface, text: RegExp) {
  const ui = await mountPane($, surface)
  const found = await ui.findAll({ type: 'Text', text })
  await ui.unmount()
  const { color, dimColor, bold } = found.at(-1)?.props ?? {}

  return { color, dimColor, bold }
}

test('blocked items take the warning colour, ids the accent, labels dim, and bars no colour', async ($, on) => {
  const w = world(on, {
    cwd: '/home/dev/repo',
    branch: 'main',
    repos: [{ root: '/home/dev/repo', remote: 'git@github.com:octo/repo.git' }],
  })
  w.model(() => '{"findings":[{"occurred":"The tests ran twice","changed":"Run them once"}]}')
  await start($)
  await w.clock.advance(0)
  await callStatusTool($, blockedDecision())
  await callStatusTool($, decisionBeforeSettling())
  await callStatusTool($, { action: 'ticket', state: 'started', number: 3, title: 'Play', effort: 'e' })
  await callStatusTool($, { action: 'ticket', state: 'landed', number: 4, title: 'Queue' })
  for (let turn = 0; turn < 5; turn++) {
    await $.turn.complete({ answer: 'Done.', durationMs: 1000, isAborted: false, turnId: 'turn', reason: 'answer' })
  }
  await w.clock.advance(0)

  for (const surface of SURFACES) {
    expect(await styleOf($, surface, /^Blocked on you \(1\)$/)).toMatchObject({ color: 'warning', bold: true })
    expect(await styleOf($, surface, /^D1$/)).toMatchObject({ color: 'warning' })
    expect(await styleOf($, surface, /^D2$/)).toMatchObject({ color: 'suggestion' })
    expect(await styleOf($, surface, /^Progress $/)).toMatchObject({ dimColor: true })
    expect(await styleOf($, surface, /█+░+$/)).toMatchObject({ color: undefined, dimColor: undefined })
    expect(await styleOf($, surface, /^Branch\s+$/)).toMatchObject({ dimColor: true })
    expect(await styleOf($, surface, /^#3$/)).toMatchObject({ color: 'suggestion' })
    expect(await styleOf($, surface, /^Observations \(1\)$/)).toMatchObject({ dimColor: true, bold: true })
    expect(await styleOf($, surface, /^Session$/)).toMatchObject({ bold: true })
  }
})

test('every state line draws in a colour of its own', async ($, on) => {
  world(on)
  await start($)
  await runCommand($)
  const seen: Record<string, string> = {}
  const look = async (state: string) => {
    for (const surface of SURFACES) {
      const { color, dimColor } = await styleOf($, surface, new RegExp(`^● ${state}$`))
      seen[state] = typeof color === 'string' ? color : dimColor === true ? 'dim' : 'none'
    }
  }

  await startTurn($)
  await look('In progress')
  await callStatusTool($, blockedDecision())
  await look('Blocked')
  await callStatusTool($, { action: 'resolve', id: 'D1' })
  await endTurn($)
  await look('Waiting for reply')
  await startTurn($, '/settle-session')
  await look('Settling')
  await endTurn($)
  await look('Settled')

  expect(seen).toEqual({
    'In progress': 'success',
    Blocked: 'warning',
    'Waiting for reply': 'suggestion',
    Settling: 'planMode',
    Settled: 'dim',
  })
  expect(new Set(Object.values(seen)).size).toBe(5)
})

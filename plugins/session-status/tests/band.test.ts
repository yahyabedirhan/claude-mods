import { expect, test } from 'claude-code/testing'

import type { StatusItem } from '../types'
import { bandText as bandLine } from '../hooks/band'
import { emptyStatus } from '../hooks/status'
import {
  START,
  SURFACES,
  bandText,
  blockedDecision,
  callStatusTool,
  decisionBeforeSettling,
  start,
  surprise,
  world,
} from './world'

test('below the width limit the band shows the counts in the agreed form', async ($, on) => {
  world(on, { isNarrow: true })
  await start($)
  await callStatusTool($, blockedDecision())
  await callStatusTool($, blockedDecision({ question: 'Which port?' }))
  await callStatusTool($, decisionBeforeSettling())
  await callStatusTool($, surprise())
  await $.classic.TaskCreated({ task_id: '1', task_subject: 'Build the pane' })
  await $.classic.TaskCreated({ task_id: '2', task_subject: 'Draw the band' })
  await $.classic.TaskCreated({ task_id: '3', task_subject: 'Write the tests' })
  await $.classic.TaskCompleted({ task_id: '1', task_subject: 'Build the pane' })

  for (const surface of SURFACES) {
    expect(await bandText($, surface)).toBe('2 blocked · 1 decide · 1/3 done · 1 surprise')
  }
})

test('the band leaves the progress figure out before any item or task', async ($, on) => {
  world(on, { isNarrow: true })
  await start($)
  await callStatusTool($, surprise())

  for (const surface of SURFACES) {
    expect(await bandText($, surface)).toBe('0 blocked · 0 decide · 1 surprise')
  }
})

test('the band leaves resolved items out', () => {
  // The resolve and dismiss actions come in their own ticket; until then the
  // rule is checked on the status as data.
  const status = {
    ...emptyStatus('session-a'),
    items: [
      { ...decision('D1', 'blocked'), resolvedAt: START },
      decision('D2', 'blocked'),
      { ...decision('D3', 'before_settling'), resolvedAt: START },
      { kind: 'surprise', id: 'S1', occurred: 'x', changed: 'y', recordedAt: START, resolvedAt: START },
    ] as StatusItem[],
  }

  expect(bandLine(status)).toBe('1 blocked · 0 decide · 0 surprise')
})

function decision(id: string, urgency: 'blocked' | 'before_settling'): StatusItem {
  return {
    kind: 'decision',
    id,
    urgency,
    question: 'Which one?',
    options: ['A', 'B'],
    default: 'A',
    unblocks: 'Pick one',
    recordedAt: START,
  }
}

test('the band stays hidden while the pane is placed', async ($, on) => {
  world(on)
  await start($)
  await callStatusTool($, blockedDecision())

  for (const surface of SURFACES) {
    expect(await bandText($, surface)).toBeUndefined()
  }
})

test('the band stays hidden while the pane is not open', async ($, on) => {
  world(on, { isNarrow: true })
  await start($)
  await $.tool.call({ tool: 'Read', file_path: '/work/src/main.ts' })

  for (const surface of SURFACES) {
    expect(await bandText($, surface)).toBeUndefined()
  }
})

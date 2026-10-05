// The Cron jobs section: the jobs the session scheduled, active, fired,
// expired or cancelled, after the subagents.

import { expect, test } from 'claude-code/testing'
import type { Engine } from 'claude-code/testing'

import { SURFACES, endTurn, mountPane, runCommand, sectionText, start, startTurn, world } from './world'
import type { World } from './world'

const CHECK = 'Check the build and report.'
const REMIND = 'Remind me to review the PR.'

/** A week in milliseconds: when Claude Code expires a recurring job. */
const WEEK = 7 * 24 * 60 * 60 * 1000

/**
 * Answers CronCreate with the next job id, as the tool does. The live result
 * has no readable schedule, so its `humanSchedule` is the raw expression.
 */
function scheduler(w: World) {
  let next = 0
  w.answer('CronCreate', e => {
    next += 1
    const input = e as unknown as { cron: string; recurring?: boolean }

    return { id: `job${next}`, humanSchedule: input.cron, recurring: input.recurring ?? true }
  })
  w.answer('CronDelete', e => ({ id: (e as unknown as { id: string }).id }))
}

/** A week's clock passes through the age timer's 40,320 waits: a few seconds. */
const SLOW = { timeoutMs: 20_000 }

/**
 * Moves the clock to `to` a day at a time: the pane's age timer waits every
 * 15 seconds, and one advance resolves at most 10,000 waits.
 */
async function passTo(w: World, to: number) {
  const DAY = 24 * 60 * 60 * 1000
  while (w.clock.now() + DAY < to) {
    await w.clock.advance(DAY)
  }
  await w.clock.set(to)
}

function schedule($: Engine, prompt: string, recurring: boolean, cron = recurring ? '0 * * * *' : '53 1 5 10 *') {
  return $.tool.call({ tool: 'CronCreate', cron, prompt, recurring } as never)
}

test('a scheduled job shows as active with its schedule, after the subagents', async ($, on) => {
  const w = world(on)
  scheduler(w)
  await start($)
  await runCommand($)
  await schedule($, CHECK, false)

  for (const surface of SURFACES) {
    expect(await sectionText($, surface, 'crons')).toBe('Cron jobs1 activeOct 5 01:53 · Check the build and report.')
  }
})

test('a one-shot job that fires is done; a recurring one counts its fires and stays active', async ($, on) => {
  const w = world(on)
  scheduler(w)
  await start($)
  await runCommand($)
  await schedule($, CHECK, false)
  await schedule($, REMIND, true)

  await startTurn($, CHECK)
  await endTurn($)
  await startTurn($, REMIND)
  await endTurn($)
  await startTurn($, REMIND)
  await endTurn($)

  for (const surface of SURFACES) {
    expect(await sectionText($, surface, 'crons')).toBe(
      'Cron jobs1 active · 1 fired2× hourly · Remind me to review the PR.',
    )
  }
})

test('a deleted job counts as cancelled and leaves the active list', async ($, on) => {
  const w = world(on)
  scheduler(w)
  await start($)
  await runCommand($)
  await schedule($, CHECK, false)
  await $.tool.call({ tool: 'CronDelete', id: 'job1' } as never)

  for (const surface of SURFACES) {
    expect(await sectionText($, surface, 'crons')).toBe('Cron jobs1 cancelled')
  }
})

test('a CronList that no longer lists an active one-shot job marks it fired', async ($, on) => {
  const w = world(on)
  scheduler(w)
  w.answer('CronList', () => ({ jobs: [] }))
  await start($)
  await runCommand($)
  await schedule($, CHECK, false)
  await $.tool.call({ tool: 'CronList' } as never)

  for (const surface of SURFACES) {
    expect(await sectionText($, surface, 'crons')).toBe('Cron jobs1 fired')
  }
})

test('the section stays out until a job is scheduled, and a refused call adds none', async ($, on) => {
  const w = world(on)
  w.answer('CronCreate', () => ({ deny: 'no' }))
  await start($)
  await runCommand($)
  await $.tool.call({ tool: 'CronCreate', cron: '* * * * *', prompt: CHECK } as never)

  for (const surface of SURFACES) {
    expect(await sectionText($, surface, 'crons')).toBeUndefined()
    const ui = await mountPane($, surface)
    expect(await ui.find({ key: 'crons' })).toBeUndefined()
    await ui.unmount()
  }
})

test('the schedule reads as short text, and as the raw expression when it cannot', async ($, on) => {
  const w = world(on)
  scheduler(w)
  await start($)
  await runCommand($)
  await schedule($, CHECK, true, '0 9 * * 1-5')
  await schedule($, REMIND, true, '*/7 9-17 * * 1-5')

  for (const surface of SURFACES) {
    expect(await sectionText($, surface, 'crons')).toBe(
      'Cron jobs2 activeweekdays 09:00 · Check the build and report.*/7 9-17 * * 1-5 · Remind me to review the PR.',
    )
  }
})

test('a recurring job expires 7 days after it was scheduled; a one-shot job does not', SLOW, async ($, on) => {
  const w = world(on)
  scheduler(w)
  await start($)
  await runCommand($)
  const scheduledAt = w.clock.now()
  await schedule($, REMIND, true)
  await schedule($, CHECK, false, '0 9 1 1 *')

  await passTo(w, scheduledAt + WEEK - 1)
  for (const surface of SURFACES) {
    expect(await sectionText($, surface, 'crons')).toBe(
      'Cron jobs2 activehourly · Remind me to review the PR.Jan 1 09:00 · Check the build and report.',
    )
  }

  await passTo(w, scheduledAt + WEEK)
  for (const surface of SURFACES) {
    expect(await sectionText($, surface, 'crons')).toBe(
      'Cron jobs1 active · 1 expiredJan 1 09:00 · Check the build and report.',
    )
  }
})

test("a turn with an expired job's prompt is no fire, and deleting the job leaves it expired", SLOW, async ($, on) => {
  const w = world(on)
  scheduler(w)
  await start($)
  await runCommand($)
  const scheduledAt = w.clock.now()
  await schedule($, REMIND, true)

  await passTo(w, scheduledAt + WEEK + 60_000)
  await startTurn($, REMIND)
  await endTurn($)
  await $.tool.call({ tool: 'CronDelete', id: 'job1' } as never)

  for (const surface of SURFACES) {
    expect(await sectionText($, surface, 'crons')).toBe('Cron jobs1 expired')
  }
})

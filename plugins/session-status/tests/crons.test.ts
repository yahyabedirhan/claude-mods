// The Cron jobs section: the jobs the session scheduled, active, fired or
// cancelled, after the subagents.

import { expect, test } from 'claude-code/testing'
import type { Engine } from 'claude-code/testing'

import { SURFACES, endTurn, mountPane, runCommand, sectionText, start, startTurn, world } from './world'
import type { World } from './world'

const CHECK = 'Check the build and report.'
const REMIND = 'Remind me to review the PR.'

/** Answers CronCreate with the next job id, as the tool does. */
function scheduler(w: World) {
  let next = 0
  w.answer('CronCreate', e => {
    next += 1
    const input = e as unknown as { recurring?: boolean }

    return { id: `job${next}`, humanSchedule: next === 1 ? 'at 01:53 on Oct 5' : 'every hour', recurring: input.recurring ?? true }
  })
  w.answer('CronDelete', e => ({ id: (e as unknown as { id: string }).id }))
}

function schedule($: Engine, prompt: string, recurring: boolean) {
  return $.tool.call({ tool: 'CronCreate', cron: '53 1 5 10 *', prompt, recurring } as never)
}

test('a scheduled job shows as active with its schedule, after the subagents', async ($, on) => {
  const w = world(on)
  scheduler(w)
  await start($)
  await runCommand($)
  await schedule($, CHECK, false)

  for (const surface of SURFACES) {
    expect(await sectionText($, surface, 'crons')).toBe('Cron jobs1 activeat 01:53 on Oct 5 · Check the build and report.')
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
      'Cron jobs1 active · 1 fired2× every hour · Remind me to review the PR.',
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

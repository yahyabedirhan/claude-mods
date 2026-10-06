// The rule for every "+N more": a button that opens the section's full list
// in the pane, with Back to the main view. These are the sections that once
// showed it as plain text: Links, Cron jobs and the Building line.

import { expect, test } from 'claude-code/testing'
import type { Engine } from 'claude-code/testing'

import { SURFACES, callStatusTool, mountPane, runCommand, start, world } from './world'
import type { Surface } from './world'

/** Presses `<key>-more` and resolves to the full list's text, then presses Back. */
async function fullList($: Engine, surface: Surface, key: string) {
  const ui = await mountPane($, surface)
  await ui.press({ key: `${key}-more` })
  const text = (await ui.find({ key: 'list-view' }))?.text ?? ''
  await ui.press({ key: 'back' })
  const isBack = (await ui.find({ key: 'list-view' })) === undefined
  await ui.unmount()

  return { text, isBack }
}

test('the Links "+N more" opens every link, newest first', async ($, on) => {
  world(on)
  await start($)
  for (let number = 1; number <= 7; number += 1) {
    await callStatusTool($, { action: 'link', url: `https://github.com/octo/widgets/pull/${number}` })
  }

  for (const surface of SURFACES) {
    const { text, isBack } = await fullList($, surface, 'links')
    expect(text).toContain('Links (7)')
    expect(text.indexOf('widgets#7')).toBeLessThan(text.indexOf('widgets#1'))
    expect(isBack).toBe(true)
  }
})

test('the Cron jobs "+N more" opens every active job', async ($, on) => {
  const w = world(on)
  let next = 0
  w.answer('CronCreate', e => ({ id: `job${++next}`, humanSchedule: (e as unknown as { cron: string }).cron, recurring: true }))
  await start($)
  await runCommand($)
  for (const prompt of ['Check CI', 'Check mail', 'Check reviews', 'Check deploys', 'Check costs']) {
    await $.tool.call({ tool: 'CronCreate', cron: '0 * * * *', prompt, recurring: true } as never)
  }

  for (const surface of SURFACES) {
    const { text, isBack } = await fullList($, surface, 'crons')
    expect(text).toContain('Active cron jobs (5)')
    expect(text).toContain('Check costs')
    expect(isBack).toBe(true)
  }
})

test('the Building "+N more" opens every ticket being built', async ($, on) => {
  world(on)
  await start($)
  for (const number of [3, 4, 5, 6, 7, 8]) {
    await callStatusTool($, { action: 'ticket', state: 'started', number, title: `Ticket ${number}`, effort: 'launch' })
  }

  for (const surface of SURFACES) {
    const { text, isBack } = await fullList($, surface, 'building')
    expect(text).toContain('Building (6)')
    expect(text).toContain('#8')
    expect(isBack).toBe(true)
  }
})

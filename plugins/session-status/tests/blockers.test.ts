import { expect, test } from 'claude-code/testing'
import type { Engine } from 'claude-code/testing'

import { INSTRUCTIONS } from '../hooks/instructions'
import { blockerPing, pingId, withdrawPing } from '../hooks/pings'
import {
  SESSION_ID,
  STATUS_TOOL,
  SURFACES,
  bandText,
  callStatusTool,
  endSession,
  mountPane,
  sectionText,
  start,
  surprise,
  world,
} from './world'

const NEW_SESSION = 'session-b'

/** A blocker's input, as the agent records it when a step fails and it cannot finish alone. */
function blocker(fields: Record<string, unknown> = {}) {
  return {
    action: 'record_blocker',
    failed: 'The plugin tests do not start: the mods switch is not refreshed.',
    needs: 'Start claude once in a terminal, then run the tests again.',
    ...fields,
  }
}

/** The shipyard commands among the runs: the session's git reads are not pings. */
function pingRuns(runs: string[][]) {
  return runs.filter(argv => argv[0] === 'shipyard')
}

/** Lets the pings the mod queued with `$.clock.after(0, ...)` run. */
async function settle(w: ReturnType<typeof world>) {
  await w.clock.advance(0)
}

test('the status tool and the prompt section tell the agent to record what it is stuck on', async ($, on) => {
  const { tools } = world(on)
  await start($)

  const tool = tools.get(STATUS_TOOL)
  expect(tool?.inputSchema).toMatchObject({
    properties: { failed: { type: 'string' }, needs: { type: 'string' } },
  })
  expect(tool?.description).toMatch(/`record_blocker`/)
  expect(INSTRUCTIONS.text).toMatch(/action `record_blocker`/)
  expect(INSTRUCTIONS.text).toMatch(/restart Claude Code/)
})

test('a blocker shows under You should know, blocks the state line and pings the person', async ($, on) => {
  const w = world(on, { isNarrow: true })
  await start($)

  const answer = await callStatusTool($, blocker())
  await settle(w)

  expect(answer.result).toBe('Recorded blocker B1. The user was pinged.')
  expect(pingRuns(w.runs)).toEqual([blockerPing(SESSION_ID, { id: 'B1', ...blocker() })])
  for (const surface of SURFACES) {
    const text = (await sectionText($, surface, 'blockers')) ?? ''
    expect(text).toContain('You should know (1)')
    expect(text).toContain('B1 · The plugin tests do not start')
    expect(text).toContain('To unblock: Start claude once in a terminal')
    expect(await sectionText($, surface, 'state')).toBe('● Blocked')
    expect(await sectionText($, surface, 'surprises')).toBeUndefined()
    expect(await bandText($, surface)).toBe('1 blocked · 0 review · 0/0 done · 0 surprise')
  }
})

test('resolving a blocker withdraws its ping and moves it to the answered history', async ($, on) => {
  const w = world(on)
  await start($)
  await callStatusTool($, blocker())

  const answer = await callStatusTool($, { action: 'resolve', id: 'b1' })
  await settle(w)

  expect(answer.result).toBe('Resolved blocker B1. It is in the answered history now.')
  expect(pingRuns(w.runs).at(-1)).toEqual(withdrawPing(pingId(SESSION_ID, 'B1')))
  for (const surface of SURFACES) {
    expect(await sectionText($, surface, 'blockers')).toBeUndefined()
    expect(await sectionText($, surface, 'history')).toBe('Answered (1)')
  }
})

test('the status tool refuses a blocker without what failed or what unblocks it', async ($, on) => {
  world(on)
  await start($)

  expect((await callStatusTool($, blocker({ failed: ' ' }))).deny).toContain('`failed`')
  expect((await callStatusTool($, blocker({ needs: undefined }))).deny).toContain('`needs`')
  await callStatusTool($, blocker())
  expect((await callStatusTool($, { action: 'dismiss', id: 'B1' })).deny).toContain('use `resolve`')
})

test('/clear carries an open blocker over with its ping id', async ($, on) => {
  const w = world(on)
  await start($)
  await callStatusTool($, blocker())

  await endSession($, SESSION_ID)
  w.forgetState()
  w.switchSession(NEW_SESSION)
  await $.classic.SessionStart({ source: 'clear', session_id: NEW_SESSION } as never)

  expect(w.saved[NEW_SESSION]).toMatchObject({ items: [{ id: 'B1', kind: 'blocker', pingId: pingId(SESSION_ID, 'B1') }] })
  await callStatusTool($, { action: 'resolve', id: 'B1' })
  await settle(w)
  expect(pingRuns(w.runs).at(-1)).toEqual(withdrawPing(pingId(SESSION_ID, 'B1')))
})

/** Mounts the pane, presses the element keyed `key`, and returns the pane's text after it. */
async function pressAndRead($: Engine, surface: (typeof SURFACES)[number], key: string) {
  const ui = await mountPane($, surface)
  await ui.press({ key })
  const text = (await ui.find({ key: 'list-view' }))?.text
  await ui.unmount()

  return text
}

test('"+N more" opens the whole list, and Back returns to every section', async ($, on) => {
  world(on)
  await start($)
  for (const n of [1, 2, 3, 4]) {
    await callStatusTool($, surprise({ occurred: `Surprise number ${n}` }))
  }

  for (const surface of SURFACES) {
    expect(await sectionText($, surface, 'surprises-more')).toBe('+2 more')

    const list = (await pressAndRead($, surface, 'surprises-more')) ?? ''
    expect(list).toContain('Surprises (4)')
    for (const n of [1, 2, 3, 4]) {
      expect(list).toContain(`Surprise number ${n}`)
    }
    expect(await sectionText($, surface, 'blocked')).toBeUndefined()

    const ui = await mountPane($, surface)
    await ui.press({ key: 'back' })
    expect(await ui.find({ key: 'list-view' })).toBeUndefined()
    expect((await ui.find({ key: 'surprises' }))?.text).toContain('Surprises (4)')
    await ui.unmount()
  }
})

test('the list view shows a list that has no entries left as nothing open', async ($, on) => {
  world(on)
  await start($)
  for (const n of [1, 2, 3]) {
    await callStatusTool($, surprise({ occurred: `Surprise number ${n}` }))
  }
  const ui = await mountPane($, 'terminal')
  await ui.press({ key: 'surprises-more' })
  await ui.unmount()
  for (const id of ['S1', 'S2', 'S3']) {
    await callStatusTool($, { action: 'dismiss', id })
  }

  expect(await sectionText($, 'terminal', 'list-view')).toContain('Nothing open.')
})

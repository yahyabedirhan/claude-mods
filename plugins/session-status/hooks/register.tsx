// The session-status mod's entry: the one file that calls `$`, because the
// engine follows `$` only within the hooks module's own file. It wires the
// engine's events to the pure modules beside it and does their reads and
// writes. Keep feature logic in those modules; keep only I/O here.

import { atom, read, update } from 'claude-code'
import type { EngineInterface, Register } from 'claude-code'

import type { SessionStatus } from '../types'
import { describeToolCall } from './describe-tool-call'
import { AGE_TICK_MS, drawPane } from './pane'
import { applyChange } from './status'

const COMMAND = 'session-status'
// Written here as literals so `claude plugin validate` can read the matcher.
const PANE_ID = 'session-status'
const PANE_TITLE = 'Session status'

/** The session's status in `$.state`; null before its first change. */
const statusAtom = atom({ plugin: 'session-status', key: 'status' } as const, null)

/** Moved by the age timer; the pane reads it only to draw again when it moves. */
const tickAtom = atom({ plugin: 'session-status', key: 'tick' } as const, 0)

// The status store: the status in `$.state`, every change saved to
// `$.store` with the session id as the key.

/** Applies one change to the status and saves it. See `applyChange`. */
async function changeStatus(
  $: EngineInterface,
  change: (status: SessionStatus) => SessionStatus,
): Promise<void> {
  const stamp = { sessionId: await $.session.id(), now: await $.clock.now() }
  const status = await update($, statusAtom, current => applyChange(current, change, stamp))
  await $.store.set(stamp.sessionId, status)
}

// The pane.

async function isPaneOpen($: EngineInterface): Promise<boolean> {
  return (await $.ui.panes()).some(pane => pane.id === PANE_ID)
}

/** Opens the pane, or closes it when it is open. Says which it did. */
async function togglePane($: EngineInterface): Promise<'opened' | 'closed'> {
  if (await isPaneOpen($)) {
    await $.ui.close({ id: PANE_ID })

    return 'closed'
  }
  await $.ui.open({ id: PANE_ID, title: PANE_TITLE })

  return 'opened'
}

/**
 * Draws the pane again every AGE_TICK_MS while it is open, so "last update"
 * ages without a status change. A reload drops the timer, and the
 * `session.start` that follows a reload starts it again.
 */
function startAgeTicker($: EngineInterface): void {
  $.clock.every(AGE_TICK_MS, () => {
    void (async () => {
      if (await isPaneOpen($)) {
        const now = await $.clock.now()
        await update($, tickAtom, () => now)
      }
    })()
  })
}

export const register: Register = on => {
  on('session.start', async ($, e, next) => {
    await $.command.register({
      name: COMMAND,
      description: 'Open or close the session status pane',
    })
    startAgeTicker($)

    return next(e)
  })

  on('command.run', { command: COMMAND }, async $ => {
    const done = await togglePane($)

    return { text: `Session status pane ${done}.` }
  })

  on('tool.call', async ($, e, next) => {
    const doing = describeToolCall(e, await $.clock.now())
    await changeStatus($, status => ({ ...status, doingNow: doing }))

    return next(e)
  })

  on('ui.render', { component: 'Pane', requestId: PANE_ID }, async ($, e) => {
    await read($, tickAtom)

    return drawPane({
      ui: $.ui.resolve(e),
      status: await read($, statusAtom),
      now: await $.clock.now(),
      columns: e.props.bodyColumns,
    })
  })
}

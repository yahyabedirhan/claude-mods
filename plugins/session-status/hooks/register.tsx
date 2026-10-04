// The session-status mod's entry: the one file that calls `$`, because the
// engine follows `$` only within the hooks module's own file. It wires the
// engine's events to the pure modules beside it and does their reads and
// writes. Keep feature logic in those modules; keep only I/O here.

import { atom, read, update } from 'claude-code'
import type { EngineInterface, Register, Timer } from 'claude-code'

import type { SessionStatus, StatusItem } from '../types'
import { describeToolCall } from './describe-tool-call'
import { INSTRUCTIONS } from './instructions'
import { isCheckDue, observerRequest, parseFindings, recordCheck } from './observer'
import type { Trigger } from './observer'
import { AGE_TICK_MS, drawPane } from './pane'
import { blockedPing, endListPing, withdrawPing } from './pings'
import {
  STATUS_TOOL,
  STATUS_TOOL_SPEC,
  closedText,
  endListText,
  readStatusToolInput,
  recordedText,
} from './status-tool'
import {
  KEPT_SESSIONS,
  applyChange,
  closeItem,
  emptyStatus,
  keysToPrune,
  onEndList,
  openReviewLater,
  recordItem,
  savedStatus,
  statusForSession,
  withDefaults,
} from './status'
import { subagentStarted, subagentStopped } from './subagents'
import { taskCreated, taskUpdated } from './tasks'
import { toolResultChange } from './tool-results'

const COMMAND = 'session-status'
// Written here as literals so `claude plugin validate` can read the matcher.
const PANE_ID = 'session-status'
const PANE_TITLE = 'Session status'

/** The session's status in `$.state`; null before its first change. */
const statusAtom = atom({ plugin: 'session-status', key: 'status' } as const, null)

/** Moved by the age timer; the pane reads it only to draw again when it moves. */
const tickAtom = atom({ plugin: 'session-status', key: 'tick' } as const, 0)

/** Main-loop turns that ended with the pane open since the observer's last check. */
const observerTurnsAtom = atom({ plugin: 'session-status', key: 'observerTurns' } as const, 0)

// The status store: the status in `$.state`, every change saved to
// `$.store` with the session id as the key.

/**
 * Makes `$.state` hold the status of `sessionId` when it holds another
 * session's or none: the saved one on a resume, else the open decisions
 * carried over from the one held (a `/clear`), saved at once. A new session
 * also drops the oldest saved sessions beyond KEPT_SESSIONS.
 */
async function holdSession($: EngineInterface, sessionId: string): Promise<void> {
  const held = await read($, statusAtom)
  if (held?.sessionId === sessionId) {
    return
  }
  const saved = savedStatus(await $.store.get(sessionId), sessionId)
  const now = await $.clock.now()
  const status = await update($, statusAtom, current =>
    statusForSession(current, sessionId, saved, now),
  )
  // A restored status is saved as it was; a carried one is saved for the first time.
  if (status !== null) {
    await $.store.set(sessionId, status)
  }
  await pruneStore($, sessionId)
}

/** Deletes the saved statuses beyond the newest KEPT_SESSIONS; keeps `current`. */
async function pruneStore($: EngineInterface, current: string): Promise<void> {
  const keys = await $.store.keys()
  const all = keys.includes(current) ? keys : [...keys, current]
  if (all.length <= KEPT_SESSIONS) {
    return
  }
  const entries = await Promise.all(
    all.map(async key => ({ key, value: key === current ? null : await $.store.get(key) })),
  )
  for (const key of keysToPrune(entries, current)) {
    await $.store.delete(key)
  }
}

/** Applies one change to the status and saves it; resolves to the new status. See `applyChange`. */
async function changeStatus(
  $: EngineInterface,
  change: (status: SessionStatus) => SessionStatus,
): Promise<SessionStatus> {
  const sessionId = await $.session.id()
  await holdSession($, sessionId)
  const stamp = { sessionId, now: await $.clock.now() }
  let status = emptyStatus(sessionId)
  await update($, statusAtom, current => (status = applyChange(current, change, stamp)))
  await $.store.set(stamp.sessionId, status)

  return status
}

// Shipyard pings.

/**
 * Runs a `shipyard ping` command and forgets it: queued on a timer so it
 * never holds the status call, every failure (no shipyard, an error, a
 * timeout) swallowed. The child inherits Claude Code's environment, so
 * `--herdr` finds `$HERDR_PANE_ID` when Claude Code runs in Herdr.
 */
function sendPing($: EngineInterface, argv: string[]): void {
  try {
    $.clock.after(0, () => {
      void $.process.run(argv, { timeoutMs: 10_000 }).catch(() => undefined)
    })
  } catch {
    // A ping is a courtesy: the status call goes on without it.
  }
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

// The observer agent: a small model's check on the recent work, shown as
// surprises tagged `observer`. It adds nothing to the main agent's context.

/** True while a check runs, so a second trigger does not start another. */
let isObserving = false

/**
 * Counts a main-loop turn toward the observer's interval and runs one check
 * when it is due: the pane open, no check running, under the cap, and the
 * turn interval reached or a subagent finished. The hooks start it without
 * waiting, so a check never holds up the session.
 */
async function observe($: EngineInterface, trigger: Trigger): Promise<void> {
  if (!(await isPaneOpen($))) {
    return
  }
  const turns = trigger === 'turn' ? await update($, observerTurnsAtom, n => n + 1) : 0
  const status = withDefaults(await read($, statusAtom)) ?? emptyStatus(await $.session.id())
  // No await between the test and the set: a second trigger sees the flag.
  if (isObserving || !isCheckDue(status, turns, trigger)) {
    return
  }
  isObserving = true
  try {
    await update($, observerTurnsAtom, () => 0)
    const request = observerRequest(status, await $.session.messages())
    // A refused request (a blocked model) counts as a check that found nothing.
    const reply = await $.model.complete(request).catch(() => null)
    const findings = reply?.isAnswered === true ? parseFindings(reply.text) : []
    const now = await $.clock.now()
    await changeStatus($, current => recordCheck(current, findings, now))
  } finally {
    isObserving = false
  }
}

/** Starts `observe` without waiting for it; a failure goes to the debug log. */
function startObserver($: EngineInterface, trigger: Trigger): void {
  observe($, trigger).catch((error: unknown) => {
    $.ui.log(`session-status observer: ${String(error)}`, { to: 'debug' })
  })
}

/** This module load's age timer; a reload starts the module, and this, over. */
let ageTicker: Timer | undefined

/**
 * Draws the pane again every AGE_TICK_MS while it is open, so "last update"
 * ages without a status change. A reload drops the timer, and the
 * `session.start` that follows a reload starts it again. A `session.start`
 * that runs again in the same load stops the timer before it, so one runs.
 * (`/clear` fires no `session.start`; the timer goes on across it.)
 */
function startAgeTicker($: EngineInterface): void {
  ageTicker?.cancel()
  ageTicker = $.clock.every(AGE_TICK_MS, () => {
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
    await $.tool.register(STATUS_TOOL_SPEC)
    startAgeTicker($)

    return next(e)
  })

  // Resume, /clear and fork move the process to another session id; the
  // status follows it (see holdSession). /compact keeps the session and its
  // status, so `compact` changes nothing, and no hook here touches the
  // status on PreCompact, PostCompact or session.end.
  on('classic.SessionStart', async ($, e, next) => {
    if (e.source !== 'compact') {
      await holdSession($, e.session_id)
    }

    return next(e)
  })

  on('command.run', { command: COMMAND }, async $ => {
    const done = await togglePane($)

    return { text: `Session status pane ${done}.` }
  })

  on('prompt.compose', async (_$, e, next) => {
    const { sections } = await next(e)

    return { sections: [...sections, INSTRUCTIONS] }
  })

  // The status tool: the model records a decision or a surprise, closes one,
  // or marks the end-of-work list posted. The matcher spells STATUS_TOOL
  // out, so `claude plugin validate` can read it.
  on('tool.call', { tool: 'mcp__session-status__status' }, async ($, e) => {
    const input = readStatusToolInput(e as unknown as Record<string, unknown>)
    if ('error' in input) {
      return { deny: input.error }
    }
    const now = await $.clock.now()

    if ('close' in input) {
      const current = withDefaults(await read($, statusAtom)) ?? emptyStatus(await $.session.id())
      const checked = closeItem(current, input.close, now)
      if ('error' in checked) {
        return { deny: checked.error }
      }
      await changeStatus($, status => {
        const closed = closeItem(status, input.close, now)

        return 'error' in closed ? status : closed.status
      })
      if (checked.item.kind === 'decision' && checked.item.urgency === 'blocked') {
        sendPing($, withdrawPing(await $.session.id(), checked.item.id))
      }

      return { result: closedText(checked.item) }
    }

    if ('postEndList' in input) {
      const current = withDefaults(await read($, statusAtom)) ?? emptyStatus(await $.session.id())
      if (openReviewLater(current).length === 0) {
        return { result: endListText([]) }
      }
      const posted = await changeStatus($, status => ({ ...status, endListPostedAt: now }))
      const listed = onEndList(posted)
      sendPing($, endListPing(posted.sessionId, listed.map(item => item.id)))

      return { result: endListText(listed) }
    }

    let recorded: StatusItem | undefined
    await changeStatus($, status => {
      const { status: next, item } = recordItem(status, input.draft, now)
      recorded = item

      return next
    })

    if (recorded?.kind === 'decision' && recorded.urgency === 'blocked') {
      sendPing($, blockedPing(await $.session.id(), recorded))
    }

    return { result: recorded === undefined ? 'Recorded.' : recordedText(recorded) }
  })

  // Subagents' tool calls arrive here too, with `agentId` set: they count
  // as the main loop's do.
  on('tool.call', async ($, e, next) => {
    // A call to the status tool is about the status, not the work.
    if (e.tool === STATUS_TOOL) {
      return next(e)
    }
    const doing = describeToolCall(e, await $.clock.now())
    await changeStatus($, status => ({ ...status, doingNow: doing }))
    const answer = await next(e)
    const change = toolResultChange(e, answer, await $.clock.now())
    if (change !== null) {
      await changeStatus($, change)
    }

    return answer
  })

  on('classic.TaskCreated', async ($, e, next) => {
    const at = await $.clock.now()
    await changeStatus($, status =>
      taskCreated(status, { id: e.task_id, subject: e.task_subject }, at),
    )

    return next(e)
  })

  on('classic.TaskCompleted', async ($, e, next) => {
    const at = await $.clock.now()
    await changeStatus($, status =>
      taskUpdated(status, { id: e.task_id, status: 'completed', subject: e.task_subject }, at),
    )

    return next(e)
  })

  on('classic.SubagentStart', async ($, e, next) => {
    await changeStatus($, status => subagentStarted(status, e.agent_id))

    return next(e)
  })

  on('classic.SubagentStop', async ($, e, next) => {
    await changeStatus($, status => subagentStopped(status, e.agent_id))
    startObserver($, 'subagent')

    return next(e)
  })

  // Only the main loop's turns count toward the observer's interval.
  on('turn.complete', async ($, e, next) => {
    if (e.agentId === undefined) {
      startObserver($, 'turn')
    }

    return next(e)
  })

  on('ui.render', { component: 'Pane', requestId: PANE_ID }, async ($, e) => {
    await read($, tickAtom)

    return drawPane({
      ui: $.ui.resolve(e),
      status: withDefaults(await read($, statusAtom)),
      now: await $.clock.now(),
      columns: e.props.bodyColumns,
    })
  })
}

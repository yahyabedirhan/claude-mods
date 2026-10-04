// The session-status mod's entry: the one file that calls `$`, because the
// engine follows `$` only within the hooks module's own file. It wires the
// engine's events to the pure modules beside it and does their reads and
// writes. Keep feature logic in those modules; keep only I/O here.

import { atom, read, update } from 'claude-code'
import type { EngineInterface, Register, Timer } from 'claude-code'

import type { SessionStatus, StatusItem } from '../types'
import { meetsAutoOpenTrigger } from './auto-open'
import { drawBand } from './band'
import { describeToolCall } from './describe-tool-call'
import { branchEffortName, effortSighting, withEffort } from './effort'
import { TICKET_TIMEOUT_MS, isTicketReadDue, parseTicketList, ticketListArgv, withTickets } from './effort-progress'
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
  CARRY_KEY,
  KEPT_SESSIONS,
  applyChange,
  clearCarry,
  closeItem,
  emptyStatus,
  keysToPrune,
  onEndList,
  openReviewLater,
  readCarry,
  recordItem,
  savedStatus,
  statusForSession,
  withCarry,
  withDefaults,
} from './status'
import type { ClearCarry } from './status'
import { isRunningSubagent, subagentStarted, subagentStopped } from './subagents'
import { taskCreated, taskUpdated } from './tasks'
import { toolResultChange } from './tool-results'

const COMMAND = 'session-status'
// Written here as literals so `claude plugin validate` can read the matcher.
const PANE_ID = 'session-status'
const PANE_TITLE = 'Session status'

/** The session's status in `$.state`; null before its first change. */
const statusAtom = atom({ plugin: 'session-status', key: 'status' } as const, null)

/**
 * Where the pane stands for the session. Auto-open opens only an `unopened`
 * pane, so a pane the person closed stays closed until they open it again.
 */
const paneAtom = atom({ plugin: 'session-status', key: 'pane' } as const, 'unopened')

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
 *
 * `carry` is what the session a `/clear` ended left in the store: its open
 * decisions join the status even when `$.state` came through the `/clear`
 * empty, or an earlier event already started the new session's status.
 */
async function holdSession(
  $: EngineInterface,
  sessionId: string,
  carry: ClearCarry | null = null,
): Promise<void> {
  const held = await read($, statusAtom)
  if (held?.sessionId === sessionId && carry === null) {
    return
  }
  const saved = savedStatus(await $.store.get(sessionId), sessionId)
  const now = await $.clock.now()
  const status = await update($, statusAtom, current => {
    const kept = statusForSession(current, sessionId, saved, now)

    return carry === null ? kept : withCarry(kept ?? { ...emptyStatus(sessionId), updatedAt: now }, carry)
  })
  // A restored status is saved as it was; a carried one is saved for the first time.
  if (status !== null) {
    await $.store.set(sessionId, status)
  }
  await pruneStore($, sessionId)
  // A restored or carried status that meets a trigger opens the pane, unless
  // the person closed it.
  if (status !== null && meetsAutoOpenTrigger(status)) {
    await autoOpenPane($)
  }
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
  if (meetsAutoOpenTrigger(status)) {
    await autoOpenPane($)
  }

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

/**
 * Opens the pane, or closes it when it is open and drawn. A pane that waits
 * undrawn is opened again instead: the person's own open seats it at any width.
 * Says which it did.
 */
async function togglePane($: EngineInterface): Promise<'opened' | 'closed'> {
  if ((await isPaneOpen($)) && !(await isPaneWaiting($))) {
    await update($, paneAtom, () => 'closed')
    await $.ui.close({ id: PANE_ID })

    return 'closed'
  }
  await update($, paneAtom, () => 'open')
  await $.ui.open({ id: PANE_ID, title: PANE_TITLE })

  return 'opened'
}

/**
 * Opens the pane unasked, once per session: only a pane that was never
 * opened. The engine seats it from 144 columns (110 for an id the person
 * opened before) and keeps it waiting below; the band shows meanwhile.
 */
async function autoOpenPane($: EngineInterface): Promise<void> {
  let isOpening = false
  await update($, paneAtom, state => {
    isOpening = state === 'unopened'

    return isOpening ? 'open' : state
  })
  if (isOpening) {
    await $.ui.open({ id: PANE_ID, title: PANE_TITLE })
  }
}

/** Whether the pane is open but waits undrawn: the terminal is too narrow. */
async function isPaneWaiting($: EngineInterface): Promise<boolean> {
  return (await $.ui.panes()).some(pane => pane.id === PANE_ID && !pane.isPlaced)
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
    // An open pane stays open for the session: a reload that dropped it
    // opens it again.
    if ((await read($, paneAtom)) === 'open' && !(await isPaneOpen($))) {
      await $.ui.open({ id: PANE_ID, title: PANE_TITLE })
    }

    return next(e)
  })

  // Resume, /clear and fork move the process to another session id; the
  // status follows it (see holdSession). /compact keeps the session and its
  // status, so `compact` changes nothing, and no hook here touches the
  // status on PreCompact or PostCompact.
  //
  // A /clear can empty `$.state`, so the session it ends saves what it carries
  // over to the store, and the new session's SessionStart (source `clear`)
  // takes it once. Only that SessionStart takes it, and only within
  // CARRY_WINDOW_MS: a startup, a resume or another process never does.
  on('session.end', async ($, e, next) => {
    if (e.reason === 'clear') {
      const ended = savedStatus(await $.store.get(e.sessionId), e.sessionId)
      const carry = ended === null ? null : clearCarry(ended, await $.clock.now())
      // No carry leaves no older one behind for this /clear's new session.
      await (carry === null ? $.store.delete(CARRY_KEY) : $.store.set(CARRY_KEY, carry))
    }

    return next(e)
  })

  on('classic.SessionStart', async ($, e, next) => {
    if (e.source === 'clear') {
      const carry = readCarry(await $.store.get(CARRY_KEY), e.session_id, await $.clock.now())
      await $.store.delete(CARRY_KEY)
      await holdSession($, e.session_id, carry)
    } else if (e.source !== 'compact') {
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
    const sighting = effortSighting(e)
    if (sighting !== null) {
      await effortSeen($, sighting.name)
    }
    const answer = await next(e)
    const change = toolResultChange(e, answer, await $.clock.now())
    if (change !== null) {
      await changeStatus($, change)
    }
    await countTicketsIfDue($, e)

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

  // The subagent counters count only the subagents an Agent tool call
  // started: `agent.spawn` fires for those alone and answers the started
  // agent's id. Claude Code's own agents (compaction and the like) fire the
  // classic SubagentStart and SubagentStop too, but no `agent.spawn`, so
  // SubagentStart moves nothing and a SubagentStop counts only an agent the
  // counters hold as running.
  on('agent.spawn', async ($, e, next) => {
    const answer = await next(e)
    const agentId = answer.deny === undefined ? answer.agentId : undefined
    if (agentId !== undefined) {
      await changeStatus($, status => subagentStarted(status, agentId))
    }

    return answer
  })

  on('classic.SubagentStop', async ($, e, next) => {
    const sessionId = await $.session.id()
    const held = withDefaults(await read($, statusAtom))
    if (held?.sessionId === sessionId && isRunningSubagent(held, e.agent_id)) {
      await changeStatus($, status => subagentStopped(status, e.agent_id))
      startObserver($, 'subagent')
    }

    return next(e)
  })

  // Only the main loop's turns count toward the observer's interval.
  on('turn.complete', async ($, e, next) => {
    if (e.agentId === undefined) {
      startObserver($, 'turn')
    }

    return next(e)
  })

  // The person closing the pane by its mark or key: auto-open leaves it
  // closed for the rest of the session.
  on('ui.close', { id: 'session-status' }, async ($, e, next) => {
    if (e.origin.kind === 'person') {
      await update($, paneAtom, () => 'closed')
    }

    return next(e)
  })

  // The band: counts only, while the pane waits on a narrow terminal.
  on('ui.render', { component: 'AbovePrompt' }, async ($, e, next) => {
    const status = await read($, statusAtom)
    if ((await read($, paneAtom)) !== 'open' || e.props.hasSurvey || !(await isPaneWaiting($))) {
      return next(e)
    }

    return drawBand($.ui.resolve(e), withDefaults(status))
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

/**
 * Records an effort run a tool call shows, and opens the pane for it. A run
 * that names no label takes the branch's name while the effort has none.
 */
async function effortSeen($: EngineInterface, name: string | null): Promise<void> {
  if (name !== null) {
    await changeStatus($, status => withEffort(status, { name, from: 'label' }))
  } else if (withDefaults(await read($, statusAtom))?.effort == null) {
    const branch = await readBranch($)
    if (branch !== null) {
      await changeStatus($, status => withEffort(status, { name: branch, from: 'branch' }))
    }
  }
  // A run whose name is still unknown opens the pane too.
  await autoOpenPane($)
}

// Effort progress: during an effort, progress counts the effort's tickets.

/** The effort and time of the last ticket read started; null before the first. */
let lastTicketRead: { effort: string; at: number } | null = null

/** True while a ticket read is queued or runs, so a second one does not start. */
let isCountingTickets = false

/** The effort of a read that fell due while one ran: it runs once when that one ends. */
let waitingTicketRead: string | null = null

/**
 * Starts a read of the effort's tickets when one is due after a tool call
 * (see `isTicketReadDue`). One read runs at a time: a read due meanwhile
 * runs once after it. The read runs on a timer, so it never holds the tool
 * call; a failed read keeps the last good count.
 */
async function countTicketsIfDue($: EngineInterface, call: { tool: string }): Promise<void> {
  const status = withDefaults(await read($, statusAtom))
  const now = await $.clock.now()
  const effort = status?.effort?.name
  if (effort === undefined || !isTicketReadDue(status, lastTicketRead, call, now)) {
    return
  }
  lastTicketRead = { effort, at: now }
  // No await between the test and the set: a second call sees the flag.
  if (isCountingTickets) {
    waitingTicketRead = effort

    return
  }
  isCountingTickets = true
  startTicketRead($, effort)
}

/** Queues one ticket read, and the waiting one after it; clears the flag at the end. */
function startTicketRead($: EngineInterface, effort: string): void {
  const finish = async () => {
    await countTickets($, effort)
    const waiting = waitingTicketRead
    if (waiting !== null) {
      waitingTicketRead = null
      await countTickets($, waiting)
    }
  }
  try {
    $.clock.after(0, () => {
      void finish().finally(() => {
        isCountingTickets = false
      })
    })
  } catch {
    isCountingTickets = false
  }
}

/** Reads the effort's tickets with `gh` and keeps the count; swallows every failure. */
async function countTickets($: EngineInterface, effort: string): Promise<void> {
  try {
    const { exitCode, stdout } = await $.process.run(ticketListArgv(effort), { timeoutMs: TICKET_TIMEOUT_MS })
    const count = exitCode === 0 ? parseTicketList(stdout) : null
    if (count !== null) {
      const at = await $.clock.now()
      await changeStatus($, status => withTickets(status, { effort, ...count, at }))
    }
  } catch {
    // No gh, no network, a timeout: the last good count holds.
  }
}

/** The session's git branch, or null when git gives none. */
async function readBranch($: EngineInterface): Promise<string | null> {
  try {
    const { exitCode, stdout } = await $.process.run(['git', 'branch', '--show-current'], {
      timeoutMs: 5_000,
    })

    return exitCode === 0 ? branchEffortName(stdout) : null
  } catch {
    return null
  }
}

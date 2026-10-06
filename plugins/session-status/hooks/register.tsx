// The session-status mod's entry: the one file that calls `$`, because the
// engine follows `$` only within the hooks module's own file. It wires the
// engine's events to the pure modules beside it and does their reads and
// writes. Keep feature logic in those modules; keep only I/O here.

import { atom, read, update } from 'claude-code'
import type { EngineInterface, Register, RenderSurface, Timer } from 'claude-code'

import type { Blocker, Decision, GitHubRepo, SessionStatus, StatusItem } from '../types'
import { afterTurn, settles, settlesByPrompt } from './activity'
import { cronFired } from './crons'
import { meetsAutoOpenTrigger } from './auto-open'
import { drawBand } from './band'
import { describeToolCall } from './describe-tool-call'
import { branchEffortName, effortSighting, withEffort } from './effort'
import { TICKET_TIMEOUT_MS, isTicketReadDue, parseTicketList, ticketListArgv, withTickets } from './effort-progress'
import { INSTRUCTIONS } from './instructions'
import { isCheckDue, observerRequest, parseFindings, recordCheck } from './observer'
import type { Trigger } from './observer'
import { AGE_TICK_MS, drawPane } from './pane'
import { blockedPing, blockerPing, endListPing, pingId, withdrawPing } from './pings'
import { changesBranch, githubRepo, repoOf, withPlace } from './place'
import { commandTargets, editedFile, folderOf, withChange } from './places'
import type { ChangedRepo } from './places'
import { linkedText, linksFound } from './links'
import { listText, resetProgress, resetText } from './reset'
import type { ResetRemoved } from './reset'
import { reportItem } from './session-items'
import { sessionProgress } from './session-progress'
import {
  STATUS_TOOL,
  STATUS_TOOL_SPEC,
  closedText,
  endListText,
  itemText,
  readStatusToolInput,
  recordedText,
  ticketText,
} from './status-tool'
import {
  KEPT_SESSIONS,
  applyChange,
  closeItem,
  emptyStatus,
  keysToPrune,
  onEndList,
  openToDecide,
  recordItem,
  savedStatus,
  statusForSession,
  withDefaults,
} from './status'
import { isRunningSubagent, subagentStarted, subagentStopped } from './subagents'
import { taskCreated, taskUpdated } from './tasks'
import { reportTicket } from './ticket-reports'
import { toolResultChange } from './tool-results'

const COMMAND = 'session-status'
// Written here as literals so `claude plugin validate` can read the matcher.
const PANE_ID = 'session-status'
const PANE_TITLE = 'Session status'
// The dock's starting width, in columns: about a third of a wide terminal,
// enough for the section lines. A width the person drags the dock to wins.
const PANE_COLUMNS = 48

/** The session's status in `$.state`; null before its first change. */
const statusAtom = atom({ plugin: 'session-status', key: 'status' } as const, null)

/**
 * Where the pane stands for the session. Auto-open opens only an `unopened`
 * pane, so a pane the person closed stays closed until they open it again.
 */
const paneAtom = atom({ plugin: 'session-status', key: 'pane' } as const, 'unopened')

/** What the pane shows: every section, or one list in full after its "+N more" was pressed. */
const viewAtom = atom({ plugin: 'session-status', key: 'view' } as const, 'main')

/** Moved by the age timer; the pane reads it only to draw again when it moves. */
const tickAtom = atom({ plugin: 'session-status', key: 'tick' } as const, 0)

/** Main-loop turns that ended with the pane open since the observer's last check. */
const observerTurnsAtom = atom({ plugin: 'session-status', key: 'observerTurns' } as const, 0)

// The status store: the status in `$.state`, every change saved to
// `$.store` with the session id as the key.

/**
 * Makes `$.state` hold the status of `sessionId` when it holds another
 * session's or none: the saved one on a resume; else none, so a `/clear` or
 * a fork starts empty. A new session also drops the oldest saved sessions
 * beyond KEPT_SESSIONS.
 */
async function holdSession($: EngineInterface, sessionId: string): Promise<void> {
  const held = await read($, statusAtom)
  if (held?.sessionId === sessionId) {
    return
  }
  const saved = savedStatus(await $.store.get(sessionId), sessionId)
  const status = await update($, statusAtom, current => statusForSession(withDefaults(current), sessionId, saved))
  if (status !== null) {
    await saveStatus($, status)
  }
  await pruneStore($, sessionId)
  // A restored status that meets a trigger opens the pane, unless the person
  // closed it.
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

/**
 * Makes `$.state` hold the status of the session that runs now (see
 * holdSession) and resolves to its id.
 */
async function holdCurrentSession($: EngineInterface): Promise<string> {
  const sessionId = await $.session.id()
  await holdSession($, sessionId)

  return sessionId
}

/** The status of the session that runs now, held first; empty before its first change. */
async function currentStatus($: EngineInterface): Promise<SessionStatus> {
  const sessionId = await holdCurrentSession($)

  return withDefaults(await read($, statusAtom)) ?? emptyStatus(sessionId)
}

/**
 * Saves a status to `$.store` under its session id. A refused write (a full
 * store) goes to the debug log: the status in `$.state` stands, and the next
 * change saves it again.
 */
async function saveStatus($: EngineInterface, status: SessionStatus): Promise<void> {
  try {
    await $.store.set(status.sessionId, status)
  } catch (error) {
    $.ui.log(`session-status: the status was not saved: ${String(error)}`, { to: 'debug' })
  }
}

/**
 * Applies one change to the status and saves it; resolves to the new status.
 * See `applyChange`. `save: false` changes `$.state` alone, for a change a
 * later one saves with it.
 */
async function changeStatus(
  $: EngineInterface,
  change: (status: SessionStatus) => SessionStatus,
  options: { save?: boolean } = {},
): Promise<SessionStatus> {
  const sessionId = await holdCurrentSession($)
  const stamp = { sessionId, now: await $.clock.now() }
  let status = emptyStatus(sessionId)
  await update($, statusAtom, current => (status = applyChange(current, change, stamp)))
  if (options.save !== false) {
    await saveStatus($, status)
  }
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
    await update($, viewAtom, () => 'main')
    await $.ui.close({ id: PANE_ID })

    return 'closed'
  }
  await update($, paneAtom, () => 'open')
  await $.ui.open({ id: PANE_ID, title: PANE_TITLE, columns: PANE_COLUMNS })

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
    await $.ui.open({ id: PANE_ID, title: PANE_TITLE, columns: PANE_COLUMNS })
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
 * turn interval reached or a subagent finished (see isCheckDue). The hooks
 * start it without waiting, so a check never holds up the session.
 */
async function observe($: EngineInterface, trigger: Trigger): Promise<void> {
  if (!(await isPaneOpen($))) {
    return
  }
  // A subagent trigger reads the turns since the last check: after a
  // dismissal it waits for the turn interval too (see isCheckDue).
  const turns =
    trigger === 'turn' ? await update($, observerTurnsAtom, n => n + 1) : await read($, observerTurnsAtom)
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

/** Copies a value the person pressed in the pane, and says so in a toast. */
async function copyValue($: EngineInterface, text: string, surface: RenderSurface): Promise<void> {
  const copied = await $.ui.copy({ text, surface })
  $.ui.toast(copied.isCopied ? `Copied ${text}` : `Could not copy ${text}`)
}

/** Resets the session progress (see `resetProgress`), saved at once; resolves to the reply. */
async function reset($: EngineInterface): Promise<string> {
  let removed: ResetRemoved | undefined
  await changeStatus($, status => {
    const outcome = resetProgress(status)
    removed = outcome.removed

    return outcome.status
  })

  return resetText(removed ?? { items: 0, entries: 0, links: 0, tickets: 0, effort: null })
}

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
    })().catch((error: unknown) => {
      $.ui.log(`session-status age timer: ${String(error)}`, { to: 'debug' })
    })
  })
}

export const register: Register = on => {
  on('session.start', async ($, e, next) => {
    await $.command.register({
      name: COMMAND,
      description: 'Open or close the session status pane; `reset` clears the whole session status',
    })
    await $.tool.register(STATUS_TOOL_SPEC)
    startAgeTicker($)
    // An open pane stays open for the session: a reload that dropped it
    // opens it again.
    if ((await read($, paneAtom)) === 'open' && !(await isPaneOpen($))) {
      await $.ui.open({ id: PANE_ID, title: PANE_TITLE, columns: PANE_COLUMNS })
    }
    readPlace($)

    return next(e)
  })

  // Resume, /clear and fork move the process to another session id; the
  // status follows it (see holdSession): a status belongs to one session id,
  // so a /clear starts empty and a resume restores what that id saved.
  // /compact keeps the session and its status, so `compact` changes nothing,
  // and no hook here touches the status on PreCompact or PostCompact.
  on('classic.SessionStart', async ($, e, next) => {
    if (e.source !== 'compact') {
      await holdSession($, e.session_id)
      readPlace($)
    }

    return next(e)
  })

  on('classic.CwdChanged', async ($, e, next) => {
    readPlace($)

    return next(e)
  })

  // `/session-status` opens or closes the pane; `/session-status reset`
  // clears the session progress a `/clear` carried over.
  on('command.run', { command: COMMAND }, async ($, e) => {
    const arg = e.args.trim().toLowerCase()
    if (arg === 'reset') {
      return { text: await reset($) }
    }
    if (arg !== '') {
      return { text: `Unknown argument "${e.args.trim()}". Use /${COMMAND} to open or close the pane, or /${COMMAND} reset to clear the whole session status.` }
    }
    const done = await togglePane($)

    return { text: `Session status pane ${done}.` }
  })

  on('prompt.compose', async (_$, e, next) => {
    const { sections } = await next(e)

    return { sections: [...sections, INSTRUCTIONS] }
  })

  // The status tool: the model records a decision or a surprise, closes one,
  // marks the decide list posted, or reports a ticket's state. The
  // matcher spells STATUS_TOOL out, so `claude plugin validate` can read it.
  on('tool.call', { tool: 'mcp__session-status__status' }, async ($, e) => {
    const input = readStatusToolInput(e as unknown as Record<string, unknown>)
    if ('error' in input) {
      return { deny: input.error }
    }
    const now = await $.clock.now()

    if ('close' in input) {
      const current = await currentStatus($)
      const checked = closeItem(current, input.close, now)
      if ('error' in checked) {
        return { deny: checked.error }
      }
      await changeStatus($, status => {
        const closed = closeItem(status, input.close, now)

        return 'error' in closed ? status : closed.status
      })
      if (pings(checked.item)) {
        // An item carried over a /clear keeps the ping id its own session sent.
        sendPing($, withdrawPing(checked.item.pingId ?? pingId(current.sessionId, checked.item.id)))
      }

      return { result: closedText(checked.item) }
    }

    if ('postEndList' in input) {
      const current = await currentStatus($)
      if (openToDecide(current).length === 0) {
        return { result: endListText([]) }
      }
      const posted = await changeStatus($, status => ({ ...status, endListPostedAt: now }))
      const listed = onEndList(posted)
      sendPing($, endListPing(posted.sessionId, listed.map(item => item.id)))

      return { result: endListText(listed) }
    }

    if ('list' in input) {
      return { result: listText(await currentStatus($)) }
    }

    if ('reset' in input) {
      return { result: await reset($) }
    }

    if ('link' in input) {
      const { link } = input
      // The reply comes from the change the status took: linksFound returns
      // the status unchanged when the page is listed already.
      let isAdded = false
      await changeStatus($, status => {
        const linked = linksFound(status, [link], { agentId: input.agentId, at: now })
        isAdded = linked !== status

        return linked
      })

      return { result: linkedText(link, isAdded) }
    }

    if ('ticket' in input) {
      const request = input.ticket
      // The reply comes from the change the status took, not from a check
      // made before it: another change can land in between.
      let outcome: ReturnType<typeof reportTicket> | undefined
      const reported = await changeStatus($, status => {
        outcome = reportTicket(status, request, now)

        return 'error' in outcome ? status : outcome.status
      })
      if (outcome === undefined || 'error' in outcome) {
        return { deny: outcome?.error ?? 'The ticket was not reported.' }
      }
      // A ticket report shows an effort run, as a call to an effort skill does.
      // One without an `effort` field names it after the branch while it has none.
      await effortSeen($, null)
      await countTicketsIfDue($, e)

      return { result: ticketText(request, outcome, sessionProgress(reported)) }
    }

    if ('item' in input) {
      const request = input.item
      let outcome: ReturnType<typeof reportItem> | undefined
      const reported = await changeStatus($, status => {
        outcome = reportItem(status, request, now)

        return 'error' in outcome ? status : outcome.status
      })
      if (outcome === undefined || 'error' in outcome) {
        return { deny: outcome?.error ?? 'The item was not reported.' }
      }

      return { result: itemText(outcome.item, outcome.change, sessionProgress(reported)) }
    }

    let recorded: StatusItem | undefined
    const after = await changeStatus($, status => {
      const { status: next, item } = recordItem(status, input.draft, now)
      if (!pings(item)) {
        recorded = item

        return next
      }
      // The ping id is kept, so a resolve after a /clear withdraws this ping.
      const pinged = { ...item, pingId: pingId(status.sessionId, item.id) }
      recorded = pinged

      return { ...next, items: next.items.map(candidate => (candidate === item ? pinged : candidate)) }
    })

    if (recorded?.kind === 'decision' && recorded.urgency === 'blocked') {
      sendPing($, blockedPing(after.sessionId, recorded))
    } else if (recorded?.kind === 'blocker') {
      sendPing($, blockerPing(after.sessionId, recorded))
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
    // Doing now reaches `$.state` (and the pane) before the tool runs, and
    // `$.store` once with the call's result, after it.
    const doing = describeToolCall(e, await $.clock.now())
    await changeStatus($, status => ({ ...status, doingNow: doing }), { save: false })
    const sighting = effortSighting(e)
    if (sighting !== null) {
      await effortSeen($, sighting.name)
    }
    if (settles(e as { tool: string; skill?: unknown })) {
      await changeStatus($, status => ({ ...status, activity: 'settling' }))
    }
    const answer = await next(e)
    const change = toolResultChange(e, answer, await $.clock.now())
    await changeStatus($, change ?? (status => status))
    await countTicketsIfDue($, e)
    if (answer.deny === undefined && answer.isError !== true) {
      countPlaces($, e)
    }
    if (changesBranch(e)) {
      readPlace($)
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

  // A turn that starts puts the session in progress, a settled one too; a
  // prompt that types a settle skill's slash command settles the turn, as a
  // Skill call to it does; a prompt that is a cron job's is that job firing.
  on('turn.start', async ($, e, next) => {
    const activity = settlesByPrompt(e.text) ? 'settling' : 'working'
    const at = await $.clock.now()
    await changeStatus($, status => {
      const fired = cronFired(status, e.text, at)

      return fired.activity === activity ? fired : { ...fired, activity }
    })

    return next(e)
  })

  // The main loop's turn ends: the session waits for a reply, or is settled
  // when a settle skill ran in it. Only these turns count toward the
  // observer's interval.
  on('turn.complete', async ($, e, next) => {
    if (e.agentId === undefined) {
      await changeStatus($, status => ({ ...status, activity: afterTurn(status.activity, e.reason === 'aborted') }))
      startObserver($, 'turn')
    }

    return next(e)
  })

  // The person closing the pane by its mark or key: auto-open leaves it
  // closed for the rest of the session.
  on('ui.close', { id: 'session-status' }, async ($, e, next) => {
    if (e.origin.kind === 'person') {
      await update($, paneAtom, () => 'closed')
      await update($, viewAtom, () => 'main')
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
      surface: e.surface,
      status: withDefaults(await read($, statusAtom)),
      now: await $.clock.now(),
      columns: e.props.bodyColumns,
      view: await read($, viewAtom),
      show: view => update($, viewAtom, () => view),
      copy: (text, surface) => copyValue($, text, surface),
    })
  })
}

/** Whether an item pings the person: a blocked decision or a blocker. */
function pings(item: StatusItem): item is Decision | Blocker {
  return item.kind === 'blocker' || (item.kind === 'decision' && item.urgency === 'blocked')
}

/**
 * Records an effort run a tool call shows, and opens the pane for it. A run
 * that names no label takes the branch's name while the effort has none.
 */
async function effortSeen($: EngineInterface, name: string | null): Promise<void> {
  if (name !== null) {
    await changeStatus($, status => withEffort(status, { name, from: 'label' }))
  } else if (withDefaults(await read($, statusAtom))?.effort == null) {
    nameEffortFromBranch($)
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

/**
 * Runs `work` on a timer, so it never holds the hook that starts it; a
 * failure goes to the debug log, and the status stays as it was.
 */
function inBackground($: EngineInterface, what: string, work: () => Promise<void>): void {
  try {
    $.clock.after(0, () => {
      work().catch((error: unknown) => {
        $.ui.log(`session-status ${what}: ${String(error)}`, { to: 'debug' })
      })
    })
  } catch {
    // The status stays as it was until the next read.
  }
}

/**
 * Names the effort after the session's git branch, in the background. A
 * label or a report found meanwhile wins (see `withEffort`).
 */
function nameEffortFromBranch($: EngineInterface): void {
  inBackground($, 'branch read', async () => {
    const branch = await readBranch($)
    if (branch !== null) {
      await changeStatus($, status => withEffort(status, { name: branch, from: 'branch' }))
    }
  })
}

/** The session's git branch, or null when git gives none. */
async function readBranch($: EngineInterface): Promise<string | null> {
  const branch = await gitLine($, ['git', 'branch', '--show-current'])

  return branch === null ? null : branchEffortName(branch)
}

// Where the session works: its repository, branch and worktree, read from
// git in the background and cached per folder, so a tool call never waits.

/**
 * Each folder's repository top folder, as git answered it. Only an answer is
 * kept: a folder outside a repository, or not made yet, is asked again.
 */
const repoRoots = new Map<string, Promise<string | null>>()

/** Each repository's GitHub repository, from its `origin` remote; null when it has none there. */
const githubRepos = new Map<string, Promise<GitHubRepo | null>>()

/** The top folder of the repository that holds `dir`, asked of git once per folder. */
function repoRootOf($: EngineInterface, dir: string): Promise<string | null> {
  let root = repoRoots.get(dir)
  if (root === undefined) {
    root = gitLine($, ['git', '-C', dir, 'rev-parse', '--show-toplevel'])
    repoRoots.set(dir, root)
    void root.then(found => {
      if (found === null) {
        repoRoots.delete(dir)
      }
    })
  }

  return root
}

/** The GitHub repository of the repository at `root`, asked of git once per repository. */
function githubRepoOf($: EngineInterface, root: string): Promise<GitHubRepo | null> {
  let repo = githubRepos.get(root)
  if (repo === undefined) {
    repo = gitLine($, ['git', '-C', root, 'remote', 'get-url', 'origin']).then(url =>
      url === null ? null : githubRepo(url),
    )
    githubRepos.set(root, repo)
  }

  return repo
}

/**
 * Reads where the session works, in the background, into the status: in
 * `$.state` alone, so a session that does nothing saves nothing; the next
 * change saves it. Outside a repository the status keeps what it had.
 */
function readPlace($: EngineInterface): void {
  inBackground($, 'place read', async () => {
    const root = await repoRootOf($, await $.session.cwd())
    if (root === null) {
      return
    }
    const [branch, repo] = await Promise.all([readBranch($), githubRepoOf($, root)])
    await changeStatus($, status => withPlace(status, { root, branch, repo }), { save: false })
  })
}

/** The repository that holds `dir`, with its GitHub repository; null outside one. */
async function changedRepoAt($: EngineInterface, dir: string): Promise<ChangedRepo | null> {
  const root = await repoRootOf($, dir)

  return root === null ? null : { root, repo: await githubRepoOf($, root) }
}

/**
 * Counts what a finished tool call changed in its repository, in the
 * background: the file an edit or a write touched, and each step of a
 * shell command that changes something (see CHANGING_COMMANDS).
 */
function countPlaces($: EngineInterface, call: { tool: string }): void {
  const file = editedFile(call)
  const command = call.tool === 'Bash' ? (call as unknown as { command?: unknown }).command : undefined
  if (file === null && typeof command !== 'string') {
    return
  }
  inBackground($, 'place count', async () => {
    const at = await $.clock.now()
    const where = file === null ? null : await changedRepoAt($, folderOf(file))
    if (file !== null && where !== null) {
      await changeStatus($, status => withChange(status, where, { file }, at))
    }
    const targets = typeof command === 'string' ? commandTargets(command, await $.session.cwd()) : []
    for (const target of targets) {
      const repo: ChangedRepo | null =
        'slug' in target ? { root: null, repo: repoOf(target.slug) } : await changedRepoAt($, target.dir)
      if (repo !== null) {
        await changeStatus($, status => withChange(status, repo, { command: true }, at))
      }
    }
  })
}

/** What a git command prints, trimmed; null when it fails or prints nothing. */
async function gitLine($: EngineInterface, argv: string[]): Promise<string | null> {
  try {
    const { exitCode, stdout } = await $.process.run(argv, { timeoutMs: 5_000 })
    const line = stdout.trim()

    return exitCode === 0 && line !== '' ? line : null
  } catch {
    return null
  }
}

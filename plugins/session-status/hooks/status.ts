// The session status as data: the pure rules for changing it. The status
// store's reads and writes (`$.state`, `$.store`) and its atom live in
// register.tsx, because the engine follows `$` and the state library's
// sources only within the hooks module's own file.

import type { Decision, Effort, SessionStatus, StatusItem, TicketReport } from '../types'

/** An item before it is recorded: `recordItem` adds its id and its time. */
export type ItemDraft = StatusItem extends infer I
  ? I extends StatusItem
    ? Omit<I, 'id' | 'recordedAt'>
    : never
  : never

/** Each kind's id prefix: decisions count `D1`, `D2`, ...; surprises `S1`, ... */
const ID_PREFIX = { decision: 'D', surprise: 'S' } as const

/**
 * The status with one more item, and that item: the draft given the next id
 * of its kind and the time it was recorded. Ids only grow within a session,
 * so pings and resolves can name an item by its id.
 */
export function recordItem(
  status: SessionStatus,
  draft: ItemDraft,
  now: number,
): { status: SessionStatus; item: StatusItem } {
  const prefix = ID_PREFIX[draft.kind]
  const highest = status.items
    .filter(item => item.kind === draft.kind)
    .map(item => Number(item.id.slice(prefix.length)))
    .reduce((max, n) => (Number.isInteger(n) && n > max ? n : max), 0)
  const item = { ...draft, id: `${prefix}${highest + 1}`, recordedAt: now } as StatusItem

  return { status: { ...status, items: [...status.items, item] }, item }
}

/** Whether an item is open: not resolved (a decision) or dismissed (a surprise). */
export function isOpen(item: StatusItem): boolean {
  return item.resolvedAt === undefined
}

/** The open review-later decisions, oldest first: what the end-of-work list holds. */
export function openReviewLater(status: SessionStatus): Decision[] {
  return status.items.filter(
    (item): item is Decision => item.kind === 'decision' && item.urgency === 'review_later' && isOpen(item),
  )
}

/**
 * The decisions the last end-of-work list named that are still open, oldest
 * first; none before the agent posts a list. A decision recorded after the
 * list was posted is not on it.
 */
export function onEndList(status: SessionStatus): Decision[] {
  const postedAt = status.endListPostedAt

  return postedAt === null ? [] : openReviewLater(status).filter(item => item.recordedAt <= postedAt)
}

/**
 * The status with one open item closed at `now`: a decision resolved or a
 * surprise dismissed. Says what is wrong when no open item of that kind has
 * the id, for the model to fix and call again.
 */
export function closeItem(
  status: SessionStatus,
  target: { kind: StatusItem['kind']; id: string },
  now: number,
): { status: SessionStatus; item: StatusItem } | { error: string } {
  const item = status.items.find(candidate => candidate.id === target.id)
  const noun = target.kind === 'decision' ? 'decision' : 'surprise'
  const closed = target.kind === 'decision' ? 'resolved' : 'dismissed'
  if (item === undefined || item.kind !== target.kind) {
    const hint =
      item === undefined
        ? 'Use an id from the status (D1, S1, ...).'
        : target.kind === 'decision'
          ? `${target.id} is a surprise: use \`dismiss\`.`
          : `${target.id} is a decision: use \`resolve\`.`

    return { error: `No ${noun} ${target.id}. ${hint}` }
  }
  if (!isOpen(item)) {
    return { error: `${noun === 'decision' ? 'Decision' : 'Surprise'} ${item.id} is already ${closed}.` }
  }
  const done = { ...item, resolvedAt: now }

  return {
    status: { ...status, items: status.items.map(candidate => (candidate === item ? done : candidate)) },
    item: done,
  }
}

/** A status with nothing in it yet, for one session. */
export function emptyStatus(sessionId: string): SessionStatus {
  return {
    version: 1,
    sessionId,
    doingNow: null,
    items: [],
    tasks: [],
    progress: null,
    links: [],
    subagents: { running: [], finished: [] },
    endListPostedAt: null,
    observer: { checks: 0, seen: [] },
    effort: null,
    tickets: null,
    ticketReports: [],
    place: null,
    places: [],
    activity: null,
    updatedAt: null,
  }
}

/**
 * A status held from an older shape, with the fields it lacks taken from an
 * empty status; null stays null.
 */
export function withDefaults(status: SessionStatus | null): SessionStatus | null {
  return status === null ? null : { ...emptyStatus(status.sessionId), ...status }
}

/**
 * The status a session starts with after `/clear`: empty for the new
 * session, but with the previous session's open decisions, ids unchanged, so
 * the person can still answer them by the same id, and its effort and
 * reported tickets: the new session still runs in the same effort. The
 * Session section counts the carried tickets while the effort stays; a
 * report for another effort starts it from zero (see `effortReports`).
 */
export function carryOver(previous: SessionStatus, sessionId: string): SessionStatus {
  const open = previous.items.filter(item => item.kind === 'decision' && isOpen(item))

  return { ...emptyStatus(sessionId), items: open, effort: previous.effort, ticketReports: previous.ticketReports }
}

/**
 * The `$.store` key that holds what a `/clear` carries over, written when the
 * old session ends. It does not rely on `$.state`, which a `/clear` can empty.
 */
export const CARRY_KEY = 'clear-carry'

/**
 * How long a carry stays fresh. The new session's SessionStart follows the
 * old one's end at once; an older carry is one whose `/clear` never got that
 * far (the process stopped), and no later session takes it.
 */
export const CARRY_WINDOW_MS = 60_000

/** What a `/clear` carries over: the ended session's open decisions, effort and reported tickets. */
export type ClearCarry = {
  kind: 'clear-carry'
  /** The session that ended. */
  from: string
  /** When it ended, in `$.clock.now()` milliseconds. */
  at: number
  items: Decision[]
  effort: Effort | null
  ticketReports: TicketReport[]
}

/** What a session that ends by `/clear` carries over; null when it has nothing to carry. */
export function clearCarry(status: SessionStatus, now: number): ClearCarry | null {
  const { items, effort, ticketReports } = carryOver(status, status.sessionId)
  const decisions = items.filter((item): item is Decision => item.kind === 'decision')
  if (decisions.length === 0 && effort === null && ticketReports.length === 0) {
    return null
  }

  return { kind: 'clear-carry', from: status.sessionId, at: now, items: decisions, effort, ticketReports }
}

/**
 * A value read from `$.store` as a carry `sessionId` may take at `now`, or
 * null: not a carry, written by `sessionId` itself, or no longer fresh.
 */
export function readCarry(value: unknown, sessionId: string, now: number): ClearCarry | null {
  if (typeof value !== 'object' || value === null) {
    return null
  }
  const carry = value as Partial<ClearCarry>
  const isCarry =
    carry.kind === 'clear-carry' &&
    typeof carry.from === 'string' &&
    typeof carry.at === 'number' &&
    Array.isArray(carry.items)
  if (!isCarry || carry.from === sessionId || Math.abs(now - (carry.at ?? 0)) > CARRY_WINDOW_MS) {
    return null
  }

  return {
    ...(carry as ClearCarry),
    effort: carry.effort ?? null,
    ticketReports: Array.isArray(carry.ticketReports) ? carry.ticketReports : [],
  }
}

/**
 * The status with a carry's decisions added before its own items, each id
 * once, and the carry's effort and reported tickets while the status has
 * none. A status that the carried state already reached (`$.state` kept
 * across the `/clear`) stays as it is.
 */
export function withCarry(status: SessionStatus, carry: ClearCarry): SessionStatus {
  const ids = new Set(status.items.map(item => item.id))
  const carried = carry.items.filter(item => !ids.has(item.id))
  const effort = status.effort ?? carry.effort
  const own = status.ticketReports
  const ticketReports = own.length > 0 ? own : carry.ticketReports
  if (carried.length === 0 && effort === status.effort && ticketReports === own) {
    return status
  }

  return { ...status, items: [...carried, ...status.items], effort, ticketReports }
}

/**
 * A value read from `$.store` as the saved status of `sessionId`, or null
 * when it is not one: missing, another session's, or not a status at all.
 */
export function savedStatus(value: unknown, sessionId: string): SessionStatus | null {
  if (typeof value !== 'object' || value === null) {
    return null
  }
  const status = value as Partial<SessionStatus>
  if (status.version !== 1 || status.sessionId !== sessionId || !Array.isArray(status.items)) {
    return null
  }

  return withDefaults(status as SessionStatus)
}

/**
 * The status `sessionId` holds, given the one held now and the one saved for
 * it: the held one when it is this session's; else the saved one (a resume);
 * else, on a known `/clear` alone, the held one's open decisions carried over
 * at `now`; else none. A resume or fork with nothing saved starts empty: it
 * never takes the decisions of the session the process held before.
 */
export function statusForSession(
  held: SessionStatus | null,
  sessionId: string,
  saved: SessionStatus | null,
  now: number,
  isClear = false,
): SessionStatus | null {
  if (held?.sessionId === sessionId) {
    return held
  }
  if (saved !== null) {
    return saved
  }

  return held === null || !isClear ? null : { ...carryOver(held, sessionId), updatedAt: now }
}

/**
 * How many of each list a status keeps within a session: finished subagent
 * ids, links, reported tickets, the files of each place, and closed items of
 * each kind. The oldest drop first (reported tickets and files by their last
 * change); an open item never drops.
 */
export const CAP = 200

/** How many places a status keeps; the one changed longest ago drops first. */
export const PLACES_KEPT = 50

/**
 * The status within its bounds (see CAP). The newest closed item of each
 * kind always stays, so the next id of that kind never repeats an old one.
 */
export function withinBounds(status: SessionStatus): SessionStatus {
  const closedCount = { decision: 0, surprise: 0 }
  for (const item of status.items) {
    if (!isOpen(item)) {
      closedCount[item.kind] += 1
    }
  }
  const isOver =
    status.subagents.finished.length > CAP ||
    status.links.length > CAP ||
    status.ticketReports.length > CAP ||
    status.places.length > PLACES_KEPT ||
    status.places.some(place => place.files.length > CAP) ||
    closedCount.decision > CAP ||
    closedCount.surprise > CAP
  if (!isOver) {
    return status
  }
  const toDrop = { decision: closedCount.decision - CAP, surprise: closedCount.surprise - CAP }
  const items = status.items.filter(item => {
    if (isOpen(item) || toDrop[item.kind] <= 0) {
      return true
    }
    toDrop[item.kind] -= 1

    return false
  })

  return {
    ...status,
    items,
    links: status.links.slice(-CAP),
    ticketReports: newestByChange(status.ticketReports, CAP),
    places: newestByChange(status.places, PLACES_KEPT).map(place => ({ ...place, files: place.files.slice(-CAP) })),
    subagents: { ...status.subagents, finished: status.subagents.finished.slice(-CAP) },
  }
}

/**
 * The `limit` entries that changed last, in their order. A ticket that
 * landed long ago drops before one started since, so past the cap the
 * Session count holds the run's recent tickets.
 */
function newestByChange<T extends { at: number }>(reports: readonly T[], limit: number): T[] {
  if (reports.length <= limit) {
    return [...reports]
  }
  const kept = new Set(
    reports
      .map((report, index) => ({ at: report.at, index }))
      .sort((a, b) => b.at - a.at || b.index - a.index)
      .slice(0, limit)
      .map(entry => entry.index),
  )

  return reports.filter((_report, index) => kept.has(index))
}

/** How many sessions' statuses `$.store` keeps; older ones are dropped. */
export const KEPT_SESSIONS = 30

/**
 * The store keys to delete so at most KEPT_SESSIONS sessions stay: the
 * oldest by their last update, a value that is not a status counting as
 * oldest. The current session always stays.
 */
export function keysToPrune(saved: { key: string; value: unknown }[], current: string): string[] {
  if (saved.length <= KEPT_SESSIONS) {
    return []
  }
  const updatedAt = (value: unknown) => {
    const at = (value as { updatedAt?: unknown } | null)?.updatedAt

    return typeof at === 'number' ? at : 0
  }
  const others = saved
    .filter(entry => entry.key !== current)
    .sort((a, b) => updatedAt(b.value) - updatedAt(a.value))
  const kept = saved.length - others.length

  return others.slice(Math.max(KEPT_SESSIONS - kept, 0)).map(entry => entry.key)
}

/**
 * The status after one change: `change` applied to the current status (an
 * empty one before the first change), kept within its bounds and stamped
 * with the session and the time. A current status of another session is
 * never stamped with this one: the change applies to an empty status. (A
 * `/clear`'s carry reaches the new session before any change; see
 * register.tsx's holdSession.)
 */
export function applyChange(
  current: SessionStatus | null,
  change: (status: SessionStatus) => SessionStatus,
  stamp: { sessionId: string; now: number },
): SessionStatus {
  const held = withDefaults(current)
  const base = held !== null && held.sessionId === stamp.sessionId ? held : emptyStatus(stamp.sessionId)

  return { ...withinBounds(change(base)), sessionId: stamp.sessionId, updatedAt: stamp.now }
}

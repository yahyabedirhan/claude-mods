// The session status as data: the pure rules for changing it. The status
// store's reads and writes (`$.state`, `$.store`) and its atom live in
// register.tsx, because the engine follows `$` and the state library's
// sources only within the hooks module's own file.

import type { Decision, SessionStatus, StatusItem } from '../types'

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
 * the person can still answer them by the same id, and its effort: the new
 * session still runs in the same effort.
 */
export function carryOver(previous: SessionStatus, sessionId: string): SessionStatus {
  const open = previous.items.filter(item => item.kind === 'decision' && isOpen(item))

  return { ...emptyStatus(sessionId), items: open, effort: withDefaults(previous)?.effort ?? null }
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
 * else the held one's open decisions carried over at `now` (a `/clear`);
 * else none.
 */
export function statusForSession(
  held: SessionStatus | null,
  sessionId: string,
  saved: SessionStatus | null,
  now: number,
): SessionStatus | null {
  if (held?.sessionId === sessionId) {
    return held
  }
  if (saved !== null) {
    return saved
  }

  return held === null ? null : { ...carryOver(held, sessionId), updatedAt: now }
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
 * empty one before the first change), stamped with the session and the time.
 * A current status of another session is never stamped with this one: the
 * change applies to its open decisions carried over, as after a `/clear`.
 */
export function applyChange(
  current: SessionStatus | null,
  change: (status: SessionStatus) => SessionStatus,
  stamp: { sessionId: string; now: number },
): SessionStatus {
  const held = withDefaults(current)
  const base =
    held === null
      ? emptyStatus(stamp.sessionId)
      : held.sessionId === stamp.sessionId
        ? held
        : carryOver(held, stamp.sessionId)

  return { ...change(base), sessionId: stamp.sessionId, updatedAt: stamp.now }
}

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
 * The status after one change: `change` applied to the current status (an
 * empty one before the first change), stamped with the session and the time.
 */
export function applyChange(
  current: SessionStatus | null,
  change: (status: SessionStatus) => SessionStatus,
  stamp: { sessionId: string; now: number },
): SessionStatus {
  return {
    ...change(withDefaults(current) ?? emptyStatus(stamp.sessionId)),
    sessionId: stamp.sessionId,
    updatedAt: stamp.now,
  }
}

// The session status as data: the pure rules for changing it. The status
// store's reads and writes (`$.state`, `$.store`) and its atom live in
// register.tsx, because the engine follows `$` and the state library's
// sources only within the hooks module's own file.

import type { SessionStatus } from '../types'

/** A status with nothing in it yet, for one session. */
export function emptyStatus(sessionId: string): SessionStatus {
  return { version: 1, sessionId, doingNow: null, updatedAt: null }
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
    ...change(current ?? emptyStatus(stamp.sessionId)),
    sessionId: stamp.sessionId,
    updatedAt: stamp.now,
  }
}

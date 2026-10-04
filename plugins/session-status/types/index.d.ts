// The session-status mod's state contract. The status is plain JSON with
// the session id, so a later cross-session export can read it from
// `$.store` as written.

/** What the session does now: taken from the last tool call. */
export type DoingNow = {
  /** The tool's name as the call named it (`Bash`, `Edit`, `mcp__x__y`). */
  tool: string
  /** One short line about the call: its description, file or command. */
  text: string
  /** The subagent's id when a subagent made the call; absent on the main loop. */
  agentId?: string
  /** When the call started, in `$.clock.now()` milliseconds. */
  at: number
}

/** One session's status, as held in `$.state` and saved to `$.store`. */
export type SessionStatus = {
  /** The shape's version, raised when a saved status no longer reads as this one. */
  version: 1
  /** The session this status belongs to: also its key in `$.store`. */
  sessionId: string
  doingNow: DoingNow | null
  /** When the status last changed, in `$.clock.now()` milliseconds. */
  updatedAt: number | null
}

declare module 'claude-code' {
  interface PluginState {
    'session-status': {
      /** The session's status; null until the first change. */
      status: SessionStatus | null
      /** The age timer's last reading: the pane reads it only to draw again. */
      tick: number
    }
  }
}

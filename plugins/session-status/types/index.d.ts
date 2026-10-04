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

/**
 * How a decision weighs on the work: `blocked` stops the agent until the
 * person answers; `review_later` goes on with its default meanwhile.
 */
export type DecisionUrgency = 'blocked' | 'review_later'

/** A decision the agent recorded with the status tool. */
export type Decision = {
  kind: 'decision'
  /** Stable for the session: `D1`, `D2`, ... Pings and resolves name it. */
  id: string
  urgency: DecisionUrgency
  question: string
  /** Two to four answers the person can give. */
  options: string[]
  /** The recommended answer: what the agent does unless told otherwise. */
  default: string
  /** What the person has to do or say to unblock the work. */
  unblocks: string
  /** When the agent recorded it, in `$.clock.now()` milliseconds. */
  recordedAt: number
  /** The subagent's id when a subagent recorded it; absent on the main loop. */
  agentId?: string
}

/** Something unexpected the agent recorded with the status tool. */
export type Surprise = {
  kind: 'surprise'
  /** Stable for the session: `S1`, `S2`, ... */
  id: string
  /** What occurred. */
  occurred: string
  /** What it changed in the work or the plan. */
  changed: string
  /** When the agent recorded it, in `$.clock.now()` milliseconds. */
  recordedAt: number
  /** The subagent's id when a subagent recorded it; absent on the main loop. */
  agentId?: string
}

/** One item the agent recorded: a decision or a surprise. */
export type StatusItem = Decision | Surprise

/** One session's status, as held in `$.state` and saved to `$.store`. */
export type SessionStatus = {
  /** The shape's version, raised when a saved status no longer reads as this one. */
  version: 1
  /** The session this status belongs to: also its key in `$.store`. */
  sessionId: string
  doingNow: DoingNow | null
  /** Decisions and surprises in the order they were recorded, oldest first. */
  items: StatusItem[]
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

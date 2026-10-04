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
  /** When the agent marked it resolved; absent while the decision is open. */
  resolvedAt?: number
  /**
   * The shipyard id of the ping sent for it, set when it is recorded blocked.
   * A `/clear` carries the decision to a new session id; the ping keeps this one.
   */
  pingId?: string
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
  /** `observer` when the observer agent found it; absent when the agent recorded it. */
  source?: 'observer'
  /** When the user dismissed it; absent while the surprise is open. */
  resolvedAt?: number
}

/** One item the agent recorded: a decision or a surprise. */
export type StatusItem = Decision | Surprise
/** One task of the session's task list, from the task tools and Task events. */
export type Task = {
  /**
   * The task's id: the task tools' own id, or `todo:<loop>:<index>` for an
   * item of a TodoWrite list (`<loop>` is the subagent's id, or `main`).
   */
  id: string
  /** The task's title. */
  subject: string
  /** What the task does while it runs ("Running tests"), when given. */
  activeForm?: string
  status: 'pending' | 'in_progress' | 'completed'
  /** When the task last changed, in `$.clock.now()` milliseconds. */
  at: number
}

/**
 * How far the task list is: tasks done, the total and the task that runs
 * now. During an effort the Session section counts the reported tickets
 * instead, once the orchestrator reports one.
 */
export type Progress = {
  done: number
  total: number
  /** The name of the task that runs now; null when none runs. */
  current: string | null
}

/** A pull request or an issue the session, or one of its subagents, created. */
export type CreatedLink = {
  kind: 'pr' | 'issue'
  /** The repository as `<owner>/<repo>`. */
  repo: string
  number: number
  /** The page on GitHub, as `gh` printed it. */
  url: string
  /** The subagent's id when a subagent created it; absent on the main loop. */
  agentId?: string
  /** When it was found, in `$.clock.now()` milliseconds. */
  at: number
}

/** The session's subagents, by id: those that run now and those that finished. */
export type Subagents = {
  running: string[]
  finished: string[]
}

/**
 * The observer agent's record for the session: how many checks it made, and
 * a key for every finding it showed, so it never shows one twice.
 */
export type ObserverRecord = {
  /** Checks made this session; the observer stops at its cap. */
  checks: number
  /** The normalized key of every finding shown, oldest first. */
  seen: string[]
}

/** The effort the session runs, found from its tool calls. */
export type Effort = {
  /** The effort's name, as its `effort:<name>` label writes it. */
  name: string
  /**
   * Where the name came from: a ticket report's `effort`, an `effort:<name>`
   * label, or the session's git branch when an effort skill ran before any
   * label showed. A report's name always wins; a label's wins over a branch's.
   */
  from?: 'report' | 'label' | 'branch'
}

/**
 * Where the status pane stands for the session: never opened yet, open
 * (by the person or by an auto-open trigger), or closed by the person.
 */
export type PaneState = 'unopened' | 'open' | 'closed'

/** The effort's tickets, as `gh issue list` last counted them. */
export type TicketCount = {
  /** The effort counted: a count for another effort is not shown. */
  effort: string
  /** Tickets closed. */
  done: number
  /** All tickets, open and closed; the spec issue is not one. */
  total: number
  /** When it was counted, in `$.clock.now()` milliseconds. */
  at: number
}

/**
 * A ticket the orchestrator reported with the status tool: `started` while a
 * delegate builds it, `landed` once its commit is on the effort branch,
 * whether or not its issue is closed.
 */
export type TicketReport = {
  /** The ticket's issue number; absent for a ticket that has none (a local tracker). */
  number?: number
  /** The ticket's title. */
  title: string
  state: 'started' | 'landed'
  /** When it reached this state, in `$.clock.now()` milliseconds. */
  at: number
  /**
   * The effort the ticket belongs to; absent on a report made before any
   * effort was named, which belongs to the effort that runs now.
   */
  effort?: string
  /**
   * When a started ticket first landed: it is rework, and a `stopped` takes
   * it back to landed at this time. Absent on a ticket that never landed.
   */
  landedAt?: number
}

/** One session's status, as held in `$.state` and saved to `$.store`. */
export type SessionStatus = {
  /** The shape's version, raised when a saved status no longer reads as this one. */
  version: 1
  /** The session this status belongs to: also its key in `$.store`. */
  sessionId: string
  doingNow: DoingNow | null
  /** Decisions and surprises in the order they were recorded, oldest first. */
  items: StatusItem[]
  /** The task list, in the order the tasks were created. */
  tasks: Task[]
  /** How far the task list is; null before the first task. See `sessionProgress`. */
  progress: Progress | null
  /** The pull requests and issues created, oldest first. */
  links: CreatedLink[]
  subagents: Subagents
  /**
   * When the agent last posted the end-of-work list of open review-later
   * decisions; null before it posts one.
   */
  endListPostedAt: number | null
  /** The observer agent's checks and the findings it showed. */
  observer: ObserverRecord
  /** The effort the session runs; null when it runs none. */
  effort: Effort | null
  /** The effort's tickets last counted; null before the first count. The Effort section shows it. */
  tickets: TicketCount | null
  /**
   * The tickets the orchestrator reported, in the order it first named them.
   * The Session section counts the current effort's: landed of all reported.
   */
  ticketReports: TicketReport[]
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
      /** Main-loop turns that ended with the pane open since the observer's last check. */
      observerTurns: number
      /** Where the pane stands: auto-open opens only an `unopened` pane. */
      pane: PaneState
    }
  }
}

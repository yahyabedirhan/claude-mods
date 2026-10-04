// The subagent counters as data. An Agent tool call's spawn starts one; a
// SubagentStop of a running one finishes it. Each keeps ids, so an event
// that arrives twice counts once.

import type { SessionStatus } from '../types'

/** A subagent an Agent tool call started: it runs now. */
export function subagentStarted(status: SessionStatus, agentId: string): SessionStatus {
  const { running, finished } = status.subagents
  if (running.includes(agentId) || finished.includes(agentId)) {
    return status
  }

  return { ...status, subagents: { running: [...running, agentId], finished } }
}

/**
 * Whether the counters hold `agentId` as running: a SubagentStop of any
 * other agent is Claude Code's own work (compaction and the like) or a stop
 * already counted, and moves nothing.
 */
export function isRunningSubagent(status: SessionStatus, agentId: string): boolean {
  return status.subagents.running.includes(agentId)
}

/** A running subagent stopped: it no longer runs and has finished. */
export function subagentStopped(status: SessionStatus, agentId: string): SessionStatus {
  const { running, finished } = status.subagents
  if (!running.includes(agentId)) {
    return status
  }

  return {
    ...status,
    subagents: { running: running.filter(id => id !== agentId), finished: [...finished, agentId] },
  }
}

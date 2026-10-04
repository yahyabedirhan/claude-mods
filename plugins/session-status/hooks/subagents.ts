// The subagent counters as data: SubagentStart and SubagentStop move them.
// Each keeps ids, so an event that arrives twice counts once.

import type { SessionStatus } from '../types'

/** A subagent started: it runs now. */
export function subagentStarted(status: SessionStatus, agentId: string): SessionStatus {
  const { running, finished } = status.subagents
  if (running.includes(agentId) || finished.includes(agentId)) {
    return status
  }

  return { ...status, subagents: { running: [...running, agentId], finished } }
}

/**
 * A subagent stopped: it no longer runs and has finished. A stop whose start
 * came before the mod loaded counts as finished all the same.
 */
export function subagentStopped(status: SessionStatus, agentId: string): SessionStatus {
  const { running, finished } = status.subagents
  if (finished.includes(agentId)) {
    return status
  }

  return {
    ...status,
    subagents: { running: running.filter(id => id !== agentId), finished: [...finished, agentId] },
  }
}

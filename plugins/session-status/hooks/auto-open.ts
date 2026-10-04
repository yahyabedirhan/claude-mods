// When the pane opens by itself: the pure rule. register.tsx opens the pane,
// once per session, when a status change makes this true.

import type { SessionStatus } from '../types'

/**
 * Whether the status has met an auto-open trigger: a subagent started, a
 * task list was made, an effort run was found, a ticket was reported, or a
 * decision or a surprise was recorded. The turn count is no trigger: a short session stays closed.
 */
export function meetsAutoOpenTrigger(status: SessionStatus): boolean {
  const { subagents } = status

  return (
    subagents.running.length + subagents.finished.length > 0 ||
    status.tasks.length > 0 ||
    status.effort !== null ||
    status.ticketReports.length > 0 ||
    status.items.length > 0
  )
}

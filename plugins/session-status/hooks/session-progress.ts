// Session progress as data: how far this session's own work is. During an
// effort it counts the tickets the orchestrator reported (landed of all
// reported); otherwise the task list. The tracker's count is the Effort
// section's (see effort-progress.ts): the two never mix.

import type { SessionStatus, TicketReport } from '../types'
import { effortReports, reportsIn } from './ticket-reports'

/** The progress the Session section shows, and where it comes from. */
export type SessionProgress =
  | {
      source: 'tickets'
      /** Tickets reported landed. */
      done: number
      /** Tickets reported in this effort. */
      total: number
      /** The tickets the orchestrator builds now, oldest first. */
      building: TicketReport[]
    }
  | { source: 'tasks'; done: number; total: number }

/**
 * The session's progress: the current effort's reported tickets once the
 * orchestrator reported one; else the task list; null when neither has any.
 */
export function sessionProgress(status: SessionStatus | null): SessionProgress | null {
  if (status === null) {
    return null
  }
  const reports = effortReports(status)
  if (reports.length > 0) {
    return {
      source: 'tickets',
      done: reportsIn(status, 'landed').length,
      total: reports.length,
      building: reportsIn(status, 'started'),
    }
  }
  const tasks = status.progress

  return tasks === null ? null : { source: 'tasks', done: tasks.done, total: tasks.total }
}

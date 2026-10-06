// Session progress as data: how close the session is to settling. It counts
// the session's items (see session-items.ts) and, during an effort, the
// effort's tickets: done of all. The total grows as items are added. A
// ticket is done once the orchestrator reports it landed or the tracker
// counts it closed; the Effort section shows the tracker's closed count
// alone (see effort-progress.ts), and the task list keeps a line of its own
// (see `taskProgress`).

import type { Progress, SessionItem, SessionStatus, TicketCount, TicketReport } from '../types'
import { countedItems, openItems } from './session-items'
import { effortReports, reportsIn } from './ticket-reports'

/** The progress the Session section shows. */
export type SessionProgress = {
  /** Items done, and tickets landed or closed. */
  done: number
  /** Items not dropped, and the effort's tickets. */
  total: number
  /** The items still to do, oldest first. */
  open: SessionItem[]
  /** The tickets the orchestrator builds now, oldest first. */
  building: TicketReport[]
}

/**
 * A ticket whose title starts with `QA:` is checked by the person, who
 * closes it by hand: the orchestrator never lands it, so the session does
 * not count it.
 */
const QA_TITLE = /^\s*qa:/i

/** Whether a ticket title names a QA ticket. */
export function isQaTitle(title: string): boolean {
  return QA_TITLE.test(title)
}

/**
 * The session's progress: its items, plus the current effort's tickets once
 * the tracker counted them or the orchestrator reported one; null when the
 * session has neither. The tickets' total is every ticket the tracker counted
 * without the `QA:` ones, or the tickets reported when they are more; done
 * is the tickets reported landed, or the tickets the tracker counted closed
 * without the `QA:` ones when they are more.
 */
export function sessionProgress(status: SessionStatus | null): SessionProgress | null {
  if (status === null) {
    return null
  }
  const items = countedItems(status)
  const tickets = ticketProgress(status)
  const total = items.length + tickets.total
  if (total === 0) {
    return null
  }

  return {
    done: items.filter(item => item.state === 'done').length + tickets.done,
    total,
    open: openItems(status),
    building: reportsIn(status, 'started').filter(report => !isQaTitle(report.title)),
  }
}

/** The task list's progress, shown on a line of its own; null before the first task. */
export function taskProgress(status: SessionStatus | null): Progress | null {
  return status?.progress ?? null
}

/**
 * The current effort's tickets landed or closed, of all its tickets, `QA:`
 * ones left out. Done is the larger of the tickets reported landed and the
 * tickets the tracker counted closed: a closed ticket is done even when no
 * orchestrator reported it.
 */
function ticketProgress(status: SessionStatus): { done: number; total: number } {
  const reports = effortReports(status).filter(report => !isQaTitle(report.title))
  const count = status.tickets
  const isCounted = count !== null && status.effort !== null && count.effort === status.effort.name
  const tracked = isCounted ? (count.builds ?? count.total) : 0
  const landed = reports.filter(report => report.state === 'landed').length

  return {
    done: Math.max(landed, isCounted ? closedBuilds(count) : 0),
    total: Math.max(reports.length, tracked),
  }
}

/**
 * The tickets a count holds closed, `QA:` ones left out. A count without its
 * list (from before 0.5.0) does not say which tickets are QA: its closed QA
 * tickets are taken to be all of them.
 */
function closedBuilds(count: TicketCount): number {
  if (count.list !== undefined) {
    return count.list.filter(ticket => ticket.isClosed && !isQaTitle(ticket.title)).length
  }

  return Math.max(0, count.done - (count.total - (count.builds ?? count.total)))
}

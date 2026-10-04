// Effort progress as data: during an effort, progress counts the effort's
// tickets instead of the task list. The total comes from the effort's
// `effort:<name>` issues; a ticket is done when its issue is closed or the
// orchestrator reported it landed (see ticket-reports.ts), and the tickets
// it reported started say where the run is. This module builds the `gh`
// command, reads its output and says when to read again; register.tsx runs
// the command and keeps the count in the status.

import type { SessionStatus, TicketCount, TicketReport } from '../types'
import { reportsIn } from './ticket-reports'

/** The least time between two ticket reads that no ticket change asked for. */
export const TICKET_REFRESH_MS = 2 * 60_000

/**
 * The least time between two reads while the status holds no count for the
 * effort: a read failed, or a `/clear` started the status over.
 */
export const TICKET_RETRY_MS = 30_000

/** How long one `gh issue list` may run. */
export const TICKET_TIMEOUT_MS = 15_000

/** A Bash command that likely changed a ticket: closed, reopened, edited, or a PR merged. */
const TICKET_CHANGE = /\bgh\s+(?:issue\s+(?:close|reopen|edit)|pr\s+merge)\b/

/**
 * An issue whose title starts with `Spec:` is the effort's spec, not one of
 * its tickets: it stays open while the tickets close, so it is not counted.
 */
const SPEC_TITLE = /^\s*spec:/i

/** The `gh` command that lists every issue of the effort, open and closed. */
export function ticketListArgv(effort: string): string[] {
  return [
    'gh',
    'issue',
    'list',
    '--label',
    `effort:${effort}`,
    '--state',
    'all',
    '--limit',
    '200',
    '--json',
    'number,title,state,labels',
  ]
}

/**
 * The tickets closed and the total from `gh issue list --json` output, with
 * the closed and the open tickets' numbers; null when the output is not such
 * a list, so the last good count holds.
 */
export function parseTicketList(stdout: string): Omit<TicketCount, 'effort' | 'at'> | null {
  let issues: unknown
  try {
    issues = JSON.parse(stdout)
  } catch {
    return null
  }
  if (!Array.isArray(issues)) {
    return null
  }
  const tickets = issues.filter(
    (issue): issue is { number?: unknown; title?: unknown; state?: unknown } =>
      typeof issue === 'object' && issue !== null && !(typeof issue.title === 'string' && SPEC_TITLE.test(issue.title)),
  )
  const isClosed = (issue: { state?: unknown }) =>
    typeof issue.state === 'string' && issue.state.toUpperCase() === 'CLOSED'
  const numbers = (list: { number?: unknown }[]) =>
    list.map(issue => issue.number).filter((n): n is number => typeof n === 'number')

  return {
    done: tickets.filter(isClosed).length,
    total: tickets.length,
    closed: numbers(tickets.filter(isClosed)),
    open: numbers(tickets.filter(issue => !isClosed(issue))),
  }
}

/** Whether a tool call likely changed the effort's tickets. */
export function changesTickets(call: { tool: string }): boolean {
  const command = (call as unknown as Record<string, unknown>).command

  return call.tool === 'Bash' && typeof command === 'string' && TICKET_CHANGE.test(command)
}

/**
 * Whether to read the effort's tickets after a tool call: never outside an
 * effort; else on the effort's first read, after a call that likely changed
 * a ticket, or when the last read is TICKET_REFRESH_MS old (TICKET_RETRY_MS
 * while the status holds no count for the effort).
 */
export function isTicketReadDue(
  status: SessionStatus | null,
  lastRead: { effort: string; at: number } | null,
  call: { tool: string },
  now: number,
): boolean {
  const effort = status?.effort?.name
  if (effort === undefined) {
    return false
  }
  if (lastRead?.effort !== effort || changesTickets(call)) {
    return true
  }
  const isCounted = status?.tickets?.effort === effort

  return now - lastRead.at >= (isCounted ? TICKET_REFRESH_MS : TICKET_RETRY_MS)
}

/** The progress the status shows, and where it comes from. */
export type ShownProgress = {
  source: 'tickets' | 'tasks'
  done: number
  total: number
  /** The task that runs now; null when none runs. */
  current: string | null
  /** The tickets the orchestrator builds now, oldest first; none from the task list. */
  building: TicketReport[]
}

/**
 * The progress to show: the tickets while the status runs an effort and
 * holds a count for it, or once the orchestrator reported a ticket, with the
 * running task as the current one; else the task list's progress; null when
 * neither has any.
 */
export function shownProgress(status: SessionStatus | null): ShownProgress | null {
  if (status === null) {
    return null
  }
  const counted = status.tickets ?? null
  const count = status.effort !== null && counted !== null && counted.effort === status.effort.name ? counted : null
  if (count !== null || (status.ticketReports ?? []).length > 0) {
    return {
      source: 'tickets',
      ...ticketProgress(count, status.ticketReports ?? []),
      current: status.progress?.current ?? null,
      building: reportsIn(status, 'started'),
    }
  }

  return status.progress === null ? null : { source: 'tasks', ...status.progress, building: [] }
}

/**
 * The tickets done and the total, from the tracker's count and the
 * orchestrator's reports together: a ticket is done when its issue is closed
 * or it was reported landed, and each ticket counts once, by its number. With
 * no count (no `gh`, a local tracker) the reports alone give both. A reported
 * ticket the count does not hold (it has no number, or not the effort's
 * label) adds to the total.
 */
export function ticketProgress(
  count: TicketCount | null,
  reports: readonly TicketReport[],
): { done: number; total: number } {
  const landed = reports.filter(report => report.state === 'landed')
  const numbersOf = (list: readonly TicketReport[]) =>
    list.map(report => report.number).filter((n): n is number => n !== undefined)
  const unnumbered = (list: readonly TicketReport[]) => list.length - numbersOf(list).length
  if (count === null) {
    return { done: landed.length, total: reports.length }
  }
  if (count.closed === undefined || count.open === undefined) {
    // A count saved before it kept numbers: the larger of the two is safe.
    return { done: Math.max(count.done, landed.length), total: Math.max(count.total, reports.length) }
  }
  const done = new Set([...count.closed, ...numbersOf(landed)]).size + unnumbered(landed)
  const total =
    new Set([...count.closed, ...count.open, ...numbersOf(reports)]).size +
    (count.total - count.closed.length - count.open.length) +
    unnumbered(reports)

  return { done, total }
}

/** The status with a new ticket count. */
export function withTickets(status: SessionStatus, count: TicketCount): SessionStatus {
  return { ...status, tickets: count }
}

// Resetting the session's progress, and listing what is open, as data. A
// `/clear` carries the session items, the reported tickets and the effort
// over (see `carryOver`); `/session-status reset` and the status tool's
// `reset` action take them out in one step. The `list` action names every
// open id, which a `/clear` leaves out of the model's context.
// register.tsx runs both; nothing here calls `$`.

import type { SessionStatus } from '../types'
import { openItems } from './session-items'
import { isOpen } from './status'
import { ticketName } from './ticket-reports'

/** What a reset took out of the status. */
export type ResetRemoved = {
  /** Session items, dropped ones too. */
  items: number
  /** Reported tickets, of every effort. */
  tickets: number
  /** The effort's name; null when the session ran none. */
  effort: string | null
}

/**
 * The status without its session items, reported tickets, effort and ticket
 * count, and what it took out. Decisions, blockers and surprises stay, open
 * and closed: an open decision still waits for its answer by the same id.
 */
export function resetProgress(status: SessionStatus): { status: SessionStatus; removed: ResetRemoved } {
  return {
    status: { ...status, sessionItems: [], ticketReports: [], effort: null, tickets: null },
    removed: {
      items: status.sessionItems.length,
      tickets: status.ticketReports.length,
      effort: status.effort?.name ?? null,
    },
  }
}

/** What the person and the model read after a reset. */
export function resetText(removed: ResetRemoved): string {
  const parts = [
    ...(removed.items > 0 ? [count(removed.items, 'session item')] : []),
    ...(removed.tickets > 0 ? [count(removed.tickets, 'ticket report')] : []),
    ...(removed.effort === null ? [] : [`the effort ${removed.effort}`]),
  ]
  if (parts.length === 0) {
    return 'Session progress was empty already. Nothing changed.'
  }

  return `Session progress reset: removed ${joinAnd(parts)}. Open decisions and blockers stay.`
}

/**
 * What the model reads after `list`: one line for each open entry, grouped
 * by kind, each with its id; a kind with no entry is left out.
 */
export function listText(status: SessionStatus): string {
  const open = status.items.filter(isOpen)
  const lines: string[] = []
  const group = (heading: string, entries: string[]) => {
    if (entries.length > 0) {
      lines.push(`${heading}:`, ...entries.map(entry => `- ${entry}`))
    }
  }
  const sessionItems = status.sessionItems.filter(item => item.state !== 'dropped')
  group(
    'Session items',
    [...openItems(status), ...sessionItems.filter(item => item.state === 'done')].map(
      item => `${item.id} ${item.title} (${item.state === 'added' ? 'open' : 'done'})`,
    ),
  )
  group(
    'Decisions',
    open.flatMap(item => (item.kind === 'decision' ? [`${item.id} ${item.question} (${item.urgency})`] : [])),
  )
  group('Blockers', open.flatMap(item => (item.kind === 'blocker' ? [`${item.id} ${item.failed}`] : [])))
  group('Surprises', open.flatMap(item => (item.kind === 'surprise' ? [`${item.id} ${item.occurred}`] : [])))
  group('Effort', status.effort === null ? [] : [status.effort.name])
  group(
    'Reported tickets',
    status.ticketReports.map(ticket => `${ticketName(ticket)} (${ticket.state})`),
  )

  return lines.length === 0 ? 'Nothing is open, and the session has no progress.' : lines.join('\n')
}

function count(n: number, noun: string): string {
  return `${n} ${noun}${n === 1 ? '' : 's'}`
}

function joinAnd(parts: readonly string[]): string {
  return parts.length === 1 ? parts[0] : `${parts.slice(0, -1).join(', ')} and ${parts.at(-1)}`
}

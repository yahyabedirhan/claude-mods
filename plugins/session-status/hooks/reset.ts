// Resetting the session's progress, and listing what is open, as data.
// `/session-status reset` and the status tool's `reset` action clear the
// whole record in one step, so an unrelated task starts from nothing within
// the same session (a `/clear` starts a new session, and so an empty status).
// The `list` action names every open id, which a `/compact` can leave out of
// the model's context.
// register.tsx runs both; nothing here calls `$`.

import type { SessionStatus } from '../types'
import { openItems } from './session-items'
import { isOpen } from './status'
import { ticketName } from './ticket-reports'

/** What a reset took out of the status. */
export type ResetRemoved = {
  /** Session items, dropped ones too. */
  items: number
  /** Decisions, surprises and blockers, open and closed. */
  entries: number
  /** Pull requests and issues the Links section listed. */
  links: number
  /** Reported tickets, of every effort. */
  tickets: number
  /** The effort's name; null when the session ran none. */
  effort: string | null
}

/**
 * The status without its record: the session items, the decisions,
 * surprises and blockers, the links, the reported tickets, the
 * effort and its ticket count; and what it took out. Ids start over at 1.
 * What the session runs now stays: its tasks, crons, subagents, place and
 * activity.
 */
export function resetProgress(status: SessionStatus): { status: SessionStatus; removed: ResetRemoved } {
  return {
    status: {
      ...status,
      items: [],
      links: [],
      endListPostedAt: null,
      sessionItems: [],
      ticketReports: [],
      effort: null,
      tickets: null,
    },
    removed: {
      items: status.sessionItems.length,
      entries: status.items.length,
      links: status.links.length,
      tickets: status.ticketReports.length,
      effort: status.effort?.name ?? null,
    },
  }
}

/** What the person and the model read after a reset. */
export function resetText(removed: ResetRemoved): string {
  const parts = [
    ...(removed.items > 0 ? [count(removed.items, 'session item')] : []),
    ...(removed.entries > 0 ? [count(removed.entries, 'decision, surprise or blocker', 'decisions, surprises and blockers')] : []),
    ...(removed.links > 0 ? [count(removed.links, 'link')] : []),
    ...(removed.tickets > 0 ? [count(removed.tickets, 'ticket report')] : []),
    ...(removed.effort === null ? [] : [`the effort ${removed.effort}`]),
  ]
  if (parts.length === 0) {
    return 'Session status was empty already. Nothing changed.'
  }

  return `Session status reset: removed ${joinAnd(parts)}. Everything starts over.`
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

function count(n: number, noun: string, plural = `${noun}s`): string {
  return `${n} ${n === 1 ? noun : plural}`
}

function joinAnd(parts: readonly string[]): string {
  return parts.length === 1 ? (parts[0] ?? '') : `${parts.slice(0, -1).join(', ')} and ${parts.at(-1)}`
}

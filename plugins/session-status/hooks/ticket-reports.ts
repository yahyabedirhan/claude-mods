// Ticket reports as data: what the orchestrator says about the tickets it
// runs. Only the orchestrator knows that a ticket is being built or that its
// commit is on the effort branch; the tracker says neither until the issue
// closes, often long after. register.tsx answers the status tool's `ticket`
// action with these rules; effort-progress.ts counts the reports.

import type { SessionStatus, TicketReport } from '../types'

/** What a `ticket` call says about one ticket. `stopped` takes a started ticket back. */
export type TicketState = TicketReport['state'] | 'stopped'

/** One `ticket` call, read from its input. */
export type TicketRequest = {
  state: TicketState
  /** The ticket's issue number, when it has one. */
  number?: number
  /** The ticket's title; a ticket reported before keeps its title without one. */
  title?: string
  /** The effort's name, as its `effort:<name>` label writes it, when the call gives it. */
  effort?: string
}

/** The ticket's name as the pane writes it: `#3 Play a video`, or the title alone. */
export function ticketName(ticket: Pick<TicketReport, 'number' | 'title'>): string {
  return ticket.number === undefined ? ticket.title : `#${ticket.number} ${ticket.title}`
}

/** The ticket's short name, for the band: `#3`, or the title when it has no number. */
export function ticketShortName(ticket: Pick<TicketReport, 'number' | 'title'>): string {
  return ticket.number === undefined ? ticket.title : `#${ticket.number}`
}

/** The reports of one state, in the order the orchestrator first named them. */
export function reportsIn(status: SessionStatus | null, state: TicketReport['state']): TicketReport[] {
  return (status?.ticketReports ?? []).filter(report => report.state === state)
}

/**
 * The status after one report, and the ticket it is about. A ticket is found
 * again by its number, or by its title when the call gives no number, so a
 * later call moves the same report: `started` then `landed`. `stopped` drops
 * the report of a started ticket; a landed one stays landed. Says what is
 * wrong when the ticket is new and has no title, for the model to fix and
 * call again.
 */
export function reportTicket(
  status: SessionStatus,
  request: TicketRequest,
  now: number,
): { status: SessionStatus; ticket: TicketReport; changed: boolean } | { error: string } {
  const reports = status.ticketReports
  const known = reports.find(report =>
    request.number === undefined ? report.title === request.title : report.number === request.number,
  )
  const title = request.title ?? known?.title
  if (title === undefined) {
    return { error: 'A ticket not reported before needs `title`: the ticket\'s title.' }
  }
  const number = request.number ?? known?.number
  const named = number === undefined ? { title } : { number, title }

  if (request.state === 'stopped') {
    const ticket: TicketReport = { ...named, state: known?.state ?? 'started', at: known?.at ?? now }
    if (known === undefined || known.state === 'landed') {
      return { status, ticket, changed: false }
    }

    return { status: { ...status, ticketReports: reports.filter(report => report !== known) }, ticket, changed: true }
  }
  if (known !== undefined && known.state === request.state && known.title === title) {
    return { status, ticket: known, changed: false }
  }
  // A ticket keeps the time it reached its state: a second `landed` only renames it.
  const ticket: TicketReport = { ...named, state: request.state, at: known?.state === request.state ? known.at : now }

  return {
    status: {
      ...status,
      ticketReports:
        known === undefined ? [...reports, ticket] : reports.map(report => (report === known ? ticket : report)),
    },
    ticket,
    changed: true,
  }
}

import type { RenderNode } from 'claude-code'

import type { TicketReport } from '../../types'
import { first } from '../lists'
import { COLOR } from '../palette'
import { branchUrl, issueUrl, worktreeLabel } from '../place'
import { sessionProgress } from '../session-progress'
import { ticketShortName } from '../ticket-reports'
import { barCells, progressBar } from './bar'
import type { Section, Ui } from './section'

/** How many tickets in progress the section names; the rest show as "+N more". */
const BUILDING_SHOWN = 4

/** The label column's width, in cells: the longest label, `Worktree`, and a space. */
const LABEL_CELLS = 9

/**
 * This session's own work, in every session: the branch and the worktree;
 * during an effort, the tickets the orchestrator reported landed of all it
 * reported and the ones it builds now, else the task list's tasks done.
 * The effort's name and the tracker's count are the Effort section's, the
 * created pages the Created section's. Drawn once any of it is known.
 */
export const sessionSection: Section = ({ ui, status, columns }) => {
  const { Box, Text } = ui
  if (status === null) {
    return null
  }
  const { place } = status
  const repo = place?.repo ?? null
  const progress = sessionProgress(status)
  const lines: RenderNode[] = []
  if (place !== null && place.branch !== null) {
    lines.push(labelled(ui, 'Branch', place.branch, repo === null ? null : branchUrl(repo, place.branch)))
  }
  if (place !== null && worktreeLabel(place.root) !== '') {
    lines.push(labelled(ui, 'Worktree', worktreeLabel(place.root), null))
  }
  if (progress !== null) {
    lines.push(
      <Text key="session-progress">
        <Text dimColor>{progress.source === 'tickets' ? 'Landed ' : 'Tasks '}</Text>
        {`${progress.done}/${progress.total} `}
        <Text color={COLOR.done}>{progressBar(progress.done, progress.total, barCells(columns))}</Text>
      </Text>,
    )
  }
  if (progress?.source === 'tickets' && progress.building.length > 0) {
    lines.push(building(ui, progress.building, repo === null ? null : number => issueUrl(repo, number)))
  }
  if (lines.length === 0) {
    return null
  }

  return (
    <Box key="session" flexDirection="column">
      <Text bold>Session</Text>
      {lines}
    </Box>
  )
}

/** One `Label    value` line; the value is a link when it has a page. */
function labelled(ui: Ui, label: string, value: string, href: string | null): RenderNode {
  const { Link, Text } = ui

  return (
    <Text key={`session-${label.toLowerCase()}`}>
      <Text dimColor>{label.padEnd(LABEL_CELLS)}</Text>
      {href === null ? value : <Link href={href} label={value} />}
    </Text>
  )
}

/** `Building: #3, #5, +2 more`, each numbered ticket a link to its issue when it has a page. */
function building(ui: Ui, tickets: readonly TicketReport[], pageOf: ((number: number) => string) | null): RenderNode {
  const { Link, Text } = ui
  const { shown, more } = first(tickets, BUILDING_SHOWN)

  return (
    <Text key="session-building">
      <Text dimColor>Building: </Text>
      {shown.map((ticket, index) => (
        <Text key={`building-${ticket.number ?? ticket.title}`} color={COLOR.accent}>
          {index === 0 ? '' : ', '}
          {ticket.number === undefined || pageOf === null ? (
            ticketShortName(ticket)
          ) : (
            <Link href={pageOf(ticket.number)} label={ticketShortName(ticket)} />
          )}
        </Text>
      ))}
      {more > 0 ? <Text dimColor>{`, +${more} more`}</Text> : null}
    </Text>
  )
}

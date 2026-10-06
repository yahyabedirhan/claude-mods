import type { RenderNode } from 'claude-code'

import type { TicketReport } from '../../types'
import { first } from '../lists'
import { COLOR } from '../palette'
import { branchUrl, issueUrl, worktreeLabel } from '../place'
import { listedItems } from '../session-items'
import { sessionProgress, taskProgress } from '../session-progress'
import { ticketShortName } from '../ticket-reports'
import { barCells, progressBar } from './bar'
import { itemEntry, moreButton } from './entries'
import type { Section, Ui } from './section'

/** How many tickets in progress the section names; the rest show as "+N more". */
const BUILDING_SHOWN = 4

/** How many session items the section lists; the rest open with "+N more". */
const ITEMS_SHOWN = 2

/** The label column's width, in cells: the longest label, `Worktree`, and a space. */
const LABEL_CELLS = 9

/**
 * This session's own work, in every session: the branch and the worktree;
 * the items done of all, the effort's tickets among them, then the first
 * two items (open ones first) and the tickets the orchestrator builds now; and the task list's
 * tasks done, on a line of its own. The effort's name and the tracker's
 * closed count are the Effort section's, the created pages the Created
 * section's. Drawn once any of it is known.
 */
export const sessionSection: Section = ({ ui, status, columns, show }) => {
  const { Box, Text } = ui
  if (status === null) {
    return null
  }
  const { place } = status
  const repo = place?.repo ?? null
  const progress = sessionProgress(status)
  const tasks = taskProgress(status)
  const lines: RenderNode[] = []
  if (place !== null && place.branch !== null) {
    lines.push(labelled(ui, 'Branch', place.branch, repo === null ? null : branchUrl(repo, place.branch)))
  }
  if (place !== null && worktreeLabel(place.root) !== '') {
    lines.push(labelled(ui, 'Worktree', worktreeLabel(place.root), null))
  }
  if (progress !== null) {
    lines.push(bar(ui, 'Progress', progress.done, progress.total, columns))
    const { shown, more } = first(listedItems(status), ITEMS_SHOWN)
    lines.push(...shown.map(item => itemEntry(ui, item, 'item')))
    if (more > 0) {
      lines.push(moreButton(ui, 'items', more, () => show('items')))
    }
    if (progress.building.length > 0) {
      lines.push(building(ui, progress.building, repo === null ? null : number => issueUrl(repo, number)))
    }
  }
  if (tasks !== null) {
    lines.push(bar(ui, 'Tasks', tasks.done, tasks.total, columns))
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

/** `Progress 7/10 ██████████████░░░░░░`: the bar is neutral; colour marks only what needs the person. */
function bar(ui: Ui, label: string, done: number, total: number, columns: number): RenderNode {
  const { Text } = ui

  return (
    <Text key={`session-${label.toLowerCase()}`}>
      <Text dimColor>{`${label} `}</Text>
      {`${done}/${total} ${progressBar(done, total, barCells(columns))}`}
    </Text>
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

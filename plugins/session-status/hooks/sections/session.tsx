import type { RenderNode, RenderSurface } from 'claude-code'

import type { TicketReport } from '../../types'
import { first } from '../lists'
import { COLOR } from '../palette'
import { issueUrl, worktreeLabel } from '../place'
import { listedItems } from '../session-items'
import { sessionProgress } from '../session-progress'
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
 * This session's own work, in every session: the session id, the branch and
 * the worktree, each copied when pressed;
 * the session items done of all, then the first two items (open ones
 * first); and the tickets the orchestrator builds now. Effort tickets never
 * count in this bar: the Effort section shows which issues GitHub closed,
 * the Task section the task list, the Links section the pull requests and
 * issues. Drawn once any of it is known.
 */
export const sessionSection: Section = ({ ui, status, columns, show, copy }) => {
  const { Box, Text } = ui
  if (status === null) {
    return null
  }
  const { place } = status
  const repo = place?.repo ?? null
  const progress = sessionProgress(status)
  const lines: RenderNode[] = [copyable(ui, 'ID', status.sessionId, status.sessionId, copy)]
  if (place !== null && place.branch !== null) {
    lines.push(copyable(ui, 'Branch', place.branch, place.branch, copy))
  }
  if (place !== null && worktreeLabel(place.root) !== '') {
    lines.push(copyable(ui, 'Worktree', worktreeLabel(place.root), place.root, copy))
  }
  if (progress !== null && progress.total > 0) {
    lines.push(bar(ui, 'Progress', progress.done, progress.total, columns))
    const { shown, more } = first(listedItems(status), ITEMS_SHOWN)
    lines.push(...shown.map(item => itemEntry(ui, item, 'item')))
    if (more > 0) {
      lines.push(moreButton(ui, 'items', more, () => show('items')))
    }
  }
  if (progress !== null && progress.building.length > 0) {
    lines.push(building(ui, progress.building, repo === null ? null : number => issueUrl(repo, number)))
    if (progress.building.length > BUILDING_SHOWN) {
      lines.push(moreButton(ui, 'building', progress.building.length - BUILDING_SHOWN, () => show('building')))
    }
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

/**
 * One `Label    value` line: pressing the value copies `text` (the worktree
 * shows its short name and copies its full path).
 */
function copyable(
  ui: Ui,
  label: string,
  value: string,
  text: string,
  copy: (text: string, surface: RenderSurface) => void,
): RenderNode {
  const { Box, Button, Text } = ui
  const key = `session-${label.toLowerCase()}`

  return (
    <Box key={key} flexDirection="row">
      <Text dimColor>{label.padEnd(LABEL_CELLS)}</Text>
      <Button key={`${key}-copy`} label={value} plain onPress={press => copy(text, press.surface)} />
    </Box>
  )
}

/** `Building: #3, #5`, each numbered ticket a link to its issue when it has a page; the rest open with "+N more" below. */
function building(ui: Ui, tickets: readonly TicketReport[], pageOf: ((number: number) => string) | null): RenderNode {
  const { Link, Text } = ui
  const { shown } = first(tickets, BUILDING_SHOWN)

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
    </Text>
  )
}

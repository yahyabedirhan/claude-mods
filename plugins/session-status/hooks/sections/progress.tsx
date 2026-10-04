import { shownProgress } from '../effort-progress'
import { ticketName } from '../ticket-reports'
import type { Section } from './section'

/** The bar's widest, in cells. */
const BAR_CELLS = 20

/** The most tickets in progress the section names; the rest show as "+N more". */
const BUILDING_SHOWN = 4

/**
 * Tickets (during an effort) or tasks done, the total, a bar, the tickets
 * the orchestrator builds now and the task that runs now. The line names its
 * source: `Tickets 3/9` or `Tasks 3/9`.
 */
export const progressSection: Section = ({ ui, status, columns }) => {
  const { Box, Text } = ui
  const progress = shownProgress(status)
  if (progress === null) {
    return null
  }
  const { source, done, total, current, building } = progress
  const cells = Math.max(5, Math.min(BAR_CELLS, columns - 14))

  return (
    <Box key="progress" flexDirection="column">
      <Text bold>Progress</Text>
      <Text>
        {`${source === 'tickets' ? 'Tickets' : 'Tasks'} ${done}/${total} done `}
        <Text color="green">{progressBar(done, total, cells)}</Text>
      </Text>
      {building.slice(0, BUILDING_SHOWN).map(ticket => (
        <Text key={`building-${ticket.number ?? ticket.title}`} wrap="truncate-end">
          {`Building: ${ticketName(ticket)}`}
        </Text>
      ))}
      {building.length > BUILDING_SHOWN ? <Text dimColor>{`+${building.length - BUILDING_SHOWN} more building`}</Text> : null}
      {current === null ? null : <Text wrap="truncate-end">{`Current: ${current}`}</Text>}
    </Box>
  )
}

/** A bar of `cells` cells, filled in the share `done` is of `total`. */
export function progressBar(done: number, total: number, cells: number): string {
  const filled = total <= 0 ? 0 : Math.round((Math.min(done, total) / total) * cells)

  return '█'.repeat(filled) + '░'.repeat(cells - filled)
}

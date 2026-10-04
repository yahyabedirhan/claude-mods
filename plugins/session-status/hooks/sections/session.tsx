import { joinFirst } from '../lists'
import { sessionProgress } from '../session-progress'
import { ticketShortName } from '../ticket-reports'
import { barCells, progressBar } from './bar'
import type { Section } from './section'

/** How many tickets in progress the section names; the rest show as "+N more". */
const BUILDING_SHOWN = 4

/**
 * This session's own work: during an effort, the tickets the orchestrator
 * reported landed of all it reported, and the ones it builds now; else the
 * task list's tasks done of the total. Never the tracker's count: that is
 * the Effort section's.
 */
export const sessionSection: Section = ({ ui, status, columns }) => {
  const { Box, Text } = ui
  const progress = sessionProgress(status)
  if (progress === null) {
    return null
  }
  const building = progress.source === 'tickets' ? progress.building.map(ticketShortName) : []

  return (
    <Box key="session" flexDirection="column">
      <Text bold>Session</Text>
      <Text>
        {`${progress.source === 'tickets' ? 'Landed' : 'Tasks'} ${progress.done}/${progress.total} `}
        <Text color="green">{progressBar(progress.done, progress.total, barCells(columns))}</Text>
      </Text>
      {building.length === 0 ? null : <Text>{`Building: ${joinFirst(building, BUILDING_SHOWN)}`}</Text>}
    </Box>
  )
}

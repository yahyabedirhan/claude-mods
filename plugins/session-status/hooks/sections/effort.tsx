import { effortProgress } from '../effort-progress'
import { barCells, progressBar } from './bar'
import type { Section } from './section'

/**
 * The effort as the tracker counts it: its tickets closed of all its
 * `effort:<name>` issues, without the spec issue. Drawn only during an
 * effort whose tickets the tracker counted.
 */
export const effortSection: Section = ({ ui, status, columns }) => {
  const { Box, Text } = ui
  const progress = effortProgress(status)
  if (progress === null) {
    return null
  }

  return (
    <Box key="effort" flexDirection="column">
      <Text bold>Effort</Text>
      <Text>
        {`Closed ${progress.closed}/${progress.total} `}
        <Text color="green">{progressBar(progress.closed, progress.total, barCells(columns))}</Text>
      </Text>
    </Box>
  )
}

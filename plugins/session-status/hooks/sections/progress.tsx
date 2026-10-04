import { shownProgress } from '../effort-progress'
import type { Section } from './section'

/** The bar's widest, in cells. */
const BAR_CELLS = 20

/**
 * Tickets (during an effort) or tasks done, the total, a bar and the task
 * that runs now. The line names its source: `Tickets 3/9` or `Tasks 3/9`.
 */
export const progressSection: Section = ({ ui, status, columns }) => {
  const { Box, Text } = ui
  const progress = shownProgress(status)
  if (progress === null) {
    return null
  }
  const { source, done, total, current } = progress
  const cells = Math.max(5, Math.min(BAR_CELLS, columns - 14))

  return (
    <Box key="progress" flexDirection="column">
      <Text bold>Progress</Text>
      <Text>
        {`${source === 'tickets' ? 'Tickets' : 'Tasks'} ${done}/${total} done `}
        <Text color="green">{progressBar(done, total, cells)}</Text>
      </Text>
      {current === null ? null : <Text wrap="truncate-end">{`Current: ${current}`}</Text>}
    </Box>
  )
}

/** A bar of `cells` cells, filled in the share `done` is of `total`. */
export function progressBar(done: number, total: number, cells: number): string {
  const filled = total <= 0 ? 0 : Math.round((Math.min(done, total) / total) * cells)

  return '█'.repeat(filled) + '░'.repeat(cells - filled)
}

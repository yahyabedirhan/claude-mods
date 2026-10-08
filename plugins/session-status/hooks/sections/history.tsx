import { isOpen } from '../status'
import type { Section } from './section'

/**
 * The answered history, collapsed to one line: how many decisions the agent
 * or the user answered and surprises the user dismissed. Closed items stay
 * in the status and out of the pane. Drawn only when there is one.
 */
export const historySection: Section = ({ ui, status }) => {
  const { Box, Text } = ui
  const answered = (status?.items ?? []).filter(item => !isOpen(item)).length
  if (answered === 0) {
    return null
  }

  return (
    <Box key="history">
      <Text dimColor>Answered ({answered})</Text>
    </Box>
  )
}

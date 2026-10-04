import { formatAge, formatClock } from '../time'
import type { Section } from './section'

export const lastUpdateSection: Section = ({ ui, status, now }) => {
  const { Box, Text } = ui
  const updatedAt = status?.updatedAt ?? null

  return (
    <Box key="last-update" flexDirection="column">
      <Text dimColor>
        {updatedAt === null
          ? 'No update yet.'
          : `Last update ${formatClock(updatedAt)} · ${formatAge(now - updatedAt)}`}
      </Text>
    </Box>
  )
}

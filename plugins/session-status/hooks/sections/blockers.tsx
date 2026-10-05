import { COLOR } from '../palette'
import { openBlockers } from '../status'
import type { Section } from './section'

/**
 * You should know: every open blocker, oldest first: what the agent tried
 * that failed, and what the person can do to unblock it. Drawn only when
 * there is one; a blocker stays until the agent resolves it.
 */
export const blockersSection: Section = ({ ui, status }) => {
  const { Box, Text } = ui
  const blockers = status === null ? [] : openBlockers(status)
  if (blockers.length === 0) {
    return null
  }

  return (
    <Box key="blockers" flexDirection="column">
      <Text bold color={COLOR.attention}>
        You should know ({blockers.length})
      </Text>
      {blockers.map(blocker => (
        <Box key={`blocker-${blocker.id}`} flexDirection="column">
          <Text>
            <Text color={COLOR.attention}>{blocker.id}</Text>
            {` · ${blocker.failed}`}
          </Text>
          <Box paddingLeft={2}>
            <Text>
              <Text dimColor>To unblock: </Text>
              {blocker.needs}
            </Text>
          </Box>
        </Box>
      ))}
    </Box>
  )
}

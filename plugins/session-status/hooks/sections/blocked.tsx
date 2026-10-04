import type { Decision } from '../../types'
import { isOpen } from '../status'
import type { Section } from './section'

/**
 * Every decision that blocks the agent, oldest first, each with what
 * unblocks it and the recommended answer. Drawn only when there is one.
 */
export const blockedSection: Section = ({ ui, status }) => {
  const { Box, Text } = ui
  const blocked = (status?.items ?? []).filter(
    (item): item is Decision => item.kind === 'decision' && item.urgency === 'blocked' && isOpen(item),
  )
  if (blocked.length === 0) {
    return null
  }

  return (
    <Box key="blocked" flexDirection="column">
      <Text bold>Blocked on you ({blocked.length})</Text>
      {blocked.map(decision => (
        <Box key={`blocked-${decision.id}`} flexDirection="column">
          <Text>
            {decision.id} · {decision.question}
          </Text>
          <Box flexDirection="column" paddingLeft={2}>
            <Text>Unblocks: {decision.unblocks}</Text>
            <Text>Recommended: {decision.default}</Text>
            <Text dimColor>Options: {decision.options.join(' / ')}</Text>
          </Box>
        </Box>
      ))}
    </Box>
  )
}

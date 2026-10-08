import type { Decision } from '../../types'
import { COLOR } from '../palette'
import { isOpen } from '../status'
import { itemHeading, replyButtons } from './entries'
import type { Section } from './section'

/**
 * Every decision that blocks the agent, oldest first, each with what
 * unblocks it, the recommended answer and its quick-reply buttons. Drawn
 * only when there is one.
 */
export const blockedSection: Section = ({ ui, status, replies }) => {
  const { Box, Text } = ui
  const blocked = (status?.items ?? []).filter(
    (item): item is Decision => item.kind === 'decision' && item.urgency === 'blocked' && isOpen(item),
  )
  if (blocked.length === 0) {
    return null
  }

  return (
    <Box key="blocked" flexDirection="column">
      <Text bold color={COLOR.attention}>
        Blocked on you ({blocked.length})
      </Text>
      {blocked.map(decision => (
        <Box key={`blocked-${decision.id}`} flexDirection="column">
          {itemHeading(ui, decision, COLOR.attention)}
          <Box flexDirection="column" paddingLeft={2}>
            <Text>
              <Text dimColor>Unblocks: </Text>
              {decision.unblocks}
            </Text>
            <Text>
              <Text dimColor>Recommended: </Text>
              {decision.default}
            </Text>
            <Text dimColor>Options: {decision.options.join(' / ')}</Text>
          </Box>
          {replyButtons(ui, decision, 'blocked', replies)}
        </Box>
      ))}
    </Box>
  )
}

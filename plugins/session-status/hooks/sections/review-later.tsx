import type { Decision } from '../../types'
import { newest } from './section'
import type { Section } from './section'

/** How many review-later decisions the pane shows; the rest are "+N more". */
const LIMIT = 3

/**
 * Decisions the person can review later: the newest three, each with the
 * default the agent goes on with, then "+N more". Drawn only when there is one.
 */
export const reviewLaterSection: Section = ({ ui, status }) => {
  const { Box, Text } = ui
  const decisions = (status?.items ?? []).filter(
    (item): item is Decision => item.kind === 'decision' && item.urgency === 'review_later',
  )
  if (decisions.length === 0) {
    return null
  }
  const { shown, more } = newest(decisions, LIMIT)

  return (
    <Box key="review-later" flexDirection="column">
      <Text bold>Review later ({decisions.length})</Text>
      {shown.map(decision => (
        <Box key={`review-later-${decision.id}`} flexDirection="column">
          <Text>
            {decision.id} · {decision.question}
          </Text>
          <Box paddingLeft={2}>
            <Text dimColor>Default: {decision.default}</Text>
          </Box>
        </Box>
      ))}
      {more > 0 ? (
        <Box key="review-later-more">
          <Text dimColor>+{more} more</Text>
        </Box>
      ) : null}
    </Box>
  )
}

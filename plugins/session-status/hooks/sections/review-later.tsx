import { onEndList, openReviewLater } from '../status'
import { newest } from '../lists'
import { COLOR } from '../palette'
import type { Section } from './section'

/** How many review-later decisions the pane shows; the rest are "+N more". */
const LIMIT = 3

/**
 * Open decisions the person can review later. Before the end-of-work list:
 * the newest three, each with the default the agent goes on with, then
 * "+N more". After it: every decision the list named, highlighted and oldest
 * first as the list numbers them, then the newest three of those recorded
 * since. Drawn only when there is one.
 */
export const reviewLaterSection: Section = ({ ui, status }) => {
  const { Box, Text } = ui
  if (status === null) {
    return null
  }
  const decisions = openReviewLater(status)
  if (decisions.length === 0) {
    return null
  }
  const listed = onEndList(status)
  const rest = decisions.filter(decision => !listed.includes(decision))
  const { shown, more } = newest(rest, LIMIT)

  return (
    <Box key="review-later" flexDirection="column">
      <Text bold>Review later ({decisions.length})</Text>
      {listed.length > 0 ? (
        <Box key="review-later-listed" flexDirection="column">
          <Text color={COLOR.attention} bold>
            In your end-of-work list ({listed.length})
          </Text>
          {listed.map(decision => (
            <Box key={`review-later-listed-${decision.id}`} flexDirection="column">
              <Text>
                <Text color={COLOR.attention}>{decision.id}</Text>
                {` · ${decision.question}`}
              </Text>
              <Box paddingLeft={2}>
                <Text dimColor>Default: {decision.default}</Text>
              </Box>
            </Box>
          ))}
        </Box>
      ) : null}
      {shown.map(decision => (
        <Box key={`review-later-${decision.id}`} flexDirection="column">
          <Text>
            <Text color={COLOR.accent}>{decision.id}</Text>
            {` · ${decision.question}`}
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

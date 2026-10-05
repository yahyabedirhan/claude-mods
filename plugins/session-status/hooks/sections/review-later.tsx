import { onEndList, openReviewLater } from '../status'
import { newest } from '../lists'
import { COLOR } from '../palette'
import { moreButton, reviewLaterEntry } from './entries'
import type { Section } from './section'

/** How many review-later decisions the pane shows; the rest are "+N more". */
const LIMIT = 3

/**
 * Open decisions the person can review later. Before the end-of-work list:
 * the newest three, each with the default the agent goes on with, then
 * a "+N more" that opens them all. After it: every decision the list named, highlighted and oldest
 * first as the list numbers them, then the newest three of those recorded
 * since. Drawn only when there is one.
 */
export const reviewLaterSection: Section = ({ ui, status, show }) => {
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
          {listed.map(decision => reviewLaterEntry(ui, decision, 'review-later-listed', COLOR.attention))}
        </Box>
      ) : null}
      {shown.map(decision => reviewLaterEntry(ui, decision, 'review-later'))}
      {more > 0 ? moreButton(ui, 'review-later', more, () => show('review-later')) : null}
    </Box>
  )
}

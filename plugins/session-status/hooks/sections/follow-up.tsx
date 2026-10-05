import { openFollowUps } from '../status'
import { newest } from '../lists'
import { decisionEntry, moreButton } from './entries'
import type { Section } from './section'

/** How many follow-ups the section shows; the rest are "+N more". */
const LIMIT = 3

/**
 * Follow-up after settling: the decisions that can wait until after the
 * session settles, each with the default the agent went on with. The newest
 * three, then a "+N more" that opens them all. Drawn only when there is one.
 */
export const followUpSection: Section = ({ ui, status, show }) => {
  const { Box, Text } = ui
  const followUps = status === null ? [] : openFollowUps(status)
  if (followUps.length === 0) {
    return null
  }
  const { shown, more } = newest(followUps, LIMIT)

  return (
    <Box key="follow-up" flexDirection="column">
      <Text bold>Follow-up after settling ({followUps.length})</Text>
      {shown.map(decision => decisionEntry(ui, decision, 'follow-up'))}
      {more > 0 ? moreButton(ui, 'follow-up', more, () => show('follow-up')) : null}
    </Box>
  )
}

import { onEndList, openToDecide } from '../status'
import { newest } from '../lists'
import { COLOR } from '../palette'
import { decisionEntry, moreButton } from './entries'
import type { Section } from './section'

/** How many decisions the section shows; the rest are "+N more". */
export const DECIDE_LIMIT = 5

/**
 * Decide before settling: the decisions the agent went on with a default
 * for, which the person answers before the session settles. The ones the
 * agent asked about in the chat (its decide list) come first, oldest first
 * as the list numbers them, their ids in the warning colour; then the newest
 * of the rest, up to five in all, then a "+N more" that opens them all.
 * Drawn only when there is one.
 */
export const decideSection: Section = ({ ui, status, show, replies }) => {
  const { Box, Text } = ui
  if (status === null) {
    return null
  }
  const decisions = openToDecide(status)
  if (decisions.length === 0) {
    return null
  }
  const asked = onEndList(status)
  const rest = decisions.filter(decision => !asked.includes(decision))
  const { shown, more } = newest(rest, Math.max(DECIDE_LIMIT - asked.length, 0))

  return (
    <Box key="decide" flexDirection="column">
      <Text bold>Decide before settling ({decisions.length})</Text>
      {asked.map(decision => decisionEntry(ui, decision, 'decide-asked', replies, COLOR.attention))}
      {shown.map(decision => decisionEntry(ui, decision, 'decide', replies))}
      {more > 0 ? moreButton(ui, 'decide', more, () => show('decide')) : null}
    </Box>
  )
}

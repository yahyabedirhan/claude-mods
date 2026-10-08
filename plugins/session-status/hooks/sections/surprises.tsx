import { newest } from '../lists'
import { moreButton, openSurprises, surpriseEntry } from './entries'
import type { Section } from './section'

/** How many surprises the pane shows; the rest are "+N more". */
const LIMIT = 2

/**
 * Surprises the agent recorded: the newest two, each with what it changed
 * and its action buttons, then a "+N more" that opens them all. The
 * observer's findings are the Observations section's. Drawn only when there
 * is one.
 */
export const surprisesSection: Section = ({ ui, status, show, replies }) => {
  const { Box, Text } = ui
  const surprises = openSurprises(status)
  if (surprises.length === 0) {
    return null
  }
  const { shown, more } = newest(surprises, LIMIT)

  return (
    <Box key="surprises" flexDirection="column">
      <Text bold>Surprises ({surprises.length})</Text>
      {shown.map(surprise => surpriseEntry(ui, surprise, 'surprise', replies))}
      {more > 0 ? moreButton(ui, 'surprises', more, () => show('surprises')) : null}
    </Box>
  )
}

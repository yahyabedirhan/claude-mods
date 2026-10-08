import { newest } from '../lists'
import { moreButton, openObservations, surpriseEntry } from './entries'
import type { Section } from './section'

/** How many observations the pane shows; the rest are "+N more". */
const LIMIT = 2

/**
 * The observer agent's findings, apart from what the agent itself knows:
 * a dim heading, the newest two, each with its action buttons, then a
 * "+N more" that opens them all. Drawn only when there is one.
 */
export const observationsSection: Section = ({ ui, status, show, replies }) => {
  const { Box, Text } = ui
  const observations = openObservations(status)
  if (observations.length === 0) {
    return null
  }
  const { shown, more } = newest(observations, LIMIT)

  return (
    <Box key="observations" flexDirection="column">
      <Text bold dimColor>
        Observations ({observations.length})
      </Text>
      {shown.map(observation => surpriseEntry(ui, observation, 'observation', replies))}
      {more > 0 ? moreButton(ui, 'observations', more, () => show('observations')) : null}
    </Box>
  )
}

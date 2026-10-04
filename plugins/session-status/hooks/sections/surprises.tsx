import type { Surprise } from '../../types'
import { newest } from './section'
import type { Section } from './section'

/** How many surprises the pane shows; the rest are "+N more". */
const LIMIT = 2

/**
 * Surprises: the newest two, each with what it changed, then "+N more".
 * Drawn only when there is one.
 */
export const surprisesSection: Section = ({ ui, status }) => {
  const { Box, Text } = ui
  const surprises = (status?.items ?? []).filter((item): item is Surprise => item.kind === 'surprise')
  if (surprises.length === 0) {
    return null
  }
  const { shown, more } = newest(surprises, LIMIT)

  return (
    <Box key="surprises" flexDirection="column">
      <Text bold>Surprises ({surprises.length})</Text>
      {shown.map(surprise => (
        <Box key={`surprise-${surprise.id}`} flexDirection="column">
          <Text>
            {surprise.id} · {surprise.occurred}
          </Text>
          <Box paddingLeft={2}>
            <Text dimColor>Changed: {surprise.changed}</Text>
          </Box>
        </Box>
      ))}
      {more > 0 ? (
        <Box key="surprises-more">
          <Text dimColor>+{more} more</Text>
        </Box>
      ) : null}
    </Box>
  )
}

import { effortProgress } from '../effort-progress'
import { effortUrl } from '../place'
import { barCells, progressBar } from './bar'
import type { Section } from './section'

/**
 * The effort: its name, a link to its `effort:<name>` issues, and the
 * tracker's count of them, closed of all without the spec issue, once the
 * tracker counted them. Drawn during an effort.
 */
export const effortSection: Section = ({ ui, status, columns }) => {
  const { Box, Link, Text } = ui
  const effort = status?.effort ?? null
  if (effort === null) {
    return null
  }
  const repo = status?.place?.repo ?? null
  const progress = effortProgress(status)

  return (
    <Box key="effort" flexDirection="column">
      <Text>
        <Text bold>Effort</Text>
        {'  '}
        {repo === null ? effort.name : <Link href={effortUrl(repo, effort.name)} label={effort.name} />}
      </Text>
      {progress === null ? null : (
        <Text>
          <Text dimColor>Closed </Text>
          {`${progress.closed}/${progress.total} ${progressBar(progress.closed, progress.total, barCells(columns))}`}
        </Text>
      )}
    </Box>
  )
}

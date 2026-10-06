import { effortProgress, effortTickets } from '../effort-progress'
import { first } from '../lists'
import { effortUrl } from '../place'
import { barCells, progressBar } from './bar'
import { moreButton, ticketEntry } from './entries'
import type { Section } from './section'

/** How many tickets the section lists; the rest open with "+N more". */
const TICKETS_SHOWN = 2

/**
 * The effort: its name, a link to its `effort:<name>` issues, and the
 * tracker's count of them, closed of all without the spec issue, once the
 * tracker counted them; then two tickets, open ones first, each a link to
 * its issue, and a "+N more" that opens them all. Drawn during an effort.
 */
export const effortSection: Section = ({ ui, status, columns, show }) => {
  const { Box, Link, Text } = ui
  const effort = status?.effort ?? null
  if (effort === null) {
    return null
  }
  const repo = status?.place?.repo ?? null
  const progress = effortProgress(status)
  const { shown, more } = first(effortTickets(status), TICKETS_SHOWN)

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
      {shown.map(ticket => ticketEntry(ui, ticket, repo, 'ticket'))}
      {more > 0 ? moreButton(ui, 'tickets', more, () => show('tickets')) : null}
    </Box>
  )
}

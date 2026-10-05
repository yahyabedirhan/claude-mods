import { cronCounts } from '../crons'
import { first } from '../lists'
import type { Section } from './section'

/** How many active jobs the section names; the rest show as "+N more". */
const ACTIVE_SHOWN = 3

/**
 * The cron jobs the session scheduled: `1 active · 1 fired · 1 cancelled`, a
 * zero part left out, then each active job's schedule and prompt, with its
 * fires when it has any. Drawn once a job is scheduled.
 */
export const cronsSection: Section = ({ ui, status }) => {
  const { Box, Text } = ui
  const crons = status?.crons ?? []
  if (crons.length === 0) {
    return null
  }
  const counts = cronCounts(crons)
  const parts = (['active', 'fired', 'cancelled'] as const)
    .filter(state => counts[state] > 0)
    .map(state => `${counts[state]} ${state}`)
  const { shown, more } = first(
    crons.filter(job => job.state === 'active'),
    ACTIVE_SHOWN,
  )

  return (
    <Box key="crons" flexDirection="column">
      <Text bold>Cron jobs</Text>
      <Text>{parts.join(' · ')}</Text>
      {shown.map(job => (
        <Text key={`cron-${job.id}`} wrap="truncate-end">
          <Text dimColor>{`${job.fires > 0 ? `${job.fires}× ` : ''}${job.schedule} · `}</Text>
          {job.prompt}
        </Text>
      ))}
      {more > 0 ? <Text dimColor>{`+${more} more`}</Text> : null}
    </Box>
  )
}

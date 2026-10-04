// The band above the prompt: counts, and the tickets in progress, for a
// terminal too narrow to place the pane. Whether the pane waits is read in register.tsx, where `$` is.

import type { ElementTable, RenderElement } from 'claude-code'

import type { SessionStatus } from '../types'
import { shownProgress } from './effort-progress'
import { isOpen } from './status'
import { ticketShortName } from './ticket-reports'

/** The counts the band shows; resolved items are left out. */
export type BandCounts = {
  blocked: number
  review: number
  done: number
  total: number
  surprises: number
}

/** The open items of each kind, and the tickets or tasks done of the total. */
export function bandCounts(status: SessionStatus | null): BandCounts {
  const open = (status?.items ?? []).filter(isOpen)
  const progress = shownProgress(status)
  const decisions = open.filter(item => item.kind === 'decision')

  return {
    blocked: decisions.filter(item => item.urgency === 'blocked').length,
    review: decisions.filter(item => item.urgency === 'review_later').length,
    done: progress?.done ?? 0,
    total: progress?.total ?? 0,
    surprises: open.filter(item => item.kind === 'surprise').length,
  }
}

/** The most tickets in progress the band names; the rest show as `+N`. */
const BUILDING_SHOWN = 3

/**
 * `<n> blocked · <n> review · <done>/<total> done · <n> surprise`, with
 * ` · building #3, #5` after the done count while the orchestrator builds
 * tickets.
 */
export function bandText(status: SessionStatus | null): string {
  const { blocked, review, done, total, surprises } = bandCounts(status)
  const building = shownProgress(status)?.building ?? []
  const names = building.slice(0, BUILDING_SHOWN).map(ticketShortName)
  const more = building.length > names.length ? [`+${building.length - names.length}`] : []
  const now = names.length === 0 ? '' : ` · building ${[...names, ...more].join(', ')}`

  return `${blocked} blocked · ${review} review · ${done}/${total} done${now} · ${surprises} surprise`
}

/** The band's tree: one line in a Box keyed `session-status-band`. */
export function drawBand(
  ui: Pick<ElementTable, 'Box' | 'Text'>,
  status: SessionStatus | null,
): RenderElement {
  const { Box, Text } = ui
  const isBlocked = bandCounts(status).blocked > 0

  return (
    <Box key="session-status-band">
      {isBlocked ? (
        <Text wrap="truncate-end" color="yellow">
          {bandText(status)}
        </Text>
      ) : (
        <Text wrap="truncate-end" dimColor>
          {bandText(status)}
        </Text>
      )}
    </Box>
  )
}

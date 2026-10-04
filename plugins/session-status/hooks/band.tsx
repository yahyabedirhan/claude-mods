// The band above the prompt: counts only, for a terminal too narrow to place
// the pane. Whether the pane waits is read in register.tsx, where `$` is.

import type { ElementTable, RenderElement } from 'claude-code'

import type { SessionStatus } from '../types'
import { effortProgress } from './effort-progress'
import { sessionProgress } from './session-progress'
import { isOpen } from './status'

/** The open decisions of each urgency and the open surprises; resolved items are left out. */
function openCounts(status: SessionStatus | null): { blocked: number; review: number; surprises: number } {
  const open = (status?.items ?? []).filter(isOpen)
  const decisions = open.filter(item => item.kind === 'decision')

  return {
    blocked: decisions.filter(item => item.urgency === 'blocked').length,
    review: decisions.filter(item => item.urgency === 'review_later').length,
    surprises: open.filter(item => item.kind === 'surprise').length,
  }
}

/**
 * `<n> blocked · <n> review · <session> · <effort> · <n> surprise`. The
 * session figure is `landed 4/9` once the orchestrator reports tickets, else
 * the tasks' `<done>/<total> done`; the effort figure, `closed 1/13`, shows
 * only while the tracker counts the effort's tickets.
 */
export function bandText(status: SessionStatus | null): string {
  const { blocked, review, surprises } = openCounts(status)
  const session = sessionProgress(status)
  const effort = effortProgress(status)
  const parts = [
    `${blocked} blocked`,
    `${review} review`,
    session?.source === 'tickets'
      ? `landed ${session.done}/${session.total}`
      : `${session?.done ?? 0}/${session?.total ?? 0} done`,
    ...(effort === null ? [] : [`closed ${effort.closed}/${effort.total}`]),
    `${surprises} surprise`,
  ]

  return parts.join(' · ')
}

/** The band's tree: one line in a Box keyed `session-status-band`. */
export function drawBand(
  ui: Pick<ElementTable, 'Box' | 'Text'>,
  status: SessionStatus | null,
): RenderElement {
  const { Box, Text } = ui
  const isBlocked = openCounts(status).blocked > 0

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

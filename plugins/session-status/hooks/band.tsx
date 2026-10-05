// The band above the prompt: counts only, for a terminal too narrow to place
// the pane. Whether the pane waits is read in register.tsx, where `$` is.

import type { ElementTable, RenderElement } from 'claude-code'

import type { SessionStatus } from '../types'
import { effortProgress } from './effort-progress'
import { COLOR } from './palette'
import { sessionProgress, taskProgress } from './session-progress'
import { isOpen } from './status'

/**
 * The open blocked decisions and blockers, review-later decisions, and the
 * agent's surprises (the observer's findings are left out); closed items too.
 */
function openCounts(status: SessionStatus | null): { blocked: number; review: number; surprises: number } {
  const open = (status?.items ?? []).filter(isOpen)
  const decisions = open.filter(item => item.kind === 'decision')

  return {
    blocked:
      decisions.filter(item => item.urgency === 'blocked').length + open.filter(item => item.kind === 'blocker').length,
    review: decisions.filter(item => item.urgency === 'review_later').length,
    surprises: open.filter(item => item.kind === 'surprise' && item.source !== 'observer').length,
  }
}

/**
 * `<n> blocked · <n> review · <session> · <effort> · <n> surprise`. The
 * session figure is `items 7/10` once the session has items or effort
 * tickets, followed by `tasks 2/5` while a task list exists; without items
 * it is the tasks' `<done>/<total> done`. The effort figure, `closed 1/13`,
 * shows only while the tracker counts the effort's tickets.
 */
export function bandText(status: SessionStatus | null): string {
  const { blocked, review, surprises } = openCounts(status)
  const session = sessionProgress(status)
  const tasks = taskProgress(status)
  const effort = effortProgress(status)
  const parts = [
    `${blocked} blocked`,
    `${review} review`,
    ...(session === null
      ? [`${tasks?.done ?? 0}/${tasks?.total ?? 0} done`]
      : [`items ${session.done}/${session.total}`, ...(tasks === null ? [] : [`tasks ${tasks.done}/${tasks.total}`])]),
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
        <Text wrap="truncate-end" color={COLOR.attention}>
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

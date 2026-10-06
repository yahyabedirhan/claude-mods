// The band above the prompt: counts only, for a terminal too narrow to place
// the pane. Whether the pane waits is read in register.tsx, where `$` is.

import type { ElementTable, RenderElement } from 'claude-code'

import type { SessionStatus } from '../types'
import { effortProgress } from './effort-progress'
import { COLOR } from './palette'
import { sessionProgress, taskProgress } from './session-progress'
import { isOpen } from './status'

/**
 * The open blocked decisions and blockers, the decisions before and after settling, and the
 * agent's surprises (the observer's findings are left out); closed items too.
 */
function openCounts(status: SessionStatus | null): { blocked: number; decide: number; followUp: number; surprises: number } {
  const open = (status?.items ?? []).filter(isOpen)
  const decisions = open.filter(item => item.kind === 'decision')

  return {
    blocked:
      decisions.filter(item => item.urgency === 'blocked').length + open.filter(item => item.kind === 'blocker').length,
    decide: decisions.filter(item => item.urgency === 'before_settling').length,
    followUp: decisions.filter(item => item.urgency === 'after_settling').length,
    surprises: open.filter(item => item.kind === 'surprise' && item.source !== 'observer').length,
  }
}

/**
 * `<n> blocked · <n> decide · <n> follow-up · <session> · <effort> · <n> surprise`,
 * the follow-up figure only when there is one. The session figure is `progress 7/10` once the session has items, followed by `tasks 2/5` while a task list exists; without items
 * it is the tasks' `<done>/<total> done`. The effort figure, `closed 1/13`,
 * shows only while the tracker counts the effort's tickets.
 */
export function bandText(status: SessionStatus | null): string {
  const { blocked, decide, followUp, surprises } = openCounts(status)
  const session = sessionProgress(status)
  const tasks = taskProgress(status)
  const effort = effortProgress(status)
  const parts = [
    `${blocked} blocked`,
    `${decide} decide`,
    ...(followUp === 0 ? [] : [`${followUp} follow-up`]),
    ...(session === null || session.total === 0
      ? [`${tasks?.done ?? 0}/${tasks?.total ?? 0} done`]
      : [`progress ${session.done}/${session.total}`, ...(tasks === null ? [] : [`tasks ${tasks.done}/${tasks.total}`])]),
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

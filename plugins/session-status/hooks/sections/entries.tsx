// The entries the list sections share with the full-list view, and the
// "+N more" that opens that view. A list section shows its newest few; the
// full-list view (see list-view.tsx) shows every entry.

import type { RenderNode } from 'claude-code'

import type { Decision, PaneView, SessionStatus, Surprise } from '../../types'
import { COLOR } from '../palette'
import { isOpen, openReviewLater } from '../status'
import type { Ui } from './section'

/** The surprises the agent recorded, open, oldest first. */
export function openSurprises(status: SessionStatus | null): Surprise[] {
  return (status?.items ?? []).filter(
    (item): item is Surprise => item.kind === 'surprise' && item.source !== 'observer' && isOpen(item),
  )
}

/** The observer agent's findings, open, oldest first. */
export function openObservations(status: SessionStatus | null): Surprise[] {
  return (status?.items ?? []).filter(
    (item): item is Surprise => item.kind === 'surprise' && item.source === 'observer' && isOpen(item),
  )
}

/** One surprise or observation: its id and what occurred, then what it changed. */
export function surpriseEntry(ui: Ui, surprise: Surprise, prefix: string): RenderNode {
  const { Box, Text } = ui

  return (
    <Box key={`${prefix}-${surprise.id}`} flexDirection="column">
      <Text>
        <Text color={COLOR.accent}>{surprise.id}</Text>
        {` · ${surprise.occurred}`}
      </Text>
      <Box paddingLeft={2}>
        <Text dimColor>Changed: {surprise.changed}</Text>
      </Box>
    </Box>
  )
}

/** One review-later decision: its id and question, then the default the agent goes on with. */
export function reviewLaterEntry(ui: Ui, decision: Decision, prefix: string, color: string = COLOR.accent): RenderNode {
  const { Box, Text } = ui

  return (
    <Box key={`${prefix}-${decision.id}`} flexDirection="column">
      <Text>
        <Text color={color}>{decision.id}</Text>
        {` · ${decision.question}`}
      </Text>
      <Box paddingLeft={2}>
        <Text dimColor>Default: {decision.default}</Text>
      </Box>
    </Box>
  )
}

/** `+N more`, pressable: it opens the list in full. Keyed `<key>-more`. */
export function moreButton(ui: Ui, key: string, more: number, open: () => void): RenderNode {
  const { Box, Button } = ui

  return (
    <Box key={`${key}-more`}>
      <Button key={`${key}-more`} label={`+${more} more`} plain dimColor onPress={open} />
    </Box>
  )
}

/** Each list the full-list view shows: its heading and its entries, newest first. */
export const FULL_LISTS: Record<Exclude<PaneView, 'main'>, (ui: Ui, status: SessionStatus | null) => { title: string; entries: RenderNode[] }> = {
  surprises: (ui, status) => {
    const all = openSurprises(status)

    return { title: `Surprises (${all.length})`, entries: [...all].reverse().map(s => surpriseEntry(ui, s, 'all')) }
  },
  observations: (ui, status) => {
    const all = openObservations(status)

    return { title: `Observations (${all.length})`, entries: [...all].reverse().map(s => surpriseEntry(ui, s, 'all')) }
  },
  'review-later': (ui, status) => {
    const all = status === null ? [] : openReviewLater(status)

    return { title: `Review later (${all.length})`, entries: [...all].reverse().map(d => reviewLaterEntry(ui, d, 'all')) }
  },
}

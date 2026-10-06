// The entries the list sections share with the full-list view, and the
// "+N more" that opens that view. A list section shows its newest few; the
// full-list view (see list-view.tsx) shows every entry.

import type { RenderNode } from 'claude-code'

import type { Decision, PaneView, SessionItem, SessionStatus, Surprise } from '../../types'
import { COLOR } from '../palette'
import { listedItems } from '../session-items'
import { isOpen, onEndList, openFollowUps, openToDecide } from '../status'
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

/** One decision the agent went on with a default for: its id and question, then that default. */
export function decisionEntry(ui: Ui, decision: Decision, prefix: string, color: string = COLOR.accent): RenderNode {
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

/** One session item: `○ I3 Write the parser` while open, `✓ I1 ...` once done. */
export function itemEntry(ui: Ui, item: SessionItem, prefix: string): RenderNode {
  const { Text } = ui

  return (
    <Text key={`${prefix}-${item.id}`}>
      <Text dimColor>{item.state === 'done' ? '✓ ' : '○ '}</Text>
      <Text color={COLOR.accent}>{item.id}</Text>
      {` ${item.title}`}
    </Text>
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

/** Each list the full-list view shows: its heading and its entries, newest first (items: open first). */
export const FULL_LISTS: Record<Exclude<PaneView, 'main'>, (ui: Ui, status: SessionStatus | null) => { title: string; entries: RenderNode[] }> = {
  surprises: (ui, status) => {
    const all = openSurprises(status)

    return { title: `Surprises (${all.length})`, entries: [...all].reverse().map(s => surpriseEntry(ui, s, 'all')) }
  },
  observations: (ui, status) => {
    const all = openObservations(status)

    return { title: `Observations (${all.length})`, entries: [...all].reverse().map(s => surpriseEntry(ui, s, 'all')) }
  },
  decide: (ui, status) => {
    const all = status === null ? [] : openToDecide(status)
    const asked = status === null ? [] : onEndList(status)

    return {
      title: `Decide before settling (${all.length})`,
      entries: [...all]
        .reverse()
        .map(d => decisionEntry(ui, d, 'all', asked.includes(d) ? COLOR.attention : COLOR.accent)),
    }
  },
  items: (ui, status) => {
    const all = status === null ? [] : listedItems(status)
    const done = all.filter(item => item.state === 'done').length

    return { title: `Session items (${done}/${all.length} done)`, entries: all.map(item => itemEntry(ui, item, 'all')) }
  },
  'follow-up': (ui, status) => {
    const all = status === null ? [] : openFollowUps(status)

    return { title: `Follow-up after settling (${all.length})`, entries: [...all].reverse().map(d => decisionEntry(ui, d, 'all')) }
  },
}

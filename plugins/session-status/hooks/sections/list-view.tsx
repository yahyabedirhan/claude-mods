import type { RenderNode } from 'claude-code'

import { FULL_LISTS } from './entries'
import type { SectionContext } from './section'

/**
 * One list in full, after the person pressed its "+N more": a Back button,
 * the list's heading, then every open entry, newest first.
 */
export function drawListView(context: SectionContext): RenderNode | null {
  const { ui, status, view, show, surface, now } = context
  const { Box, Button, Text } = ui
  if (view === 'main') {
    return null
  }
  const { title, entries } = FULL_LISTS[view](ui, status, surface, now)

  return (
    <Box key="list-view" flexDirection="column" gap={1}>
      <Box key="list-view-back">
        <Button key="back" label="← Back" hotkey="b" onPress={() => show('main')} />
      </Box>
      <Box key="list-view-entries" flexDirection="column">
        <Text bold>{title}</Text>
        {entries.length === 0 ? <Text dimColor>Nothing open.</Text> : entries}
      </Box>
    </Box>
  )
}

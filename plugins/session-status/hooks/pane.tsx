// The status pane's tree: each section in order. Opening, closing and
// reading the status live in register.tsx, where `$` is.

import type { RenderElement } from 'claude-code'

import { SECTIONS } from './sections'
import type { SectionContext } from './sections/section'

/** How often an open pane draws again, so the ages it shows stay current. */
export const AGE_TICK_MS = 15_000

/** The pane's tree: every section in order, the ones with nothing left out. */
export function drawPane(context: SectionContext): RenderElement {
  const { Box } = context.ui
  const drawn = SECTIONS.map(section => section(context)).filter(node => node !== null)

  return (
    <Box flexDirection="column" gap={1}>
      {drawn}
    </Box>
  )
}

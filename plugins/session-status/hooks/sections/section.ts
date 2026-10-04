// What every pane section is: a pure function from the status to a tree, or
// to null when it has nothing to show. Sections never call `$`: whatever a
// section draws from is in the context register.tsx builds.

import type { ElementTable, RenderNode } from 'claude-code'

import type { SessionStatus } from '../../types'

/** The elements every surface draws: a section uses no others. */
export type Ui = Pick<ElementTable, 'Box' | 'Text' | 'Link' | 'Button' | 'Code' | 'Markdown'>

export type SectionContext = {
  ui: Ui
  /** The session's status; null before its first change. */
  status: SessionStatus | null
  /** The clock reading this drawing is made at. */
  now: number
  /** Cells across the pane's body. */
  columns: number
}

/**
 * One section of the pane. It returns its tree in a `Box` keyed by the
 * section's name, or null to draw nothing.
 */
export type Section = (context: SectionContext) => RenderNode | null

/**
 * The newest `limit` of a list kept oldest first, newest first, and how many
 * older ones it leaves out: a section draws those as "+N more".
 */
export function newest<T>(items: readonly T[], limit: number): { shown: T[]; more: number } {
  const shown = items.slice(-limit).reverse()

  return { shown, more: items.length - shown.length }
}

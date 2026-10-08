// What every pane section is: a pure function from the status to a tree, or
// to null when it has nothing to show. Sections never call `$`: whatever a
// section draws from is in the context register.tsx builds.

import type { ElementTable, RenderNode, RenderSurface } from 'claude-code'

import type { Decision, PaneView, SessionStatus, Surprise } from '../../types'

/** The elements every surface draws: a section uses no others. */
export type Ui = Pick<ElementTable, 'Box' | 'Text' | 'Link' | 'Button' | 'Code' | 'Markdown'>

/** What a press on a decision's quick-reply buttons or a surprise's action buttons does. */
export type Replies = {
  /** Resolves the decision and sends `<id>: <option>` as the user's own words. */
  answer: (decision: Decision, option: string) => Promise<void>
  /** Marks the decision or surprise as in discussion and asks the agent in the chat to discuss it. */
  discuss: (item: Decision | Surprise) => Promise<void>
  /** Dismisses the surprise and sends nothing. */
  dismiss: (surprise: Surprise) => Promise<void>
  /** Dismisses the surprise, acted on, and sends `File an issue for <id>: <occurred>` as the user's own words. */
  fileIssue: (surprise: Surprise) => Promise<void>
  /** Dismisses the surprise, acted on, and sends `<id>: <action>` as the user's own words. */
  act: (surprise: Surprise, action: string) => Promise<void>
}

export type SectionContext = {
  ui: Ui
  /** The session's status; null before its first change. */
  status: SessionStatus | null
  /** The clock reading this drawing is made at. */
  now: number
  /** Cells across the pane's body. */
  columns: number
  /** What the pane shows: every section, or one list in full. */
  view: PaneView
  /** Switches the pane to another view: a "+N more" opens its list, Back returns to `main`. */
  show: (view: PaneView) => void
  /** Where the pane is drawn: the terminal draws Nerd Font glyphs, the others plain text. */
  surface: RenderSurface
  /** Puts `text` on the clipboard of the surface a press came from. */
  copy: (text: string, surface: RenderSurface) => void
  /** Answers, discusses or dismisses a decision or a surprise from its buttons. */
  replies: Replies
}

/**
 * One section of the pane. It returns its tree in a `Box` keyed by the
 * section's name, or null to draw nothing.
 */
export type Section = (context: SectionContext) => RenderNode | null


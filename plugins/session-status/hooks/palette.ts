// The colours the pane and the band draw with, by what they mean. Each is a
// key of Claude Code's theme, so it reads in light and dark themes alike, on
// the terminal and on the desktop. Headings are bold and labels dim; colour
// marks only these.

export const COLOR = {
  /** What needs the person: blocked decisions, blockers, the decisions asked before settling, a blocked band. */
  attention: 'warning',
  /** A session at work: the In progress state. The progress bars stay neutral. */
  done: 'success',
  /** What names a thing: item ids and the tickets being built. */
  accent: 'suggestion',
  /** A session wrapping up: the Settling state. */
  closing: 'planMode',
  /** An open pull request or issue in the Links section. */
  open: 'success',
  /** A merged pull request or a closed issue: the theme's purple for a merge. */
  merged: 'merged',
  /** A pull request closed without merging. */
  closedUnmerged: 'error',
} as const

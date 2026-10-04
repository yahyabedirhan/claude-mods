// The colours the pane and the band draw with, by what they mean. Each is a
// key of Claude Code's theme, so it reads in light and dark themes alike, on
// the terminal and on the desktop. Headings are bold and labels dim; colour
// marks only these.

export const COLOR = {
  /** What needs the person: blocked decisions, the end-of-work list, a blocked band. */
  attention: 'warning',
  /** Work done: the progress bars. */
  done: 'success',
  /** What names a thing: item ids and the tickets being built. */
  accent: 'suggestion',
} as const

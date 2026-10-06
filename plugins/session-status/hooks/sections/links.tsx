import type { RenderSurface } from 'claude-code'

import type { SessionLink } from '../../types'
import { linkLabel } from '../links'
import { newest } from '../lists'
import { COLOR } from '../palette'
import type { Section } from './section'

/** How many pages the section names; the older ones show as "+N more". */
const LINKS_SHOWN = 5

/** Material Design's pull request and merge glyphs, from a Nerd Font: the terminal draws them. */
const PR_GLYPH = '\u{F04C2}'
const MERGED_GLYPH = '\u{F062D}'

/** A pull request's mark where no Nerd Font draws: the desktop and the others. */
const PR_PLAIN = '⇄'

/**
 * Each page's mark and colour by its kind and state: an open page green, a
 * merged pull request or a closed issue purple, a pull request closed
 * without merging red.
 */
function mark(link: SessionLink, surface: RenderSurface): { glyph: string; color: string } {
  const state = link.state ?? 'open'
  if (link.kind === 'issue') {
    return state === 'open' ? { glyph: '◎', color: COLOR.open } : { glyph: '⊙', color: COLOR.merged }
  }
  const pr = surface === 'terminal' ? PR_GLYPH : PR_PLAIN
  if (state === 'merged') {
    return { glyph: surface === 'terminal' ? MERGED_GLYPH : PR_PLAIN, color: COLOR.merged }
  }

  return { glyph: pr, color: state === 'closed' ? COLOR.closedUnmerged : COLOR.open }
}

/**
 * The pull requests and issues attached to the session, in every
 * repository, newest first: `󰓂 claude-mods#14 · 󰘭 skills#88 · ◎
 * workstation#7`. The session created them, or the agent linked them. The
 * mark gives the kind and state, the `<repo>#<n>` where it is, and each is a
 * link to its page. Drawn only when there is one.
 */
export const linksSection: Section = ({ ui, status, surface }) => {
  const { Box, Link, Text } = ui
  const { shown, more } = newest(status?.links ?? [], LINKS_SHOWN)
  if (shown.length === 0) {
    return null
  }

  return (
    <Box key="links" flexDirection="column">
      <Text bold>Links</Text>
      <Text>
        {shown.map((link, index) => (
          <Text key={link.url}>
            {index === 0 ? '' : ' · '}
            <Text color={mark(link, surface).color}>{`${mark(link, surface).glyph} `}</Text>
            <Link href={link.url} label={linkLabel(link)} />
          </Text>
        ))}
        {more > 0 ? <Text dimColor>{` · +${more} more`}</Text> : null}
      </Text>
    </Box>
  )
}

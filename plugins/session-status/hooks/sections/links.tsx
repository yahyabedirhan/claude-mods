import { newest } from '../lists'
import { linkEntry, moreButton } from './entries'
import type { Section } from './section'

/** How many pages the section names; the older ones show as "+N more". */
const LINKS_SHOWN = 5

/**
 * The pull requests and issues attached to the session, in every
 * repository, newest first: `󰓂 claude-mods#14 · 󰘭 skills#88 · ◎
 * workstation#7`. The session created them, or the agent linked them. The
 * mark gives the kind and state, the `<repo>#<n>` where it is, and each is a
 * link to its page; "+N more" opens them all. Drawn only when there is one.
 */
export const linksSection: Section = ({ ui, status, surface, show }) => {
  const { Box, Text } = ui
  const { shown, more } = newest(status?.links ?? [], LINKS_SHOWN)
  if (shown.length === 0) {
    return null
  }

  return (
    <Box key="links" flexDirection="column">
      <Text bold>Links</Text>
      {/* One box per link, so a narrow pane wraps between links, never between a mark and its label. */}
      <Box key="links-row" flexDirection="row" flexWrap="wrap">
        {shown.map((link, index) => (
          <Box key={link.url}>
            <Text>
              {linkEntry(ui, link, surface)}
              {index === shown.length - 1 ? '' : ' · '}
            </Text>
          </Box>
        ))}
      </Box>
      {more > 0 ? moreButton(ui, 'links', more, () => show('links')) : null}
    </Box>
  )
}

import { linkLabel } from '../links'
import { newest } from '../lists'
import type { Section } from './section'

/** How many pages the section names; the older ones show as "+N more". */
const LINKS_SHOWN = 5

/**
 * The pull requests and issues attached to the session, in every
 * repository, newest first: `PR claude-mods#14 · PR skills#88 · issue
 * workstation#7`. The session created them, or the agent linked them.
 * Each is a link to its page; its `<repo>#<n>` says where it is. Drawn only
 * when there is one.
 */
export const linksSection: Section = ({ ui, status }) => {
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
            <Text dimColor>{link.kind === 'pr' ? 'PR ' : 'issue '}</Text>
            <Link href={link.url} label={linkLabel(link)} />
          </Text>
        ))}
        {more > 0 ? <Text dimColor>{` · +${more} more`}</Text> : null}
      </Text>
    </Box>
  )
}

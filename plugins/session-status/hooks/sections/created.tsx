import { linkLabel } from '../links'
import { newest } from '../lists'
import type { Section } from './section'

/** How many pages the section names; the older ones show as "+N more". */
const CREATED_SHOWN = 5

/**
 * The pull requests and issues the session created, in every repository,
 * newest first: `PR claude-mods#14 · PR skills#88 · issue workstation#7`.
 * Each is a link to its page; its `<repo>#<n>` says where it is. Drawn only
 * when there is one.
 */
export const createdSection: Section = ({ ui, status }) => {
  const { Box, Link, Text } = ui
  const { shown, more } = newest(status?.links ?? [], CREATED_SHOWN)
  if (shown.length === 0) {
    return null
  }

  return (
    <Box key="created" flexDirection="column">
      <Text bold>Created</Text>
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

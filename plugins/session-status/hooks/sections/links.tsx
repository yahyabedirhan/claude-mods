import { linkLabel } from '../links'
import type { Section } from './section'

/** The pull requests and issues the session created, each a link to its page. */
export const linksSection: Section = ({ ui, status }) => {
  const { Box, Link, Text } = ui
  const links = status?.links ?? []
  if (links.length === 0) {
    return null
  }

  return (
    <Box key="links" flexDirection="column">
      <Text bold>Pull requests and issues</Text>
      {links.map(link => (
        <Text key={link.url}>
          {link.kind === 'pr' ? 'PR ' : 'Issue '}
          <Link href={link.url} label={linkLabel(link)} />
        </Text>
      ))}
    </Box>
  )
}

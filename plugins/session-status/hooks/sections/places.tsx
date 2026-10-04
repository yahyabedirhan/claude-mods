import { linkLabel } from '../links'
import { shownPlaces } from '../places'
import type { ShownPlace } from '../places'
import type { Section, Ui } from './section'

/**
 * The blast radius: the other repositories the session changed, one line
 * each, `skills  PR skills#88 · 3 files · 2 commands`, a part left out when
 * it is zero. The repository's name links to its page, each pull request and
 * issue to its own. The heading counts them when there are two or more.
 * Drawn only when there is one.
 */
export const placesSection: Section = ({ ui, status }) => {
  const { Box, Text } = ui
  const places = status === null ? [] : shownPlaces(status)
  if (places.length === 0) {
    return null
  }

  return (
    <Box key="places" flexDirection="column">
      <Text bold>{places.length === 1 ? 'Places' : `Places (${places.length})`}</Text>
      {places.map(place => placeLine(ui, place))}
    </Box>
  )
}

function placeLine(ui: Ui, place: ShownPlace) {
  const { Link, Text } = ui
  const counts = [
    ...(place.files === 0 ? [] : [`${place.files} ${place.files === 1 ? 'file' : 'files'}`]),
    ...(place.commands === 0 ? [] : [`${place.commands} ${place.commands === 1 ? 'command' : 'commands'}`]),
  ]

  return (
    <Text key={`place-${place.name}-${place.url ?? ''}`}>
      {place.url === null ? place.name : <Link href={place.url} label={place.name} />}
      {'  '}
      {place.links.map((link, index) => (
        <Text key={link.url}>
          {`${index === 0 ? '' : ' · '}${link.kind === 'pr' ? 'PR' : 'issue'} `}
          <Link href={link.url} label={linkLabel(link)} />
        </Text>
      ))}
      {`${place.links.length > 0 && counts.length > 0 ? ' · ' : ''}${counts.join(' · ')}`}
    </Text>
  )
}

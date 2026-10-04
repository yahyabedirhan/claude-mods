import { shownPlaces } from '../places'
import type { ShownPlace } from '../places'
import type { Section, Ui } from './section'

/**
 * The blast radius: the other repositories the session changed files in or
 * ran changing commands in, one line each, `skills  3 files · 2 commands`, a
 * part left out when it is zero. The repository's name links to its page;
 * the pull requests and issues made there are the Created section's. With
 * two or more the heading `Places (N)` leads them; one place is its line
 * alone. Drawn only when there is one.
 */
export const placesSection: Section = ({ ui, status }) => {
  const { Box, Text } = ui
  const places = status === null ? [] : shownPlaces(status)
  if (places.length === 0) {
    return null
  }

  return (
    <Box key="places" flexDirection="column">
      {places.length > 1 && <Text bold>{`Places (${places.length})`}</Text>}
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
      <Text dimColor>{`  ${counts.join(' · ')}`}</Text>
    </Text>
  )
}

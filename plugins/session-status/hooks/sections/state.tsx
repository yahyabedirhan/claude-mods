import { HEADLINE_TEXT, headline } from '../activity'
import type { Headline } from '../activity'
import { COLOR } from '../palette'
import type { Section } from './section'

/** The colour each state draws in; Settled is dim. */
const STATE_COLOR: Record<Headline, string | null> = {
  blocked: COLOR.attention,
  working: COLOR.done,
  waiting: COLOR.accent,
  settled: null,
}

/**
 * The session's state in one word, at the top of the pane: `● Blocked`,
 * `● In progress`, `● Waiting for reply` or `● Settled`. Drawn once the
 * session has a state.
 */
export const stateSection: Section = ({ ui, status }) => {
  const { Box, Text } = ui
  const state = status === null ? null : headline(status)
  if (state === null) {
    return null
  }
  const color = STATE_COLOR[state]

  return (
    <Box key="state" flexDirection="column">
      {color === null ? (
        <Text bold dimColor>{`● ${HEADLINE_TEXT[state]}`}</Text>
      ) : (
        <Text bold color={color}>{`● ${HEADLINE_TEXT[state]}`}</Text>
      )}
    </Box>
  )
}

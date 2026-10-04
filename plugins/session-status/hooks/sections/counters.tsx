import type { Section } from './section'

/** Running and finished subagents; nothing before the first subagent. */
export const countersSection: Section = ({ ui, status }) => {
  const { Box, Text } = ui
  const running = status?.subagents.running.length ?? 0
  const finished = status?.subagents.finished.length ?? 0
  if (running === 0 && finished === 0) {
    return null
  }

  return (
    <Box key="counters" flexDirection="column">
      <Text bold>Subagents</Text>
      <Text>{`${running} running · ${finished} finished`}</Text>
    </Box>
  )
}

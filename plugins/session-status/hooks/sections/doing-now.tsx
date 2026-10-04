import type { Section } from './section'

export const doingNowSection: Section = ({ ui, status }) => {
  const { Box, Text } = ui
  const doing = status?.doingNow ?? null

  return (
    <Box key="doing-now" flexDirection="column">
      <Text bold>Doing now</Text>
      {doing === null ? (
        <Text dimColor>Nothing yet.</Text>
      ) : (
        <Text wrap="truncate-end">
          {doing.agentId === undefined ? '' : 'subagent · '}
          {doing.text === '' ? doing.tool : `${doing.tool}: ${doing.text}`}
        </Text>
      )}
    </Box>
  )
}

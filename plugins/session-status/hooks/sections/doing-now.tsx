import { currentTask } from '../tasks'
import type { Section } from './section'

/** What the session does now: the task that runs, else the last tool call. */
export const doingNowSection: Section = ({ ui, status }) => {
  const { Box, Text } = ui
  const task = currentTask(status?.tasks ?? [])
  const doing = status?.doingNow ?? null

  return (
    <Box key="doing-now" flexDirection="column">
      <Text bold>Doing now</Text>
      {task !== null ? (
        <Text wrap="truncate-end">{`Task: ${task.activeForm ?? task.subject}`}</Text>
      ) : doing === null ? (
        <Text dimColor>Nothing yet.</Text>
      ) : (
        <Text wrap="truncate-end">
          {doing.agentId === undefined ? null : <Text dimColor>subagent · </Text>}
          {doing.text === '' ? doing.tool : `${doing.tool}: ${doing.text}`}
        </Text>
      )}
    </Box>
  )
}

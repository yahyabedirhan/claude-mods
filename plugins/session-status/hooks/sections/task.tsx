import { first } from '../lists'
import { taskProgress } from '../session-progress'
import { listedTasks } from '../tasks'
import { barCells, progressBar } from './bar'
import { moreButton, taskEntry } from './entries'
import type { Section } from './section'

/** How many tasks the section lists; the rest open with "+N more". */
const TASKS_SHOWN = 2

/**
 * Claude Code's task list, shaped like the Effort section: the tasks
 * completed of all, then two tasks (running and pending ones first) and a
 * "+N more" that opens them all. Drawn once the session has a task.
 */
export const taskSection: Section = ({ ui, status, columns, show }) => {
  const { Box, Text } = ui
  const progress = taskProgress(status)
  if (progress === null || progress.total === 0) {
    return null
  }
  const { shown, more } = first(listedTasks(status), TASKS_SHOWN)

  return (
    <Box key="task" flexDirection="column">
      <Text bold>Task</Text>
      <Text>
        <Text dimColor>Done </Text>
        {`${progress.done}/${progress.total} ${progressBar(progress.done, progress.total, barCells(columns))}`}
      </Text>
      {shown.map(task => taskEntry(ui, task, 'task'))}
      {more > 0 ? moreButton(ui, 'tasks', more, () => show('tasks')) : null}
    </Box>
  )
}

// The session's task list as data: the pure rules that mirror it from the
// Task events and the task tools' results, and the progress it gives.
// There is no task noun on `$`; register.tsx feeds these from the events.

import type { Progress, SessionStatus, Task } from '../types'

type Status = Task['status']

/** A task the task tools or the TaskCreated event made: added once, by id. */
export function taskCreated(
  status: SessionStatus,
  task: { id: string; subject: string; activeForm?: string },
  at: number,
): SessionStatus {
  if (status.tasks.some(known => known.id === task.id)) {
    return status
  }
  const created: Task = { id: task.id, subject: task.subject, status: 'pending', at }
  if (task.activeForm !== undefined && task.activeForm !== '') {
    created.activeForm = task.activeForm
  }

  return withTasks(status, [...status.tasks, created])
}

/**
 * A change to one task: a new status (`deleted` removes the task), subject
 * or active form. A task not known yet is added when the change names its
 * subject, since its creation may have come before the mod loaded.
 */
export function taskUpdated(
  status: SessionStatus,
  change: {
    id: string
    status?: Status | 'deleted'
    subject?: string
    activeForm?: string
  },
  at: number,
): SessionStatus {
  if (change.status === 'deleted') {
    return withTasks(
      status,
      status.tasks.filter(task => task.id !== change.id),
    )
  }
  const known = status.tasks.find(task => task.id === change.id)
  if (known === undefined) {
    if (change.subject === undefined) {
      return status
    }
    const created = taskCreated(status, { id: change.id, subject: change.subject }, at)

    return taskUpdated(created, change, at)
  }
  const updated: Task = { ...known, at }
  if (change.status !== undefined) {
    updated.status = change.status
  }
  if (change.subject !== undefined && change.subject !== '') {
    updated.subject = change.subject
  }
  if (change.activeForm !== undefined && change.activeForm !== '') {
    updated.activeForm = change.activeForm
  }

  return withTasks(
    status,
    status.tasks.map(task => (task.id === change.id ? updated : task)),
  )
}

/**
 * A TodoWrite list replaces the loop's earlier list whole. Each item is keyed
 * by its loop and place, since TodoWrite items carry no id.
 */
export function todosWritten(
  status: SessionStatus,
  todos: readonly { content: string; status: Status; activeForm?: string }[],
  agentId: string | undefined,
  at: number,
): SessionStatus {
  const prefix = `todo:${agentId ?? 'main'}:`
  const kept = status.tasks.filter(task => !task.id.startsWith(prefix))
  const written = todos.map((todo, index): Task => {
    const task: Task = { id: `${prefix}${index}`, subject: todo.content, status: todo.status, at }
    if (todo.activeForm !== undefined && todo.activeForm !== '') {
      task.activeForm = todo.activeForm
    }

    return task
  })

  return withTasks(status, [...kept, ...written])
}

/**
 * Progress from a task list: tasks done, the total, and the name of the task
 * that runs now; null for an empty list.
 */
export function progressOf(tasks: readonly Task[]): Progress | null {
  if (tasks.length === 0) {
    return null
  }

  return {
    done: tasks.filter(task => task.status === 'completed').length,
    total: tasks.length,
    current: currentTask(tasks)?.subject ?? null,
  }
}

/** The task that runs now: of those in progress, the one that changed last. */
export function currentTask(tasks: readonly Task[]): Task | null {
  return tasks
    .filter(task => task.status === 'in_progress')
    .reduce<Task | null>((last, task) => (last === null || task.at >= last.at ? task : last), null)
}

function withTasks(status: SessionStatus, tasks: Task[]): SessionStatus {
  return { ...status, tasks, progress: progressOf(tasks) }
}

/**
 * The task list as the Task section lists it: the running tasks first, then
 * the pending ones, then the completed ones, each in the order it was made.
 */
export function listedTasks(status: SessionStatus | null): Task[] {
  const tasks = status?.tasks ?? []
  const of = (state: Status) => tasks.filter(task => task.status === state)

  return [...of('in_progress'), ...of('pending'), ...of('completed')]
}

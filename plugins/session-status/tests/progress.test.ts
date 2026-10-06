import { expect, test } from 'claude-code/testing'
import type { Engine } from 'claude-code/testing'

import { SESSION_ID, SURFACES, sectionText, start, subagentToolCall, world } from './world'
import type { World } from './world'

/** Answers TaskCreate as the tool does: the new task's id and subject, ids counting up. */
function taskTools(w: World) {
  let next = 0
  w.answer('TaskCreate', e => ({
    task: { id: String(++next), subject: (e as unknown as { subject: string }).subject },
  }))
  w.answer('TaskUpdate', e => {
    const { taskId, status } = e as unknown as { taskId: string; status?: string }

    return {
      success: true,
      taskId,
      updatedFields: status === undefined ? [] : ['status'],
      ...(status === undefined ? {} : { statusChange: { from: 'pending', to: status } }),
    }
  })
}

function createTask($: Engine, subject: string, activeForm?: string) {
  return $.tool.call({
    tool: 'TaskCreate',
    subject,
    description: subject,
    ...(activeForm === undefined ? {} : { activeForm }),
  })
}

function setStatus($: Engine, taskId: string, status: 'in_progress' | 'completed' | 'deleted') {
  return $.tool.call({ tool: 'TaskUpdate', taskId, status })
}

test('the Session section shows tasks done, the total and a bar', async ($, on) => {
  const w = world(on)
  taskTools(w)
  await start($)
  await createTask($, 'Write the parser')
  await createTask($, 'Write the tests')
  await createTask($, 'Wire the hooks', 'Wiring the hooks')
  await setStatus($, '1', 'completed')
  await setStatus($, '3', 'in_progress')

  for (const surface of SURFACES) {
    const text = (await sectionText($, surface, 'session')) ?? ''
    expect(text).toContain('Tasks 1/3')
    expect(text).toMatch(/█+░+/)
  }
})

test('the bar fills as tasks finish', async ($, on) => {
  const w = world(on)
  taskTools(w)
  await start($)
  await createTask($, 'One')
  await createTask($, 'Two')
  await setStatus($, '1', 'completed')
  await setStatus($, '2', 'completed')

  for (const surface of SURFACES) {
    const text = (await sectionText($, surface, 'session')) ?? ''
    expect(text).toContain('Tasks 2/2')
    expect(text).not.toContain('░')
  }
})

test('before the first task the Session section shows only the session id', async ($, on) => {
  world(on)
  await start($)
  await $.tool.call({ tool: 'Bash', command: 'ls' })

  for (const surface of SURFACES) {
    expect(await sectionText($, surface, 'session')).toMatch(/^Session\s*ID\s+session-a$/)
  }
})

test('a deleted task leaves the total', async ($, on) => {
  const w = world(on)
  taskTools(w)
  await start($)
  await createTask($, 'Keep')
  await createTask($, 'Drop')
  await setStatus($, '2', 'deleted')

  expect(w.saved[SESSION_ID]).toMatchObject({ progress: { done: 0, total: 1 } })
})

test('the TaskCreated and TaskCompleted events count tasks', async ($, on) => {
  const { saved } = world(on)
  await start($)
  await $.classic.TaskCreated({ task_id: '7', task_subject: 'Ship the pane' })
  await $.classic.TaskCreated({ task_id: '8', task_subject: 'Review the pane' })
  await $.classic.TaskCompleted({ task_id: '7', task_subject: 'Ship the pane' })

  expect(saved[SESSION_ID]).toMatchObject({
    progress: { done: 1, total: 2, current: null },
  })
})

test('a task the tool and the event both report counts once', async ($, on) => {
  const w = world(on)
  taskTools(w)
  await start($)
  await createTask($, 'Only once')
  await $.classic.TaskCreated({ task_id: '1', task_subject: 'Only once' })

  expect(w.saved[SESSION_ID]).toMatchObject({ progress: { done: 0, total: 1 } })
})

test('a TodoWrite list gives the progress and the current task', async ($, on) => {
  const w = world(on)
  const todos = [
    { content: 'Read the spec', status: 'completed', activeForm: 'Reading the spec' },
    { content: 'Write the code', status: 'in_progress', activeForm: 'Writing the code' },
    { content: 'Open the PR', status: 'pending', activeForm: 'Opening the PR' },
  ] as const
  w.answer('TodoWrite', () => ({ oldTodos: [], newTodos: todos }))
  await start($)
  await $.tool.call({ tool: 'TodoWrite', todos: [...todos] })

  expect(w.saved[SESSION_ID]).toMatchObject({
    progress: { done: 1, total: 3, current: 'Write the code' },
  })
})

test('a new TodoWrite list replaces the earlier one', async ($, on) => {
  const w = world(on)
  let list: { content: string; status: 'pending' | 'completed'; activeForm: string }[] = [
    { content: 'A', status: 'pending', activeForm: 'Doing A' },
    { content: 'B', status: 'pending', activeForm: 'Doing B' },
  ]
  w.answer('TodoWrite', () => ({ oldTodos: [], newTodos: list }))
  await start($)
  await $.tool.call({ tool: 'TodoWrite', todos: list })
  list = [{ content: 'A', status: 'completed', activeForm: 'Doing A' }]
  await $.tool.call({ tool: 'TodoWrite', todos: list })

  expect(w.saved[SESSION_ID]).toMatchObject({ progress: { done: 1, total: 1 } })
})

test("a subagent's tasks count in the progress", async ($, on) => {
  const w = world(on)
  taskTools(w)
  await start($)
  await createTask($, 'Main task')
  await subagentToolCall($, 'agent-1', {
    tool: 'TaskCreate',
    subject: 'Subagent task',
    description: 'Subagent task',
  })
  await subagentToolCall($, 'agent-1', { tool: 'TaskUpdate', taskId: '2', status: 'completed' })

  expect(w.saved[SESSION_ID]).toMatchObject({ progress: { done: 1, total: 2 } })
})

test('doing now shows the current task', async ($, on) => {
  const w = world(on)
  taskTools(w)
  await start($)
  await createTask($, 'Wire the hooks', 'Wiring the hooks')
  await setStatus($, '1', 'in_progress')
  await $.tool.call({ tool: 'Bash', command: 'npm test', description: 'Run the tests' })

  for (const surface of SURFACES) {
    const text = (await sectionText($, surface, 'doing-now')) ?? ''
    expect(text).toContain('Wiring the hooks')
    expect(text).not.toContain('Run the tests')
  }
})

test('doing now falls back to the last tool call when no task runs', async ($, on) => {
  const w = world(on)
  taskTools(w)
  await start($)
  await createTask($, 'Wire the hooks', 'Wiring the hooks')
  await setStatus($, '1', 'in_progress')
  await setStatus($, '1', 'completed')
  await $.tool.call({ tool: 'Bash', command: 'npm test', description: 'Run the tests' })

  for (const surface of SURFACES) {
    const text = (await sectionText($, surface, 'doing-now')) ?? ''
    expect(text).toContain('Run the tests')
    expect(text).not.toContain('Wiring the hooks')
  }
})

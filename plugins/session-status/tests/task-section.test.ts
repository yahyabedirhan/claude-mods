// The Task section: Claude Code's task list, shaped like the Effort section
// and apart from the Session bar, which counts only session items.

import { expect, test } from 'claude-code/testing'
import type { Engine } from 'claude-code/testing'

import { SURFACES, callStatusTool, mountPane, sectionText, start, world } from './world'
import type { World } from './world'

/** Answers TaskCreate and TaskUpdate as the task tools do. */
function taskTools(w: World) {
  let next = 0
  w.answer('TaskCreate', e => ({ task: { id: String(++next), subject: (e as unknown as { subject: string }).subject } }))
  w.answer('TaskUpdate', e => {
    const { taskId, status } = e as unknown as { taskId: string; status?: string }

    return { success: true, taskId, updatedFields: ['status'], statusChange: { from: 'pending', to: status } }
  })
}

async function tasks($: Engine, subjects: string[]) {
  for (const subject of subjects) {
    await $.tool.call({ tool: 'TaskCreate', subject, description: subject })
  }
}

function setStatus($: Engine, taskId: string, status: 'in_progress' | 'completed') {
  return $.tool.call({ tool: 'TaskUpdate', taskId, status })
}

test('the Task section shows tasks done of all, running and pending tasks first, then "+N more"', async ($, on) => {
  const w = world(on)
  taskTools(w)
  await start($)
  await tasks($, ['Write tests', 'Update README', 'Ship it', 'Tell the team'])
  await setStatus($, '1', 'completed')
  await setStatus($, '3', 'in_progress')

  for (const surface of SURFACES) {
    const text = (await sectionText($, surface, 'task')) ?? ''
    expect(text).toMatch(/^TaskDone 1\/4 /)
    expect(text).toContain('◐ Ship it')
    expect(text).toContain('○ Update README')
    expect(text.indexOf('Ship it')).toBeLessThan(text.indexOf('Update README'))
    expect(text).not.toContain('Write tests')
    expect(text).toContain('+2 more')
  }
})

test('"+N more" opens every task, completed ones last, and Back returns', async ($, on) => {
  const w = world(on)
  taskTools(w)
  await start($)
  await tasks($, ['Write tests', 'Update README', 'Ship it'])
  await setStatus($, '1', 'completed')

  const ui = await mountPane($, 'terminal')
  await ui.press({ key: 'tasks-more' })
  const list = (await ui.find({ key: 'list-view' }))?.text ?? ''
  expect(list).toContain('Tasks (1/3 done)')
  expect(list.indexOf('○ Update README')).toBeLessThan(list.indexOf('✓ Write tests'))
  await ui.press({ key: 'back' })
  expect(await ui.find({ key: 'list-view' })).toBeUndefined()
  await ui.unmount()
})

test('tasks never count in the Session bar, and items never in the Task bar', async ($, on) => {
  const w = world(on)
  taskTools(w)
  await start($)
  await tasks($, ['Write tests', 'Ship it'])
  await setStatus($, '1', 'completed')
  await callStatusTool($, { action: 'item', state: 'added', title: 'Open the pull request' })

  const session = (await sectionText($, 'terminal', 'session')) ?? ''
  expect(session).toMatch(/Progress 0\/1/)
  expect(session).not.toContain('Tasks')
  expect(await sectionText($, 'terminal', 'task')).toMatch(/^TaskDone 1\/2 /)
})

test('without a task the Task section stays out', async ($, on) => {
  world(on)
  await start($)
  await callStatusTool($, { action: 'item', state: 'added', title: 'Open the pull request' })

  expect(await sectionText($, 'terminal', 'task')).toBeUndefined()
})

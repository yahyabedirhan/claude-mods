import { expect, test } from 'claude-code/testing'
import type { Engine } from 'claude-code/testing'

import { BASE_SECTIONS, STATUS_TOOL, start, world } from './world'

const SECTION_ID = 'session-status:status'

async function compose($: Engine) {
  const { sections } = await $.prompt.compose({
    model: 'claude-test',
    promptModel: 'claude-test',
    surfaces: ['terminal'],
    tools: ['Bash', STATUS_TOOL],
    outputStyle: null,
    traits: [],
  })

  return { sections, section: sections.find(s => s.id === SECTION_ID) }
}

test('the mod adds its section last, after the engine sections, on the session side', async ($, on) => {
  world(on)
  await start($)

  const { sections, section } = await compose($)

  expect(sections.slice(0, BASE_SECTIONS.length)).toEqual(BASE_SECTIONS)
  expect(sections.at(-1)?.id).toBe(SECTION_ID)
  expect(section?.scope).toBe('session')
})

test('the section tells the agent to record decisions and surprises with the status tool', async ($, on) => {
  world(on)
  await start($)

  const text = (await compose($)).section?.text ?? ''

  expect(text).toContain(STATUS_TOOL)
  expect(text).toMatch(/record .*decision/i)
  expect(text).toMatch(/surprise/i)
})

test('the section tells the agent to choose a safe default, continue, and stop only when none exists', async ($, on) => {
  world(on)
  await start($)

  const text = (await compose($)).section?.text ?? ''

  expect(text).toMatch(/safe default/i)
  expect(text).toMatch(/continue/i)
  expect(text).toMatch(/stop only when no safe default exists/i)
})

test('the section gives a subagent the fallback: decisions and surprises go in its final report', async ($, on) => {
  world(on)
  await start($)

  const text = (await compose($)).section?.text ?? ''

  expect(text).toMatch(/cannot call/i)
  expect(text).toMatch(/final report/i)
  expect(text).toMatch(/orchestrator records them/i)
})

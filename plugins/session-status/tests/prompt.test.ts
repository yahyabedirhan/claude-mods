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

test('the section tells the agent to post one numbered decide list and call post_decide_list', async ($, on) => {
  world(on)
  await start($)

  const text = (await compose($)).section?.text ?? ''

  expect(text).toMatch(/end of (your|the) work/i)
  expect(text).toMatch(/one numbered list/i)
  expect(text).toMatch(/default and (its )?options/i)
  expect(text).toContain('post_decide_list')
})

test('the section tells an orchestrator to report each ticket started and landed', async ($, on) => {
  world(on)
  await start($)

  const text = (await compose($)).section?.text ?? ''

  expect(text).toMatch(/orchestrate an effort's tickets/i)
  expect(text).toMatch(/`ticket`/)
  expect(text).toMatch(/`started` when you delegate/i)
  expect(text).toMatch(/`landed` when the ticket's commit is on the effort branch/i)
  expect(text).toMatch(/do not wait for the issue to close/i)
  expect(text).toMatch(/`effort`/)
})

test('the section tells the agent to resolve answered decisions and dismiss surprises the user asks to', async ($, on) => {
  world(on)
  await start($)

  const text = (await compose($)).section?.text ?? ''

  expect(text).toMatch(/`resolve`/)
  expect(text).toMatch(/answers? .*in the chat/i)
  expect(text).toMatch(/`dismiss`/)
  expect(text).toMatch(/buttons under each decision/i)
})

/** The concise-item rule, as the prompt, the tool and the observer each say it. */
const CONCISE = /one short, clear sentence.*active voice.*one idea per sentence.*no lists.*no filler/is

test('the section tells the agent to keep each item short in plain technical style, with no character limit', async ($, on) => {
  world(on)
  await start($)

  const text = (await compose($)).section?.text ?? ''

  expect(text).toMatch(CONCISE)
  expect(text).not.toMatch(/\d+ characters/)
})

test('the status tool tells a subagent the same rule, field by field', async ($, on) => {
  const { tools } = world(on)
  await start($)

  const tool = tools.get(STATUS_TOOL)
  const fields = (tool?.inputSchema as { properties: Record<string, { description: string }> }).properties

  expect(tool?.description).toMatch(CONCISE)
  for (const field of ['question', 'default', 'unblocks', 'occurred', 'changed']) {
    expect(fields[field]?.description).toMatch(/one short sentence/i)
  }
})

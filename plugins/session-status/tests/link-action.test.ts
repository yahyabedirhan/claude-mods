// The status tool's `link` action: a pull request or issue the session did
// not create joins the Links section by its URL.

import { expect, test } from 'claude-code/testing'

import { readPageUrl } from '../hooks/links'
import { SESSION_ID, STATUS_TOOL, SURFACES, callStatusTool, prMark, sectionText, start, subagentToolCall, world } from './world'

const PR_URL = 'https://github.com/octo/widgets/pull/27'
const ISSUE_URL = 'https://github.com/octo/widgets/issues/28'

test('link adds a pull request and an issue to the Links section, as created pages show', async ($, on) => {
  const w = world(on)
  await start($)

  expect((await callStatusTool($, { action: 'link', url: PR_URL })).result).toBe(
    'Pull request widgets#27 is now listed under Links.',
  )
  expect((await callStatusTool($, { action: 'link', url: `${ISSUE_URL}/` })).result).toBe(
    'Issue widgets#28 is now listed under Links.',
  )

  expect(w.saved[SESSION_ID]).toMatchObject({
    links: [
      { kind: 'pr', repo: 'octo/widgets', number: 27, url: PR_URL },
      { kind: 'issue', repo: 'octo/widgets', number: 28, url: ISSUE_URL },
    ],
  })
  for (const surface of SURFACES) {
    expect(await sectionText($, surface, 'links')).toBe(`Links◎ widgets#28 · ${prMark(surface)} widgets#27`)
  }
})

test('linking a page twice lists it once and says nothing changed', async ($, on) => {
  const w = world(on)
  await start($)
  await callStatusTool($, { action: 'link', url: PR_URL })

  expect((await callStatusTool($, { action: 'link', url: PR_URL })).result).toBe(
    'Pull request widgets#27 is listed under Links already. Nothing changed.',
  )
  expect((w.saved[SESSION_ID] as { links: unknown[] }).links).toHaveLength(1)
})

test('link refuses a missing url or one that is not a pull request or issue', async ($, on) => {
  world(on)
  await start($)

  for (const input of [{}, { url: 'https://github.com/octo/widgets' }, { url: 'see #27' }]) {
    expect((await callStatusTool($, { action: 'link', ...input })).deny).toMatch(/^A link needs `url`/)
  }
})

test('a subagent can link a page, stamped with its id', async ($, on) => {
  const w = world(on)
  await start($)

  await subagentToolCall($, 'agent-1', { tool: STATUS_TOOL, action: 'link', url: PR_URL } as never)

  expect(w.saved[SESSION_ID]).toMatchObject({ links: [{ number: 27, agentId: 'agent-1' }] })
})

test('the status tool and the prompt describe link', async ($, on) => {
  const { tools } = world(on)
  await start($)

  const tool = tools.get(STATUS_TOOL)
  expect(tool?.inputSchema).toMatchObject({ properties: { action: { enum: expect.arrayContaining(['link']) }, url: { type: 'string' } } })
  expect(tool?.description).toMatch(/`link` with `url`: a GitHub pull request or issue this session works on but did not create/)
})

test('readPageUrl reads one pull request or issue URL and nothing else', () => {
  expect(readPageUrl(` ${PR_URL} `)).toEqual({ kind: 'pr', repo: 'octo/widgets', number: 27, url: PR_URL })
  expect(readPageUrl('https://github.example.com/octo/widgets/issues/3')).toMatchObject({ kind: 'issue', number: 3 })
  expect(readPageUrl(`${PR_URL}/files`)).toBeNull()
  expect(readPageUrl(`${PR_URL} and more`)).toBeNull()
  expect(readPageUrl('octo/widgets#27')).toBeNull()
})

import { expect, test } from 'claude-code/testing'
import type { Engine } from 'claude-code/testing'

import { SESSION_ID, SURFACES, mountPane, sectionText, start, subagentToolCall, world } from './world'
import type { World } from './world'

const PR_URL = 'https://github.com/octo/widgets/pull/12'
const ISSUE_URL = 'https://github.com/octo/widgets/issues/34'

/** Answers Bash as `gh` does: what each command prints on stdout. */
function shell(w: World, printed: Record<string, string>) {
  w.answer('Bash', e => ({
    stdout: printed[(e as unknown as { command: string }).command] ?? '',
    stderr: '',
    interrupted: false,
  }))
}

async function linksIn($: Engine, surface: (typeof SURFACES)[number]) {
  const ui = await mountPane($, surface)
  const links = await ui.findAll({ type: 'Link' })
  const section = await ui.find({ key: 'created' })
  await ui.unmount()

  return { links, section }
}

test('a created pull request and issue show as clickable <repo>#<number> links', async ($, on) => {
  const w = world(on)
  shell(w, {
    'gh pr create --fill': `Creating pull request for feature into main\n\n${PR_URL}\n`,
    'gh issue create --title Bug --body Text': `${ISSUE_URL}\n`,
  })
  await start($)
  await $.tool.call({ tool: 'Bash', command: 'gh pr create --fill' })
  await $.tool.call({ tool: 'Bash', command: 'gh issue create --title Bug --body Text' })

  for (const surface of SURFACES) {
    const { links, section } = await linksIn($, surface)
    expect(links.map(link => [link.props.label, link.props.href])).toEqual([
      ['widgets#34', ISSUE_URL],
      ['widgets#12', PR_URL],
    ])
    expect(section?.text).toContain('PR widgets#12')
    expect(section?.text).toContain('issue widgets#34')
  }
})

test("a subagent's pull requests and issues show too", async ($, on) => {
  const w = world(on)
  shell(w, { 'gh pr create --fill': `${PR_URL}\n` })
  await start($)
  await subagentToolCall($, 'agent-1', { tool: 'Bash', command: 'gh pr create --fill' })

  expect(w.saved[SESSION_ID]).toMatchObject({
    links: [{ kind: 'pr', repo: 'octo/widgets', number: 12, url: PR_URL, agentId: 'agent-1' }],
  })
  for (const surface of SURFACES) {
    const { links } = await linksIn($, surface)
    expect(links.map(link => link.props.href)).toEqual([PR_URL])
  }
})

test('a URL that a command only printed is not a created link', async ($, on) => {
  const w = world(on)
  shell(w, {
    'gh pr view 12 --json url': `{"url":"${PR_URL}"}\n`,
    'gh pr create --fill': `See ${ISSUE_URL} for the bug\n${PR_URL}\n`,
  })
  await start($)
  await $.tool.call({ tool: 'Bash', command: 'gh pr view 12 --json url' })
  await $.tool.call({ tool: 'Bash', command: 'gh pr create --fill' })

  expect(w.saved[SESSION_ID]).toMatchObject({ links: [{ url: PR_URL }] })
  expect((w.saved[SESSION_ID] as { links: unknown[] }).links).toHaveLength(1)
})

test('the same page shows once', async ($, on) => {
  const w = world(on)
  shell(w, { 'gh pr create --fill': `${PR_URL}\n` })
  await start($)
  await $.tool.call({ tool: 'Bash', command: 'gh pr create --fill' })
  await $.tool.call({ tool: 'Bash', command: 'gh pr create --fill' })

  expect((w.saved[SESSION_ID] as { links: unknown[] }).links).toHaveLength(1)
})

test('no link shows before the first created page', async ($, on) => {
  world(on)
  await start($)
  await $.tool.call({ tool: 'Bash', command: 'ls' })

  for (const surface of SURFACES) {
    const { section } = await linksIn($, surface)
    expect(section).toBeUndefined()
  }
})

test('the Created section names the newest five pages, then how many more', async ($, on) => {
  const w = world(on)
  const printed: Record<string, string> = {}
  for (let n = 1; n <= 7; n++) {
    printed[`gh issue create --title T${n}`] = `https://github.com/octo/widgets/issues/${n}\n`
  }
  shell(w, printed)
  await start($)
  for (const command of Object.keys(printed)) {
    await $.tool.call({ tool: 'Bash', command })
  }

  for (const surface of SURFACES) {
    expect(await sectionText($, surface, 'created')).toBe(
      'Createdissue widgets#7 · issue widgets#6 · issue widgets#5 · issue widgets#4 · issue widgets#3 · +2 more',
    )
  }
})

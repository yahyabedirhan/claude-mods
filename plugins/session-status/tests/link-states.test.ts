// A linked page's state: the session's own `gh` merges, closes and reopens
// change its mark and colour in the Links section.

import { expect, test } from 'claude-code/testing'
import type { Engine } from 'claude-code/testing'

import { linkStatesArgv, parseLinkStates } from '../hooks/link-states'
import { findStateChanges } from '../hooks/links'
import { SESSION_ID, SURFACES, callStatusTool, mountPane, start, world } from './world'
import type { Surface, World } from './world'

const PR_URL = 'https://github.com/octo/widgets/pull/27'
const ISSUE_URL = 'https://github.com/octo/widgets/issues/28'
const PR_GLYPH = '\u{F04C2}'
const MERGED_GLYPH = '\u{F062D}'

/** Answers Bash as `gh` does: what each command prints on stdout. */
function shell(w: World, printed: Record<string, string>) {
  w.answer('Bash', e => ({ stdout: printed[(e as unknown as { command: string }).command] ?? '', stderr: '', interrupted: false }))
}

/** Each Links mark in the pane, as `[mark, colour]`, in order. */
async function marks($: Engine, surface: Surface) {
  const ui = await mountPane($, surface)
  const found = await ui.findAll({ type: 'Text', text: /^[◎⊙⇄\u{F04C2}\u{F062D}] $/u })
  await ui.unmount()

  return found.map(text => [text.text.trim(), text.props.color])
}

test('open pages are green; a merged pull request and a closed issue turn purple', async ($, on) => {
  const w = world(on)
  shell(w, { 'gh pr merge 27 --squash': '✓ Squashed and merged pull request octo/widgets#27 (Add link)\n' })
  await start($)
  await callStatusTool($, { action: 'link', url: PR_URL })
  await callStatusTool($, { action: 'link', url: ISSUE_URL })

  expect(await marks($, 'terminal')).toEqual([
    ['◎', 'success'],
    [PR_GLYPH, 'success'],
  ])

  await $.tool.call({ tool: 'Bash', command: 'gh pr merge 27 --squash' })
  await $.tool.call({ tool: 'Bash', command: `gh issue close ${ISSUE_URL} --comment Done` })

  expect(w.saved[SESSION_ID]).toMatchObject({ links: [{ number: 27, state: 'merged' }, { number: 28, state: 'closed' }] })
  expect(await marks($, 'terminal')).toEqual([
    ['⊙', 'merged'],
    [MERGED_GLYPH, 'merged'],
  ])
  expect(await marks($, 'desktop')).toEqual([
    ['⊙', 'merged'],
    ['⇄', 'merged'],
  ])
})

test('a pull request closed without merging is red, and a reopen makes it green again', async ($, on) => {
  const w = world(on)
  await start($)
  await callStatusTool($, { action: 'link', url: PR_URL })

  await $.tool.call({ tool: 'Bash', command: 'gh pr close 27' })
  for (const surface of SURFACES) {
    expect((await marks($, surface))[0]?.[1]).toBe('error')
  }
  expect(await marks($, 'terminal')).toEqual([[PR_GLYPH, 'error']])

  await $.tool.call({ tool: 'Bash', command: 'gh pr reopen 27' })
  expect(w.saved[SESSION_ID]).toMatchObject({ links: [{ number: 27, state: 'open' }] })
})

test('an auto-merge leaves a linked page as it was', async ($, on) => {
  const w = world(on)
  await start($)
  await callStatusTool($, { action: 'link', url: PR_URL })

  await $.tool.call({ tool: 'Bash', command: 'gh pr merge 27 --auto --squash' })

  expect((w.saved[SESSION_ID] as { links: { state?: string }[] }).links).toEqual([
    expect.objectContaining({ number: 27 }),
  ])
  expect((w.saved[SESSION_ID] as { links: { state?: string }[] }).links[0]?.state).toBeUndefined()
})

test('a page the session merges, closes or reopens joins the links, though another session made it', async ($, on) => {
  const w = world(on, { cwd: '/work', branch: 'main', repos: [{ root: '/work', remote: 'git@github.com:octo/widgets.git' }] })
  shell(w, { 'gh pr merge --squash': '✓ Squashed and merged pull request octo/gadgets#5 (Fix)\n' })
  await start($)
  await w.clock.advance(0)

  await $.tool.call({ tool: 'Bash', command: 'gh pr merge 31 --squash --delete-branch' })
  await $.tool.call({ tool: 'Bash', command: 'gh issue close 28 --reason "not planned"' })
  await $.tool.call({ tool: 'Bash', command: 'gh pr close 40 --repo octo/gadgets' })
  await $.tool.call({ tool: 'Bash', command: 'gh issue reopen https://git.example.com/team/app/issues/7' })
  await $.tool.call({ tool: 'Bash', command: 'gh pr merge 41 --auto --squash' })
  await $.tool.call({ tool: 'Bash', command: 'gh pr merge --squash' })

  expect((w.saved[SESSION_ID] as { links: unknown[] }).links).toEqual([
    expect.objectContaining({ kind: 'pr', repo: 'octo/widgets', number: 31, state: 'merged', url: 'https://github.com/octo/widgets/pull/31' }),
    expect.objectContaining({ kind: 'issue', repo: 'octo/widgets', number: 28, state: 'closed', url: 'https://github.com/octo/widgets/issues/28' }),
    expect.objectContaining({ kind: 'pr', repo: 'octo/gadgets', number: 40, state: 'closed', url: 'https://github.com/octo/gadgets/pull/40' }),
    expect.objectContaining({ kind: 'issue', repo: 'team/app', number: 7, url: 'https://git.example.com/team/app/issues/7' }),
    expect.objectContaining({ kind: 'pr', repo: 'octo/widgets', number: 41, url: 'https://github.com/octo/widgets/pull/41' }),
    expect.objectContaining({ kind: 'pr', repo: 'octo/gadgets', number: 5, state: 'merged', url: 'https://github.com/octo/gadgets/pull/5' }),
  ])
})

test('a page named by number alone, outside a GitHub repository, or deleted from the links, stays out', async ($, on) => {
  const w = world(on)
  await start($)
  await $.tool.call({ tool: 'Bash', command: 'gh pr merge 31 --squash' })
  expect((w.saved[SESSION_ID] as { links?: unknown[] } | undefined)?.links ?? []).toEqual([])

  await $.tool.call({ tool: 'Bash', command: `gh pr close ${PR_URL}` })
  await callStatusTool($, { action: 'delete', kind: 'link', id: 'widgets#27' })
  await $.tool.call({ tool: 'Bash', command: `gh pr reopen ${PR_URL}` })
  expect((w.saved[SESSION_ID] as { links: unknown[] }).links).toEqual([])
})

test('findStateChanges reads the page by number, #number, URL, --repo or what gh printed', () => {
  expect(findStateChanges('gh pr merge 27 --squash --delete-branch', '')).toEqual([
    { kind: 'pr', state: 'merged', repo: null, number: 27 },
  ])
  expect(findStateChanges('gh issue close #28 --repo octo/widgets', '')).toEqual([
    { kind: 'issue', state: 'closed', repo: 'octo/widgets', number: 28 },
  ])
  expect(findStateChanges(`gh pr close ${PR_URL}`, '')).toEqual([
    { kind: 'pr', state: 'closed', repo: 'octo/widgets', number: 27, url: PR_URL },
  ])
  expect(findStateChanges('gh pr merge --squash', '✓ Merged pull request octo/widgets#27 (Add link)')).toEqual([
    { kind: 'pr', state: 'merged', repo: 'octo/widgets', number: 27 },
  ])
  expect(findStateChanges('git push && gh pr merge 27 --squash && gh issue close 28', '')).toEqual([
    { kind: 'pr', state: 'merged', repo: null, number: 27 },
    { kind: 'issue', state: 'closed', repo: null, number: 28 },
  ])
  expect(findStateChanges('gh pr view 27', '')).toEqual([])
  expect(findStateChanges('gh pr merge 27 --auto', '')).toEqual([{ kind: 'pr', state: null, repo: null, number: 27 }])
})

test('the links take the states GitHub reports, whoever merged or closed them', async ($, on) => {
  const w = world(on)
  w.pageStates({ 'octo/widgets#27': 'MERGED', 'octo/widgets#28': 'CLOSED' })
  await start($)
  await callStatusTool($, { action: 'link', url: PR_URL })
  await w.clock.advance(0)
  await callStatusTool($, { action: 'link', url: ISSUE_URL })
  await w.clock.advance(0)

  expect(w.runs.filter(argv => argv.slice(0, 3).join(' ') === 'gh api graphql')).toHaveLength(2)
  expect(w.saved[SESSION_ID]).toMatchObject({ links: [{ number: 27, state: 'merged' }, { number: 28, state: 'closed' }] })
  expect(await marks($, 'terminal')).toEqual([
    ['⊙', 'merged'],
    [MERGED_GLYPH, 'merged'],
  ])
})

test('the states are read again after a gh pr command, or two minutes on, and not between', async ($, on) => {
  const w = world(on)
  await start($)
  await callStatusTool($, { action: 'link', url: PR_URL })
  await w.clock.advance(0)
  const reads = () => w.runs.filter(argv => argv.slice(0, 3).join(' ') === 'gh api graphql').length

  await $.tool.call({ tool: 'Bash', command: 'ls' })
  await w.clock.advance(0)
  expect(reads()).toBe(1)

  w.pageStates({ 'octo/widgets#27': 'CLOSED' })
  await $.tool.call({ tool: 'Bash', command: 'gh pr view 27' })
  await w.clock.advance(0)
  expect(reads()).toBe(2)
  expect(await marks($, 'terminal')).toEqual([[PR_GLYPH, 'error']])

  await w.clock.advance(2 * 60_000)
  await $.tool.call({ tool: 'Bash', command: 'ls' })
  await w.clock.advance(0)
  expect(reads()).toBe(3)
})

test('a page GitHub cannot find keeps the state it had', async ($, on) => {
  const w = world(on)
  await start($)
  await callStatusTool($, { action: 'link', url: PR_URL })
  await w.clock.advance(0)

  expect((w.saved[SESSION_ID] as { links: { state?: string }[] }).links[0]?.state).toBeUndefined()
})

test('one graphql query asks for every page, each repository once, and its answer maps back by URL', () => {
  const links = [
    { kind: 'pr', repo: 'octo/widgets', number: 27, url: PR_URL, at: 0 },
    { kind: 'issue', repo: 'octo/widgets', number: 28, url: ISSUE_URL, at: 0 },
    { kind: 'pr', repo: 'octo/skills', number: 88, url: 'https://github.com/octo/skills/pull/88', at: 0 },
  ] as const
  const argv = linkStatesArgv(links) ?? []

  expect(argv.slice(0, 4)).toEqual(['gh', 'api', 'graphql', '-f'])
  expect(argv[4]).toContain('r0: repository(owner: "octo", name: "widgets") { n27: issueOrPullRequest(number: 27)')
  expect(argv[4]).toContain('r1: repository(owner: "octo", name: "skills") { n88:')
  expect(linkStatesArgv([])).toBeNull()

  const answer = JSON.stringify({ data: { r0: { n27: { state: 'MERGED' }, n28: { state: 'OPEN' } }, r1: null } })
  expect(parseLinkStates(answer, links)).toEqual(new Map([[PR_URL, 'merged'], [ISSUE_URL, 'open']]))
  expect(parseLinkStates('gh: not logged in', links)).toEqual(new Map())
})

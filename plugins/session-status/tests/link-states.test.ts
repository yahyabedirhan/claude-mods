// A linked page's state: the session's own `gh` merges, closes and reopens
// change its mark and colour in the Links section.

import { expect, test } from 'claude-code/testing'
import type { Engine } from 'claude-code/testing'

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

test('a merge of a page the session has not linked, or an auto-merge, changes nothing', async ($, on) => {
  const w = world(on)
  await start($)
  await callStatusTool($, { action: 'link', url: PR_URL })

  await $.tool.call({ tool: 'Bash', command: 'gh pr merge 31 --squash' })
  await $.tool.call({ tool: 'Bash', command: 'gh pr merge 27 --auto --squash' })

  expect((w.saved[SESSION_ID] as { links: { state?: string }[] }).links[0]?.state).toBeUndefined()
})

test('findStateChanges reads the page by number, #number, URL, --repo or what gh printed', () => {
  expect(findStateChanges('gh pr merge 27 --squash --delete-branch', '')).toEqual([
    { kind: 'pr', state: 'merged', repo: null, number: 27 },
  ])
  expect(findStateChanges('gh issue close #28 --repo octo/widgets', '')).toEqual([
    { kind: 'issue', state: 'closed', repo: 'octo/widgets', number: 28 },
  ])
  expect(findStateChanges(`gh pr close ${PR_URL}`, '')).toEqual([
    { kind: 'pr', state: 'closed', repo: 'octo/widgets', number: 27 },
  ])
  expect(findStateChanges('gh pr merge --squash', '✓ Merged pull request octo/widgets#27 (Add link)')).toEqual([
    { kind: 'pr', state: 'merged', repo: 'octo/widgets', number: 27 },
  ])
  expect(findStateChanges('git push && gh pr merge 27 --squash && gh issue close 28', '')).toEqual([
    { kind: 'pr', state: 'merged', repo: null, number: 27 },
    { kind: 'issue', state: 'closed', repo: null, number: 28 },
  ])
  expect(findStateChanges('gh pr view 27', '')).toEqual([])
  expect(findStateChanges('gh pr merge 27 --auto', '')).toEqual([])
})

// The Session section's header: the effort, the branch and the worktree,
// read from git in the session's directory, and this repository's links.

import { expect, test } from 'claude-code/testing'
import type { Engine } from 'claude-code/testing'

import { githubRepo, worktreeLabel } from '../hooks/place'
import { SESSION_ID, SURFACES, callStatusTool, mountPane, sectionText, start, world } from './world'
import type { Surface, World } from './world'

const ROOT = '/home/dev/.treehouse/claude-mods-8ec7ac/1/claude-mods'
const REMOTE = 'git@github.com:octo/claude-mods.git'
const REPO_URL = 'https://github.com/octo/claude-mods'

/** A session in a worktree of octo/claude-mods on the branch `pane-width`. */
function inWorktree(on: Parameters<typeof world>[0], options: Parameters<typeof world>[1] = {}) {
  return world(on, { cwd: `${ROOT}/plugins`, repos: [{ root: ROOT, remote: REMOTE }], branch: 'pane-width', ...options })
}

/** Lets the reads the mod queued with `$.clock.after(0, ...)` run. */
async function settle(w: World) {
  await w.clock.advance(0)
  await w.clock.advance(0)
}

/** The pane's links on a surface, in order, as `[label, href]`. */
async function paneLinks($: Engine, surface: Surface) {
  const ui = await mountPane($, surface)
  const links = await ui.findAll({ type: 'Link' })
  await ui.unmount()

  return links.map(link => [link.text, link.props.href])
}

test('outside an effort the Session section shows the branch and the worktree, without the full path', async ($, on) => {
  const w = inWorktree(on)
  await start($)
  await settle(w)
  await $.tool.call({ tool: 'Bash', command: 'ls' })

  expect(w.saved[SESSION_ID]).toMatchObject({
    place: { root: ROOT, branch: 'pane-width', repo: { slug: 'octo/claude-mods', url: REPO_URL } },
  })
  for (const surface of SURFACES) {
    const text = (await sectionText($, surface, 'session')) ?? ''
    expect(text).toMatch(/Branch\s+pane-width/)
    expect(text).toMatch(/Worktree\s+claude-mods-8ec7ac\/1/)
    expect(text).not.toContain('Effort')
    expect(text).not.toContain('/home/dev')
    expect(await paneLinks($, surface)).toEqual([['pane-width', `${REPO_URL}/tree/pane-width`]])
  }
})

test('during an effort the Session section links the effort and the tickets being built', async ($, on) => {
  const w = inWorktree(on)
  await start($)
  await settle(w)
  await callStatusTool($, { action: 'ticket', state: 'started', number: 3, title: 'Play', effort: 'video-review-v1' })

  for (const surface of SURFACES) {
    const text = (await sectionText($, surface, 'session')) ?? ''
    expect(text).toMatch(/^Session\s*Effort\s+video-review-v1\s*Branch\s+pane-width\s*Worktree\s+claude-mods-8ec7ac\/1\s*Landed 0\/1/)
    expect(text).toContain('Building: #3')
    expect(await paneLinks($, surface)).toEqual([
      ['video-review-v1', `${REPO_URL}/issues?q=label%3Aeffort%3Avideo-review-v1`],
      ['pane-width', `${REPO_URL}/tree/pane-width`],
      ['#3', `${REPO_URL}/issues/3`],
    ])
  }
})

test("the Session section lists this repository's created pages; another repository's stay out", async ($, on) => {
  const w = inWorktree(on)
  const printed: Record<string, string> = {
    'gh pr create --fill': `${REPO_URL}/pull/14\n`,
    'gh issue create --title Bug': `${REPO_URL}/issues/15\n`,
    'gh pr create --repo octo/skills --fill': 'https://github.com/octo/skills/pull/88\n',
  }
  w.answer('Bash', e => ({ stdout: printed[(e as unknown as { command: string }).command] ?? '', stderr: '' }))
  await start($)
  await settle(w)
  for (const command of Object.keys(printed)) {
    await $.tool.call({ tool: 'Bash', command })
  }

  for (const surface of SURFACES) {
    const text = (await sectionText($, surface, 'session')) ?? ''
    expect(text).toContain('PR claude-mods#14 · issue claude-mods#15')
    expect(text).not.toContain('skills')
    expect(await paneLinks($, surface)).toContainEqual(['claude-mods#14', `${REPO_URL}/pull/14`])
  }
})

test('without a GitHub remote the branch shows as plain text', async ($, on) => {
  const w = inWorktree(on, { repos: [{ root: ROOT, remote: 'git@gitlab.com:octo/claude-mods.git' }] })
  await start($)
  await settle(w)

  for (const surface of SURFACES) {
    expect(await sectionText($, surface, 'session')).toMatch(/Branch\s+pane-width/)
    expect(await paneLinks($, surface)).toEqual([])
  }
})

test('a branch switch reads the branch again', async ($, on) => {
  const w = inWorktree(on)
  await start($)
  await settle(w)
  w.branch('fix-band')
  await $.tool.call({ tool: 'Bash', command: 'git switch -c fix-band' })
  await settle(w)

  for (const surface of SURFACES) {
    expect(await sectionText($, surface, 'session')).toMatch(/Branch\s+fix-band/)
  }
})

test('outside a repository the Session section waits for the first task', async ($, on) => {
  const w = world(on, { branch: 'main' })
  await start($)
  await settle(w)

  for (const surface of SURFACES) {
    expect(await sectionText($, surface, 'session')).toBeUndefined()
  }
})

test('a remote URL names its GitHub repository; other hosts name none', () => {
  for (const remote of [
    'git@github.com:octo/claude-mods.git',
    'https://github.com/octo/claude-mods.git',
    'https://github.com/octo/claude-mods',
    'ssh://git@github.com/octo/claude-mods.git',
  ]) {
    expect(githubRepo(remote)).toEqual({ slug: 'octo/claude-mods', url: REPO_URL })
  }
  expect(githubRepo('git@gitlab.com:octo/claude-mods.git')).toBeNull()
  expect(githubRepo('/srv/git/claude-mods.git')).toBeNull()
})

test('the worktree is named by the two folders above the repository folder', () => {
  expect(worktreeLabel(ROOT)).toBe('claude-mods-8ec7ac/1')
  expect(worktreeLabel('/repo')).toBe('')
})

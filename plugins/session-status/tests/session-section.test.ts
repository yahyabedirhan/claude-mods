// The Session section's header: the effort, the branch and the worktree,
// read from git in the session's directory, and this repository's links.

import { expect, test } from 'claude-code/testing'
import type { Engine } from 'claude-code/testing'

import { githubRepo, worktreeLabel } from '../hooks/place'
import { SESSION_ID, SURFACES, callStatusTool, ghIssue, mountPane, sectionText, start, world } from './world'
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
    expect(text).toMatch(/ID\s+session-a\s*Branch\s+pane-width/)
    expect(text).toMatch(/Worktree\s+claude-mods-8ec7ac\/1/)
    expect(text).not.toContain('Effort')
    expect(text).not.toContain('/home/dev')
    expect(await paneLinks($, surface)).toEqual([])
  }
})

test('pressing the session id, the branch or the worktree copies it, the worktree as its full path', async ($, on) => {
  const w = inWorktree(on)
  const copied: [string, string | undefined][] = []
  on('ui.copy', (_$, e) => {
    copied.push([e.text, e.surface])

    return { value: { isCopied: true } } as never
  })
  await start($)
  await settle(w)

  for (const surface of SURFACES) {
    copied.length = 0
    const ui = await mountPane($, surface)
    for (const key of ['session-id-copy', 'session-branch-copy', 'session-worktree-copy']) {
      await ui.press({ key })
    }
    await ui.unmount()
    expect(copied).toEqual([
      [SESSION_ID, surface],
      ['pane-width', surface],
      [ROOT, surface],
    ])
  }
})

test('during an effort the Effort section links the effort and Session the tickets being built', async ($, on) => {
  const w = inWorktree(on)
  await start($)
  await settle(w)
  await callStatusTool($, { action: 'ticket', state: 'started', number: 3, title: 'Play', effort: 'video-review-v1' })

  for (const surface of SURFACES) {
    const text = (await sectionText($, surface, 'session')) ?? ''
    expect(text).toMatch(/^Session\s*ID\s+session-a\s*Branch\s+pane-width\s*Worktree\s+claude-mods-8ec7ac\/1\s*Progress 0\/1/)
    expect(await sectionText($, surface, 'effort')).toMatch(/^Effort\s+video-review-v1$/)
    expect(text).toContain('Building: #3')
    expect(await paneLinks($, surface)).toEqual([
      ['#3', `${REPO_URL}/issues/3`],
      ['video-review-v1', `${REPO_URL}/issues?q=label%3Aeffort%3Avideo-review-v1`],
    ])
  }
})

test('the Effort section lists two tickets, open ones first, each linked, and "+N more" opens them all', async ($, on) => {
  const effort = 'launch'
  const w = inWorktree(on, {
    issues: [
      ghIssue(1, 'Spec: Launch', 'OPEN', effort),
      ghIssue(2, 'Pick a name', 'CLOSED', effort),
      ghIssue(5, 'Write the page', 'OPEN', effort),
      ghIssue(3, 'Draw the logo', 'OPEN', effort),
      ghIssue(4, 'Book the room', 'CLOSED', effort),
    ],
  })
  await start($)
  await settle(w)
  await $.tool.call({ tool: 'Bash', command: `gh issue list --label effort:${effort}` })
  await settle(w)

  for (const surface of SURFACES) {
    const text = (await sectionText($, surface, 'effort')) ?? ''
    expect(text).toContain('Closed 2/4')
    expect(text).toContain('○ #3 Draw the logo')
    expect(text).toContain('○ #5 Write the page')
    expect(text).not.toContain('Spec')
    expect(text).not.toContain('#2')
    expect(text).toContain('+2 more')

    const ui = await mountPane($, surface)
    await ui.press({ key: 'tickets-more' })
    const list = (await ui.find({ key: 'list-view' }))?.text ?? ''
    expect(list).toContain('launch tickets (2/4 closed)')
    expect(['#3', '#5', '#2', '#4'].map(name => list.indexOf(name))).toEqual(
      [...['#3', '#5', '#2', '#4'].map(name => list.indexOf(name))].sort((a, b) => a - b),
    )
    expect(list).toContain('✓ #4 Book the room')
    const links = (await ui.findAll({ type: 'Link' })).map(link => [link.text, link.props.href])
    expect(links).toEqual([3, 5, 2, 4].map(n => [`#${n}`, `${REPO_URL}/issues/${n}`]))
    await ui.press({ key: 'back' })
    await ui.unmount()
  }
})

test('the Created section lists the pages made in every repository, newest first', async ($, on) => {
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
    expect(await sectionText($, surface, 'created')).toBe('CreatedPR skills#88 · issue claude-mods#15 · PR claude-mods#14')
    expect(await sectionText($, surface, 'session')).not.toContain('#14')
    expect(await paneLinks($, surface)).toContainEqual(['claude-mods#14', `${REPO_URL}/pull/14`])
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
  expect(worktreeLabel('/x/claude-mods/.claude/worktrees/agent-x')).toBe('worktrees/agent-x')
  expect(worktreeLabel('/repo')).toBe('')
})

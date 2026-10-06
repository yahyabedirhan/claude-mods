// Places: the other repositories the session changed, and how.

import { expect, test } from 'claude-code/testing'
import type { Engine } from 'claude-code/testing'

import { commandTargets } from '../hooks/places'
import { CAP, PLACES_KEPT, emptyStatus, withinBounds } from '../hooks/status'
import { SESSION_ID, SURFACES, mountPane, sectionText, start, subagentToolCall, world } from './world'
import type { World } from './world'

const OWN = '/home/dev/claude-mods'
const SKILLS = '/home/dev/skills'
const SKILLS_URL = 'https://github.com/octo/skills'

/** A session in octo/claude-mods, with octo/skills checked out beside it. */
function twoRepos(on: Parameters<typeof world>[0]) {
  return world(on, {
    cwd: OWN,
    branch: 'main',
    repos: [
      { root: OWN, remote: 'git@github.com:octo/claude-mods.git' },
      { root: SKILLS, remote: 'https://github.com/octo/skills.git' },
    ],
  })
}

/** Lets the reads and counts the mod queued with `$.clock.after(0, ...)` run. */
async function settle(w: World) {
  for (let i = 0; i < 4; i++) {
    await w.clock.advance(0)
  }
}

function bash($: Engine, command: string) {
  return $.tool.call({ tool: 'Bash', command })
}

test('files edited or written in another repository count once each; reads and the own repository do not', async ($, on) => {
  const w = twoRepos(on)
  await start($)
  await settle(w)
  await $.tool.call({ tool: 'Edit', file_path: `${SKILLS}/skills/a/SKILL.md`, old_string: 'a', new_string: 'b' })
  await $.tool.call({ tool: 'Edit', file_path: `${SKILLS}/skills/a/SKILL.md`, old_string: 'b', new_string: 'c' })
  await subagentToolCall($, 'agent-1', { tool: 'Write', file_path: `${SKILLS}/README.md`, content: 'x' })
  await $.tool.call({ tool: 'Read', file_path: `${SKILLS}/skills/b/SKILL.md` })
  await $.tool.call({ tool: 'Edit', file_path: `${OWN}/README.md`, old_string: 'a', new_string: 'b' })
  await settle(w)

  for (const surface of SURFACES) {
    expect(await sectionText($, surface, 'places')).toBe('skills  2 files')
  }
  expect(w.saved[SESSION_ID]).toMatchObject({
    places: [
      { key: SKILLS, name: 'skills', files: [`${SKILLS}/skills/a/SKILL.md`, `${SKILLS}/README.md`], commands: 0 },
      { key: OWN, name: 'claude-mods', commands: 0 },
    ],
  })
})

test('commands that change something count where they ran; the pages made there are in Links', async ($, on) => {
  const w = twoRepos(on)
  w.answer('Bash', e =>
    (e as unknown as { command: string }).command.startsWith('gh pr create')
      ? { stdout: `${SKILLS_URL}/pull/88\n`, stderr: '' }
      : { stdout: '', stderr: '' },
  )
  await start($)
  await settle(w)
  await bash($, `cd ${SKILLS} && git add -A && git commit -m "Fix" && git push`)
  await bash($, `git -C ${SKILLS} tag v1`)
  await bash($, `git -C ${SKILLS} status`)
  await bash($, 'gh pr create --repo octo/skills --fill')
  await bash($, `rm ${SKILLS}/old.md`)
  await bash($, 'git commit -m "Own work"')
  await settle(w)

  for (const surface of SURFACES) {
    expect(await sectionText($, surface, 'places')).toBe('skills  4 commands')
    expect(await sectionText($, surface, 'links')).toBe('LinksPR skills#88')
    const ui = await mountPane($, surface)
    const links = (await ui.findAll({ type: 'Link' })).map(link => [link.text, link.props.href])
    await ui.unmount()
    expect(links).toContainEqual(['skills', SKILLS_URL])
    expect(links).toContainEqual(['skills#88', `${SKILLS_URL}/pull/88`])
  }
})

test('a repository only gh named is a place of its own, and two places are counted in the heading', async ($, on) => {
  const w = twoRepos(on)
  await start($)
  await settle(w)
  await $.tool.call({ tool: 'Write', file_path: `${SKILLS}/a.md`, content: 'x' })
  await bash($, 'gh issue comment 5 --repo octo/docs --body "Done"')
  await settle(w)

  for (const surface of SURFACES) {
    const text = (await sectionText($, surface, 'places')) ?? ''
    expect(text).toBe('Places (2)skills  1 filedocs  1 command')
  }
})

test('no Places section shows while the session changes only its own repository', async ($, on) => {
  const w = twoRepos(on)
  await start($)
  await settle(w)
  await $.tool.call({ tool: 'Edit', file_path: `${OWN}/a.ts`, old_string: 'a', new_string: 'b' })
  await bash($, 'git commit -m x')
  await settle(w)

  for (const surface of SURFACES) {
    expect(await sectionText($, surface, 'places')).toBeUndefined()
  }
})

test('a command names where each changing step runs', () => {
  expect(commandTargets('git status && git log', '/w')).toEqual([])
  expect(commandTargets('cd ../skills && git commit -m "a b" && git push', '/w/own')).toEqual([
    { dir: '/w/skills' },
    { dir: '/w/skills' },
  ])
  expect(commandTargets('git -C /x/repo -c a=b merge main', '/w')).toEqual([{ dir: '/x/repo' }])
  expect(commandTargets('gh pr merge 3 -R octo/skills --squash', '/w')).toEqual([{ slug: 'octo/skills' }])
  expect(commandTargets('gh issue edit 3 --repo=octo/docs --title x', '/w')).toEqual([{ slug: 'octo/docs' }])
  expect(commandTargets('gh issue create --repo=octo/docs --title x', '/w')).toEqual([])
  expect(commandTargets('gh pr view 3 --repo octo/skills', '/w')).toEqual([])
  expect(commandTargets('gh issue close 4', '/w')).toEqual([{ dir: '/w' }])
  expect(commandTargets('mv -f a/b.md /x/c.md', '/w')).toEqual([{ dir: '/w/a' }])
  expect(commandTargets('GIT_DIR=x git tag v1 | cat', '/w')).toEqual([{ dir: '/w' }])
})

test('the status keeps the places that changed last, and each place the files touched last', () => {
  const place = (n: number, files = 1) => ({
    key: `/r/${n}`,
    name: String(n),
    repo: null,
    files: Array.from({ length: files }, (_, f) => `/r/${n}/${f}`),
    commands: 0,
    at: n === 0 ? 1_000 : n,
  })
  const places = Array.from({ length: PLACES_KEPT + 1 }, (_, n) => place(n, n === 0 ? CAP + 1 : 1))

  const kept = withinBounds({ ...emptyStatus(SESSION_ID), places }).places

  expect(kept).toHaveLength(PLACES_KEPT)
  expect(kept.some(p => p.key === '/r/1')).toBe(false)
  expect(kept[0]?.files).toHaveLength(CAP)
  expect(kept[0]?.files[0]).toBe('/r/0/1')
})

test('a repository where the session only made a pull request is in Links, not in Places', async ($, on) => {
  const w = twoRepos(on)
  w.answer('Bash', () => ({ stdout: `${SKILLS_URL}/pull/88\n`, stderr: '' }))
  await start($)
  await settle(w)
  await bash($, 'gh pr create --repo octo/skills --fill')
  await settle(w)

  for (const surface of SURFACES) {
    expect(await sectionText($, surface, 'places')).toBeUndefined()
    expect(await sectionText($, surface, 'links')).toBe('LinksPR skills#88')
  }
})

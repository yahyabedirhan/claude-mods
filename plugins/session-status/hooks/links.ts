// The pull requests and issues a session creates, found in what `gh pr
// create` and `gh issue create` print: the new page's URL.

import type { CreatedLink, SessionStatus } from '../types'

/** The `gh` commands that create a page, and the URL path each one prints. */
const CREATES = [
  { kind: 'pr', command: /\bgh\s+pr\s+create\b/, path: 'pull' },
  { kind: 'issue', command: /\bgh\s+issue\s+create\b/, path: 'issues' },
] as const

const PAGE_URL = /https:\/\/[^\s/]+\/([\w.-]+)\/([\w.-]+)\/(pull|issues)\/(\d+)(?![\w/])/g

/** A created page as the pane names it: `<repo>#<number>`. */
export type FoundLink = Pick<CreatedLink, 'kind' | 'repo' | 'number' | 'url'>

/**
 * The pages a shell command created: each URL of its kind in the output of a
 * command that runs `gh pr create` or `gh issue create`. Nothing for any
 * other command, so a URL a command only printed is never taken.
 */
export function findCreatedLinks(command: string, output: string): FoundLink[] {
  const found: FoundLink[] = []
  for (const create of CREATES) {
    if (!create.command.test(command)) {
      continue
    }
    for (const match of output.matchAll(PAGE_URL)) {
      const [url, owner, repo, path, number] = match as unknown as [string, string, string, string, string]
      if (path === create.path) {
        found.push({ kind: create.kind, repo: `${owner}/${repo}`, number: Number(number), url })
      }
    }
  }

  return found
}

/** The `<repo>#<number>` a link shows: the repository's name without its owner. */
export function linkLabel(link: Pick<CreatedLink, 'repo' | 'number'>): string {
  return `${link.repo.split('/').pop() ?? link.repo}#${link.number}`
}

/** The status with the found links added, each page once. */
export function linksFound(
  status: SessionStatus,
  found: readonly FoundLink[],
  stamp: { agentId?: string; at: number },
): SessionStatus {
  const added: CreatedLink[] = []
  for (const link of found) {
    if ([...status.links, ...added].some(known => known.url === link.url)) {
      continue
    }
    const created: CreatedLink = { ...link, at: stamp.at }
    if (stamp.agentId !== undefined) {
      created.agentId = stamp.agentId
    }
    added.push(created)
  }

  return added.length === 0 ? status : { ...status, links: [...status.links, ...added] }
}

import { expect, test } from 'claude-code/testing'
import type { ToolCallInput } from 'claude-code'

import { describeToolCall } from '../hooks/describe-tool-call'
import { START } from './world'

function bash(command: string, description?: string) {
  const call = description === undefined ? { tool: 'Bash', command } : { tool: 'Bash', command, description }

  return describeToolCall(call as unknown as ToolCallInput, START).text
}

test('a Bash call shows its description first', () => {
  expect(bash('export GH_TOKEN=abc && gh pr create', 'Open the pull request')).toBe('Open the pull request')
})

test('a Bash command without a description shows only its programs and subcommands', () => {
  expect(bash('export GH_TOKEN=abc && gh pr create')).toBe('gh pr create')
  expect(bash('GH_TOKEN=abc gh pr create --token xyz --title "Fix it"')).toBe('gh pr create')
  expect(bash('mysql -u root -phunter2 shop')).toBe('mysql')
  expect(bash('curl -H "Authorization: Bearer abc123" https://example.com')).toBe('curl')
  expect(bash('cd /work/repo && npm run test | tail -5')).toBe('npm run test | tail')
  expect(bash('/usr/bin/git log --oneline')).toBe('git log')
  expect(bash('git status')).toBe('git status')
})

test('no secret of a Bash command reaches doing now', () => {
  for (const command of [
    'export GH_TOKEN=abc && gh pr create',
    'GH_TOKEN=abc gh pr create',
    'gh auth login --with-token abc',
    'psql postgres://user:abc@db/shop',
    'echo abc > token.txt',
  ]) {
    expect(bash(command)).not.toContain('abc')
  }
})

// "Doing now" from a tool call: the tool and one short line about the call.

import type { ToolCallInput } from 'claude-code'

import type { DoingNow } from '../types'

const MAX_TEXT = 120

/** Fields that name a file: shown by the file's name alone. */
const PATH_FIELDS = ['file_path', 'notebook_path'] as const

/**
 * Fields that say what the call does, best first. A `command` shows only
 * its programs (see `commandShape`): doing now is saved to `$.store`, and a
 * command line can hold a token or a password.
 */
const TEXT_FIELDS = [
  'description',
  'subject',
  'command',
  'pattern',
  'url',
  'query',
  'skill',
  'prompt',
] as const

/** What the call does now, as one line the pane shows. */
export function describeToolCall(e: ToolCallInput, at: number): DoingNow {
  const fields = e as unknown as Record<string, unknown>
  const doing: DoingNow = { tool: e.tool, text: summarize(fields), at }
  if (e.agentId !== undefined) {
    doing.agentId = e.agentId
  }

  return doing
}

function summarize(fields: Record<string, unknown>): string {
  for (const field of PATH_FIELDS) {
    const value = fields[field]
    if (typeof value === 'string' && value !== '') {
      return oneLine(value.split(/[\\/]/).filter(Boolean).pop() ?? value)
    }
  }
  for (const field of TEXT_FIELDS) {
    const value = fields[field]
    if (typeof value === 'string' && value.trim() !== '') {
      return oneLine(field === 'command' ? commandShape(value) : value)
    }
  }

  return ''
}

/**
 * Programs whose second and third words name a subcommand (`gh pr create`,
 * `npm run test`). Any other program shows by its name alone, because its
 * words can be free text (`echo <token>`).
 */
const SUBCOMMAND_PROGRAMS = new Set([
  'bun',
  'cargo',
  'claude',
  'docker',
  'gh',
  'git',
  'go',
  'kubectl',
  'npm',
  'pnpm',
  'uv',
  'yarn',
])

/** Steps that only set up the shell: left out of the shape. */
const SETUP_PROGRAMS = new Set(['cd', 'export', 'set', 'unset'])

/** A word that can name a program or a subcommand, not a value. */
const PLAIN_WORD = /^[a-z][a-z-]*$/
/** `NAME=value`: an environment assignment before a program. */
const ASSIGNMENT = /^[A-Za-z_][A-Za-z0-9_]*=/

/**
 * A shell command as its programs and subcommands only, joined by the
 * operators between them: `export GH_TOKEN=x && gh pr create --title y`
 * shows as `gh pr create`. No argument value, assignment or path is kept.
 */
export function commandShape(command: string): string {
  const parts = command.split(/(&&|\|\||[;|\n])/)
  const shown: string[] = []
  for (let i = 0; i < parts.length; i += 2) {
    const step = stepShape(parts[i] ?? '')
    if (step !== null) {
      shown.push(shown.length === 0 ? step : `${(parts[i - 1] ?? ';').trim() || ';'} ${step}`)
    }
  }

  return shown.join(' ')
}

/** One step's program and subcommand words; null for a setup step or none. */
function stepShape(step: string): string | null {
  const words = step.trim().split(/\s+/).filter(word => word !== '')
  while (words.length > 0 && ASSIGNMENT.test(words[0] ?? '')) {
    words.shift()
  }
  const program = (words[0] ?? '').split('/').pop() ?? ''
  if (!/^[A-Za-z0-9][\w.+-]*$/.test(program) || SETUP_PROGRAMS.has(program)) {
    return null
  }
  const shape = [program]
  if (SUBCOMMAND_PROGRAMS.has(program)) {
    for (const word of words.slice(1, 3)) {
      if (!PLAIN_WORD.test(word)) {
        break
      }
      shape.push(word)
    }
  }

  return shape.join(' ')
}

function oneLine(text: string): string {
  const line = text.replace(/\s+/g, ' ').trim()

  return line.length > MAX_TEXT ? `${line.slice(0, MAX_TEXT - 1)}…` : line
}

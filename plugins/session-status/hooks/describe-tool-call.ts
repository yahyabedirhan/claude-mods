// "Doing now" from a tool call: the tool and one short line about the call.

import type { ToolCallInput } from 'claude-code'

import type { DoingNow } from '../types'

const MAX_TEXT = 120

/** Fields that name a file: shown by the file's name alone. */
const PATH_FIELDS = ['file_path', 'notebook_path'] as const

/** Fields that say what the call does, best first. */
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
      return oneLine(value)
    }
  }

  return ''
}

function oneLine(text: string): string {
  const line = text.replace(/\s+/g, ' ').trim()

  return line.length > MAX_TEXT ? `${line.slice(0, MAX_TEXT - 1)}…` : line
}

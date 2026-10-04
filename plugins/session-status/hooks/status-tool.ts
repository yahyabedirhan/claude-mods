// The status tool: what the model reads about it, and the rules that turn
// one call's input into an item to record. Registering the tool and
// answering its calls live in register.tsx, where `$` is.
//
// One tool with an `action` field, so later actions (resolve a decision,
// dismiss a surprise) join this same tool.

import type { DecisionUrgency, StatusItem } from '../types'
import type { ItemDraft } from './status'

/** The tool's short name: the model calls it as `mcp__session-status__status`. */
export const STATUS_TOOL_NAME = 'status'

/** The tool's full name, as the model calls it and `tool.call` names it. */
export const STATUS_TOOL = `mcp__session-status__${STATUS_TOOL_NAME}`

const ACTIONS = ['record_decision', 'record_surprise'] as const
const URGENCIES: readonly DecisionUrgency[] = ['blocked', 'review_later']
const MIN_OPTIONS = 2
const MAX_OPTIONS = 4

/** What `$.tool.register` takes for the status tool. */
export const STATUS_TOOL_SPEC = {
  name: STATUS_TOOL_NAME,
  description: [
    "Records an item on the session status pane the user watches.",
    "`record_decision`: a choice the user must make. Give the question, two to four options,",
    "your default (the answer you recommend) and what unblocks it.",
    "Use urgency `review_later` when a safe default exists: continue with the default.",
    "Use urgency `blocked` only when no safe default exists and you must stop.",
    "`record_surprise`: something unexpected that changed the work or the plan.",
    "Give what occurred and what it changed. Do not record ordinary errors you fixed yourself.",
    'The result names the item\'s id (D1, S1, ...).',
  ].join(' '),
  inputSchema: {
    type: 'object',
    properties: {
      action: {
        type: 'string',
        enum: [...ACTIONS],
        description: 'What to record.',
      },
      urgency: {
        type: 'string',
        enum: [...URGENCIES],
        description:
          'record_decision: `blocked` when no safe default exists and the work stops; `review_later` when you continue with the default.',
      },
      question: { type: 'string', description: 'record_decision: the question for the user.' },
      options: {
        type: 'array',
        items: { type: 'string' },
        minItems: MIN_OPTIONS,
        maxItems: MAX_OPTIONS,
        description: 'record_decision: two to four answers the user can give.',
      },
      default: {
        type: 'string',
        description: 'record_decision: the answer you recommend, and use unless the user says otherwise.',
      },
      unblocks: {
        type: 'string',
        description: 'record_decision: the one thing the user must say or do to settle it.',
      },
      occurred: { type: 'string', description: 'record_surprise: what occurred.' },
      changed: { type: 'string', description: 'record_surprise: what it changed in the work or the plan.' },
    },
    required: ['action'],
  },
} as const

/**
 * Reads one call's input into the item it records, or says what is wrong
 * with it, for the model to fix and call again.
 */
export function readStatusToolInput(
  input: Record<string, unknown>,
): { draft: ItemDraft } | { error: string } {
  const withAgent = <T extends ItemDraft>(draft: T): { draft: T } =>
    typeof input.agentId === 'string' ? { draft: { ...draft, agentId: input.agentId } } : { draft }

  switch (input.action) {
    case 'record_decision': {
      const urgency = input.urgency
      if (!URGENCIES.includes(urgency as DecisionUrgency)) {
        return { error: 'A decision needs an urgency: `blocked` or `review_later`.' }
      }
      const question = text(input.question)
      if (question === null) {
        return { error: 'A decision needs a question.' }
      }
      const options = Array.isArray(input.options) ? input.options.map(text) : []
      if (
        options.length < MIN_OPTIONS ||
        options.length > MAX_OPTIONS ||
        options.some(option => option === null)
      ) {
        return { error: 'A decision needs two to four options, each a non-empty string.' }
      }
      const fallback = text(input.default)
      if (fallback === null) {
        return { error: 'A decision needs a default: the answer you recommend.' }
      }
      const unblocks = text(input.unblocks)
      if (unblocks === null) {
        return { error: 'A decision needs `unblocks`: what the user must say or do to settle it.' }
      }

      return withAgent({
        kind: 'decision',
        urgency: urgency as DecisionUrgency,
        question,
        options: options as string[],
        default: fallback,
        unblocks,
      })
    }
    case 'record_surprise': {
      const occurred = text(input.occurred)
      if (occurred === null) {
        return { error: 'A surprise needs `occurred`: what occurred.' }
      }
      const changed = text(input.changed)
      if (changed === null) {
        return { error: 'A surprise needs `changed`: what it changed in the work or the plan.' }
      }

      return withAgent({ kind: 'surprise', occurred, changed })
    }
    default:
      return { error: `Unknown action. Use one of: ${ACTIONS.join(', ')}.` }
  }
}

/** What the model reads after a recorded item. */
export function recordedText(item: StatusItem): string {
  if (item.kind === 'surprise') {
    return `Recorded surprise ${item.id}.`
  }

  return item.urgency === 'blocked'
    ? `Recorded decision ${item.id}: blocked on the user. Stop the work that needs it.`
    : `Recorded decision ${item.id} for review later. Continue with the default: ${item.default}.`
}

/** A trimmed, non-empty string, or null. */
function text(value: unknown): string | null {
  if (typeof value !== 'string') {
    return null
  }
  const trimmed = value.trim()

  return trimmed === '' ? null : trimmed
}

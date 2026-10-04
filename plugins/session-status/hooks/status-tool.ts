// The status tool: what the model reads about it, and the rules that turn
// one call's input into what it asks for. Registering the tool and
// answering its calls live in register.tsx, where `$` is.
//
// One tool with an `action` field: it records items, closes them and marks
// the end-of-work list as posted.

import type { Decision, DecisionUrgency, StatusItem } from '../types'
import type { ItemDraft } from './status'

/** The tool's short name: the model calls it as `mcp__session-status__status`. */
export const STATUS_TOOL_NAME = 'status'

/** The tool's full name, as the model calls it and `tool.call` names it. */
export const STATUS_TOOL = `mcp__session-status__${STATUS_TOOL_NAME}`

const ACTIONS = ['record_decision', 'record_surprise', 'resolve', 'dismiss', 'post_end_list'] as const
const URGENCIES: readonly DecisionUrgency[] = ['blocked', 'review_later']
const MIN_OPTIONS = 2
const MAX_OPTIONS = 4

/** What `$.tool.register` takes for the status tool. */
export const STATUS_TOOL_SPEC = {
  name: STATUS_TOOL_NAME,
  // Subagents get this tool but not the prompt section, so the description
  // carries the core of the instructions too, in short.
  description: [
    'Keeps the session status pane the user watches current. The pane is read-only: the user answers in the chat.',
    '`record_decision`: a choice the user must make. Give the question, two to four options,',
    'your default (the answer you recommend) and what unblocks it.',
    'Choose a safe default and continue: use urgency `review_later`.',
    'Stop only when no safe default exists: use urgency `blocked`.',
    '`record_surprise`: something unexpected that changed the work or the plan.',
    'Give what occurred and what it changed. Do not record ordinary errors you fixed yourself.',
    '`resolve` with `id`: the user answered that decision in the chat.',
    '`dismiss` with `id`: the user asked in the chat to dismiss that surprise.',
    '`post_end_list`: call it when, at the end of your work, you post one numbered list',
    'of the open review-later decisions, each with its default and options.',
    "The result names the item's id (D1, S1, ...).",
  ].join(' '),
  inputSchema: {
    type: 'object',
    properties: {
      action: {
        type: 'string',
        enum: [...ACTIONS],
        description: 'What to do: record an item, close one (`resolve`, `dismiss`) or mark the end-of-work list posted.',
      },
      id: {
        type: 'string',
        description: 'resolve: the decision id (D1, ...). dismiss: the surprise id (S1, ...).',
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

/** What one call asks for, read from its input. */
export type StatusToolRequest =
  /** Record a new item. */
  | { draft: ItemDraft }
  /** Close an open item: resolve a decision or dismiss a surprise. */
  | { close: { kind: StatusItem['kind']; id: string } }
  /** Mark the end-of-work list as posted. */
  | { postEndList: true }

/**
 * Reads one call's input into what it asks for, or says what is wrong with
 * it, for the model to fix and call again.
 */
export function readStatusToolInput(
  input: Record<string, unknown>,
): StatusToolRequest | { error: string } {
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
    case 'resolve':
    case 'dismiss': {
      const id = text(input.id)
      if (id === null) {
        return {
          error:
            input.action === 'resolve'
              ? 'Resolve needs `id`: the decision id (D1, ...).'
              : 'Dismiss needs `id`: the surprise id (S1, ...).',
        }
      }

      return { close: { kind: input.action === 'resolve' ? 'decision' : 'surprise', id } }
    }
    case 'post_end_list':
      return { postEndList: true }
    default:
      return { error: `Unknown action. Use one of: ${ACTIONS.join(', ')}.` }
  }
}

// The texts the model reads back are plain facts about the status, with no
// instruction in them: an imperative in a tool result reads to the model
// like a prompt injection. What to do with a decision is in the tool's
// description and the prompt section.

/** What the model reads after a recorded item. */
export function recordedText(item: StatusItem): string {
  if (item.kind === 'surprise') {
    return `Recorded surprise ${item.id}.`
  }

  return item.urgency === 'blocked'
    ? `Recorded decision ${item.id} (blocked on the user).`
    : `Recorded decision ${item.id} (review later). Default: ${item.default}.`
}

/** What the model reads after it closed an item. */
export function closedText(item: StatusItem): string {
  return item.kind === 'decision'
    ? `Resolved decision ${item.id}. It is in the answered history now.`
    : `Dismissed surprise ${item.id}. It is in the answered history now.`
}

/** What the model reads after `post_end_list`, given the decisions the list holds. */
export function endListText(listed: readonly Decision[]): string {
  return listed.length === 0
    ? 'No open review-later decisions. No end-of-work list was marked as posted.'
    : `End-of-work list marked as posted with ${listed.map(d => d.id).join(', ')}. The pane highlights each until it is resolved.`
}

/** A trimmed, non-empty string, or null. */
function text(value: unknown): string | null {
  if (typeof value !== 'string') {
    return null
  }
  const trimmed = value.trim()

  return trimmed === '' ? null : trimmed
}

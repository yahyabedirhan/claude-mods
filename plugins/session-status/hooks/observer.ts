// The observer agent as data: when it checks, what it asks a small model,
// and how its answer becomes surprises. register.tsx makes the model call
// and the reads and writes; these functions only decide.
//
// The observer reports to the person alone: its findings go into the status
// as surprises tagged `observer`, never into the main agent's context.

import type { ModelCompleteRequest, SessionMessage } from 'claude-code'

import type { SessionStatus, Surprise } from '../types'
import { recordItem } from './status'
import { CONCISE_RULE } from './status-tool'

/** The small, cheap model the observer asks: an alias the engine resolves. */
export const OBSERVER_MODEL = 'haiku'
/** Main-loop turns between checks before any dismissal. */
export const BASE_TURN_INTERVAL = 5
/** The longest the turn interval grows to after dismissals. */
export const MAX_TURN_INTERVAL = 40
/** Checks for each session; the observer stops there. */
export const CHECK_CAP = 20
/** How many of the newest transcript messages a check reads. */
export const STEP_LIMIT = 30
/** How much of one text a check reads (a message, a tool's input or result). */
export const TEXT_LIMIT = 300
/** How much of the recent steps a check reads in all; the oldest lines drop first. */
export const STEPS_LIMIT = 12_000
/** How many findings one check may add. */
export const FINDING_LIMIT = 3
/** How many finding keys the status keeps; the oldest drop first. */
export const SEEN_LIMIT = 200
/** The reply's token cap: a few short findings in JSON. */
const REPLY_TOKENS = 600
/** How long one check may take before it is abandoned. */
const TIMEOUT_MS = 60_000

/** What starts a check: a main-loop turn ending, or a subagent finishing. */
export type Trigger = 'turn' | 'subagent'

/** One finding as the model gives it: what it saw and what it costs or changes. */
export type Finding = { occurred: string; changed: string }

function observerSurprises(status: SessionStatus): Surprise[] {
  return status.items.filter((item): item is Surprise => item.kind === 'surprise' && item.source === 'observer')
}

/**
 * Main-loop turns between checks: the base interval doubled for each
 * observer finding the person dismissed, up to the maximum. The back-off
 * idea of the built-in "You Should Know" plugin: ignored advice comes less often.
 */
export function turnInterval(status: SessionStatus): number {
  return Math.min(BASE_TURN_INTERVAL * 2 ** dismissedCount(status), MAX_TURN_INTERVAL)
}

/** How many observer findings the person dismissed. */
function dismissedCount(status: SessionStatus): number {
  return observerSurprises(status).filter(item => item.resolvedAt !== undefined).length
}

/**
 * Whether a check is due: under the cap, and enough turns ended since the
 * last check (`turns`). A finished subagent starts a check at once until the
 * person dismisses an observer finding; after that it too waits for the
 * turn interval, so the back-off holds for both triggers. The pane being
 * open and no check running are register.tsx's.
 */
export function isCheckDue(status: SessionStatus, turns: number, trigger: Trigger): boolean {
  if (status.observer.checks >= CHECK_CAP) {
    return false
  }
  if (trigger === 'subagent' && dismissedCount(status) === 0) {
    return true
  }

  return turns >= turnInterval(status)
}

function clip(text: string, limit = TEXT_LIMIT): string {
  const flat = text.replace(/\s+/g, ' ').trim()

  return flat.length > limit ? `${flat.slice(0, limit - 1)}…` : flat
}

/** One transcript message as the lines a check reads. */
function stepLines(message: SessionMessage): string[] {
  const lines: string[] = []
  if (message.text !== '') {
    lines.push(`${message.role}: ${clip(message.text)}`)
  }
  for (const use of message.toolUses) {
    const outcome = use.text === undefined ? 'running' : `${use.isError === true ? 'error: ' : ''}${clip(use.text)}`
    lines.push(`tool ${use.tool} ${clip(JSON.stringify(use.input))} -> ${outcome}`)
  }

  return lines
}

/** The newest lines whose length together stays within `limit`, oldest first. */
function newestWithin(lines: readonly string[], limit: number): string[] {
  const kept: string[] = []
  let used = 0
  for (const line of [...lines].reverse()) {
    used += line.length + 1
    if (used > limit) {
      break
    }
    kept.unshift(line)
  }

  return kept
}

const SYSTEM = `You watch a coding agent's session for the user. You never talk to the agent.
Find only these problems:
- inefficient work: loops, the same step repeated, work done twice;
- time sinks: steps that take far more turns or time than they are worth;
- steps that do not agree with the effort phase or the task list.
Ordinary errors that the agent fixed itself are not findings.
${CONCISE_RULE}
Do not repeat a finding that was already shown, even in other words.
When you find nothing, give no findings. Most checks find nothing.
Answer with strict JSON only, no other text, in this shape:
{"findings":[{"occurred":"what you saw, one short sentence","changed":"what it costs or what to change, one short sentence"}]}
Give at most ${FINDING_LIMIT} findings.`

/** The model request for one check: the recent steps, the tasks, the session items and the effort phase. */
export function observerRequest(status: SessionStatus, messages: readonly SessionMessage[]): ModelCompleteRequest {
  const steps = newestWithin(messages.slice(-STEP_LIMIT).flatMap(stepLines), STEPS_LIMIT)
  const tasks = status.tasks.map(task => `- [${task.status}] ${clip(task.subject, 120)}`)
  const items = status.sessionItems.map(item => `- [${item.state}] ${item.id} ${clip(item.title, 120)}`)
  const effort = status.effort?.name
  const shown = observerSurprises(status).map(item => `- ${clip(item.occurred, 160)}`)
  const prompt = [
    `Effort phase: ${effort ?? 'none'}`,
    `Progress: ${status.progress === null ? 'no tasks' : `${status.progress.done} of ${status.progress.total} done`}`,
    'Task list:',
    ...(tasks.length === 0 ? ['(none)'] : tasks),
    'Session items:',
    ...(items.length === 0 ? ['(none)'] : items),
    'Findings already shown:',
    ...(shown.length === 0 ? ['(none)'] : shown),
    `Recent steps, oldest first:`,
    ...(steps.length === 0 ? ['(none)'] : steps),
  ].join('\n')

  return { model: OBSERVER_MODEL, system: SYSTEM, prompt, maxTokens: REPLY_TOKENS, effort: 'low', timeoutMs: TIMEOUT_MS }
}

/**
 * The findings in the model's reply; none when the reply is not the agreed
 * JSON. A code fence around the JSON is taken off first.
 */
export function parseFindings(text: string): Finding[] {
  const json = text.trim().replace(/^```(?:json)?\s*([\s\S]*?)\s*```$/, '$1')
  let reply: unknown
  try {
    reply = JSON.parse(json)
  } catch {
    return []
  }
  const findings = (reply as { findings?: unknown } | null)?.findings
  if (!Array.isArray(findings)) {
    return []
  }

  return findings
    .filter(
      (f): f is Finding =>
        typeof f === 'object' &&
        f !== null &&
        typeof f.occurred === 'string' &&
        typeof f.changed === 'string' &&
        f.occurred.trim() !== '' &&
        f.changed.trim() !== '',
    )
    .slice(0, FINDING_LIMIT)
    .map(f => ({ occurred: clip(f.occurred, 200), changed: clip(f.changed, 200) }))
}

/** A finding's key: its words lowercased, numbers and punctuation dropped. */
export function findingKey(finding: Finding): string {
  return finding.occurred
    .toLowerCase()
    .replace(/[^a-z]+/g, ' ')
    .trim()
}

/**
 * The status after one check: the check counted, and each finding whose key
 * was not seen before added as an observer surprise.
 */
export function recordCheck(status: SessionStatus, findings: readonly Finding[], now: number): SessionStatus {
  let next: SessionStatus = { ...status, observer: { ...status.observer, checks: status.observer.checks + 1 } }
  for (const finding of findings) {
    const key = findingKey(finding)
    if (key === '' || next.observer.seen.includes(key)) {
      continue
    }
    next = recordItem(next, { kind: 'surprise', ...finding, source: 'observer' }, now).status
    next = { ...next, observer: { ...next.observer, seen: [...next.observer.seen, key].slice(-SEEN_LIMIT) } }
  }

  return next
}

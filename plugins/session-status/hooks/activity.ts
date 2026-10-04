// The session's state in one word, for the top of the pane: Blocked, In
// progress, Waiting for reply or Settled. The turn events and the settle
// skills set what the session does; an open blocked decision wins over it.

import type { Activity, SessionStatus } from '../types'
import { isOpen } from './status'

/** The skills that settle a session: a Skill call to one marks it settled. */
export const SETTLE_SKILLS: readonly string[] = ['settle-session', 'settle-effort']

/** The state the pane shows, by priority; null before the first turn. */
export type Headline = 'blocked' | 'working' | 'waiting' | 'settled'

/** What the pane's top line says for each state. */
export const HEADLINE_TEXT: Record<Headline, string> = {
  blocked: 'Blocked',
  working: 'In progress',
  waiting: 'Waiting for reply',
  settled: 'Settled',
}

/**
 * The session's state: Blocked while a blocked decision is open; In progress
 * while a turn or a subagent runs; else what the last turn left, waiting
 * for a reply or settled.
 */
export function headline(status: SessionStatus): Headline | null {
  const isBlocked = status.items.some(item => item.kind === 'decision' && item.urgency === 'blocked' && isOpen(item))
  if (isBlocked) {
    return 'blocked'
  }
  if (status.activity === 'working' || status.activity === 'settling' || status.subagents.running.length > 0) {
    return 'working'
  }

  return status.activity
}

/** Whether a tool call runs a settle skill (a plugin's `<plugin>:<skill>` too). */
export function settles(call: { tool: string; skill?: unknown }): boolean {
  if (call.tool !== 'Skill' || typeof call.skill !== 'string') {
    return false
  }

  return SETTLE_SKILLS.includes(call.skill.slice(call.skill.lastIndexOf(':') + 1))
}

/** The activity a turn's end leaves: settled after a settle skill ran in it, else waiting for a reply. */
export function afterTurn(activity: Activity | null): Activity {
  return activity === 'settling' || activity === 'settled' ? 'settled' : 'waiting'
}

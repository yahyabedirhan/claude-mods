// The system prompt section the mod adds: how the agent records decisions
// and surprises. register.tsx adds it in `prompt.compose`.

import type { PromptComposeSection } from 'claude-code'

import { STATUS_TOOL } from './status-tool'

/** The section's id: the mod's own, `<plugin>:<name>`. */
export const INSTRUCTIONS_ID = 'session-status:status'

const TEXT = `# Session status

The user watches a status pane for this session. Use the \`${STATUS_TOOL}\` tool to keep it current.

- When the work needs a choice from the user, record a decision. Give the question, two to four options, your default (the answer you recommend) and what unblocks it.
- Choose a safe default and continue. Record that decision with urgency \`review_later\`. Do not stop the work for it.
- Stop only when no safe default exists. Then record the decision with urgency \`blocked\`. Make it as easy as possible to unblock: recommend one option, and say in \`unblocks\` the one thing the user must say or do.
- When something unexpected changes the work or the plan, record a surprise. Say what occurred and what it changed. Do not record ordinary errors that you fixed yourself.
- If you are a subagent and cannot call the status tool, put your decisions and surprises in your final report, with the same fields. The orchestrator records them with the status tool.`

/** The section, added after the engine's own on the session side. */
export const INSTRUCTIONS: PromptComposeSection = {
  id: INSTRUCTIONS_ID,
  text: TEXT,
  scope: 'session',
}

// The world beneath the mod in a test: what the engine would answer in a
// session. Every test file of this mod builds on it.

import { mock } from 'claude-code/testing'
import type { Engine, MockClock } from 'claude-code/testing'
import type { On, ToolCallArgs, ToolCallInput, ToolSpec, UiPane } from 'claude-code'

export const PLUGIN = 'session-status'
export const SESSION_ID = 'session-a'
/** The status tool as the model sees it. */
export const STATUS_TOOL = 'mcp__session-status__status'
export const SURFACES = ['terminal', 'desktop'] as const
export type Surface = (typeof SURFACES)[number]

/** 2026-10-04 12:00:00 UTC: where the mocked clock starts. */
export const START = Date.UTC(2026, 9, 4, 12, 0, 0)

export type World = {
  clock: MockClock
  /** What the mod saved to `$.store`, by key. */
  saved: Record<string, unknown>
  /** The panes open now, by id. */
  panes: Map<string, UiPane>
  /** The commands the mod registered, by name. */
  commands: string[]
  /** The tools the mod registered for the model, by full name. */
  tools: Map<string, ToolSpec>
  /**
   * Makes the tool named answer each call with what `result` gives for it,
   * as the tool's record (`{ stdout }` for Bash). Other tools answer `ok`.
   */
  answer: (tool: string, result: (e: ToolCallInput) => unknown) => void
  /** Moves the process on to another session id, as /clear and /resume do. */
  switchSession: (sessionId: string) => void
}

/** The engine's own system prompt beneath the mod: one shared section. */
export const BASE_SECTIONS = [{ id: 'intro', text: 'You are Claude Code.', scope: 'shared' }] as const

/**
 * Answers every noun the mod calls beneath it: the clock (mocked), the
 * session id, the store, the panes, command and tool registration, the
 * engine's system prompt and tool calls.
 *
 * Call it before the test's first call on `$`.
 */
export function world(
  on: On,
  options: { sessionId?: string; saved?: Record<string, unknown> } = {},
): World {
  const clock = mock.clock(on, { now: START })
  const saved: Record<string, unknown> = { ...options.saved }
  let sessionId = options.sessionId ?? SESSION_ID
  const panes = new Map<string, UiPane>()
  const commands: string[] = []
  const tools = new Map<string, ToolSpec>()
  const answers = new Map<string, (e: ToolCallInput) => unknown>()

  on('session.start', (_$, e) => ({ cwd: e.cwd }))
  on('session.id', () => ({ value: sessionId }))
  on('store.get', (_$, e) => ({ value: saved[e.key] }))
  on('store.set', (_$, e) => {
    saved[e.key] = e.value

    return { value: undefined }
  })
  on('store.delete', (_$, e) => {
    delete saved[e.key]

    return { value: undefined }
  })
  on('store.keys', () => ({ value: Object.keys(saved) }))
  on('command.register', (_$, e) => {
    commands.push(e.name)

    return { value: { command: e.name } }
  })
  on('tool.register', (_$, e) => {
    const tool = `mcp__${PLUGIN}__${e.name}`
    tools.set(tool, e)

    return { value: { tool } }
  })
  on('prompt.compose', () => ({ sections: BASE_SECTIONS }))
  on('ui.open', (_$, e) => {
    panes.set(e.id, {
      id: e.id,
      title: e.title ?? e.id,
      isShown: true,
      isFocused: false,
      isPlaced: true,
    })

    return { value: { isPlaced: true } }
  })
  on('ui.close', (_$, e) => {
    panes.delete(e.id)

    return { value: undefined }
  })
  on('ui.panes', () => ({ value: [...panes.values()] }))
  on('tool.call', (_$, e) => ({ result: answers.get(e.tool)?.(e) ?? 'ok' }) as never)
  on('classic.*', () => ({}))

  return {
    clock,
    saved,
    panes,
    commands,
    tools,
    answer: (tool, result) => {
      answers.set(tool, result)
    },
    switchSession: id => {
      sessionId = id
    },
  }
}

/** Starts the session as the REPL does. */
export async function start($: Engine) {
  await $.session.start({ cwd: '/work', surface: 'terminal', isInteractive: true })
}

/**
 * A tool call a subagent makes: its loop's id rides the input as a session's
 * does. `ToolCallArgs` leaves `agentId` out of its type, but the engine keeps it.
 */
export function subagentToolCall($: Engine, agentId: string, input: ToolCallArgs) {
  return $.tool.call({ ...input, agentId } as never)
}

/** Runs `/session-status` as the person typing it does. */
export function runCommand($: Engine) {
  return $.command.run({
    command: PLUGIN,
    args: '',
    origin: { kind: 'composer' },
    presentation: { isFullscreen: true, columns: 160 },
  })
}

/** Mounts the status pane on a surface, docked and wide. */
export function mountPane($: Engine, surface: Surface) {
  return $.ui.mount({
    plugin: PLUGIN,
    surface,
    component: 'Pane',
    requestId: PLUGIN,
    viewport: { columns: 160, rows: 40 },
    props: {
      title: 'Session status',
      isFocused: false,
      bodyColumns: 50,
      placement: 'dock',
      scroll: { offset: 0, bodyRows: 30 },
      view: {},
    },
  })
}

/** Calls the status tool as the model does; resolves to what the model gets. */
export function callStatusTool($: Engine, input: Record<string, unknown>) {
  return $.tool.call({ tool: STATUS_TOOL, ...input })
}

/** A blocked decision's input, with the given fields changed. */
export function blockedDecision(fields: Record<string, unknown> = {}) {
  return {
    action: 'record_decision',
    urgency: 'blocked',
    question: 'Which database do we use?',
    options: ['Postgres', 'SQLite'],
    default: 'Postgres',
    unblocks: 'Pick one database',
    ...fields,
  }
}

/** A review-later decision's input, with the given fields changed. */
export function reviewLaterDecision(fields: Record<string, unknown> = {}) {
  return {
    action: 'record_decision',
    urgency: 'review_later',
    question: 'Which name does the flag get?',
    options: ['--fast', '--quick'],
    default: '--fast',
    unblocks: 'Confirm or change the name',
    ...fields,
  }
}

/** A surprise's input, with the given fields changed. */
export function surprise(fields: Record<string, unknown> = {}) {
  return {
    action: 'record_surprise',
    occurred: 'The API has no batch endpoint',
    changed: 'Each item is sent in its own request',
    ...fields,
  }
}

/** The text of one pane section on a surface, by its key; undefined when it is not drawn. */
export async function sectionText($: Engine, surface: Surface, key: string) {
  const ui = await mountPane($, surface)
  const text = (await ui.find({ key }))?.text
  await ui.unmount()

  return text
}

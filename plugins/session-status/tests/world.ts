// The world beneath the mod in a test: what the engine would answer in a
// session. Every test file of this mod builds on it.

import { mock } from 'claude-code/testing'
import type { Engine, MockClock } from 'claude-code/testing'
import type {
  ModelCompleteRequest,
  On,
  SessionMessage,
  ToolCallArgs,
  ToolCallInput,
  ToolSpec,
  UiPane,
} from 'claude-code'

export const PLUGIN = 'session-status'
export const SESSION_ID = 'session-a'
/** The status tool as the model sees it. */
export const STATUS_TOOL = 'mcp__session-status__status'
export const SURFACES = ['terminal', 'desktop'] as const
export type Surface = (typeof SURFACES)[number]

/** 2026-10-04 12:00:00 UTC: where the mocked clock starts. */
export const START = Date.UTC(2026, 9, 4, 12, 0, 0)

export type World = {
  /** The argument of every `$.ui.open` the mod made, oldest first. */
  opens: { id: string; title?: string; columns?: number }[]
  clock: MockClock
  /** What the mod saved to `$.store`, by key. */
  saved: Record<string, unknown>
  /** Every `$.store.set` the mod made, oldest first, refused ones too. */
  storeWrites: { key: string; value: unknown }[]
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
  /**
   * Empties the mod's values in `$.state`, as a `/clear` does: each reads as
   * never written until the mod writes it again.
   */
  forgetState: () => void
  /** Moves the process on to another session id, as /clear and /resume do. */
  switchSession: (sessionId: string) => void
  /** The argv of each command the mod ran through `$.process.run`, in order. None runs for real. */
  runs: string[][]
  /** The main conversation `$.session.messages()` returns; a test sets it. */
  messages: SessionMessage[]
  /** Every `$.model.complete` request the mod made, oldest first. */
  modelCalls: ModelCompleteRequest[]
  /**
   * Makes the fake model reply to each request with the text `reply` gives,
   * or with none when it gives undefined. The default reply is no findings.
   */
  model: (reply: ModelReply) => void
  /**
   * Sets the issues `gh issue list` answers from now on, as its `--json`
   * output; undefined makes `gh` fail.
   */
  issues: (list: GhIssue[] | undefined) => void
  /**
   * Holds every `gh issue list` answer from now on until the returned
   * function is called, as a slow network does.
   */
  holdIssues: () => () => void
  /**
   * Holds every call of the tool named until the returned function is
   * called, as a long-running tool does.
   */
  holdTool: (tool: string) => () => void
  /** Sets what `git branch --show-current` prints from now on; undefined makes git fail. */
  branch: (name: string | undefined) => void
}

/**
 * A git repository on the test host: its top folder and, when it has one, its
 * `origin` remote. `git -C <dir> rev-parse --show-toplevel` answers the
 * deepest repository that holds the folder.
 */
export type GitRepo = { root: string; remote?: string }

/** One issue as `gh issue list --json number,title,state,labels` prints it. */
export type GhIssue = { number: number; title: string; state: 'OPEN' | 'CLOSED'; labels: { name: string }[] }

/** An effort's issue: open unless `state` says otherwise, labelled `effort:<effort>`. */
export function ghIssue(number: number, title: string, state: 'OPEN' | 'CLOSED' = 'OPEN', effort = 'session-status'): GhIssue {
  return { number, title, state, labels: [{ name: `effort:${effort}` }] }
}

/** The fake model's reply to a request: its text, or undefined for none. */
export type ModelReply = (request: ModelCompleteRequest) => string | undefined | Promise<string | undefined>

/** What the fake model's every call cost. */
export const MODEL_USAGE = {
  input_tokens: 3000,
  output_tokens: 100,
  cache_read_input_tokens: 0,
  cache_creation_input_tokens: 0,
}

/** A process's output read whole. */
const FULL = { isStdoutTruncated: false, isStderrTruncated: false }

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
  options: {
    sessionId?: string
    saved?: Record<string, unknown>
    /** Makes every `$.process.run` fail as a missing command does, after it is recorded. */
    failRuns?: boolean
    /**
     * A terminal below the floor for an unasked pane: every open answers
     * `{ isPlaced: false }` and the pane waits undrawn.
     */
    isNarrow?: boolean
    /** What `git branch --show-current` prints; git fails when absent. */
    branch?: string
    /** Makes every Agent tool spawn refused, so no subagent starts. */
    denySpawns?: boolean
    /** What `gh issue list` answers, as its `--json` output; `gh` fails when absent. */
    issues?: GhIssue[]
    /** Makes every `$.store.set` fail, as a full store does, after it is recorded. */
    failStoreWrites?: boolean
    /** The session's directory, as `$.session.cwd()` answers it; `/work` when absent. */
    cwd?: string
    /** The git repositories on the host; none when absent, so git finds no repository. */
    repos?: GitRepo[]
  } = {},
): World {
  const clock = mock.clock(on, { now: START })
  const saved: Record<string, unknown> = { ...options.saved }
  let sessionId = options.sessionId ?? SESSION_ID
  const panes = new Map<string, UiPane>()
  const opens: World['opens'] = []
  const commands: string[] = []
  const tools = new Map<string, ToolSpec>()
  const answers = new Map<string, (e: ToolCallInput) => unknown>()
  const runs: string[][] = []
  const messages: SessionMessage[] = []
  const modelCalls: ModelCompleteRequest[] = []
  let reply: ModelReply = () => '{"findings":[]}'
  let issues = options.issues
  let branch = options.branch
  let issueGate: Promise<void> | null = null
  const storeWrites: { key: string; value: unknown }[] = []
  const toolGates = new Map<string, Promise<void>>()

  on('session.start', (_$, e) => ({ cwd: e.cwd }))
  on('session.id', () => ({ value: sessionId }))
  on('session.cwd', () => ({ value: options.cwd ?? '/work' }))
  on('store.get', (_$, e) => ({ value: saved[e.key] }))
  on('store.set', (_$, e) => {
    storeWrites.push({ key: e.key, value: e.value })
    if (options.failStoreWrites === true) {
      throw new Error('store full')
    }
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
    opens.push({ id: e.id, title: e.title, columns: e.columns })
    const isPlaced = options.isNarrow !== true
    panes.set(e.id, {
      id: e.id,
      title: e.title ?? e.id,
      isShown: true,
      isFocused: false,
      isPlaced,
    })

    return {
      value: isPlaced ? { isPlaced: true } : { isPlaced: false, reason: 'below 144 columns' },
    }
  })
  on('ui.close', (_$, e) => {
    panes.delete(e.id)

    return { value: undefined }
  })
  on('ui.panes', () => ({ value: [...panes.values()] }))
  on('process.run', async (_$, e) => {
    runs.push([...e.argv])
    if (options.failRuns === true) {
      throw new Error(`${e.argv[0]}: command not found`)
    }
    if (e.argv.join(' ') === 'git branch --show-current') {
      return branch === undefined
        ? { value: { exitCode: 128, stdout: '', stderr: 'fatal: not a git repository', ...FULL } }
        : { value: { exitCode: 0, stdout: `${branch}\n`, stderr: '', ...FULL } }
    }
    const git = gitAnswer(options.repos ?? [], e.argv)
    if (git !== null) {
      return { value: { ...git, ...FULL } }
    }
    if (e.argv.slice(0, 3).join(' ') === 'gh issue list') {
      await issueGate
      return issues === undefined
        ? { value: { exitCode: 1, stdout: '', stderr: 'gh: not logged in', ...FULL } }
        : { value: { exitCode: 0, stdout: JSON.stringify(issues), stderr: '', ...FULL } }
    }

    return { value: { exitCode: 0, stdout: '', stderr: '', ...FULL } }
  })
  on('tool.call', async (_$, e) => {
    await toolGates.get(e.tool)

    return { result: answers.get(e.tool)?.(e) ?? 'ok' } as never
  })
  on('classic.*', () => ({}))
  // An Agent tool call's spawn answers the started subagent's id: the call's `name`.
  on('agent.spawn', (_$, e) =>
    options.denySpawns === true ? { deny: 'Spawns are off.' } : { model: 'claude-test', agentId: e.name ?? 'agent' },
  )
  on('session.end', (_$, e) => ({ sessionId: e.sessionId }))
  // `$.state` as a /clear leaves it: each value reads as never written, at
  // the version it stood at then, until the mod writes it again.
  let isForgotten = false
  const forgottenAt = new Map<string, number>()
  on('state.get', async (_$, e, next) => {
    const answer = await next(e)
    if (!isForgotten || answer.deny !== undefined) {
      return answer
    }
    const { version } = answer.value
    if (!forgottenAt.has(e.key)) {
      forgottenAt.set(e.key, version)
    }

    return forgottenAt.get(e.key) === version ? { value: { version, value: undefined } } : answer
  })
  on('session.messages', () => ({ value: messages }) as never)
  on('model.complete', async (_$, e) => {
    modelCalls.push(e)
    const text = await reply(e)

    return {
      value:
        text === undefined
          ? { isAnswered: false, reason: 'empty-reply', usage: MODEL_USAGE }
          : { isAnswered: true, text, usage: MODEL_USAGE },
    } as never
  })
  on('turn.complete', (_$, e) => ({ text: e.answer }))
  // The engine's own band beneath the mod: nothing above the prompt.
  on('ui.render', { component: 'AbovePrompt' }, ($, e) => h($.ui.resolve(e).Box, { key: 'engine-band' }) as never)

  return {
    opens,
    clock,
    saved,
    storeWrites,
    panes,
    commands,
    tools,
    runs,
    answer: (tool, result) => {
      answers.set(tool, result)
    },
    forgetState: () => {
      isForgotten = true
      forgottenAt.clear()
    },
    switchSession: id => {
      sessionId = id
    },
    messages,
    modelCalls,
    model: next => {
      reply = next
    },
    issues: list => {
      issues = list
    },
    holdIssues: () => {
      let release = () => {}
      issueGate = new Promise<void>(resolve => {
        release = resolve
      })

      return () => {
        issueGate = null
        release()
      }
    },
    branch: name => {
      branch = name
    },
    holdTool: tool => {
      let release = () => {}
      toolGates.set(
        tool,
        new Promise<void>(resolve => {
          release = resolve
        }),
      )

      return () => {
        toolGates.delete(tool)
        release()
      }
    },
  }
}

/**
 * What git prints for `git -C <dir> rev-parse --show-toplevel` and
 * `git -C <root> remote get-url origin` on a host with these repositories;
 * null for any other command.
 */
function gitAnswer(repos: readonly GitRepo[], argv: readonly string[]) {
  if (argv[0] !== 'git' || argv[1] !== '-C' || argv[2] === undefined) {
    return null
  }
  const dir = argv[2].replace(/\/+$/, '')
  const rest = argv.slice(3).join(' ')
  const holder = repos
    .filter(repo => dir === repo.root || dir.startsWith(`${repo.root}/`))
    .sort((a, b) => b.root.length - a.root.length)[0]
  const fail = { exitCode: 128, stdout: '', stderr: 'fatal: not a git repository' }
  if (rest === 'rev-parse --show-toplevel') {
    return holder === undefined ? fail : { exitCode: 0, stdout: `${holder.root}\n`, stderr: '' }
  }
  if (rest === 'remote get-url origin') {
    return holder?.remote === undefined ? { ...fail, exitCode: 2 } : { exitCode: 0, stdout: `${holder.remote}\n`, stderr: '' }
  }

  return null
}

/** Ends one main-loop turn as the query loop does; resolves to its result. */
export function endTurn($: Engine, answer = 'Done.') {
  return $.turn.complete({ answer, durationMs: 1000, isAborted: false, turnId: 'turn', reason: 'answer' })
}

/**
 * A subagent an Agent tool call starts, with `agentId` as its id: its classic
 * SubagentStart fires while the spawn starts it, then the spawn answers.
 */
export async function spawnSubagent($: Engine, agentId: string) {
  await $.classic.SubagentStart({ agent_id: agentId, agent_type: 'general-purpose' })
  await $.agent.spawn({
    tool_use_id: `toolu-${agentId}`,
    prompt: 'Do the work',
    description: 'Work',
    subagentType: 'general-purpose',
    provider: { plugin: 'engine', tier: 'core' },
    parentModel: 'claude-test',
    background: false,
    fork: false,
    name: agentId,
  })
}

/**
 * One of Claude Code's own agents (compaction and the like): it fires the
 * classic SubagentStart and SubagentStop, but no Agent tool call spawned it.
 */
export async function internalAgent($: Engine, agentId: string) {
  await $.classic.SubagentStart({ agent_id: agentId, agent_type: '' })
  await subagentStop($, agentId)
}

/** Ends the session `sessionId` as a `/clear` or an exit does. */
export function endSession($: Engine, sessionId: string, reason: 'clear' | 'prompt_input_exit' = 'clear') {
  return $.session.end({ reason, sessionId, resume: { id: sessionId } })
}

/** A subagent finishing, as the classic SubagentStop event says it. */
export function subagentStop($: Engine, agentId: string) {
  return $.classic.SubagentStop({
    agent_id: agentId,
    agent_type: 'general-purpose',
    agent_transcript_path: '',
    stop_hook_active: false,
  })
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

/** Mounts the band above the prompt on a surface. */
export function mountBand($: Engine, surface: Surface) {
  return $.ui.mount({
    plugin: PLUGIN,
    surface,
    component: 'AbovePrompt',
    viewport: { columns: 100, rows: 40 },
    props: {
      hasSurvey: false,
      isWorking: false,
      maxRows: 10,
      bodyColumns: 95,
      scroll: { offset: 0, bodyRows: 10 },
      view: {},
    },
  })
}

/** The band's line on a surface; undefined when the band is not drawn. */
export async function bandText($: Engine, surface: Surface) {
  const ui = await mountBand($, surface)
  const text = (await ui.find({ key: 'session-status-band' }))?.text
  await ui.unmount()

  return text
}

// The world beneath the mod in a test: what the engine would answer in a
// session. Every test file of this mod builds on it.

import { mock } from 'claude-code/testing'
import type { Engine, MockClock } from 'claude-code/testing'
import type { On, UiPane } from 'claude-code'

export const PLUGIN = 'session-status'
export const SESSION_ID = 'session-a'
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
}

/**
 * Answers every noun the mod calls beneath it: the clock (mocked), the
 * session id, the store, the panes, command registration and tool calls.
 *
 * Call it before the test's first call on `$`.
 */
export function world(on: On, options: { sessionId?: string } = {}): World {
  const clock = mock.clock(on, { now: START })
  const saved: Record<string, unknown> = {}
  const panes = new Map<string, UiPane>()
  const commands: string[] = []

  on('session.start', (_$, e) => ({ cwd: e.cwd }))
  on('session.id', () => ({ value: options.sessionId ?? SESSION_ID }))
  on('store.get', (_$, e) => ({ value: saved[e.key] }))
  on('store.set', (_$, e) => {
    saved[e.key] = e.value

    return { value: undefined }
  })
  on('command.register', (_$, e) => {
    commands.push(e.name)

    return { value: { command: e.name } }
  })
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
  on('tool.call', () => ({ result: 'ok' }) as never)

  return { clock, saved, panes, commands }
}

/** Starts the session as the REPL does. */
export async function start($: Engine) {
  await $.session.start({ cwd: '/work', surface: 'terminal', isInteractive: true })
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

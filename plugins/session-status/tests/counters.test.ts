import { expect, test } from 'claude-code/testing'
import type { Engine } from 'claude-code/testing'

import { SURFACES, sectionText, start, world } from './world'

function subagentStart($: Engine, agentId: string) {
  return $.classic.SubagentStart({ agent_id: agentId, agent_type: 'general-purpose' })
}

function subagentStop($: Engine, agentId: string) {
  return $.classic.SubagentStop({
    agent_id: agentId,
    agent_type: 'general-purpose',
    agent_transcript_path: '',
    stop_hook_active: false,
  })
}

test('the counters show running and finished subagents', async ($, on) => {
  world(on)
  await start($)
  await subagentStart($, 'agent-1')
  await subagentStart($, 'agent-2')
  await subagentStart($, 'agent-3')
  await subagentStop($, 'agent-2')

  for (const surface of SURFACES) {
    expect(await sectionText($, surface, 'counters')).toContain('2 running · 1 finished')
  }
})

test('a stop that arrives twice counts once', async ($, on) => {
  world(on)
  await start($)
  await subagentStart($, 'agent-1')
  await subagentStop($, 'agent-1')
  await subagentStop($, 'agent-1')

  for (const surface of SURFACES) {
    expect(await sectionText($, surface, 'counters')).toContain('0 running · 1 finished')
  }
})

test('the counters stay out of the pane before the first subagent', async ($, on) => {
  world(on)
  await start($)
  await $.tool.call({ tool: 'Bash', command: 'ls' })

  for (const surface of SURFACES) {
    expect(await sectionText($, surface, 'counters')).toBeUndefined()
  }
})

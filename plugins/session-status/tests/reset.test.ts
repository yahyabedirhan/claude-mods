import { expect, test } from 'claude-code/testing'

import {
  SESSION_ID,
  STATUS_TOOL,
  callStatusTool,
  decisionBeforeSettling,
  endSession,
  ghIssue,
  runCommand,
  sectionText,
  start,
  subagentToolCall,
  world,
} from './world'

const NEW_SESSION = 'session-b'
const EFFORT = 'launch'

/** A session with two items, an effort with a reported ticket and an open decision, then a `/clear`. */
async function clearedSession($: Parameters<typeof start>[0], w: ReturnType<typeof world>) {
  await start($)
  await callStatusTool($, { action: 'item', state: 'added', title: 'Write the parser' })
  await callStatusTool($, { action: 'item', state: 'added', title: 'Ship it' })
  await callStatusTool($, { action: 'item', state: 'done', id: 'I1' })
  await callStatusTool($, { action: 'ticket', state: 'landed', number: 3, title: 'Play a video', effort: EFFORT })
  await callStatusTool($, decisionBeforeSettling())
  await endSession($, SESSION_ID)
  w.forgetState()
  w.switchSession(NEW_SESSION)
  await $.classic.SessionStart({ source: 'clear', session_id: NEW_SESSION } as never)
}

test('/session-status reset clears everything, open decisions too, and ids start over', async ($, on) => {
  const w = world(on, { issues: [ghIssue(3, 'Play a video', 'OPEN', EFFORT), ghIssue(4, 'Pause', 'OPEN', EFFORT)] })
  await clearedSession($, w)
  expect(await sectionText($, 'terminal', 'session')).toBeDefined()

  const reply = await runCommand($, 'reset')

  expect(reply.text).toBe(
    'Session status reset: removed 2 session items, 1 decision, surprise or blocker, 1 ticket report and the effort launch. Everything starts over.',
  )
  expect(w.saved[NEW_SESSION]).toMatchObject({ sessionItems: [], ticketReports: [], effort: null, tickets: null })
  expect(w.saved[NEW_SESSION]).toMatchObject({ items: [], links: [], endListPostedAt: null })
  expect(await sectionText($, 'terminal', 'session')).toBeUndefined()
  expect(await sectionText($, 'terminal', 'effort')).toBeUndefined()
  expect((await callStatusTool($, { action: 'item', state: 'added', title: 'Fresh' })).result).toBe(
    'Added item I1 Fresh. Session: 0/1 done.',
  )
  expect((await callStatusTool($, decisionBeforeSettling())).result).toMatch(/^Recorded decision D1/)
})

test('a reset with no progress says that nothing changed', async ($, on) => {
  world(on)
  await start($)

  expect((await runCommand($, 'reset')).text).toBe('Session status was empty already. Nothing changed.')
})

test('/session-status with an unknown argument names the two forms and leaves the pane closed', async ($, on) => {
  const { panes } = world(on)
  await start($)

  const reply = await runCommand($, 'wipe')

  expect(reply.text).toMatch(/Unknown argument "wipe"/)
  expect(reply.text).toMatch(/\/session-status reset/)
  expect(panes.size).toBe(0)
})

test('the reset action does what the command does, and a subagent cannot call it', async ($, on) => {
  const w = world(on)
  await clearedSession($, w)

  expect((await subagentToolCall($, 'agent-1', { tool: STATUS_TOOL, action: 'reset' } as never)).deny).toMatch(
    /Only the main session/,
  )
  expect((await callStatusTool($, { action: 'reset' })).result).toMatch(/^Session status reset: removed 2 session items/)
  expect(w.saved[NEW_SESSION]).toMatchObject({ sessionItems: [], effort: null })
})

test('list names the ids the earlier session gave, after /clear', async ($, on) => {
  const w = world(on)
  await clearedSession($, w)

  const reply = (await callStatusTool($, { action: 'list' })).result

  expect(reply).toBe(
    [
      'Session items:',
      '- I2 Ship it (open)',
      '- I1 Write the parser (done)',
      'Decisions:',
      `- D1 ${decisionBeforeSettling().question} (before_settling)`,
      'Effort:',
      '- launch',
      'Reported tickets:',
      '- #3 Play a video (landed)',
    ].join('\n'),
  )
})

test('list on an empty status says so, and changes nothing', async ($, on) => {
  const w = world(on)
  await start($)

  expect((await callStatusTool($, { action: 'list' })).result).toBe('Nothing is open, and the session has no progress.')
  expect(w.saved[SESSION_ID]).toBeUndefined()
})

test('the status tool and the prompt describe list and reset', async ($, on) => {
  const { tools } = world(on)
  await start($)

  const tool = tools.get(STATUS_TOOL)
  expect(tool?.inputSchema).toMatchObject({ properties: { action: { enum: expect.arrayContaining(['list', 'reset']) } } })
  expect(tool?.description).toMatch(/`reset`: only when the user explicitly asks/)
  expect(tool?.description).toMatch(/never because of `\/clear`/)
})

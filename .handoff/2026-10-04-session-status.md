# Handoff: build the session-status mod

You are the orchestrator for the effort `session-status` in `yahyabedirhan/claude-mods`. Build it end to end and deliver one pull request into `main`.

## Where the work is

- Worktree: the treehouse slot this session runs in, on branch `session-status` (cut from `main` at "set up the project for coding agents"). The branch has no upstream until the first `git push -u origin session-status`.
- Spec: issue "Spec: session-status mod shows live session progress, decisions and surprises" (#1).
- Tickets, all labelled `effort:session-status` and `ready-for-agent`, with GitHub's native blocking links set:
  1. "Plugin skeleton: /session-status opens a pane with doing now and last update" (#2): no blockers
  2. "Status tool: record decisions and surprises, show blocked, review later and surprises" (#3): blocked by #2
  3. "Progress, counters and links from events" (#4): blocked by #2
  4. "Auto-open triggers and the narrow-terminal band" (#5): blocked by #3 and #4
  5. "Resolve, history and the end-of-work list" (#6): blocked by #3
  6. "Shipyard pings for blockers" (#7): blocked by #6
  7. "Survive resume, /clear and /compact" (#8): blocked by #3 and #4
  8. "Effort progress from tickets" (#9): blocked by #4
  9. "Observer agent" (#10): blocked by #3
- The repo's rules: `AGENTS.md` and `docs/agents/`.

## Settled decisions

Every design decision is in the spec, from a 25-question grilling with the maintainer. The maintainer approved the spec, the ticket breakdown and the blocking edges, and said to start without more questions. Don't reopen them. Highlights that are easy to miss:

- The pane is read-only. The user answers decisions in the chat, and the agent marks them resolved with the status tool.
- The agent must not interrupt long work for review-later decisions. It collects them and posts one numbered list at the end. It stops only when no safe default exists.
- The user stays in the main session. Subagents' decisions and surprises must reach the main session's pane.
- One test seam: the hooks module through `claude plugin test`, with surfaces `terminal` and `desktop`, a mocked clock and a faked observer model.
- The repo is private now and may become public later. Keep home paths, usernames and secrets out of committed files.

## Mod API facts already gathered

Load the `plugin-authoring` skill first: loading it writes this Claude Code build's API types file and names its path. Grep that file rather than reading it whole. Facts found in this build (Claude Code 2.1.289), so you can go straight to the right declarations:

- Events: classic settings-hook events are hookable as `classic.<Name>`, including `SubagentStart`, `SubagentStop`, `TaskCreated`, `TaskCompleted`, `PreCompact`, `PostCompact` and `SessionStart` (with `source`). `/clear` fires `session.end` with `reason: 'clear'`, then the process continues under a new session id with no `session.start`.
- Subagents: tool calls inside a subagent reach the mod's `tool.call` hooks, with `agentId` set (absent on the main loop).
- Tasks: there is no `$.tasks` noun. Mirror tasks from the classic Task events and from `tool.call` results of the task tools. The TaskUpdate result has `statusChange`, and TodoWrite has `oldTodos` and `newTodos`.
- `$.tool.register({ name, description, inputSchema })` in `session.start`. The model sees `mcp__<plugin>__<name>`, and the mod answers it in a `tool.call` hook on that name. Whether subagents get it is unconfirmed: ticket #3 tests it live.
- `prompt.compose`: append a section with `scope: 'session'`, after every `shared` section. Its input has no `agentId`. Whether it applies to subagents is unconfirmed: test it with #3.
- Panes: `$.ui.open({ id, title })` plus a `ui.render` hook on `{ component: 'Pane', requestId: id }`. A pane the mod opens by itself waits below 144 columns (110 if the user opened that id before). The band is `ui.render` on `AbovePrompt`. See the skill's `pane.tsx` and `band.tsx` examples.
- State: `$.state` lasts for the session and survives hot reload. `$.store` is a per-plugin JSON file that lasts across sessions (4 MiB cap). Whether `$.state` survives `/clear` or `/compact` is unconfirmed: ticket #8 tests it live.
- The built-in "You Should Know" plugin is a mod with a back-off: it tracks seen headlines and backs off when the user types past its cards. Its code is minified and not readable. Copy only the idea for the observer (#10).

## Live checks

Tickets #3 and #8 each need a manual check in a real session, because the test harness can't prove these facts. Run them yourself in a separate Herdr pane, with `claude --plugin-dir <plugin folder>`. Record the results in the pull request. If a check fails, use the fallback the spec names.

## Reaching the maintainer

The maintainer's session that wrote this handoff runs in Herdr and can receive messages. But the maintainer asked for no more questions. Decide open questions yourself, with the spec as the guide, and list each one with your choice in the pull request. Use `shipyard ping` only when the pull request is ready, or when you are truly blocked.

## Suggested skills

- `orchestrate-effort` / `orchestrating`: run the effort and delegate the tickets.
- `plugin-authoring`: the mod API, its types and test kit. Load it before writing any mod code.
- `implement` and `tdd`: for each ticket's delegate.
- `to-pr`: open the pull request.
- `shipyard`: ping the maintainer when the pull request is ready.

# Handoff: fix four session-status issues

You are the orchestrator for the effort `session-status-fixes` in `yahyabedirhan/claude-mods`. Build it end to end and deliver one pull request into `main` for the mod fixes, plus one pull request in `yahyabedirhan/skills` for the settle skills.

## Where the work is

- Worktree: the treehouse slot this session runs in, on branch `session-status-fixes`, cut from `main` at "Create, read, update and delete every kind of session-status entry (#41)".
- There is no spec: each issue is a self-contained ticket. They carry the labels `effort:session-status-fixes` and `ready-for-agent`, and none blocks another:
  1. "session-status: Stop the decision reply printing two periods after the default" (#40). The steps are in the issue.
  2. "session-status: Hide the band's 0/0 done when the session has no items or tasks" (#37). The steps are in the issue.
  3. "session-status: Stop the observer crediting the user's commands to the agent" (#36). The steps are in the issue.
  4. "session-status: Show open review-later decisions at settle" (#15). Read the decision comment on the issue: it replaces the issue's "Decision to make" and its steps.
- #37 and #40 touch `status-tool.ts`, `band.tsx` and shared tests. Land them one after the other, or let the delegates rebase, to avoid conflicts.
- The repo's rules: `AGENTS.md` and `docs/agents/`.

## Settled decisions

- The maintainer said to start with no questions. Don't reopen the issues' steps.
- #15 uses option B. The settle skills tell the agent to list open decisions through the session-status tool (`list` with `filter: { kind: ["decision"], state: "open" }`), post one numbered list, then call `post_decide_list`. The skills never read the store file.
- #15 changes `skills/settle-session/SKILL.md` and `skills/settle-effort/SKILL.md` in `yahyabedirhan/skills`, cloned at `~/Developer/yahyabedirhan/skills`. Make that change in its own worktree and branch of that repo, follow its `AGENTS.md`, and use the `writing-for-agents` skill. Open a separate pull request there, and link it from the claude-mods pull request. Do not install or sync the skill to other machines: that happens after merge.
- Keep the claude-mods pull request to the mod. If #15 needs no mod change, the claude-mods pull request closes #36, #37 and #40, and the skills pull request names #15.

## Checks

- `claude plugin validate plugins/session-status` and `claude plugin test plugins/session-status` must pass on the branch.
- #36 needs a test with a user `/reload-plugins` in the observer's transcript. Use the faked observer model in the test kit.

## Reaching the maintainer

The session that wrote this handoff runs in Herdr and can receive messages. The maintainer asked for no questions. Decide open questions yourself and list each with your choice in the pull request. Use `shipyard ping` only when the pull requests are ready, or when you are truly blocked. Ask before merging.

## Suggested skills

- `orchestrate-effort` / `orchestrating`: run the effort and delegate the tickets.
- `plugin-authoring`: the mod API, its types and test kit. Load it before touching mod code.
- `implement` and `tdd`: for each ticket's delegate.
- `writing-for-agents`: for the settle skills change in #15.
- `to-pr`: open the pull requests.
- `shipyard`: ping the maintainer when the pull requests are ready.

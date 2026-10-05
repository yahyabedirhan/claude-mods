# claude-mods

Claude Code mods I made. A mod changes how Claude Code behaves or looks: a live pane, a band above the prompt, a status line or a hook. Each one is a Claude Code plugin with a TypeScript hooks module, so mods run only in Claude Code; other harnesses don't load them.

Mods are not sandboxed: they run with Claude Code's own access. Read a mod before you install it.

## Install

Add this repo to Claude Code once:

```bash
claude plugin marketplace add yahyabedirhan/claude-mods
```

Then install any mod by its name from [Mods](#mods):

```bash
claude plugin install <mod-name>@claude-mods
```

For example `session-status@claude-mods`. The first command also takes a local path to a clone of this repo, which is handy while you work on a mod.

## Mods

| Mod | What it does | Install |
|---|---|---|
| [session-status](plugins/session-status/README.md) | A read-only pane that shows what a long session is doing, the decisions it needs from you, its progress and its surprises. | `claude plugin install session-status@claude-mods` |

## How the mods work

### session-status

Long sessions, especially ones that run many subagents, hide their state in the chat. `session-status` keeps it in a pane beside the chat: the agent records decisions and surprises with a status tool, and the mod counts the rest from session events.

```text
opens        by itself on the first subagent, task list, effort or recorded item; /session-status toggles it
pane         state · now · blocked on you · session · effort · created · places · surprises · review later · subagents · cron jobs · last update
progress     every session counts its items done of all, effort tickets included; the total grows as you ask for more
narrow       a one-line band above the prompt: 2 blocked · 1 review · items 4/9 · closed 1/13 · 1 surprise
you answer   in the chat; the agent resolves the decision, and the pane moves it to the history
end of work  one numbered list of open review-later decisions, highlighted in the pane
pings        a shipyard ping for each blocked decision, withdrawn once it's answered (optional)
observer     a Haiku check every few turns for loops, time sinks and off-flow steps, shown as [observer] surprises
survives     resume, /clear (open decisions and items carry over) and /compact
```

An example pane, midway through an effort, with one decision waiting on you:

```text
● Blocked
Now
Edit: crons.tsx
Blocked on you (1)
D3 · Should the band show cron jobs too?
  Unblocks: Answer yes or no in the chat.
  Recommended: No, the pane is enough.
  Options: Yes / No
Session
Branch   cron-readable
Worktree claude-mods-8ec7ac/1
Items 4/9 █████████░░░░░░░░░░░
○ I2 Open the pull request
○ I3 Settle
Building: #21, #22
Effort  session-status-v2
Closed 2/7 ██████░░░░░░░░░░░░░░
Created
PR claude-mods#18 · issue claude-mods#19 · issue skills#163
skills  2 files · 1 command
Surprises (1)
S1 · CronCreate's result has no readable schedule.
  Changed: The mod formats the cron expression itself.
Review later (1)
D2 · Which word marks a week-old recurring job?
  Default: expired
Subagents
1 running · 2 finished
Cron jobs
1 active · 1 fired
weekdays 09:00 · Check the build and report.
Answered (4)
Last update 09:41:07 · 12s ago
```

## Adding a mod

Put it in `plugins/<name>/` with `.claude-plugin/plugin.json`, `hooks/hooks.json`, its hooks module and its `*.test.ts` tests. List it in `.claude-plugin/marketplace.json`, which is how Claude Code finds the mods in this repo. Add its row to [Mods](#mods) and its section under [How the mods work](#how-the-mods-work), in the same shape: two sentences, one outline and, optionally, an example of what the mod shows.

Check a mod before you commit it:

```bash
claude plugin validate .                    # the repo's mod list
claude plugin validate plugins/<name>       # the mod's manifest and hooks module
claude plugin test plugins/<name>           # the mod's tests
tsc -p plugins/<name>                       # type-check the mod
```

The type-check needs the mod's generated types. A mod's `tsconfig.json` extends `.claude-plugin/types/tsconfig.json`, which Claude Code writes when it loads the mod. Load it once, for example with `claude --plugin-dir plugins/<name>`, before you run `tsc`. Don't commit the generated `types` folder.

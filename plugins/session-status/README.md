# session-status

A read-only pane that shows what the session is doing, what it needs from
you and what surprised it. The agent keeps it current with a status tool; you
answer in the chat.

```sh
claude plugin install session-status@claude-mods
```

## The pane

Sections, top to bottom. An empty section is not drawn.

```text
Doing now        the current task, else the last tool call
Blocked on you   every open blocked decision
Review later     the newest 3, then "+N more"
Session          Effort    video-review-v1       during an effort
                 Branch    pane-width
                 Worktree  claude-mods-8ec7ac/1
                 Landed 4/9 ████████░░░░          Tasks 2/5 outside an effort
                 Building: #3, #5
                 PR claude-mods#14 · issue claude-mods#15
Effort           Closed 1/13 █░░░░░░░░░░░         during an effort
Places (2)       skills  PR skills#88 · 3 files · 2 commands
                 docs  1 command
Surprises        the newest 2, then "+N more"
Subagents        running · finished
Answered (N) · Last update
```

1. **Doing now**: the current task, or the last tool call (its description,
   file name or programs).
2. **Blocked on you**: decisions that stop the work until you answer.
3. **Review later**: decisions the agent made with a safe default, each with
   that default.
4. **Session**: this session's own work, in every session.
   - **Effort** (during an effort), **Branch** and **Worktree** (the two
     folders above the repository folder). The full path stays in the status.
   - **Landed** during an effort: the tickets the orchestrator reported
     landed, of all it reported in this session. **Tasks** outside an
     effort: the task list's tasks done.
   - **Building**: the tickets the orchestrator builds now.
   - The pull requests and issues created in this repository.
5. **Effort**: the tracker's count, during an effort: closed tickets of all
   the effort's issues. It never mixes in the orchestrator's reports.
6. **Places**: the other repositories the session changed (see
   [Places](#places)).
7. **Surprises**: unexpected things and what they changed. Observer findings
   carry an `[observer]` tag.
8. **Subagents**: running and finished.
9. **Answered**: how many decisions were resolved and surprises dismissed.
10. **Last update**: its time and age.

Links go to GitHub when the repository's `origin` remote is there: the effort
links its issues list (`label:effort:<name>`), the branch its tree, each
ticket being built its issue, and each pull request, issue and place its page.

Colour carries meaning, from Claude Code's theme, so it reads in light and
dark themes: headings are bold and labels dim; blocked decisions and the
end-of-work list take the warning colour, the bars the success colour, and
item ids and the tickets being built the accent colour.

When the terminal is too narrow for the pane, a one-line band above the
prompt shows the counts instead:
`<n> blocked · <n> review · landed 4/9 · closed 1/13 · <n> surprise`. Outside
an effort the session figure is the tasks' `<done>/<total> done`, and the
effort figure is left out.

## Opening it

- `/session-status` opens or closes the pane.
- The pane opens by itself, once per session, when a subagent starts, a task
  list is made, an effort is found, a ticket is reported, or a decision or
  surprise is recorded.
  A pane you closed stays closed until you open it again.

## The status tool

The mod adds the tool `mcp__session-status__status` and a short system
prompt section that tells the agent how to use it. Actions:

| Action | What it does |
| --- | --- |
| `record_decision` | Records a decision: question, two to four options, a default, what unblocks it, and urgency `blocked` or `review_later`. |
| `record_surprise` | Records a surprise: what occurred and what it changed. |
| `resolve` | Marks a decision (`D1`, ...) resolved after you answer it in the chat. |
| `dismiss` | Dismisses a surprise (`S1`, ...) when you ask. |
| `post_end_list` | Marks the end-of-work list posted. |
| `ticket` | Reports a ticket's state during an effort: `number`, `title`, `state` (`started`, `landed` or `stopped`) and, on the first call, `effort`. |

**Short items.** The prompt section, the tool's description and the
observer's instructions ask for the same style: each field one short, clear
sentence in plain technical style, with active voice, one idea per sentence,
no lists and no filler. There is no character limit.

**End-of-work list.** The agent collects review-later decisions while it
works. At the end, it posts one numbered list of the open ones in the chat
and calls `post_end_list`. The pane highlights each listed decision until it
is resolved.

## Effort progress

During an effort the pane shows two counts that never mix:

- **Session** (`Landed 4/9`): what the orchestrator reported in this session.
- **Effort** (`Closed 1/13`): what the tracker says. An issue often closes
  long after its ticket is built: when the pull request merges, after QA,
  or never in a run that shares its issues.

The orchestrator reports each ticket with the `ticket` action:

| State | When the orchestrator reports it | What Session does |
| --- | --- | --- |
| `started` | It delegates the ticket. | Names the ticket: `Building: #3`. |
| `landed` | The ticket's commit is on the effort branch. | Counts the ticket as landed. |
| `stopped` | A started ticket is no longer being built. | Removes the ticket. A ticket started again after it landed (rework) goes back to landed. |

- **Landed** is the tickets reported landed, of all the tickets reported for
  the current effort. Both can grow.
- **Closed** is the closed issues with the label `effort:<name>`, of all of
  them, without the `Spec:` issue.
- **The effort's name** comes from the `effort` field of a `ticket` call,
  from an `effort:<name>` label in a command, or from the git branch. A
  report that names another effort switches the session to it; only that
  effort's reports count.
- A `stopped` for a ticket never reported changes nothing.
- A ticket without an issue number is reported by its title alone.
- **Without `gh`** the Effort section is left out; Session still counts.

## Places

Places is the blast radius: every repository other than the session's own
that the session, or one of its subagents, changed. Each line counts:

- the pull requests and issues created there;
- the files edited or written there (`Edit`, `Write`, `NotebookEdit`), each
  once;
- the commands that changed something there: `git commit`, `push`, `merge`,
  `rebase`, `tag`; `gh pr create`, `edit`, `merge`, `close`; `gh issue
  create`, `edit`, `close`, `comment`; `mv`, `rm`, `cp`.

Reads never count. A file's repository comes from `git rev-parse
--show-toplevel` in its folder, read once per folder in the background. A
command's repository is the session's directory, or the one that `cd <dir>
&&`, `git -C <dir>` or `gh --repo <owner>/<name>` names. A zero count is left
out of the line.

## Resume, `/clear` and `/compact`

- **Resume** restores the session's saved status. A session with no saved
  status starts empty.
- **`/clear`** starts a new status and carries the open decisions (same ids),
  the effort and the reported tickets over to it. Session progress goes on
  while the effort stays the same; a report for a different effort starts it
  from zero.
- **`/compact`** keeps the status as it is.

## Optional tools

All are skipped silently when they are missing.

- **`git`** for the branch, the worktree, the GitHub links and Places. It
  runs in the background and never holds a tool call.
- **`shipyard` and Herdr** for pings: a ping for each blocked decision
  (withdrawn when it is resolved), and one ping when the end-of-work list is
  posted.
- **`gh`** for links and effort progress: created pull requests and issues
  are read from `gh` output, and the effort's tickets are counted with
  `gh issue list`. Without it, the Effort section is left out.

## The observer

While the pane is open, a small model (Haiku) checks the recent work for
loops, repeated work, time sinks and steps that don't match the task list or
the effort. Its findings show as surprises tagged `[observer]`; they never
reach the main agent.

- It checks every 5 main-loop turns and when a subagent finishes.
- Each finding you dismiss doubles the turn interval, up to 40 turns. After
  a dismissal, a finished subagent also waits for that interval.
- At most 20 checks per session. Each check is one short request, so the
  cost is small.

## Privacy

- The observer sends clipped transcript text (recent messages and tool
  calls, each cut short) to the model through Claude Code's own client.
- The status is saved in the plugin's store, keyed by session id; the newest
  30 sessions are kept. A Bash command without a description is saved as its
  programs and subcommands only, never its arguments.
- The status keeps the session's repository folder and, for Places, the
  paths of the files edited in other repositories. The pane shows neither.

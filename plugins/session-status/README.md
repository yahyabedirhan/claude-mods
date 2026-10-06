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
● In progress    the session's state: Blocked, In progress, Settling, Waiting for reply or Settled
Now              the current task, else the last tool call
Blocked on you   every open blocked decision
You should know  every open blocker: what failed and what unblocks it
Session          ID        cb8cbec3-754b-4b30-80d5-014a9daf1042
                 Branch    pane-width           press the ID, branch or worktree to copy it
                 Worktree  claude-mods-8ec7ac/1
                 Progress 7/19 ███████░░░░░       the session's items and effort tickets
                 ○ I8 Open the pull request       2 items, open ones first, then "+N more"
                 ✓ I7 Run the tests
                 Building: #3, #5
                 Tasks 2/5 ████████░░░░░          while a task list exists
Effort           video-review-v1                  during an effort
                 Closed 1/13 █░░░░░░░░░░░         once the tracker counted it
                 ○ #4 Effort progress             2 tickets, open ones first, each a link
                 ○ #5 Observer agent
                 +11 more
Created          PR claude-mods#14 · PR skills#88 · issue claude-mods#15
Places (2)       skills  3 files · 2 commands
                 docs  1 command
Decide before settling     the newest 5, asked ones first, then a pressable "+N more"
Follow-up after settling   the newest 3, then a pressable "+N more"
Surprises        the newest 2, then a pressable "+N more"
Observations     the observer's findings, dim: the newest 2, then "+N more"
Subagents        running · finished
Cron jobs        1 active · 1 fired · 1 expired · 1 cancelled
                 weekdays 09:00 · Check the build and report.
Answered (N) · Last update
```

1. **State**: one word for the whole session, by priority.
   - **Blocked** while a blocked decision or a blocker is open.
   - **In progress** while a turn or a subagent runs.
   - **Settling** while a turn that runs `settle-session` or `settle-effort`
     runs.
   - **Waiting for reply** once the turn ended.
   - **Settled** once a turn that ran `settle-session` or `settle-effort`
     ended, as a Skill call or as the slash command you typed; the next turn
     clears it.
2. **Now**: the current task, or the last tool call (its description, file
   name or programs).
3. **Blocked on you**: decisions that stop the work until you answer.
4. **You should know**: what the agent tried that failed and that it cannot
   finish alone: a denied action, a check that cannot run, a tool that
   refuses to start. Each says what you can do to unblock it (run a command,
   restart Claude Code, allow an action), pings you, and stays until the
   agent resolves it.
5. **Session**: this session's own work, in every session.
   - **ID**, **Branch** and **Worktree** (the two folders above the repository
     folder, or `worktrees/<name>` for a worktree in a `worktrees` folder).
     Press a value to copy it to the clipboard: the full session ID, the
     branch name, or the worktree's full path.
   - **Progress**: how close the session is to settling, as done of all (see
     [Session progress](#session-progress)). The total grows as the session
     takes on more work.
   - The items, each with its id: two of them, the open ones first (`○`,
     oldest first), then the done ones (`✓`, newest first), then a pressable
     "+N more" for every item behind Progress. Dropped items are left out.
   - **Building**: the tickets the orchestrator builds now.
   - **Tasks**: the task list's tasks done, on a line of its own. It never
     mixes into Progress.
6. **Effort**, during an effort: its name, then the tracker's count once it
   has one: closed tickets of all the effort's issues, `QA:` tickets
   included. It never mixes in the orchestrator's reports. Below it, two
   tickets, the open ones first (`○`), then the closed ones (`✓`), each in
   issue-number order; each number links to its issue. A pressable
   "+N more" lists every ticket of the effort.
7. **Created**: the pull requests and issues the session made, in every
   repository, newest 5 first, then "+N more". The agent adds one it works
   on but did not make, such as a pull request from an earlier session, with
   the status tool's `link` action and the page's URL.
8. **Places**: the other repositories the session changed (see
   [Places](#places)).
9. **Decide before settling**: decisions the agent went on with a default
   for, which you answer before the session settles. The ones it asked you
   about in the chat (its decide list) come first, their ids in the warning
   colour; then the newest of the rest, five in all.
10. **Follow-up after settling**: decisions that can wait until after the
    session settles, each with the default the agent went on with. They never
    hold up settling.
11. **Surprises**: unexpected things the agent recorded and what they changed.
12. **Observations**: the observer's findings (see [The observer](#the-observer)),
    kept apart from what the agent itself knows, under a dim heading.
13. **Subagents**: running and finished.
14. **Cron jobs**: the jobs the session scheduled with `CronCreate`, counted
    as active, fired, expired or cancelled, then each active job's schedule
    and prompt (the newest 3, then "+N more"). The schedule is short text
    (`every 5m`, `hourly`, `daily 09:00`, `weekdays 09:00`, `Mondays 08:00`,
    `monthly on the 1st 09:00`, `Dec 25 03:07`), or the cron expression when
    it has no short form. A job fires when a turn starts with its prompt; a
    one-shot job is then done. A recurring job expires 7 days after
    `CronCreate` scheduled it, as Claude Code expires it. `CronDelete` cancels
    a job, and a one-shot job that `CronList` no longer lists has fired.
15. **Answered**: how many decisions and blockers were resolved and surprises
    dismissed.
16. **Last update**: its time and age.

**"+N more"** under the session items, the effort's tickets, Decide before settling, Follow-up
after settling, Surprises and Observations is a button:
pressing it turns the pane into that whole list, newest first (the items:
and the tickets: open ones first), with a
**← Back** button (or the `b` key) to return. Closing the pane returns it to
every section.

Links go to GitHub when the repository's `origin` remote is there: the effort
links its issues list (`label:effort:<name>`), the branch its tree, each
ticket being built its issue, and each pull request, issue and place its page.

Colour carries meaning, from Claude Code's theme, so it reads in light and
dark themes: headings are bold and labels dim; the state line takes the
warning colour when blocked, the success colour in progress, the accent
colour waiting for a reply, and is dim when settled; blocked decisions,
blockers and the decisions asked in the chat take the warning colour, and decision, surprise and
session item ids and the tickets being built the accent colour. The progress
bars stay neutral.

When the terminal is too narrow for the pane, a one-line band above the
prompt shows the counts instead:
`<n> blocked · <n> decide · <n> follow-up · progress 7/19 · tasks 2/5 · closed 1/13 · <n> surprise`.
`blocked` counts blocked decisions and blockers; `surprise` leaves the
observer's findings out.
`follow-up` shows while there is one, `tasks` while a task list exists, and
`closed` during an effort.
Without items or effort tickets the session figure is the tasks'
`<done>/<total> done`.

## Opening it

- `/session-status` opens or closes the pane; `/session-status reset` clears the whole session status (see below).
- The pane opens by itself, once per session, when a subagent starts, a task
  list is made, an effort is found, a ticket or a session item is reported,
  or a decision or surprise is recorded.
  A pane you closed stays closed until you open it again.

## The status tool

The mod adds the tool `mcp__session-status__status` and a short system
prompt section that tells the agent how to use it. Actions:

| Action | What it does |
| --- | --- |
| `record_decision` | Records a decision: question, two to four options, a default, what unblocks it, and urgency `blocked`, `before_settling` or `after_settling`. |
| `record_surprise` | Records a surprise: what occurred and what it changed. |
| `record_blocker` | Records a blocker: what failed (`failed`) and what you can do to unblock it (`needs`). It pings you. |
| `resolve` | Marks a decision (`D1`, ...) resolved after you answer it in the chat, or a blocker (`B1`, ...) resolved once it works. |
| `dismiss` | Dismisses a surprise (`S1`, ...) when you ask. |
| `post_decide_list` | Marks the decide list posted. |
| `ticket` | Reports a ticket's state during an effort: `number`, `title`, `state` (`started`, `landed` or `stopped`) and, on the first call, `effort`. |
| `item` | Reports a session item: `state` `added` with a `title` (the reply names its id, `I1`, ...), or `done` or `dropped` with its `id`. |

**Short items.** The prompt section, the tool's description and the
observer's instructions ask for the same style: each field one short, clear
sentence in plain technical style, with active voice, one idea per sentence,
no lists and no filler. There is no character limit.

**Decide list.** The agent collects before-settling decisions while it
works. When the work is done, it posts one numbered list of the open ones in
the chat and calls `post_decide_list`. The pane highlights each asked
decision until it is resolved. Follow-ups are never on the list.

## Session progress

Every session shows how close it is to settling: `Progress 7/19`, done of all.
The total is the session's items plus, during an effort, the effort's
tickets.

**Items.** The main session reports each piece of work it must do before it
settles with the `item` action. The total grows as the session goes on.

| State | When the agent reports it | What Progress does |
| --- | --- | --- |
| `added` | You ask for something: one item for each request or sub-request. Also follow-up work the agent takes on, and each step left before the session settles (review, pull request, your approval, merge, settle). | Counts one more item and lists it as open. |
| `done` | The item's work is finished and verified. | Counts it as done. |
| `dropped` | The item is no longer needed, or a later item replaced it. | Takes it out of the total, even after it was done. |

- An item is never reopened: rework is a new item. A dropped item stays
  dropped.
- Only the main session reports items; a subagent's `item` call is refused.
- The task list (`TaskCreate`, `TodoWrite`) keeps its own **Tasks** line and
  never mixes into Progress.

**Effort tickets.** During an effort, Progress also counts the effort's
tickets: every ticket the tracker counted, or the tickets reported when they
are more. A ticket counts as done once the orchestrator reports it landed.
`Spec:` and `QA:` issues are left out: you close a QA ticket by hand, so the
orchestrator never lands one. The agent adds no item for a ticket.

## Effort progress

During an effort the pane shows two counts that never mix:

- **Session** (`Progress 7/19`): the session's items and the tickets the
  orchestrator reported landed, of every ticket of the effort.
- **Effort** (`Closed 1/14`): what the tracker says. An issue often closes
  long after its ticket is built: when the pull request merges, after QA,
  or never in a run that shares its issues. It counts the `QA:` tickets: the
  effort is not finished until they close.

The orchestrator reports each ticket with the `ticket` action:

| State | When the orchestrator reports it | What Session does |
| --- | --- | --- |
| `started` | It delegates the ticket. | Names the ticket: `Building: #3`. |
| `landed` | The ticket's commit is on the effort branch. | Counts the ticket as landed. |
| `stopped` | A started ticket is no longer being built. | Removes the ticket. A ticket started again after it landed (rework) goes back to landed. |

- **Session** counts the tickets reported landed, of all the effort's
  tickets without `QA:` ones.
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
that the session, or one of its subagents, changed files or ran changing
commands in. Each line counts:

- the files edited or written there (`Edit`, `Write`, `NotebookEdit`), each
  once;
- the commands that changed something there: `git commit`, `push`, `merge`,
  `rebase`, `tag`; `gh pr edit`, `merge`, `close`; `gh issue edit`, `close`,
  `comment`; `mv`, `rm`, `cp`.

The pull requests and issues made there show in **Created**, so `gh pr
create` and `gh issue create` are not counted here. With one place its line
shows alone; with two or more the heading `Places (N)` leads them.

Reads never count. A file's repository comes from `git rev-parse
--show-toplevel` in its folder, read once per folder in the background. A
command's repository is the session's directory, or the one that `cd <dir>
&&`, `git -C <dir>` or `gh --repo <owner>/<name>` names. A zero count is left
out of the line.

## Resume, `/clear` and `/compact`

- **Resume** restores the session's saved status. A session with no saved
  status starts empty.
- **`/clear`** starts a new, empty status, because it starts a new session
  id: nothing carries over, and ids start over at 1. The old session keeps
  its saved status, which `/resume` of that session restores.
- **`/compact`** keeps the status as it is.

To start an unrelated task from nothing, type **`/session-status reset`**. It
removes everything the status recorded: the session items, the decisions,
surprises and blockers (open ones too), the created links, the reported
tickets, the effort and its ticket count. Ids start over at 1. What the session
runs now stays: its tasks, crons, subagents and place. The model can do the
same with the status tool's `reset` action, which it calls only when you
explicitly ask for a reset, never on its own or because of `/clear`. Its
`list` action names every open item, decision, blocker and surprise with its
id, so the model can close them after `/compact` took the ids out of its context.

## Optional tools

All are skipped silently when they are missing.

- **`git`** for the branch, the worktree, the GitHub links and Places. It
  runs in the background and never holds a tool call.
- **`shipyard` and Herdr** for pings: a ping for each blocked decision
  (withdrawn when it is resolved), and one ping when the decide list is
  posted.
- **`gh`** for links and effort progress: created pull requests and issues
  are read from `gh` output, and the effort's tickets are counted with
  `gh issue list`. Without it, the Effort section is left out.

## The observer

While the pane is open, a small model (Haiku) checks the recent work for
what the agent does not see itself: the same failing step tried three or
more times, many turns spent on a side issue, and steps that contradict the
effort, the task list or the session items. Small details and single errors
are not findings, and an unsure check gives none; one check adds at most
one finding. Findings show under **Observations**; they never reach the
main agent. What the agent knows it is stuck on is a blocker, under **You
should know**.

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

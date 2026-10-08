# session-status

A pane that shows what the session is doing, what it needs from you and what
surprised it. The agent keeps it current with a status tool; you answer in
the chat, or with the buttons under each decision.

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
                 Progress 7/19 ███████░░░░░       the session's own items
                 ○ I8 Open the pull request       2 items, open ones first, then "+N more"
                 ✓ I7 Run the tests
                 Building: #3, #5
Effort           video-review-v1                  during an effort
                 Closed 1/13 █░░░░░░░░░░░         the issues GitHub closed
                 ○ #4 Effort progress             2 tickets, open ones first, each a link
                 ○ #5 Observer agent
                 +11 more
Task             Done 2/5 ████████░░░░░           while a task list exists
                 ◐ Write the tests                2 tasks, running ones first
                 ○ Update the README
                 +3 more
Links            󰓂 claude-mods#14 · 󰘭 skills#88 · ◎ claude-mods#15
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
   - **Progress**: this session's own items, done of all (see
     [Session progress](#session-progress)). The total grows as the session
     takes on more work. Effort tickets and tasks never count here.
   - The items, each with its id: two of them, the open ones first (`○`,
     oldest first), then the done ones (`✓`, newest first), then a pressable
     "+N more" for every item behind Progress. Dropped items are left out.
   - **Building**: the tickets the orchestrator builds now, the first 4,
     then a pressable "+N more".
6. **Effort**, during an effort: its name, then the tracker's count once it
   has one: closed tickets of all the effort's issues, `QA:` tickets
   included. It never mixes in the orchestrator's reports. Below it, two
   tickets, the open ones first (`○`), then the closed ones (`✓`), each in
   issue-number order; each number links to its issue. A pressable
   "+N more" lists every ticket of the effort.
   **Task**, while Claude Code's task list (`TaskCreate`, `TodoWrite`) has a
   task: the tasks completed of all, then two tasks, the running ones first
   (`◐`), then the pending (`○`), then the completed (`✓`), and a pressable
   "+N more" that lists them all.
7. **Links**: the pull requests and issues attached to the session, in
   every repository, newest 5 first, then "+N more". The session's
   `gh pr create` and `gh issue create` add theirs by themselves; the agent
   adds one it works on but did not make, such as a pull request from an
   earlier session, with the status tool's `link` action and the page's URL.
   Both look the same. A mark before each gives its kind and state:

   | Page | Open | Done |
   |---|---|---|
   | Pull request | `󰓂` green | merged: `󰘭` purple; closed without merging: `󰓂` red |
   | Issue | `◎` green | closed: `⊙` purple |

   The pull request marks are Nerd Font glyphs (Material Design's
   `source_pull` and `source_merge`), drawn in the terminal; the desktop shows
   `⇄` in the same colours. The pane reads each page's state from GitHub
   with one `gh api graphql` call: when a link joins, right after a `gh pr`
   or `gh issue` command, and at most every two minutes while the session
   works. A page merged or closed anywhere, by anyone, shows so; without
   `gh` or a network, the marks keep their last state. Each label is a link
   to its page: Cmd+click opens it in Ghostty, and Cmd+Shift+click when the
   pane runs inside Herdr.
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

**Every "+N more" is a button**: under the session items, the Building
line, the effort's tickets, the tasks, the links, Decide before settling,
Follow-up after settling, Surprises, Observations and the cron jobs. A new
section that shows "+N more" follows the same rule. It is a button:
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
Without items the session figure is the tasks'
`<done>/<total> done`; with no items and no tasks the band leaves it out.

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
| `resolve` | Marks a decision (`D1`, ...) resolved after you answer it in the chat, or a blocker (`B1`, ...) resolved once it works. A button answer resolves the decision itself. |
| `dismiss` | Dismisses a surprise (`S1`, ...) when you ask. |
| `post_decide_list` | Marks the decide list posted. |
| `ticket` | Reports a ticket's state during an effort: `number`, `title`, `state` (`started`, `landed` or `stopped`) and, on the first call, `effort`. |
| `item` | Reports a session item: `state` `added` with a `title` (the reply names its id, `I1`, ...), or `done` or `dropped` with its `id`. |
| `create` | Adds one entry of any kind: `kind` and `fields`. |
| `read` | Returns the entries an optional `filter` keeps (see below); without one, everything. |
| `update` | Changes the given `fields` of one entry: `kind`, `id` and `fields`. A closed entry can open again. |
| `delete` | Removes one entry: `kind` and `id`. |

The other actions are shortcuts for the generic four. Each shortcut and its
generic action share the same pure function, such as `closeItem` for
`resolve` and an `update` to `resolved`. The agent uses the generic
actions when you ask, and when an automatic path recorded something wrong,
such as a false link or a false effort.

| Kind | Id | Fields `update` can set | Automatic source |
| --- | --- | --- | --- |
| `item` | `I5` | `title`, `state` | none |
| `decision` | `D1` | `question`, `options`, `default`, `unblocks`, `urgency`, `state` | none |
| `surprise` | `S2` | `occurred`, `changed`, `state` | the observer |
| `blocker` | `B1` | `failed`, `needs`, `state` | none |
| `ticket` | `#4` | `title`, `state` | `ticket` reports |
| `link` | `claude-mods#27` | `state` (`open`, `merged`, `closed`) | `gh pr create`, `gh issue create`, `gh` merge and close commands, the GitHub read |
| `effort` | its name | `name` | effort skills, `effort:` labels in `gh` commands |
| `task` | the task id | `subject`, `status` | the task tools and Task events |
| `cron` | the job id | `state` | the Cron tools |
| `place` | `owner/repo` | none (`delete` only) | changing commands and file edits |

`create` takes the fields the record actions take, such as `title`,
`question` or `url`. A cron job and a place are created only by their
automatic sources. A task the agent creates gets the id `manual-1`, ...

**Manual and automatic values.** A value the agent sets with `update` stays
until its automatic source reports a new change. A link you set to `closed`
stays `closed` until GitHub reports another state than it reported before.
A `gh pr reopen` or a task event is a new change each time, so it
overwrites the value. An entry that `delete` removed does not come back from
an automatic source, and its id is not given again. `create` or `link`
brings a deleted entry back.

Each generic call returns one line that says what changed, for example
`Link skills#88 deleted.` An unknown kind, an unknown id or a field that the
kind does not have returns an error that names the allowed values. A
subagent can change only the entries that it created.

**Short items.** The prompt section, the tool's description and the
observer's instructions ask for the same style: each field one short, clear
sentence in plain technical style, with active voice, one idea per sentence,
no lists and no filler. There is no character limit.

**Decide list.** The agent collects before-settling decisions while it
works. When the work is done, it posts one numbered list of the open ones in
the chat and calls `post_decide_list`. The pane highlights each asked
decision until it is resolved. Follow-ups are never on the list.

**Quick reply.** Each open decision in Blocked on you, Decide before settling
and Follow-up after settling has a row of buttons under it:

```
D4 · Use SQLite or Postgres for the cache?
  Default: SQLite
  [ SQLite ✓ ]  [ Postgres ]  [ Discuss ]
```

- An option button resolves the decision, withdraws its ping when it is
  blocked, and sends `D4: Postgres` as your own words. The default's button
  has a `✓`.
- Option buttons show only when every option has 30 characters or fewer;
  otherwise only Discuss shows. The agent is told to write options in a few
  words.
- Discuss sends `Let's discuss D4: <question>`. The agent explains the
  context and each option's trade-off in the chat and waits for you. The
  decision stays open with a `(discussing)` mark, and its buttons stay,
  until you answer or the agent resolves it.
- A plugin's prompt runs once the session is idle, so a press during a turn
  reaches the agent when that turn ends.

## Session progress

The pane shows three kinds of progress, and they never mix:

| Section | Counts | Done when |
| --- | --- | --- |
| **Session** (`Progress 7/19`) | the items this session is responsible for | the session marks the item `done` |
| **Effort** (`Closed 1/14`) | the effort's GitHub issues, without the `Spec:` issue | GitHub closes the issue |
| **Task** (`Done 2/5`) | Claude Code's task list | the task is completed |

A session without an effort shows only Session. A session that builds an
effort adds an item for each ticket it takes on and marks it done when its
work lands; the issue, and the Effort bar, move only when GitHub closes it,
usually when you merge. So a settled session reads full while its issues
are still open:

```text
1. the agent adds  I5 Build #4         Session 4/5   Effort 3/9
2. its work lands in the pull request  Session 5/5   Effort 3/9   (#4 still open)
3. you merge; GitHub closes #4         Session 5/5   Effort 4/9
```

**Items.** The main session reports each piece of work it must do before it
settles with the `item` action. The total grows as the session goes on.

| State | When the agent reports it | What Progress does |
| --- | --- | --- |
| `added` | You ask for something: one item for each request or sub-request. Also each effort ticket it takes on, follow-up work, and each step left before the session settles (review, pull request, your approval, merge, settle). | Counts one more item and lists it as open. |
| `done` | The item's work is finished and verified. | Counts it as done. |
| `dropped` | The item is no longer needed, or a later item replaced it. | Takes it out of the total, even after it was done. |

- An item is never reopened: rework is a new item. A dropped item stays
  dropped.
- Only the main session reports items; a subagent's `item` call is refused.

## Effort progress

**Effort** (`Closed 1/14`) is what GitHub says: the closed issues with the
label `effort:<name>`, of all of them, without the `Spec:` issue. An issue
often closes long after its ticket is built: when the pull request merges,
after QA, or never in a run that shares its issues. It counts the `QA:`
tickets: the effort is not finished until they close.

The orchestrator reports each ticket with the `ticket` action:

| State | When the orchestrator reports it | What Session does |
| --- | --- | --- |
| `started` | It delegates the ticket. | Names the ticket: `Building: #3`. |
| `landed` | The ticket's commit is on the effort branch. | Takes it off the Building line. |
| `stopped` | A started ticket is no longer being built. | Takes it off the Building line. A ticket started again after it landed (rework) goes back to landed. |

- Ticket reports feed only the Building line; they never change a bar.
- **The effort's name** comes from the `effort` field of a `ticket` call,
  from an `effort:<name>` label in a command, or from the git branch. A
  report that names another effort switches the session to it; only that
  effort's reports count.
- A `stopped` for a ticket never reported changes nothing.
- A ticket without an issue number is reported by its title alone.
- **Without `gh`** the Effort section is left out; Session still counts its items.

## Places

Places is the blast radius: every repository other than the session's own
that the session, or one of its subagents, changed files or ran changing
commands in. Each line counts:

- the files edited or written there (`Edit`, `Write`, `NotebookEdit`), each
  once;
- the commands that changed something there: `git commit`, `push`, `merge`,
  `rebase`, `tag`; `gh pr edit`, `merge`, `close`; `gh issue edit`, `close`,
  `comment`; `mv`, `rm`, `cp`.

The pull requests and issues made there show in **Links**, so `gh pr
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
surprises and blockers (open ones too), the links, the reported
tickets, the effort and its ticket count, and the record of what `delete`
removed of those kinds. Ids start over at 1. What the session runs now
stays: its tasks, crons, subagents, place and places. The model can do the
same with the status tool's `reset` action, which it calls only when you
explicitly ask for a reset, never on its own or because of `/clear`. Its
`list` action names every open item, decision, blocker, surprise and
observation with its id, so the model can close them after `/compact` took the
ids out of its context.

`list` takes an optional `filter`, so the model reads only what you ask
about. Different keys must all match; the values of one key match if one of
them matches.

| Key | Values | Default |
| --- | --- | --- |
| `kind` | `item`, `decision`, `blocker`, `surprise`, `observation`, `ticket`, `effort`, `link`, `task`, `cron`, `place` | all kinds |
| `state` | `open`; `closed` (resolved, dismissed, done, dropped, landed, a merged or closed link, a completed task, a cron job no longer active); `all` | `open` |
| `id` | ids such as `D1`, `S2`, `I16`, a ticket as `#3`, a link as `claude-mods#27` (any case) | all ids |

An observation is a surprise the observer found; `surprise` leaves it out.
The effort and a place have no state, so they show with any `state`. For example, "read
the observations" is `{ "kind": ["observation"] }`, and "which decisions did
I answer" is `{ "kind": ["decision"], "state": "closed" }`. Without a filter,
`list` also names the done items and every reported ticket, and leaves out
the links, tasks, cron jobs and places that the pane shows by themselves;
`read` without a filter returns everything. An unknown kind or state returns
an error that names the allowed values.

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

While the pane is open, a small model (Haiku 5.5, through Claude Code's
`haiku` alias) checks the recent work for
what the agent does not see itself: the same failing step tried three or
more times, many turns spent on a side issue, and steps that contradict the
effort, the task list or the session items. Small details and single errors
are not findings, and an unsure check gives none; one check adds at most
one finding. Findings show under **Observations**; they never reach the
main agent. What the agent knows it is stuck on is a blocker, under **You
should know**.

- It reads each step as the user's, the agent's or a subagent's. A command
  you run yourself, such as `/reload-plugins` or `!git status`, is marked as
  yours, and the observer is told not to count it against the agent.
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

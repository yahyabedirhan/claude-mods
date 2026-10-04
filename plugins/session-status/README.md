# session-status

A read-only pane that shows what the session is doing, what it needs from
you and what surprised it. The agent keeps it current with a status tool; you
answer in the chat.

```sh
claude plugin install session-status@claude-mods
```

## The pane

Sections, top to bottom. An empty section is not drawn.

1. **Doing now**: the current task, or the last tool call (its description,
   file name or programs).
2. **Blocked**: decisions that stop the work until you answer.
3. **Review later**: decisions the agent made with a safe default, each with
   that default.
4. **Progress**: tasks done of the total. During an effort: the effort's
   tickets done of the total, and the tickets being built now (see
   [Effort progress](#effort-progress)).
5. **Links**: pull requests and issues the session created.
6. **Surprises**: unexpected things and what they changed. Observer findings
   carry an `[observer]` tag.
7. **Counters**: subagents running and finished.
8. **History**: how many decisions were resolved and surprises dismissed.
9. **Last update**: its time and age.

When the terminal is too narrow for the pane, a one-line band above the
prompt shows the counts instead:
`<n> blocked · <n> review · <done>/<total> done · <n> surprise`. While the
orchestrator builds tickets, it names them after the done count:
`2/13 done · building #3, #5`.

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

**End-of-work list.** The agent collects review-later decisions while it
works. At the end, it posts one numbered list of the open ones in the chat
and calls `post_end_list`. The pane highlights each listed decision until it
is resolved.

## Effort progress

During an effort, Progress shows where the orchestrator is, not only which
issues are closed. An issue often closes long after its ticket is built: when
the pull request merges, after QA, or never in a run that shares its issues.
So the orchestrator reports each ticket with the `ticket` action:

| State | When the orchestrator reports it | What Progress does |
| --- | --- | --- |
| `started` | It delegates the ticket. | Names the ticket: `Building: #3 Play a video`. |
| `landed` | The ticket's commit is on the effort branch. | Counts the ticket as done, whether or not its issue is closed. |
| `stopped` | A started ticket is no longer being built. | Removes the ticket. A landed ticket stays landed. |

```text
Progress
Tickets 2/13 done ███░░░░░░░░░░░░░░░░░
Building: #3 Control: Play a video
```

- **Done** is every ticket whose issue is closed or that was reported
  landed. A ticket that is both counts once.
- **The total** is the effort's issues: every issue with the label
  `effort:<name>`, without the `Spec:` issue.
- **The effort's name** comes from the `effort` field of a `ticket` call, from
  an `effort:<name>` label in a command, or from the git branch.
- **Without `gh`** the reported tickets alone give the count: landed tickets
  of all reported tickets.
- A ticket without an issue number is reported by its title alone.

## Resume, `/clear` and `/compact`

- **Resume** restores the session's saved status. A session with no saved
  status starts empty.
- **`/clear`** starts a new status and carries the open decisions (same ids),
  the effort and the reported tickets over to it.
- **`/compact`** keeps the status as it is.

## Optional tools

Both are skipped silently when they are missing.

- **`shipyard` and Herdr** for pings: a ping for each blocked decision
  (withdrawn when it is resolved), and one ping when the end-of-work list is
  posted.
- **`gh`** for links and effort progress: created pull requests and issues
  are read from `gh` output, and the effort's tickets are counted with
  `gh issue list`. Without it, effort progress counts the reported tickets.

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

# session-status: low-level design

session-status is a Claude Code mod: one hooks module that watches the
session and draws a pane of what it is doing, what it needs from the
person, and how far its work has come. This document says which module owns
what, how a change travels from an event to the screen, and where to make
the next change.

**Start here:**

- The program starts in `hooks/register.tsx`, the only file that calls `$`
  (the engine). Every other module is pure: data in, data out.
- All state is one `SessionStatus` value (`types/index.d.ts`), held in
  `$.state` and saved to `$.store` under the session id.
- The pane is a list of sections (`hooks/sections/index.ts`), each a pure
  function from the status to a tree.
- To add a section: write `hooks/sections/<name>.tsx`, add it to `SECTIONS`.
  To add a status tool action: `hooks/status-tool.ts` (schema and input
  reading), then one branch in `register.tsx`.

## Requirements

1. **Show the session's state** (Blocked, In progress, Settling, Waiting for
   reply, Settled) and what it does now.
2. **Record what the model reports** through the status tool: decisions,
   surprises, blockers, session items, ticket reports, links; answer `list`
   and `reset`.
3. **Read what tool calls show**: the task list, cron jobs, created pull
   requests and issues, an effort run, the places the session changed.
4. **Show progress in three separate sections**, each measuring one thing:
   - **Session**: the items this session is responsible for, done when the
     session marks them done.
   - **Effort**: the effort's GitHub issues, done when GitHub closes them.
   - **Task**: Claude Code's task list, done when a task is completed.
5. **Read GitHub** for the effort's issues and each link's state, without
   holding a tool call.
6. **Keep a status per session id**: a resume restores it, `/clear` and a
   fork start empty, `/compact` keeps it.
7. **Error handling**: a refused status call says what is wrong for the
   model to fix; a failed `gh` or `git` read keeps the last good value.
8. **Out of scope**: the engine's own UI, storing anything outside
   `$.state` and `$.store`, sharing state between sessions.

## Entities and relationships

- **Status** (`SessionStatus`): everything the pane shows. The one entity
  with durable state.
- **Status items**: decisions, surprises (an observation is a surprise with
  `source: 'observer'`) and blockers, each with an id (D1, S1, B1).
- **Session items** (I1, I2 …): the work this session takes on.
- **Effort**: the effort the session works on, and the tracker's count of
  its tickets (`TicketCount`, with each ticket's number, title, closed).
- **Ticket reports**: what an orchestrator says about a ticket it delegates
  (started, landed, stopped).
- **Tasks**: Claude Code's task list, mirrored from the task tools and events.
- **Links**: the pull requests and issues attached to the session, each
  with a state (open, merged, closed).
- **Place / places**: where the session works, and the other repositories
  it changed.
- **Deleted entries** (`DeletedEntry`): what the status tool's `delete`
  removed, by kind and key, so an automatic source does not add it again and
  an id is not given again.
- **Manual fields** (`fieldsSetBy`): on a link, the effort, a task and a cron
  job, the fields the agent set with `update`, each with the value its
  automatic source last reported.

```text
register.tsx ──events──▶ pure modules ──change──▶ Status ──draw──▶ sections
                                                    │
                                     $.state + $.store[sessionId]
Status ─has─▶ items, sessionItems, effort+tickets, ticketReports, tasks, links, place, places, crons, deleted
```

## Class design

Each module owns the rules of the state it changes; `register.tsx` only
does the reads and writes and calls them.

```text
plugins/session-status/
├── hooks/
│   ├── register.tsx          # entry: engine events → pure modules; $.state/$.store; gh/git runs; pane and band render
│   ├── status.ts             # the status rules: empty status, ids, bounds, which status a session id holds
│   ├── status-tool.ts        # the status tool: schema, description, input → request
│   ├── crud.ts               # create/read/update/delete: the kind table and four pure functions over SessionStatus
│   ├── set-by.ts             # manual fields and deleted entries: what the automatic sources respect
│   ├── instructions.ts       # the system prompt section that tells the model how to report
│   ├── tool-results.ts       # a finished tool call → a status change (tasks, crons, links)
│   ├── shell.ts              # a Bash command → the simple commands it runs (heredocs dropped)
│   ├── session-items.ts      # session items: add, done, dropped; the listed order
│   ├── session-progress.ts   # Session bar: session items only
│   ├── effort.ts             # effort detection: effort skills, effort:<name> labels in gh commands
│   ├── effort-progress.ts    # Effort bar: the tracker's count (gh issue list), closed of all, Spec: left out
│   ├── ticket-reports.ts     # ticket reports: started/landed/stopped; the "Building" line
│   ├── tasks.ts              # Task bar: the task list mirrored from TaskCreate/TaskUpdate/TodoWrite/events
│   ├── links.ts              # links: created by gh pr/issue create, added by `link`, state from gh commands
│   ├── link-states.ts        # each link's state read from GitHub (one gh api graphql call)
│   ├── reset.ts              # `reset` and `list` as data; `matchesFilter` keeps what a `list` filter asks for
│   ├── observer.ts           # the observer agent: when it checks, what it asks, what it keeps
│   ├── activity.ts, auto-open.ts, place.ts, places.ts, crons.ts, cron-schedule.ts,
│   │   subagents.ts, pings.ts, describe-tool-call.ts, time.ts, lists.ts, palette.ts
│   ├── pane.tsx, band.tsx    # the pane's tree (sections in order) and the narrow band
│   └── sections/
│       ├── index.ts          # SECTIONS, in pane order
│       ├── section.ts        # Section = (context) → tree | null; the context it gets
│       ├── session.tsx       # ID, Branch, Worktree (copy on press); Session bar; items; Building
│       ├── effort.tsx        # Effort name; Closed n/m bar; tickets; +N more
│       ├── task.tsx          # Task: Done n/m bar; tasks; +N more
│       ├── links.tsx         # Links: a mark per kind and state, each label a link
│       ├── entries.tsx       # shared entry lines and the full lists "+N more" opens
│       ├── list-view.tsx     # one list in full, with Back
│       └── …                 # state, doing-now, blocked, blockers, places, decide, follow-up,
│                             # surprises, observations, counters, crons, history, last-update
├── types/index.d.ts          # SessionStatus and every value in it
└── tests/                    # one file per behaviour; world.ts fakes the engine, git and gh
```

### The three progress sections

| Section | Module | Counts | Done when | Drawn when |
|---|---|---|---|---|
| Session | `session-progress.ts` | session items not dropped | the item is `done` | the session has an item |
| Effort | `effort-progress.ts` | the effort's issues, `Spec:` left out, `QA:` counted | GitHub closed the issue | the session has an effort |
| Task | `tasks.ts` | the task list's tasks | the task is `completed` | the session has a task |

The bars never mix. A session that builds a ticket adds a session item for
it and marks it done when the work lands; the ticket's issue closes, and
the Effort bar moves, only when GitHub closes it (usually at the merge).
Ticket reports feed only the Session section's "Building: #3, #5" line.

### "+N more"

Every list that shows only its first few entries ends with a pressable
"+N more" (`moreButton` in `sections/entries.tsx`). A press switches the
pane's view (`PaneView`) to that list in full (`FULL_LISTS`), drawn by
`list-view.tsx` with a Back button. Today: items, building, tickets, tasks,
links, decide, follow-up, surprises, observations, crons. A new section
with "+N more" adds its view to `PaneView` and `FULL_LISTS`; plain "+N more"
text is not allowed.

```text
Session   Progress 5/5  █████     ← this session finished its work
Effort    Closed 3/9    ███░░░░░░ ← GitHub has closed 3 issues
Task      Done 4/6      ████░░    ← Claude Code's task list
```

## Implementation

**A tool call, from event to screen:**

```text
tool.call (register.tsx)
  next(e)                                   the tool runs
  toolResultChange(e, answer)               tool-results.ts → tasks / crons / links change
    simpleCommands(command)                 shell.ts, for Bash
  changeStatus(change)                      register.tsx
    applyChange(current, change, stamp)     status.ts: bounds, session id, time
    saveStatus → $.store[sessionId]
  countTicketsIfDue(e)                      effort-progress.ts rule → gh issue list, on a timer
  readLinkStatesIfDue(e)                    link-states.ts rule → gh api graphql, on a timer
ui.render Pane
  drawPane(context)                         pane.tsx → each of SECTIONS
```

**Trace, an effort session:**

| Step | Session | Effort |
|---|---|---|
| The orchestrator adds `I5 Build #4` | 4/5 | Closed 3/9 |
| Its delegate's commit lands; `I5` done; `ticket #4 landed` | 5/5, Building line drops #4 | Closed 3/9 |
| The maintainer merges; GitHub closes #4; next read | 5/5 | Closed 4/9 |

**Rejections:** an `item` call from a subagent, a `done` for an unknown
id, a `link` with no pull request or issue URL, a `list` filter with an
unknown kind or state, a generic call with an unknown kind, id or field, a
subagent's change to an entry it did not create: each returns an error text
for the model and changes nothing.

**Generic actions and shortcuts.** `crud.ts` holds one table of kinds (`KINDS`:
the id, the fields `create` takes and `update` can set, and the values of
each fixed field). `status-tool.ts` checks a call against it;
`createEntry`, `updateEntry`, `deleteEntry` and `readEntries` change or read
the status. Each shortcut calls the same function as its generic action:
`record_*` → `readDraft` and `recordDraft`, `resolve` and `dismiss` →
`closeItem`, `item` → `reportItem` and `movedItem`, `ticket` →
`reportTicket`, `link` → `linkPage`, `list` → `listText`.

**Manual and automatic values.** `set-by.ts` decides when an automatic
source may change a value. `autoSet` takes a reported value at all times
for a field the agent did not set. For a field the agent set, it takes the
value on an `event` (a `gh` merge, close or reopen; a task event; a
CronDelete), and on a `read` (the GitHub read, a TodoWrite list, a label,
the cron expiry and CronList) only when the read reports another value than
`lastAuto`. `isDeleted` keeps a deleted link, effort, task, cron job or
place out of `linksFound`, `withEffort`, `taskCreated`, `todosWritten`,
`cronCreated` and `withChange`. A ticket report is the agent's own call, so
it is not an automatic source that `isDeleted` stops.

## Extensibility

| Change | What you touch |
|---|---|
| A new section | `sections/<name>.tsx`, one line in `SECTIONS`; a "+N more" adds a `PaneView` and a `FULL_LISTS` entry |
| A new status tool action | `status-tool.ts` (schema, reading), one branch in `register.tsx`, `instructions.ts` |
| A new kind for the generic actions | `crud.ts` (`KINDS`, `entriesOf`, a branch in each function), `reset.ts` (`LIST_KINDS`, a `listText` group), its automatic sources through `set-by.ts` |
| A new `list` filter key | `reset.ts` (`ListFilter`, `matchesFilter`, a field on `ListEntry`), `status-tool.ts` (`filter` schema, `readListFilter`) |
| Another tracker than GitHub | `effort-progress.ts` and `link-states.ts` (their argv and parsers) |
| Another kind of progress | a pure module for its count, a section beside Effort and Task |

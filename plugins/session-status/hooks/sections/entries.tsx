// The entries the list sections share with the full-list view, and the
// "+N more" that opens that view. A list section shows its newest few; the
// full-list view (see list-view.tsx) shows every entry.

import type { RenderNode, RenderSurface } from 'claude-code'

import type {
  CronJob,
  Decision,
  GitHubRepo,
  PaneView,
  SessionItem,
  SessionLink,
  SessionStatus,
  Surprise,
  Task,
  TicketReport,
  TrackedTicket,
} from '../../types'
import { expireCrons } from '../crons'
import { effortTickets } from '../effort-progress'
import { linkLabel } from '../links'
import { COLOR } from '../palette'
import { issueUrl } from '../place'
import { listedItems } from '../session-items'
import { sessionProgress } from '../session-progress'
import { isOpen, onEndList, openFollowUps, openToDecide } from '../status'
import { listedTasks } from '../tasks'
import { ticketShortName } from '../ticket-reports'
import type { Replies, Ui } from './section'

/** The surprises the agent recorded, open, oldest first. */
export function openSurprises(status: SessionStatus | null): Surprise[] {
  return (status?.items ?? []).filter(
    (item): item is Surprise => item.kind === 'surprise' && item.source !== 'observer' && isOpen(item),
  )
}

/** The observer agent's findings, open, oldest first. */
export function openObservations(status: SessionStatus | null): Surprise[] {
  return (status?.items ?? []).filter(
    (item): item is Surprise => item.kind === 'surprise' && item.source === 'observer' && isOpen(item),
  )
}

/** One surprise or observation: its id and what occurred, then what it changed. */
export function surpriseEntry(ui: Ui, surprise: Surprise, prefix: string): RenderNode {
  const { Box, Text } = ui

  return (
    <Box key={`${prefix}-${surprise.id}`} flexDirection="column">
      <Text>
        <Text color={COLOR.accent}>{surprise.id}</Text>
        {` · ${surprise.occurred}`}
      </Text>
      <Box paddingLeft={2}>
        <Text dimColor>Changed: {surprise.changed}</Text>
      </Box>
    </Box>
  )
}

/** One decision the agent went on with a default for: its id and question, that default, then its quick-reply buttons. */
export function decisionEntry(
  ui: Ui,
  decision: Decision,
  prefix: string,
  replies: Replies,
  color: string = COLOR.accent,
): RenderNode {
  const { Box, Text } = ui

  return (
    <Box key={`${prefix}-${decision.id}`} flexDirection="column">
      <Text>
        <Text color={color}>{decision.id}</Text>
        {decision.discussingAt === undefined ? null : <Text dimColor> (discussing)</Text>}
        {` · ${decision.question}`}
      </Text>
      <Box paddingLeft={2}>
        <Text dimColor>Default: {decision.default}</Text>
      </Box>
      {replyButtons(ui, decision, prefix, replies)}
    </Box>
  )
}

/** The longest option the pane draws as a button; a longer one leaves only Discuss. */
export const OPTION_BUTTON_LIMIT = 30

/**
 * A decision's quick-reply row: a button for each option, the default's
 * marked `✓`, when every option fits one; then Discuss, until it is pressed.
 * Keyed `<prefix>-<id>-option-<n>` and `<prefix>-<id>-discuss`.
 */
export function replyButtons(ui: Ui, decision: Decision, prefix: string, replies: Replies): RenderNode {
  const { Box, Button } = ui
  const key = `${prefix}-${decision.id}`
  const fits = decision.options.every(option => option.length <= OPTION_BUTTON_LIMIT)
  const options = fits
    ? decision.options.map((option, index) => (
        <Button
          key={`${key}-option-${index + 1}`}
          label={option === decision.default ? `${option} ✓` : option}
          onPress={() => replies.answer(decision, option)}
        />
      ))
    : []
  const discuss =
    decision.discussingAt === undefined
      ? [<Button key={`${key}-discuss`} label="Discuss" dimColor onPress={() => replies.discuss(decision)} />]
      : []

  return (
    <Box key={`replies-${key}`} paddingLeft={2} gap={1} flexWrap="wrap">
      {[...options, ...discuss]}
    </Box>
  )
}

/** One session item: `○ I3 Write the parser` while open, `✓ I1 ...` once done. */
export function itemEntry(ui: Ui, item: SessionItem, prefix: string): RenderNode {
  const { Text } = ui

  return (
    <Text key={`${prefix}-${item.id}`}>
      <Text dimColor>{item.state === 'done' ? '✓ ' : '○ '}</Text>
      <Text color={COLOR.accent}>{item.id}</Text>
      {` ${item.title}`}
    </Text>
  )
}

/**
 * One of the effort's tickets: `○ #3 Play a video` while open, `✓ #3 ...`
 * once closed; the number links to its issue when the repository is known.
 */
export function ticketEntry(ui: Ui, ticket: TrackedTicket, repo: GitHubRepo | null, prefix: string): RenderNode {
  const { Link, Text } = ui
  const name = `#${ticket.number}`

  return (
    <Text key={`${prefix}-${ticket.number}`}>
      <Text dimColor>{ticket.isClosed ? '✓ ' : '○ '}</Text>
      <Text color={COLOR.accent}>{repo === null ? name : <Link href={issueUrl(repo, ticket.number)} label={name} />}</Text>
      {` ${ticket.title}`}
    </Text>
  )
}

/** One task of the task list: `○ Write tests`, `◐` while it runs, `✓` once completed. */
export function taskEntry(ui: Ui, task: Task, prefix: string): RenderNode {
  const { Text } = ui
  const mark = task.status === 'completed' ? '✓ ' : task.status === 'in_progress' ? '◐ ' : '○ '

  return (
    <Text key={`${prefix}-${task.id}`}>
      <Text dimColor>{mark}</Text>
      {task.subject}
    </Text>
  )
}

/** Material Design's pull request and merge glyphs, from a Nerd Font: the terminal draws them. */
const PR_GLYPH = '\u{F04C2}'
const MERGED_GLYPH = '\u{F062D}'

/** A pull request's mark where no Nerd Font draws: the desktop and the others. */
const PR_PLAIN = '⇄'

/**
 * Each page's mark and colour by its kind and state: an open page green, a
 * merged pull request or a closed issue purple, a pull request closed
 * without merging red.
 */
export function mark(link: SessionLink, surface: RenderSurface): { glyph: string; color: string } {
  const state = link.state ?? 'open'
  if (link.kind === 'issue') {
    return state === 'open' ? { glyph: '◎', color: COLOR.open } : { glyph: '⊙', color: COLOR.merged }
  }
  const pr = surface === 'terminal' ? PR_GLYPH : PR_PLAIN
  if (state === 'merged') {
    return { glyph: surface === 'terminal' ? MERGED_GLYPH : PR_PLAIN, color: COLOR.merged }
  }

  return { glyph: pr, color: state === 'closed' ? COLOR.closedUnmerged : COLOR.open }
}

/** One page: its mark in its colour, then `<repo>#<n>`, a link to the page. */
export function linkEntry(ui: Ui, link: SessionLink, surface: RenderSurface): RenderNode {
  const { Link, Text } = ui
  const { glyph, color } = mark(link, surface)

  return (
    <Text key={`link-${link.url}`}>
      <Text color={color}>{`${glyph} `}</Text>
      <Link href={link.url} label={linkLabel(link)} />
    </Text>
  )
}

/** One cron job: its fires, its schedule and its prompt, on one line. */
export function cronEntry(ui: Ui, job: CronJob, prefix: string): RenderNode {
  const { Text } = ui

  return (
    <Text key={`${prefix}-${job.id}`} wrap="truncate-end">
      <Text dimColor>{`${job.fires > 0 ? `${job.fires}× ` : ''}${job.schedule} · `}</Text>
      {job.prompt}
    </Text>
  )
}

/** One ticket being built: `#3 Play a video`, the number a link to its issue when it has a page. */
export function buildingEntry(ui: Ui, ticket: TicketReport, repo: GitHubRepo | null): RenderNode {
  const { Link, Text } = ui
  const name = ticketShortName(ticket)

  return (
    <Text key={`building-all-${ticket.number ?? ticket.title}`} color={COLOR.accent}>
      {ticket.number === undefined || repo === null ? name : <Link href={issueUrl(repo, ticket.number)} label={name} />}
    </Text>
  )
}

/** `+N more`, pressable: it opens the list in full. Keyed `<key>-more`. */
export function moreButton(ui: Ui, key: string, more: number, open: () => void): RenderNode {
  const { Box, Button } = ui

  return (
    <Box key={`${key}-more`}>
      <Button key={`${key}-more`} label={`+${more} more`} plain dimColor onPress={open} />
    </Box>
  )
}

/** Each list the full-list view shows: its heading and its entries, newest first (items: open first). */
export const FULL_LISTS: Record<
  Exclude<PaneView, 'main'>,
  (
    ui: Ui,
    status: SessionStatus | null,
    surface: RenderSurface,
    now: number,
    replies: Replies,
  ) => { title: string; entries: RenderNode[] }
> = {
  links: (ui, status, surface) => {
    const all = [...(status?.links ?? [])].reverse()

    return { title: `Links (${all.length})`, entries: all.map(link => linkEntry(ui, link, surface)) }
  },
  crons: (ui, status, _surface, now) => {
    const all = expireCrons(status?.crons ?? [], now).filter(job => job.state === 'active')

    return { title: `Active cron jobs (${all.length})`, entries: all.map(job => cronEntry(ui, job, 'all')) }
  },
  building: (ui, status) => {
    const all = sessionProgress(status)?.building ?? []

    return { title: `Building (${all.length})`, entries: all.map(ticket => buildingEntry(ui, ticket, status?.place?.repo ?? null)) }
  },
  surprises: (ui, status) => {
    const all = openSurprises(status)

    return { title: `Surprises (${all.length})`, entries: [...all].reverse().map(s => surpriseEntry(ui, s, 'all')) }
  },
  observations: (ui, status) => {
    const all = openObservations(status)

    return { title: `Observations (${all.length})`, entries: [...all].reverse().map(s => surpriseEntry(ui, s, 'all')) }
  },
  decide: (ui, status, _surface, _now, replies) => {
    const all = status === null ? [] : openToDecide(status)
    const asked = status === null ? [] : onEndList(status)

    return {
      title: `Decide before settling (${all.length})`,
      entries: [...all]
        .reverse()
        .map(d => decisionEntry(ui, d, 'all', replies, asked.includes(d) ? COLOR.attention : COLOR.accent)),
    }
  },
  items: (ui, status) => {
    const all = status === null ? [] : listedItems(status)
    const done = all.filter(item => item.state === 'done').length

    return { title: `Session items (${done}/${all.length} done)`, entries: all.map(item => itemEntry(ui, item, 'all')) }
  },
  tickets: (ui, status) => {
    const all = effortTickets(status)
    const repo = status?.place?.repo ?? null
    const closed = all.filter(ticket => ticket.isClosed).length

    return {
      title: `${status?.effort?.name ?? 'Effort'} tickets (${closed}/${all.length} closed)`,
      entries: all.map(ticket => ticketEntry(ui, ticket, repo, 'all')),
    }
  },
  tasks: (ui, status) => {
    const all = listedTasks(status)
    const done = all.filter(task => task.status === 'completed').length

    return { title: `Tasks (${done}/${all.length} done)`, entries: all.map(task => taskEntry(ui, task, 'all')) }
  },
  'follow-up': (ui, status, _surface, _now, replies) => {
    const all = status === null ? [] : openFollowUps(status)

    return { title: `Follow-up after settling (${all.length})`, entries: [...all].reverse().map(d => decisionEntry(ui, d, 'all', replies)) }
  },
}

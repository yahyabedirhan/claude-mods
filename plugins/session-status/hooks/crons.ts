// The cron jobs the session scheduled: what CronCreate made, CronDelete
// cancelled and CronList still lists, and each fire, seen as a turn that
// starts with the job's prompt. Nothing here calls `$`.

import type { CronJob, SessionStatus } from '../types'

/** A new job from CronCreate's result: active, never fired. */
export function cronCreated(
  status: SessionStatus,
  job: { id: string; schedule: string; prompt: string; recurring: boolean },
  at: number,
): SessionStatus {
  if (status.crons.some(known => known.id === job.id)) {
    return status
  }

  return { ...status, crons: [...status.crons, { ...job, state: 'active', fires: 0, at }] }
}

/** A job CronDelete removed: cancelled, unless it already ended. */
export function cronDeleted(status: SessionStatus, id: string, at: number): SessionStatus {
  return withJob(status, id, job => (job.state === 'active' ? { ...job, state: 'cancelled', at } : job))
}

/**
 * The jobs CronList still lists stay active; an active one-shot job it no
 * longer lists has fired (it deletes itself once it has).
 */
export function cronListed(status: SessionStatus, listed: readonly string[], at: number): SessionStatus {
  const crons = status.crons.map(job =>
    job.state === 'active' && !job.recurring && !listed.includes(job.id)
      ? { ...job, state: 'fired' as const, fires: Math.max(job.fires, 1), at }
      : job,
  )

  return crons.some((job, index) => job !== status.crons[index]) ? { ...status, crons } : status
}

/**
 * A turn whose prompt is an active job's prompt is that job firing: a
 * one-shot job is then fired and done, a recurring one counts the fire.
 */
export function cronFired(status: SessionStatus, prompt: string, at: number): SessionStatus {
  const job = status.crons.find(known => known.state === 'active' && known.prompt.trim() === prompt.trim())
  if (job === undefined) {
    return status
  }

  return withJob(status, job.id, known => ({
    ...known,
    state: known.recurring ? 'active' : 'fired',
    fires: known.fires + 1,
    at,
  }))
}

/** How many jobs are active, fired (done) and cancelled. */
export function cronCounts(crons: readonly CronJob[]): Record<CronJob['state'], number> {
  const counts = { active: 0, fired: 0, cancelled: 0 }
  for (const job of crons) {
    counts[job.state] += 1
  }

  return counts
}

function withJob(status: SessionStatus, id: string, change: (job: CronJob) => CronJob): SessionStatus {
  const crons = status.crons.map(job => (job.id === id ? change(job) : job))

  return crons.some((job, index) => job !== status.crons[index]) ? { ...status, crons } : status
}

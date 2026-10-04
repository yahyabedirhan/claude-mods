// How the pane writes times. Every time comes from `$.clock.now()`, which a
// test mocks; these functions only format a reading.

/** A clock reading as the local time of day, `HH:MM:SS`. */
export function formatClock(ms: number): string {
  const date = new Date(ms)

  return [date.getHours(), date.getMinutes(), date.getSeconds()]
    .map(part => String(part).padStart(2, '0'))
    .join(':')
}

/** How long ago a moment was: `just now`, `45s ago`, `1m 30s ago`, `2h 5m ago`. */
export function formatAge(ms: number): string {
  const seconds = Math.max(0, Math.floor(ms / 1000))
  if (seconds < 10) {
    return 'just now'
  }
  if (seconds < 60) {
    return `${seconds}s ago`
  }
  const minutes = Math.floor(seconds / 60)
  if (minutes < 10) {
    const rest = seconds % 60

    return rest === 0 ? `${minutes}m ago` : `${minutes}m ${rest}s ago`
  }
  if (minutes < 60) {
    return `${minutes}m ago`
  }
  const hours = Math.floor(minutes / 60)
  const rest = minutes % 60

  return rest === 0 ? `${hours}h ago` : `${hours}h ${rest}m ago`
}

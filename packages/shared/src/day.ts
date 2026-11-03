/** Anki-style day rollover: a new study day starts at 4am local time. */
export const ROLLOVER_HOUR = 4

export function startOfStudyDay(now = Date.now()): number {
  const d = new Date(now)
  if (d.getHours() < ROLLOVER_HOUR) d.setDate(d.getDate() - 1)
  d.setHours(ROLLOVER_HOUR, 0, 0, 0)
  return d.getTime()
}

export function endOfStudyDay(now = Date.now()): number {
  const d = new Date(startOfStudyDay(now))
  d.setDate(d.getDate() + 1)
  return d.getTime()
}

/** Local calendar date key (YYYY-MM-DD) of the study day containing ts. */
export function dayKey(ts: number): string {
  const d = new Date(startOfStudyDay(ts))
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`
}

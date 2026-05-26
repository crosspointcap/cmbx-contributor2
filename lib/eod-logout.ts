/**
 * Schedules an automatic logout at 18:00 ET (6pm Eastern Time).
 * Works correctly regardless of the user's local timezone.
 * Returns a cleanup function — call it on component unmount.
 *
 * If it is already past 6pm ET when this is called, no timer is set
 * (the session simply remains until the user closes the tab or logs out manually).
 */
export function scheduleEodLogout(onLogout: () => void): () => void {
  // Use Intl.DateTimeFormat parts — spec-compliant, works in all browsers.
  const parts = new Intl.DateTimeFormat('en-US', {
    timeZone: 'America/New_York',
    hour: 'numeric', minute: 'numeric', second: 'numeric',
    hour12: false,
  }).formatToParts(new Date())

  const get = (type: string) => Number(parts.find(p => p.type === type)?.value ?? 0)
  const h = get('hour')
  const m = get('minute')
  const s = get('second')

  const msUntil = ((18 - h) * 3600 - m * 60 - s) * 1000
  if (msUntil <= 0) return () => {} // already past 6pm ET — no timer needed

  const id = setTimeout(onLogout, msUntil)
  return () => clearTimeout(id)
}

/**
 * Schedules an automatic logout at 18:00 ET (6pm Eastern Time).
 * Works correctly regardless of the user's local timezone.
 * Returns a cleanup function — call it on component unmount.
 *
 * If it is already past 6pm ET when this is called, no timer is set
 * (the session simply remains until the user closes the tab or logs out manually).
 */
export function scheduleEodLogout(onLogout: () => void): () => void {
  // Get current clock reading in ET (hours/minutes stay accurate for interval math
  // even though the resulting Date object nominally uses local timezone).
  const nowEt = new Date(new Date().toLocaleString('en-US', { timeZone: 'America/New_York' }))
  const eodEt = new Date(nowEt)
  eodEt.setHours(18, 0, 0, 0)

  const msUntil = eodEt.getTime() - nowEt.getTime()
  if (msUntil <= 0) return () => {} // already past 6pm ET — no timer needed

  const id = setTimeout(onLogout, msUntil)
  return () => clearTimeout(id)
}

export const SCHEDULE_CADENCES = ['weekly', 'monthly'] as const;
export type ScheduleCadence = typeof SCHEDULE_CADENCES[number];

export type ContributionSchedule = {
  id: string;
  name: string;
  budget: string;
  allocations: { mint: string; bps: string }[];
  cadence: ScheduleCadence;
  timezone: string;
  nextDueAt: string;
  paused: boolean;
  planVersion: number;
};

export function nextOccurrence(date: Date, cadence: ScheduleCadence): Date {
  const next = new Date(date.getTime());
  if (cadence === 'weekly') next.setUTCDate(next.getUTCDate() + 7);
  else {
    const day = next.getUTCDate();
    next.setUTCMonth(next.getUTCMonth() + 1);
    if (next.getUTCDate() !== day) next.setUTCDate(0);
  }
  return next;
}

export function occurrenceId(scheduleId: string, dueAt: string): string {
  return `${scheduleId}:${dueAt}`;
}

/** datetime-local text in the saved IANA timezone, independent of device travel. */
export function scheduleLocalTime(date: Date, timezone: string): string {
  const parts = new Intl.DateTimeFormat('en-CA', { timeZone: timezone, year: 'numeric', month: '2-digit', day: '2-digit', hour: '2-digit', minute: '2-digit', hourCycle: 'h23' }).formatToParts(date);
  const value = (type: string) => parts.find(part => part.type === type)!.value;
  return `${value('year')}-${value('month')}-${value('day')}T${value('hour')}:${value('minute')}`;
}

/** Reject a DST gap instead of silently changing the time the user selected. */
export function scheduleDate(local: string, timezone: string): Date | null {
  if (!/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}$/.test(local)) return null;
  const desired = Date.parse(`${local}:00Z`);
  if (!Number.isFinite(desired)) return null;
  try {
    let candidate = desired;
    for (let count = 0; count < 4; count += 1) {
      const actual = scheduleLocalTime(new Date(candidate), timezone);
      if (actual === local) return new Date(candidate);
      candidate += desired - Date.parse(`${actual}:00Z`);
    }
  } catch { /* Invalid IANA timezones do not produce a scheduled occurrence. */ }
  return null;
}

/** Skip missed reviews; a due reminder never accumulates catch-up purchases. */
export function nextFutureReview(dueAt: string, cadence: ScheduleCadence, timezone: string, now: Date): Date {
  let local = new Date(`${scheduleLocalTime(new Date(dueAt), timezone)}:00Z`);
  for (let count = 0; count < 10_000; count += 1) {
    local = nextOccurrence(local, cadence);
    const next = scheduleDate(local.toISOString().slice(0, 16), timezone);
    // A nonexistent local time is skipped, never silently moved by an hour.
    if (next && next.getTime() > now.getTime()) return next;
  }
  throw new Error('Choose a new future review date.');
}

export function calendarEvent(schedule: Pick<ContributionSchedule, 'id' | 'name' | 'nextDueAt' | 'timezone'>): string {
  const start = new Date(schedule.nextDueAt);
  const end = new Date(start.getTime() + 30 * 60 * 1000);
  const format = (value: Date) => value.toISOString().replace(/[-:]/g, '').replace(/\.\d{3}Z$/, 'Z');
  const escape = (value: string) => value.replaceAll('\\', '\\\\').replaceAll(';', '\\;').replaceAll(',', '\\,').replaceAll('\n', '\\n');
  return ['BEGIN:VCALENDAR', 'VERSION:2.0', 'PRODID:-//Lotline//Contribution review//EN', 'BEGIN:VEVENT', `UID:${escape(occurrenceId(schedule.id, schedule.nextDueAt))}@lotline`, `DTSTAMP:${format(new Date())}`, `DTSTART:${format(start)}`, `DTEND:${format(end)}`, `SUMMARY:${escape(`Review ${schedule.name}`)}`, `DESCRIPTION:${escape('Review and sign your Lotline contribution. No transaction is submitted automatically.')}`, `X-LOTLINE-TIMEZONE:${escape(schedule.timezone)}`, 'END:VEVENT', 'END:VCALENDAR', ''].join('\r\n');
}

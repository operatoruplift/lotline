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

export function calendarEvent(schedule: Pick<ContributionSchedule, 'id' | 'name' | 'nextDueAt' | 'timezone'>): string {
  const start = new Date(schedule.nextDueAt);
  const end = new Date(start.getTime() + 30 * 60 * 1000);
  const format = (value: Date) => value.toISOString().replace(/[-:]/g, '').replace(/\.\d{3}Z$/, 'Z');
  const escape = (value: string) => value.replaceAll('\\', '\\\\').replaceAll(';', '\\;').replaceAll(',', '\\,').replaceAll('\n', '\\n');
  return ['BEGIN:VCALENDAR', 'VERSION:2.0', 'PRODID:-//Lotline//Contribution review//EN', 'BEGIN:VEVENT', `UID:${escape(occurrenceId(schedule.id, schedule.nextDueAt))}@lotline`, `DTSTAMP:${format(new Date())}`, `DTSTART:${format(start)}`, `DTEND:${format(end)}`, `SUMMARY:${escape(`Review ${schedule.name}`)}`, `DESCRIPTION:${escape('Review and sign your Lotline contribution. No transaction is submitted automatically.')}`, `X-LOTLINE-TIMEZONE:${escape(schedule.timezone)}`, 'END:VEVENT', 'END:VCALENDAR', ''].join('\r\n');
}

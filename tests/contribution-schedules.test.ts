import { describe, expect, it } from 'vitest';
import { nextFutureReview, occurrenceId, scheduleDate, scheduleLocalTime } from '../lib/domain/contribution-schedules';

describe('manual contribution reminder times', () => {
  it('keeps the saved IANA wall-clock time across daylight saving', () => {
    expect(scheduleLocalTime(new Date('2026-03-01T14:00:00Z'), 'America/New_York')).toBe('2026-03-01T09:00');
    expect(nextFutureReview('2026-03-01T14:00:00Z', 'weekly', 'America/New_York', new Date('2026-03-02T00:00:00Z')).toISOString()).toBe('2026-03-08T13:00:00.000Z');
  });
  it('rejects nonexistent daylight-saving local times and invalid dates', () => {
    expect(scheduleDate('2026-03-08T02:30', 'America/New_York')).toBeNull();
    expect(scheduleDate('2026-02-30T12:00', 'UTC')).toBeNull();
    expect(scheduleDate('2026-09-19T12:00', 'Not/AZone')).toBeNull();
  });
  it('skips missed cycles without catch-up and has a stable occurrence identity', () => {
    expect(nextFutureReview('2026-01-01T09:00:00Z', 'weekly', 'UTC', new Date('2026-09-19T12:00:00Z')).toISOString()).toBe('2026-09-24T09:00:00.000Z');
    expect(occurrenceId('saved-id', '2026-09-24T09:00:00.000Z')).toBe('saved-id:2026-09-24T09:00:00.000Z');
  });
});

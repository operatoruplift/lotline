import type { Basket, Mode } from '@/lib/domain/types';
import { scheduleLocalTime, type ScheduleCadence } from '@/lib/domain/contribution-schedules';
import { validatePlan } from '@/lib/domain/math';
import { parseSavedBasket } from '@/lib/domain/storage';

/** The device's review reminder, written by the planner's reminder section. */
export const REMINDER_STORAGE_KEY = 'lotline:contribution-schedule:v2';
export type SavedReminder = { id: string; basket: Basket; mode: Mode; cadence: ScheduleCadence; timezone: string; nextDueAt: string; paused: boolean; planVersion: number; cloudId?: string };

/** A stored reminder, or null when it is missing, malformed, or its plan no longer validates. */
export function readReminder(raw: string | null): SavedReminder | null {
  try {
    const value = JSON.parse(raw ?? 'null') as SavedReminder | null;
    if (!value || !/^[a-zA-Z0-9-]{1,64}$/.test(value.id) || !['live', 'example'].includes(value.mode) || !['weekly', 'monthly'].includes(value.cadence) || typeof value.paused !== 'boolean' || !Number.isInteger(value.planVersion) || value.planVersion < 1 || !Number.isFinite(Date.parse(value.nextDueAt))) return null;
    const basket = parseSavedBasket(value.basket);
    if (!basket || !validatePlan(basket).valid) return null;
    scheduleLocalTime(new Date(value.nextDueAt), value.timezone);
    return { ...value, basket };
  } catch { return null; }
}

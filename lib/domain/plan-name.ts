import { z } from 'zod';

/**
 * A saved plan's name is the one piece of free text a member writes that other
 * members may read: a shared plan carries it into the gallery, its page and
 * link previews. It follows the rules display names already have: no links or
 * URL-like text, no invisible formatting or bidi control characters, at most 60
 * characters, trimmed. The database checks the same rules
 * (supabase/migrations/20261017100000_plan_name_rules.sql), and a shared plan
 * whose stored name fails them is not shown.
 */
export const PLAN_NAME_MAX_LENGTH = 60;
/** The database's display-name link rule, as JavaScript. */
const LINK_LIKE = /(https?|www|:\/\/|\.(com|io|xyz|net|org|app|dev)\b)/i;
/** C0 and C1 controls, line and paragraph separators, and every Unicode format character (bidi overrides, zero-width joiners, tags). */
const INVISIBLE = /[\u0000-\u001f\u007f-\u009f\p{Zl}\p{Zp}\p{Cf}]/u;

export const planNameSchema = z.string().trim().min(1).max(PLAN_NAME_MAX_LENGTH)
  .refine(value => !INVISIBLE.test(value), 'A plan name cannot contain invisible or formatting characters.')
  .refine(value => !LINK_LIKE.test(value), 'A plan name cannot contain a link.');

export function isValidPlanName(value: string): boolean {
  return planNameSchema.safeParse(value).success;
}

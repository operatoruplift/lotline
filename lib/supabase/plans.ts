import { z } from 'zod';
import type { Basket } from '@/lib/domain/types';
import { formatUsdc, MAX_BUDGET_RAW, parseBudget, parsePercent, validatePlan } from '@/lib/domain/math';
import { MAX_PLAN_ASSETS } from '@/lib/domain/limits';
import { XSTOCK_MINTS } from '@/lib/domain/assets';

// Issuer-confirmed Solana deployments. Live execution estimates still reverify the catalog.
export const PLAN_MINTS = XSTOCK_MINTS;
const rawBudget = z.string().regex(/^[1-9]\d{0,12}$/).refine(value => /^[1-9]\d{0,12}$/.test(value) && BigInt(value) <= MAX_BUDGET_RAW);
const bps = z.string().regex(/^(0|[1-9]\d{0,4})$/).refine(value => /^(0|[1-9]\d{0,4})$/.test(value) && Number(value) <= 10_000);
const allocations = z.array(z.object({ mint: z.string().refine(value => (PLAN_MINTS as readonly string[]).includes(value)), bps }).strict()).min(1).max(MAX_PLAN_ASSETS)
  .refine(items => new Set(items.map(item => item.mint)).size === items.length)
  .refine(items => items.reduce((sum, item) => sum + Number(item.bps), 0) === 10_000);

export const cloudPlanInput = z.object({ name: z.string().trim().min(1).max(60).regex(/^[^\u0000-\u001f\u007f]+$/), budget_raw: rawBudget, allocations }).strict();
export const planId = z.uuid();
export const cloudPlanRecord = cloudPlanInput.extend({ id: planId, created_at: z.iso.datetime({ offset: true }) });
export type CloudPlan = z.infer<typeof cloudPlanRecord>;
export type CloudPlanInput = z.infer<typeof cloudPlanInput>;

export function basketToCloudPlan(basket: Basket, name: string): CloudPlanInput | null {
  if (!validatePlan(basket).valid) return null;
  const parsed = cloudPlanInput.safeParse({ name, budget_raw: parseBudget(basket.budget).toString(), allocations: basket.items.map(item => ({ mint: item.mint, bps: parsePercent(item.percent).toString() })) });
  return parsed.success ? parsed.data : null;
}

export function cloudPlanToBasket(plan: CloudPlanInput): Basket {
  const parsed = cloudPlanInput.parse(plan);
  return { version: 1, budget: formatUsdc(parsed.budget_raw), items: parsed.allocations.map(item => ({ mint: item.mint, percent: `${Math.floor(Number(item.bps) / 100)}.${(Number(item.bps) % 100).toString().padStart(2, '0')}` })) };
}

export function safeAuthNext(value: string | null): '/app' | '/auth/update-password' {
  return value === '/auth/update-password' ? value : '/app';
}

const LOOPBACK_HOSTS = new Set(['localhost', '127.0.0.1', '[::1]']);

/** NextURL normalizes loopback IPs to localhost; restore only a matching local Host. */
export function requestOrigin(request: Request): string | null {
  const url = new URL(request.url);
  const host = request.headers.get('host');
  if (!LOOPBACK_HOSTS.has(url.hostname) || !host) return url.origin;
  try {
    const authority = new URL(`${url.protocol}//${host}`);
    if (!LOOPBACK_HOSTS.has(authority.hostname) || authority.port !== url.port || authority.username || authority.password || authority.pathname !== '/' || authority.search || authority.hash || authority.host !== host.toLowerCase()) return null;
    return authority.origin;
  } catch { return null; }
}

/** Cookie-backed mutations require the browser's exact origin; forwarded hosts are never trusted. */
export function isSameOriginMutation(request: Request): boolean {
  const origin = request.headers.get('origin');
  return origin !== null && origin === requestOrigin(request) && request.headers.get('sec-fetch-site') !== 'cross-site';
}

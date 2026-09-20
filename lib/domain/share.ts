import { validatePlan } from './math';
import type { Basket, Mode } from './types';
import { MAX_PLAN_ASSETS } from './limits';
import { PLANNER_UNIVERSES, type PlannerUniverse } from './planner-universe';

export const PLAN_HASH_PREFIX = '#plan=';
export const MAX_PLAN_HASH_LENGTH = 2_048;
export type SharedPlan = { basket: Basket; mode: Mode; universe?: 'prestocks' };

function parsePayload(value: unknown): SharedPlan | null {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return null;
  const candidate = value as Record<string, unknown>;
  const keys = Object.keys(candidate);
  const prestocks = candidate.v === 2 && candidate.universe === 'prestocks';
  const fields = prestocks ? ['v', 'universe', 'mode', 'budget', 'items'] : ['v', 'mode', 'budget', 'items'];
  if (keys.length !== fields.length || !keys.every(key => fields.includes(key))) return null;
  if ((!prestocks && candidate.v !== 1) || (candidate.mode !== 'example' && candidate.mode !== 'live') || (prestocks && candidate.mode !== 'live') || typeof candidate.budget !== 'string') return null;
  if (!Array.isArray(candidate.items) || candidate.items.length < 1 || candidate.items.length > MAX_PLAN_ASSETS) return null;
  const items: Basket['items'] = [];
  for (const item of candidate.items) {
    if (!Array.isArray(item) || item.length !== 2 || typeof item[0] !== 'string' || typeof item[1] !== 'string') return null;
    items.push({ mint: item[0], percent: item[1] });
  }
  const basket: Basket = { version: 1, budget: candidate.budget, items };
  // This checks exact amounts and syntactic mint validity. The planner must still
  // verify each mint against its current catalog before contacting providers.
  return validatePlan(basket).valid ? { basket, mode: candidate.mode, ...(prestocks ? { universe: 'prestocks' as const } : {}) } : null;
}

/** A bounded, ASCII-only fragment. Deliberately excludes identity and estimates. */
export function encodePlanHash(basket: Basket, mode: Mode, universe: PlannerUniverse = 'xstocks'): string {
  const payload = { v: universe === 'prestocks' ? 2 : 1, ...(universe === 'prestocks' ? { universe } : {}), mode, budget: basket.budget, items: basket.items.map(item => [item.mint, item.percent]) };
  if (!parsePayload(payload)) throw new Error('Complete a valid budget and a split totaling 100% before sharing.');
  const encoded = btoa(JSON.stringify(payload)).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
  const hash = `${PLAN_HASH_PREFIX}${encoded}`;
  if (hash.length > MAX_PLAN_HASH_LENGTH) throw new Error('This plan is too long to share.');
  return hash;
}

export function decodePlanHash(hash: unknown): SharedPlan | null {
  if (typeof hash !== 'string' || hash.length > MAX_PLAN_HASH_LENGTH || !hash.startsWith(PLAN_HASH_PREFIX)) return null;
  const encoded = hash.slice(PLAN_HASH_PREFIX.length);
  if (!encoded || !/^[A-Za-z0-9_-]+$/.test(encoded)) return null;
  try {
    const decoded = atob(encoded.replace(/-/g, '+').replace(/_/g, '/'));
    if (!/^[\x20-\x7E]+$/.test(decoded)) return null;
    // Reject noncanonical trailing bits and ambiguous alternate encodings.
    if (btoa(decoded).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '') !== encoded) return null;
    return parsePayload(JSON.parse(decoded));
  } catch {
    return null;
  }
}

export function buildPlanLink(origin: string, basket: Basket, mode: Mode, universe: PlannerUniverse = 'xstocks'): string {
  const url = new URL(PLANNER_UNIVERSES[universe].path, origin);
  if (url.protocol !== 'https:' && url.protocol !== 'http:') throw new Error('Open Lotline in a browser to share a plan.');
  if (mode === 'example') url.searchParams.set('mode', 'example');
  url.hash = encodePlanHash(basket, mode, universe);
  return url.toString();
}

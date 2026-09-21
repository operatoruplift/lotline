import 'server-only';
import type { Asset, Holding, HoldingsResponse, ProjectionResponse } from '../domain/types';
import { selectedAssets } from './catalog';
import { addressSchema, BoundedCache, safeMessage, ServiceError, USDC_MINT } from './common';
import { convertRawUnitsBatch, loadRawBalanceWithContext } from './solana';

const holdingsCache = new BoundedCache<HoldingsResponse>(100);
export function unavailableHolding(mint: string, message: string): Holding {
  return { mint, state: 'unavailable', raw: null, units: null, message };
}
export function unavailableHoldings(mints: string[], error: unknown): HoldingsResponse {
  const message = safeMessage(error);
  return { state: error instanceof ServiceError ? error.kind : 'unavailable', holdings: mints.map(mint => unavailableHolding(mint, message)), usdc: unavailableHolding(USDC_MINT, message), fetchedAt: new Date().toISOString(), message };
}
export async function getHoldings(owner: string, mints: string[]): Promise<HoldingsResponse> {
  if (!addressSchema.safeParse(owner).success) throw new ServiceError('invalid-input', 'Enter a valid Solana wallet address.');
  return getHoldingsForVerifiedAssets(owner, await selectedAssets(mints));
}
/** Server-only adapter seam: each issuer must verify its own selected catalog first. */
export async function getHoldingsForVerifiedAssets(owner: string, assets: readonly Asset[]): Promise<HoldingsResponse> {
  if (!addressSchema.safeParse(owner).success) throw new ServiceError('invalid-input', 'Enter a valid Solana wallet address.');
  const mints = assets.map(asset => asset.mint);
  const key = `${owner}:${[...mints].sort().join(',')}`;
  const cached = holdingsCache.get(key);
  if (cached) return cached;
  // A sequential read is a snapshot window, not an atomic balance. Date it from
  // its earliest possible observation so slow later reads cannot make it look fresh.
  const fetchedAt = new Date().toISOString();
  // Read every balance first, then convert them all from one chain observation.
  // Converting per mint re-read the Clock once per asset, multiplying the shared
  // provider budget by the basket size for no added accuracy.
  const ordered = [...mints, USDC_MINT];
  const balances = new Map<string, { raw: string; slot?: number; frozenRaw: string } | ServiceError>();
  for (const mint of ordered) {
    try { balances.set(mint, await loadRawBalanceWithContext(owner, mint)); }
    catch (error) { balances.set(mint, error instanceof ServiceError ? error : new ServiceError('unavailable', safeMessage(error))); }
  }
  const convertible = ordered.flatMap(mint => {
    const balance = balances.get(mint);
    return balance && !(balance instanceof ServiceError) ? [{ mint, raw: balance.raw }] : [];
  });
  const converted = await convertRawUnitsBatch(convertible);
  const read = (mint: string): Holding => {
    const balance = balances.get(mint);
    if (!balance || balance instanceof ServiceError) return unavailableHolding(mint, safeMessage(balance));
    const observed = { mint, raw: balance.raw, balanceSlot: balance.slot, frozenRaw: balance.frozenRaw };
    const units = converted.get(mint);
    if (!units || units instanceof ServiceError) return { ...observed, state: 'success', units: null, message: safeMessage(units) };
    return { ...observed, state: 'success', units: units.units, unitContext: units.context, ...(balance.frozenRaw !== '0' ? { message: 'Includes frozen token units that are not currently transferable.' } : {}) };
  };
  const holdings: Holding[] = mints.map(read);
  const usdc = read(USDC_MINT);
  const all = [...holdings, usdc];
  const complete = all.filter(item => item.state === 'success' && item.units !== null).length;
  const response: HoldingsResponse = { state: complete === all.length ? 'success' : all.some(item => item.state === 'success') ? 'partial' : 'unavailable', holdings, usdc, fetchedAt };
  holdingsCache.set(key, response, 15_000);
  return response;
}
export async function getUnits(items: { mint: string; raw: string }[]): Promise<ProjectionResponse> {
  return getUnitsForVerifiedAssets(items, await selectedAssets(items.map(item => item.mint)));
}
/** Selection is explicit so arbitrary mints cannot enter a provider's unit endpoint. */
export async function getUnitsForVerifiedAssets(items: { mint: string; raw: string }[], assets: readonly Asset[]): Promise<ProjectionResponse> {
  if (items.some(item => !assets.some(asset => asset.mint === item.mint))) throw new ServiceError('invalid-input', 'Choose currently verified assets from the catalog.');
  // One chain observation for the whole projection, for the same reason as holdings.
  const converted = await convertRawUnitsBatch(items);
  const results: ProjectionResponse['items'] = items.map(item => {
    const outcome = converted.get(item.mint);
    if (!outcome || outcome instanceof ServiceError) return { mint: item.mint, units: null, message: safeMessage(outcome) };
    return { mint: item.mint, units: outcome.units, unitContext: outcome.context };
  });
  const complete = results.filter(item => item.units !== null).length;
  return { state: complete === items.length ? 'success' : complete ? 'partial' : 'unavailable', items: results };
}

import 'server-only';
import type { Holding, HoldingsResponse, ProjectionResponse } from '../domain/types';
import { selectedAssets } from './catalog';
import { addressSchema, BoundedCache, safeMessage, ServiceError, USDC_MINT } from './common';
import { convertRawUnits, loadRawBalance } from './solana';

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
  await selectedAssets(mints);
  const key = `${owner}:${[...mints].sort().join(',')}`;
  const cached = holdingsCache.get(key);
  if (cached) return cached;
  const read = async (mint: string): Promise<Holding> => {
    try {
      const raw = await loadRawBalance(owner, mint);
      try { return { mint, state: 'success', raw, units: await convertRawUnits(mint, raw) }; }
      catch (error) { return { mint, state: 'success', raw, units: null, message: safeMessage(error) }; }
    } catch (error) { return unavailableHolding(mint, safeMessage(error)); }
  };
  const holdings: Holding[] = [];
  for (const mint of mints) holdings.push(await read(mint));
  const usdc = await read(USDC_MINT);
  const all = [...holdings, usdc];
  const complete = all.filter(item => item.state === 'success' && item.units !== null).length;
  const response: HoldingsResponse = { state: complete === all.length ? 'success' : all.some(item => item.state === 'success') ? 'partial' : 'unavailable', holdings, usdc, fetchedAt: new Date().toISOString() };
  holdingsCache.set(key, response, 15_000);
  return response;
}
export async function getUnits(items: { mint: string; raw: string }[]): Promise<ProjectionResponse> {
  await selectedAssets(items.map(item => item.mint));
  const results: ProjectionResponse['items'] = [];
  for (const item of items) {
    try { results.push({ mint: item.mint, units: await convertRawUnits(item.mint, item.raw) }); }
    catch (error) { results.push({ mint: item.mint, units: null, message: safeMessage(error) }); }
  }
  const complete = results.filter(item => item.units !== null).length;
  return { state: complete === items.length ? 'success' : complete ? 'partial' : 'unavailable', items: results };
}

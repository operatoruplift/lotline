import 'server-only';
import { z } from 'zod';
import { API_BATCH_SIZE } from '../domain/limits';
import { addressSchema, isBoundedRaw, MAX_USDC_RAW, rawSchema, ServiceError } from './common';

const mintsSchema = z.array(addressSchema).min(1).max(API_BATCH_SIZE).refine(items => new Set(items).size === items.length);
export function parseMints(input: string | null): string[] {
  const parsed = mintsSchema.safeParse(input?.split(','));
  if (!parsed.success) throw new ServiceError('invalid-input', 'Choose one to three unique verified mints.');
  return parsed.data;
}
export const quotesRequestSchema = z.object({ items: z.array(z.object({ mint: addressSchema, usdcRaw: z.string().refine(value => isBoundedRaw(value, MAX_USDC_RAW)) }).strict()).min(1).max(API_BATCH_SIZE) }).strict().refine(value => new Set(value.items.map(item => item.mint)).size === value.items.length).refine(value => value.items.every(item => isBoundedRaw(item.usdcRaw, MAX_USDC_RAW)) && value.items.reduce((sum, item) => sum + BigInt(item.usdcRaw), 0n) <= MAX_USDC_RAW);
export const unitsRequestSchema = z.object({ items: z.array(z.object({ mint: addressSchema, raw: rawSchema }).strict()).min(1).max(API_BATCH_SIZE) }).strict().refine(value => new Set(value.items.map(item => item.mint)).size === value.items.length);
export function httpStatus(state: string): number { return state === 'invalid-input' ? 400 : state === 'configuration-required' || state === 'unavailable' ? 503 : 200; }
/**
 * Optional context routes answer a supported request even when their provider is
 * switched off: the body carries the complete determination, so the answer is a 200
 * and never a logged server fault. Required planning data keeps `httpStatus`, where
 * an unconfigured server genuinely cannot serve the request.
 */
export function optionalHttpStatus(state: string): number { return state === 'configuration-required' ? 200 : httpStatus(state); }
export const noStore = { 'Cache-Control': 'no-store', 'X-Content-Type-Options': 'nosniff' };

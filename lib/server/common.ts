import 'server-only';
import { isAddress } from '@solana/kit';
import { z } from 'zod';

export const USDC_MINT = 'EPjFWdd5AufqSSqeM2qN1xzybapC8G4wEGGkZwyTDt1v';
export const TOKEN_PROGRAM = 'TokenkegQfeZyiNwAJbNbGKPFXCWuBvf9Ss623VQ5DA';
export const TOKEN_2022_PROGRAM = 'TokenzQdBNbLqP5VEhdkAS6EPFLC1PHnBqCXEpPxuEb';
export const U64_MAX = 18_446_744_073_709_551_615n;
export const MAX_USDC_RAW = 1_000_000_000_000n; // 1,000,000 USDC, matching the client.
export const addressSchema = z.string().max(44).refine(isAddress, 'Enter a valid Solana address.');
export function isBoundedRaw(value: string, maximum = U64_MAX): boolean {
  return value.length <= 20 && /^(0|[1-9][0-9]*)$/.test(value) && BigInt(value) <= maximum;
}
export const rawSchema = z.string().refine(value => isBoundedRaw(value));
export class ServiceError extends Error {
  constructor(public readonly kind: 'unavailable' | 'configuration-required' | 'invalid-input', message: string) { super(message); }
}
export function safeMessage(error: unknown): string {
  return error instanceof ServiceError ? error.message : 'Service unavailable. Please try again.';
}
export async function fetchJson(url: string, init?: RequestInit): Promise<unknown> {
  try {
    const response = await fetch(url, { ...init, cache: 'no-store', signal: AbortSignal.timeout(12_000) });
    if (response.status === 429) throw new ServiceError('unavailable', 'Service rate limit reached. Wait a moment, then refresh.');
    if (response.status === 401 || response.status === 403) throw new ServiceError('unavailable', 'The service denied access. Check server configuration or try again later.');
    if (!response.ok) throw new ServiceError('unavailable', 'The upstream service is temporarily unavailable. Please retry.');
    const body = await response.text();
    if (body.length > 2_000_000) throw new ServiceError('unavailable', 'The service returned an unsupported response.');
    return JSON.parse(body) as unknown;
  } catch (error) {
    if (error instanceof ServiceError) throw error;
    throw new ServiceError('unavailable', 'The service could not be reached or returned invalid data. Please retry.');
  }
}

/** Small process-local cache: no wallet data is persisted to disk. */
export class BoundedCache<T> {
  private values = new Map<string, { value: T; until: number }>();
  constructor(private readonly capacity = 100) {}
  get(key: string): T | undefined {
    const entry = this.values.get(key);
    if (!entry || entry.until <= Date.now()) { this.values.delete(key); return; }
    return entry.value;
  }
  set(key: string, value: T, ttl: number) {
    if (this.values.size >= this.capacity) this.values.delete(this.values.keys().next().value!);
    this.values.set(key, { value, until: Date.now() + ttl });
  }
}

/** Starts evenly spaced work, with bounded queued/active work and no automatic retry. */
export class SpacedQueue {
  private tail = Promise.resolve();
  private nextStart = 0;
  private pending = 0;
  constructor(private readonly intervalMs: number, private readonly capacity: number) {}
  async run<T>(operation: () => Promise<T>): Promise<T> {
    if (this.pending >= this.capacity) throw new ServiceError('unavailable', 'The service is busy. Wait a moment, then refresh.');
    this.pending++;
    const previous = this.tail;
    let release!: () => void;
    this.tail = new Promise<void>(resolve => { release = resolve; });
    try {
      await previous;
      const wait = Math.max(0, this.nextStart - Date.now());
      if (wait) await new Promise(resolve => setTimeout(resolve, wait));
      this.nextStart = Date.now() + this.intervalMs;
      // Keep operations sequential as well as evenly spaced; slow upstreams cannot pile up.
      return await operation();
    } finally { this.pending--; release(); }
  }
}

export async function readSmallJson(request: Request): Promise<unknown> {
  if (!request.headers.get('content-type')?.includes('application/json')) throw new ServiceError('invalid-input', 'Send a JSON request.');
  if (Number(request.headers.get('content-length') ?? 0) > 4096) throw new ServiceError('invalid-input', 'Request is too large.');
  const reader = request.body?.getReader();
  if (!reader) throw new ServiceError('invalid-input', 'Send a JSON request.');
  let size = 0;
  const chunks: Uint8Array[] = [];
  try {
    while (true) {
      const { value, done } = await reader.read();
      if (done) break;
      size += value.byteLength;
      if (size > 4096) { await reader.cancel(); throw new ServiceError('invalid-input', 'Request is too large.'); }
      chunks.push(value);
    }
    return JSON.parse(Buffer.concat(chunks).toString('utf8')) as unknown;
  } catch (error) {
    if (error instanceof ServiceError) throw error;
    throw new ServiceError('invalid-input', 'Send valid JSON.');
  }
}

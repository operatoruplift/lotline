import { afterEach, beforeEach, expect, it, vi } from 'vitest';
import { reserveProviderSlot } from '../lib/server/provider-limits';

beforeEach(() => {
  vi.stubEnv('VERCEL', '1');
  vi.stubEnv('LOTLINE_SHARED_LIMITS', '');
  vi.stubEnv('NEXT_PUBLIC_SUPABASE_URL', 'https://test-project.supabase.co');
  vi.stubEnv('SUPABASE_SECRET_KEY', 'sb_secret_test_fixture_only');
});
afterEach(() => { vi.unstubAllEnvs(); vi.unstubAllGlobals(); vi.useRealTimers(); });

it('requires shared coordination on Vercel and never silently falls back', async () => {
  vi.stubEnv('SUPABASE_SECRET_KEY', '');
  const fetcher = vi.fn(); vi.stubGlobal('fetch', fetcher);
  await expect(reserveProviderSlot('jupiter')).rejects.toMatchObject({ kind: 'configuration-required' });
  expect(fetcher).not.toHaveBeenCalled();
});
it('keeps single-process local development usable without cloud configuration', async () => {
  vi.stubEnv('VERCEL', ''); vi.stubEnv('SUPABASE_SECRET_KEY', '');
  const fetcher = vi.fn(); vi.stubGlobal('fetch', fetcher);
  await reserveProviderSlot('jupiter');
  expect(fetcher).not.toHaveBeenCalled();
});
it('waits for the reserved slot before permitting a provider request', async () => {
  vi.useFakeTimers();
  const fetcher = vi.fn(async () => Response.json({ allowed: true, wait_ms: 2100 })); vi.stubGlobal('fetch', fetcher);
  let released = false;
  const pending = reserveProviderSlot('jupiter').then(() => { released = true; });
  await vi.advanceTimersByTimeAsync(2099); expect(released).toBe(false);
  await vi.advanceTimersByTimeAsync(1); await pending; expect(released).toBe(true);
  const [url, init] = fetcher.mock.calls[0] as unknown as [string, RequestInit];
  expect(String(url)).toBe('https://test-project.supabase.co/rest/v1/rpc/lotline_reserve_provider_slot');
  expect(JSON.parse(String(init.body))).toEqual({ provider: 'jupiter' });
});
it.each([
  { allowed: false, wait_ms: 0 },
  { allowed: true, wait_ms: -1 },
  { allowed: true, wait_ms: 12601 },
  { unexpected: 'shape' },
])('rejects denied or malformed quota responses: %j', async payload => {
  vi.stubGlobal('fetch', vi.fn(async () => Response.json(payload)));
  await expect(reserveProviderSlot('solana')).rejects.toMatchObject({ kind: 'unavailable' });
});
it('sanitizes provider failures and does not send the secret to arbitrary hosts', async () => {
  const fetcher = vi.fn(async () => { throw new Error('secret token provider detail'); }); vi.stubGlobal('fetch', fetcher);
  await expect(reserveProviderSlot('solana')).rejects.toThrow('Live request coordination is temporarily unavailable.');
  fetcher.mockClear(); vi.stubEnv('NEXT_PUBLIC_SUPABASE_URL', 'https://untrusted.example');
  await expect(reserveProviderSlot('solana')).rejects.toThrow('Live request coordination is temporarily unavailable.');
  expect(fetcher).not.toHaveBeenCalled();
});

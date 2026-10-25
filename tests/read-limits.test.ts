import { createHmac } from 'node:crypto';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

const SALT = 'unit-test-ip-hash-salt';
const hash = (label: string) => createHmac('sha256', SALT).update(label).digest('hex');
const read = (ip: string) => new Request('https://lotline.dev/api/quotes', { headers: { 'x-real-ip': ip } });

/** Answers the shared bucket's RPC and records every hash it was asked about. */
function bucket(answer: (ipHash: string) => boolean | Response = () => true) {
  const calls: { p_ip_hash: string; p_limit: number; p_window_seconds: number }[] = [];
  const fetcher = vi.fn(async (input: URL | string | Request, init?: RequestInit) => {
    const url = new URL(input instanceof Request ? input.url : String(input));
    expect(url.pathname).toBe('/rest/v1/rpc/lotline_consume_guest_execution_ip_slot');
    const body = JSON.parse(String(init?.body)) as (typeof calls)[number];
    calls.push(body);
    const result = answer(body.p_ip_hash);
    return result instanceof Response ? result : Response.json(result);
  });
  vi.stubGlobal('fetch', fetcher);
  return { calls, fetcher };
}

beforeEach(() => {
  vi.resetModules();
  vi.stubEnv('NEXT_PUBLIC_SUPABASE_URL', 'https://project.supabase.test');
  vi.stubEnv('SUPABASE_SECRET_KEY', 'sb_secret_unit_test');
  vi.stubEnv('LOTLINE_IP_HASH_SALT', SALT);
});
afterEach(() => { vi.unstubAllEnvs(); vi.unstubAllGlobals(); });

describe('shared read limiter', () => {
  it('checks the global bucket before the per-address bucket, keyed by salted hashes of the collapsed address', async () => {
    const { calls } = bucket();
    const { enforceReadRateLimit } = await import('../lib/server/read-limits');
    await enforceReadRateLimit(read('2001:db8:85a3:8d3:1319:8a2e:370:7348'));
    expect(calls.map(call => call.p_ip_hash)).toEqual([hash('live-read:global'), hash('live-read:ip:2001:0db8:85a3:08d3::/64')]);
    expect(calls.map(call => call.p_limit)).toEqual([1_200, 40]);
    expect(calls.every(call => call.p_window_seconds === 60)).toBe(true);
    // Another address in the same /64 lands in the same bucket; a neighbouring /64 does not.
    await enforceReadRateLimit(read('2001:db8:85a3:8d3:ffff::1'));
    expect(calls[3].p_ip_hash).toBe(calls[1].p_ip_hash);
    await enforceReadRateLimit(read('2001:db8:85a3:8d4::1'));
    expect(calls[5].p_ip_hash).not.toBe(calls[1].p_ip_hash);
    expect(JSON.stringify(calls)).not.toContain('2001:');
  });

  it('refuses from the global bucket without touching a per-address bucket, so address cycling cannot add rows', async () => {
    const { calls, fetcher } = bucket(ipHash => ipHash !== hash('live-read:global'));
    const { enforceReadRateLimit } = await import('../lib/server/read-limits');
    await expect(enforceReadRateLimit(read('203.0.113.9'))).rejects.toMatchObject({ kind: 'unavailable', reasonCode: 'rate-limited' });
    expect(fetcher).toHaveBeenCalledTimes(1);
    expect(calls[0].p_ip_hash).toBe(hash('live-read:global'));
  });

  it('refuses from the per-address bucket and keeps each budget in its own scope', async () => {
    const { calls } = bucket(ipHash => ipHash !== hash('gallery-read:ip:203.0.113.9'));
    const { enforceReadRateLimit, GALLERY_READ_BUDGET, SESSION_READ_BUDGET, isRateLimited } = await import('../lib/server/read-limits');
    const refused = await enforceReadRateLimit(read('203.0.113.9'), GALLERY_READ_BUDGET).catch(error => error as unknown);
    expect(isRateLimited(refused)).toBe(true);
    expect(calls.map(call => call.p_ip_hash)).toEqual([hash('gallery-read:global'), hash('gallery-read:ip:203.0.113.9')]);
    await expect(enforceReadRateLimit(read('203.0.113.9'), SESSION_READ_BUDGET)).resolves.toBeUndefined();
    expect(calls.slice(2).map(call => call.p_limit)).toEqual([SESSION_READ_BUDGET.global, SESSION_READ_BUDGET.perIp]);
    expect(isRateLimited(new Error('anything else'))).toBe(false);
  });

  it('falls back to the stricter in-process ceiling when the shared bucket cannot answer', async () => {
    bucket(() => new Response('gateway', { status: 502 }));
    const { enforceReadRateLimit } = await import('../lib/server/read-limits');
    for (let attempt = 0; attempt < 12; attempt += 1) await enforceReadRateLimit(read('198.51.100.7'));
    await expect(enforceReadRateLimit(read('198.51.100.7'))).rejects.toMatchObject({ reasonCode: 'rate-limited' });
    await expect(enforceReadRateLimit(read('198.51.100.8'))).resolves.toBeUndefined();
  });
});

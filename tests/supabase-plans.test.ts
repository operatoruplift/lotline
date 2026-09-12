import { afterEach, describe, expect, it, vi } from 'vitest';
import { NextRequest } from 'next/server';
import { DEFAULT_BASKET } from '@/lib/demo/example';
import { basketToCloudPlan, cloudPlanInput, cloudPlanToBasket, isSameOriginMutation, PLAN_MINTS, safeAuthNext } from '@/lib/supabase/plans';
import { supabaseConfig } from '@/lib/supabase/config';
import { MAX_PLAN_ASSETS } from '@/lib/domain/limits';

afterEach(() => vi.unstubAllEnvs());
const input = () => ({ name: 'Monthly split', budget_raw: '10000001', allocations: DEFAULT_BASKET.items.map((item, index) => ({ mint: item.mint, bps: ['5000', '3000', '2000'][index] })) });

describe('cloud plan privacy and exact representation', () => {
  it('round trips micro-USDC and basis points exactly', () => {
    const result = basketToCloudPlan({ ...DEFAULT_BASKET, budget: '10.000001' }, 'Monthly split');
    expect(result).toEqual(input());
    expect(cloudPlanToBasket(input())).toEqual({ ...DEFAULT_BASKET, budget: '10.000001', items: DEFAULT_BASKET.items.map(item => ({ ...item, percent: `${item.percent}.00` })) });
  });
  it('does not upload extra local data', () => {
    const local = { ...DEFAULT_BASKET, wallet: 'private address', quotes: 'private quote' };
    expect(Object.keys(basketToCloudPlan(local, 'My plan')!)).toEqual(['name', 'budget_raw', 'allocations']);
    expect(cloudPlanInput.safeParse({ ...input(), wallet: 'private address' }).success).toBe(false);
    expect(cloudPlanInput.safeParse({ ...input(), user_id: 'another user' }).success).toBe(false);
    expect(cloudPlanInput.safeParse({ ...input(), allocations: [{ ...input().allocations[0], wallet: 'address' }] }).success).toBe(false);
  });
  it.each(['0', '-1', '1.2', '1e6', ' 100', '0100', 'x', '1000000000001', '999999999999999999999999999999999999999999999'])('rejects malformed/out-of-range raw budget %s without throwing', budget_raw => {
    expect(() => cloudPlanInput.safeParse({ ...input(), budget_raw })).not.toThrow();
    expect(cloudPlanInput.safeParse({ ...input(), budget_raw }).success).toBe(false);
  });
  it.each(['1.1', '-1', '05000', '10001', 'x'])('rejects non-canonical bps %s', bps => {
    expect(cloudPlanInput.safeParse({ ...input(), allocations: [{ mint: PLAN_MINTS[0], bps }] }).success).toBe(false);
  });
  it('rejects unknown mints, duplicates, eleven assets and invalid totals', () => {
    expect(cloudPlanInput.safeParse({ ...input(), allocations: [{ mint: '11111111111111111111111111111111', bps: '10000' }] }).success).toBe(false);
    expect(cloudPlanInput.safeParse({ ...input(), allocations: [{ mint: PLAN_MINTS[0], bps: '5000' }, { mint: PLAN_MINTS[0], bps: '5000' }] }).success).toBe(false);
    const excessive = PLAN_MINTS.slice(0, MAX_PLAN_ASSETS + 1).map((mint, index) => ({ mint, bps: index === 0 ? '10000' : '0' }));
    expect(excessive).toHaveLength(11);
    expect(cloudPlanInput.safeParse({ ...input(), allocations: excessive }).success).toBe(false);
    expect(cloudPlanInput.safeParse({ ...input(), allocations: [{ mint: PLAN_MINTS[0], bps: '9999' }] }).success).toBe(false);
  });
  it('round-trips ten supported assets, including newly cataloged identities', () => {
    const allocations = PLAN_MINTS.slice(0, MAX_PLAN_ASSETS).map(mint => ({ mint, bps: '1000' }));
    expect(allocations).toHaveLength(10);
    const expanded = { ...input(), budget_raw: '1', allocations };
    expect(cloudPlanInput.safeParse(expanded).success).toBe(true);
    const basket = cloudPlanToBasket(expanded);
    expect(basket.items).toHaveLength(10);
    expect(basket.budget).toBe('0.000001');
    expect(basketToCloudPlan(basket, expanded.name)).toEqual(expanded);
    expect(cloudPlanInput.safeParse({ ...expanded, allocations: [{ mint: PLAN_MINTS.at(-1), bps: '10000' }] }).success).toBe(true);
  });
  it('allows exact maximum, a one-micro budget and zero-weight slots', () => {
    for (const budget_raw of ['1', '1000000000000']) expect(cloudPlanInput.safeParse({ ...input(), budget_raw }).success).toBe(true);
    expect(cloudPlanInput.safeParse({ ...input(), allocations: [{ mint: PLAN_MINTS[0], bps: '10000' }, { mint: PLAN_MINTS[1], bps: '0' }] }).success).toBe(true);
  });
  it('does not save unfinished or invalid drafts', () => {
    expect(basketToCloudPlan({ ...DEFAULT_BASKET, items: [] }, 'Draft')).toBeNull();
    expect(basketToCloudPlan(DEFAULT_BASKET, ' ')).toBeNull();
    expect(basketToCloudPlan(DEFAULT_BASKET, 'Line\nbreak')).toBeNull();
  });
});

describe('auth and request boundaries', () => {
  it('rejects foreign, missing, and cross-site origins', () => {
    expect(isSameOriginMutation(new Request('https://lotline.example/api/plans', { headers: { origin: 'https://lotline.example' } }))).toBe(true);
    const rejected: Record<string, string>[] = [{ origin: 'https://attacker.example' }, {}, { origin: 'https://lotline.example', 'sec-fetch-site': 'cross-site' }];
    for (const headers of rejected) expect(isSameOriginMutation(new Request('https://lotline.example/api/plans', { headers }))).toBe(false);
  });
  it('only permits the two intended post-auth paths', () => {
    expect(safeAuthNext('/auth/update-password')).toBe('/auth/update-password');
    for (const value of ['https://attacker.example', '//attacker.example', '/\\attacker.example', '/app?next=evil', null]) expect(safeAuthNext(value)).toBe('/app');
  });
  it('preserves actual loopback browser origins after NextURL normalization', () => {
    for (const host of ['127.0.0.1:3103', '[::1]:3103', 'localhost:3103']) {
      const request = new NextRequest(`http://${host}/api/plans`, { headers: { host, origin: `http://${host}` } });
      expect(new URL(request.url).hostname).toBe('localhost');
      expect(isSameOriginMutation(request)).toBe(true);
    }
  });
  it('rejects forged local hosts, alias origins, ports, protocols and forwarded headers', () => {
    const headers: Record<string, string>[] = [
      { host: 'attacker.example:3103', origin: 'http://attacker.example:3103' },
      { host: '127.0.0.1:3103', origin: 'http://localhost:3103' },
      { host: '127.0.0.1:3104', origin: 'http://127.0.0.1:3104' },
      { host: '127.0.0.1:3103', origin: 'https://127.0.0.1:3103' },
      { host: 'localhost:3103', origin: 'https://attacker.example', 'x-forwarded-host': 'attacker.example', 'x-forwarded-proto': 'https' },
      { host: 'attacker@localhost:3103', origin: 'http://localhost:3103' },
      { host: 'localhost:3103/path', origin: 'http://localhost:3103' },
    ];
    for (const entry of headers) expect(isSameOriginMutation(new NextRequest('http://127.0.0.1:3103/api/plans', { headers: entry }))).toBe(false);
    expect(isSameOriginMutation(new Request('https://lotline.test/api/plans', { headers: { host: 'attacker.test', origin: 'https://attacker.test', 'x-forwarded-host': 'attacker.test' } }))).toBe(false);
  });
  it('does not accept private keys or non-web configuration', () => {
    vi.stubEnv('NEXT_PUBLIC_SUPABASE_URL', 'https://project.supabase.co');
    vi.stubEnv('NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY', 'sb_secret_never_expose');
    expect(supabaseConfig()).toBeNull();
    vi.stubEnv('NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY', 'sb_publishable_test');
    expect(supabaseConfig()).toEqual({ url: 'https://project.supabase.co', key: 'sb_publishable_test' });
    for (const url of ['http://project.supabase.co', 'https://user:pass@project.supabase.co', 'file:///secret', 'https://project.supabase.co/path']) { vi.stubEnv('NEXT_PUBLIC_SUPABASE_URL', url); expect(supabaseConfig()).toBeNull(); }
  });
});

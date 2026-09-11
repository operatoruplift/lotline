import { beforeEach, describe, expect, it, vi } from 'vitest';
import { NextRequest } from 'next/server';
const mock = vi.hoisted(() => ({ server: vi.fn(), getUser: vi.fn(), from: vi.fn(), exchange: vi.fn() }));
vi.mock('@/lib/supabase/server', () => ({ serverSupabase: mock.server }));
import { DELETE, GET, POST } from '@/app/api/plans/route';
import { GET as session } from '@/app/api/auth/session/route';
import { GET as callback } from '@/app/auth/callback/route';
import { PLAN_MINTS } from '@/lib/supabase/plans';

const userId = 'f11a42f7-94c9-4131-aacc-8c689a294ab6';
const planId = 'ccf2689b-66a7-45c0-8d7f-ebdf84c7e2e7';
const plan = { name: 'Next contribution', budget_raw: '10000001', allocations: [{ mint: PLAN_MINTS[0], bps: '10000' }] };
function request(body: unknown = plan, origin = 'https://lotline.test') { return new Request('https://lotline.test/api/plans', { method: 'POST', headers: { origin, 'Content-Type': 'application/json' }, body: JSON.stringify(body) }); }

beforeEach(() => {
  vi.clearAllMocks();
  mock.server.mockResolvedValue({ auth: { getUser: mock.getUser, exchangeCodeForSession: mock.exchange }, from: mock.from });
  mock.getUser.mockResolvedValue({ data: { user: { id: userId, email: 'reader@example.test' } }, error: null });
});

describe('cloud plan route authorization', () => {
  it('returns configuration-required without trying a database', async () => {
    mock.server.mockResolvedValue(null);
    expect((await GET()).status).toBe(503);
    expect((await POST(request())).status).toBe(503);
    expect(mock.from).not.toHaveBeenCalled();
  });
  it('denies missing or forged sessions before database access', async () => {
    mock.getUser.mockResolvedValue({ data: { user: null }, error: { name: 'AuthSessionMissingError', status: 401 } });
    expect((await GET()).status).toBe(401);
    expect((await POST(request())).status).toBe(401);
    expect((await DELETE(new Request(`https://lotline.test/api/plans?id=${planId}`, { method: 'DELETE', headers: { origin: 'https://lotline.test' } }))).status).toBe(401);
    expect(mock.from).not.toHaveBeenCalled();
  });
  it('denies cross-origin mutations even with a valid session', async () => {
    expect((await POST(request(plan, 'https://attacker.test'))).status).toBe(403);
    expect(mock.server).not.toHaveBeenCalled();
  });
  it('rejects owner spoofing and wallet data', async () => {
    for (const extra of [{ user_id: 'another-user' }, { wallet: '11111111111111111111111111111111' }]) expect((await POST(request({ ...plan, ...extra }))).status).toBe(400);
    expect(mock.from).not.toHaveBeenCalled();
  });
  it('rejects malformed JSON and oversized input', async () => {
    expect((await POST(new Request('https://lotline.test/api/plans', { method: 'POST', headers: { origin: 'https://lotline.test', 'Content-Type': 'application/json' }, body: '{' }))).status).toBe(400);
    expect((await POST(request({ ...plan, name: 'a'.repeat(5000) }))).status).toBe(400);
  });
  it('inserts only server-verified owner and bounded plan fields', async () => {
    const single = vi.fn().mockResolvedValue({ data: { ...plan, id: planId, created_at: '2026-09-11T16:00:00+00:00' }, error: null });
    const insert = vi.fn().mockReturnValue({ select: vi.fn().mockReturnValue({ single }) });
    mock.from.mockReturnValue({ insert });
    const response = await POST(request());
    expect(response.status).toBe(201);
    expect(insert).toHaveBeenCalledWith({ ...plan, user_id: userId });
    expect(response.headers.get('cache-control')).toBe('no-store');
  });
  it('applies an owner filter even when RLS already provides ownership', async () => {
    const limit = vi.fn().mockResolvedValue({ data: [], error: null });
    const eq = vi.fn().mockReturnValue({ order: vi.fn().mockReturnValue({ limit }) });
    mock.from.mockReturnValue({ select: vi.fn().mockReturnValue({ eq }) });
    expect((await GET()).status).toBe(200);
    expect(eq).toHaveBeenCalledWith('user_id', userId);
    expect(limit).toHaveBeenCalledWith(20);
  });
  it('does not claim an absent or inaccessible plan was deleted', async () => {
    const secondEq = vi.fn().mockReturnValue({ select: vi.fn().mockResolvedValue({ data: [], error: null }) });
    const firstEq = vi.fn().mockReturnValue({ eq: secondEq });
    mock.from.mockReturnValue({ delete: vi.fn().mockReturnValue({ eq: firstEq }) });
    const response = await DELETE(new Request(`https://lotline.test/api/plans?id=${planId}`, { method: 'DELETE', headers: { origin: 'https://lotline.test' } }));
    expect(response.status).toBe(404);
    expect(secondEq).toHaveBeenCalledWith('user_id', userId);
  });
});

describe('verified session and email callbacks', () => {
  it('sanitizes the account response', async () => {
    mock.getUser.mockResolvedValue({ data: { user: { id: userId, email: 'reader@example.test', user_metadata: { role: 'admin' }, identities: ['private'] } }, error: null });
    expect(await (await session()).json()).toEqual({ state: 'signed-in', user: { id: userId, email: 'reader@example.test' } });
  });
  it('distinguishes unavailable Auth from a guest', async () => {
    mock.getUser.mockRejectedValue(new Error('network'));
    expect((await session()).status).toBe(503);
  });
  it('cannot use next for an open redirect', async () => {
    mock.exchange.mockResolvedValue({ error: null });
    const response = await callback(new Request('https://lotline.test/auth/callback?code=valid-code&next=https://attacker.test'));
    expect(response.headers.get('location')).toBe('https://lotline.test/app');
    expect(mock.exchange).toHaveBeenCalledWith('valid-code');
  });
  it('preserves the reset destination and handles an expired code', async () => {
    mock.exchange.mockResolvedValue({ error: null });
    expect((await callback(new Request('https://lotline.test/auth/callback?code=valid-code&next=/auth/update-password'))).headers.get('location')).toBe('https://lotline.test/auth/update-password');
    mock.exchange.mockResolvedValue({ error: { message: 'expired' } });
    expect((await callback(new Request('https://lotline.test/auth/callback?code=expired'))).headers.get('location')).toBe('https://lotline.test/sign-in?error=confirmation');
  });
  it('preserves loopback callback cookie hosts and rejects remote Host substitution', async () => {
    mock.exchange.mockResolvedValue({ error: null });
    const response = await callback(new NextRequest('http://127.0.0.1:3103/auth/callback?code=valid-code&next=/auth/update-password', { headers: { host: '127.0.0.1:3103' } }));
    expect(response.headers.get('location')).toBe('http://127.0.0.1:3103/auth/update-password');
    const invalid = await callback(new NextRequest('http://127.0.0.1:3103/auth/callback?code=valid-code', { headers: { host: 'attacker.example:3103', 'x-forwarded-host': 'attacker.example' } }));
    expect(invalid.status).toBe(400);
    expect(mock.exchange).toHaveBeenCalledTimes(1);
  });
});

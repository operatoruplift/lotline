import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

const mocks = vi.hoisted(() => ({ server: vi.fn(), getUser: vi.fn(), rpc: vi.fn(), admin: vi.fn(), adminRpc: vi.fn() }));
vi.mock('../lib/supabase/server', () => ({ serverSupabase: mocks.server }));
vi.mock('../lib/supabase/admin', () => ({ adminSupabase: mocks.admin }));

const ID = '6a1f8c4e-2b7d-4c1e-9f0a-3d5b7e9c1a2b';
let address = 0;
const connection = () => `198.51.100.${++address}`;
const send = (body: unknown, ip = connection(), origin = 'https://lotline.dev') =>
  new Request('https://lotline.dev/api/gallery/report', { method: 'POST', headers: { origin, 'content-type': 'application/json', 'x-real-ip': ip }, body: JSON.stringify(body) });

beforeEach(() => {
  vi.stubEnv('LOTLINE_GALLERY_ENABLED', 'true');
  vi.stubEnv('NEXT_PUBLIC_SUPABASE_URL', 'https://project.supabase.test');
  vi.stubEnv('SUPABASE_SECRET_KEY', 'sb_secret_unit_test');
  mocks.server.mockResolvedValue({ rpc: mocks.rpc, auth: { getUser: mocks.getUser } });
  mocks.getUser.mockResolvedValue({ data: { user: { id: 'member' } }, error: null });
  mocks.rpc.mockResolvedValue({ data: true, error: null });
  mocks.admin.mockReturnValue({ rpc: mocks.adminRpc });
  mocks.adminRpc.mockImplementation(async (name: string) => ({ data: true, error: null, name }));
});
afterEach(() => { vi.unstubAllEnvs(); vi.clearAllMocks(); });

const guestCalls = () => mocks.adminRpc.mock.calls.filter(([name]) => name === 'lotline_report_plan_as_guest') as [string, { p_id: string; p_reason: string; p_reporter: string }][];

describe('reporting a community plan', () => {
  it('stays dark without the operator flag and refuses other origins', async () => {
    const { POST } = await import('../app/api/gallery/report/route');
    vi.stubEnv('LOTLINE_GALLERY_ENABLED', 'false');
    expect((await POST(send({ id: ID, reason: 'spam' }))).status).toBe(404);
    vi.stubEnv('LOTLINE_GALLERY_ENABLED', 'true');
    expect((await POST(send({ id: ID, reason: 'spam' }, connection(), 'https://attacker.test'))).status).toBe(403);
    expect(mocks.rpc).not.toHaveBeenCalled();
    expect(mocks.adminRpc).not.toHaveBeenCalled();
  });

  it('accepts only a shared plan id and one of the listed reasons', async () => {
    const { POST } = await import('../app/api/gallery/report/route');
    for (const body of [{ id: ID }, { id: 'nope', reason: 'spam' }, { id: ID, reason: 'returns' }, { id: ID, reason: 'spam', note: 'extra' }]) {
      expect((await POST(send(body))).status).toBe(400);
    }
    expect(mocks.rpc).not.toHaveBeenCalled();
  });

  it('reports as the signed-in member through their own session', async () => {
    const { POST } = await import('../app/api/gallery/report/route');
    const response = await POST(send({ id: ID, reason: 'offensive' }));
    expect(response.status).toBe(200);
    expect(await response.json()).toEqual({ state: 'success' });
    expect(mocks.rpc).toHaveBeenCalledWith('lotline_report_plan', { p_id: ID, p_reason: 'offensive' });
    expect(guestCalls()).toHaveLength(0);
    // A repeat report reads the same, so the answer never says who reported what.
    mocks.rpc.mockResolvedValueOnce({ data: false, error: null });
    expect(await (await POST(send({ id: ID, reason: 'spam' }))).json()).toEqual({ state: 'success' });
  });

  it('reports a guest as a salted hash of the connection, never the address', async () => {
    const { POST } = await import('../app/api/gallery/report/route');
    mocks.getUser.mockResolvedValue({ data: { user: null }, error: { name: 'AuthSessionMissingError', status: 400 } });
    const [first, second] = [connection(), connection()];
    expect((await POST(send({ id: ID, reason: 'spam' }, first))).status).toBe(200);
    expect((await POST(send({ id: ID, reason: 'misleading' }, first))).status).toBe(200);
    expect((await POST(send({ id: ID, reason: 'spam' }, second))).status).toBe(200);
    const [a, b, c] = guestCalls().map(([, args]) => args);
    expect(a).toMatchObject({ p_id: ID, p_reason: 'spam' });
    expect(a.p_reporter).toMatch(/^[a-f0-9]{64}$/);
    expect(b.p_reporter).toBe(a.p_reporter);
    expect(c.p_reporter).not.toBe(a.p_reporter);
    expect(JSON.stringify(mocks.adminRpc.mock.calls)).not.toContain(first);
    expect(mocks.rpc).not.toHaveBeenCalled();
    vi.stubEnv('SUPABASE_SECRET_KEY', '');
    expect((await POST(send({ id: ID, reason: 'spam' }))).status).toBe(503);
  });

  it('says when a plan is gone or the reporter has sent too many', async () => {
    const { POST } = await import('../app/api/gallery/report/route');
    for (const [code, status] of [['P0002', 404], ['P0001', 429], ['XX000', 503]] as const) {
      mocks.rpc.mockResolvedValueOnce({ data: null, error: { code } });
      expect((await POST(send({ id: ID, reason: 'spam' }))).status).toBe(status);
    }
  });

  it('is rate limited per connection before any database write', async () => {
    const { POST } = await import('../app/api/gallery/report/route');
    const ip = connection();
    for (let attempt = 0; attempt < 20; attempt += 1) expect((await POST(send({ id: ID, reason: 'spam' }, ip))).status).toBe(200);
    expect((await POST(send({ id: ID, reason: 'spam' }, ip))).status).toBe(429);
    expect(mocks.rpc).toHaveBeenCalledTimes(20);
  });
});

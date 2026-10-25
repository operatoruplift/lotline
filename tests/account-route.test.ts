import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

const mocks = vi.hoisted(() => ({ server: vi.fn(), getUser: vi.fn(), getSession: vi.fn(), admin: vi.fn(), deleteUser: vi.fn(), rpc: vi.fn() }));
vi.mock('../lib/supabase/server', () => ({ serverSupabase: mocks.server }));
vi.mock('../lib/supabase/admin', () => ({ adminSupabase: mocks.admin }));
import { ACCOUNT_REAUTH_MESSAGE } from '../lib/client/account';

const MEMBER = 'f11a42f7-94c9-4131-aacc-8c689a294ab6';
const now = Math.floor(Date.now() / 1_000);
const encode = (value: unknown) => Buffer.from(JSON.stringify(value)).toString('base64url');
/** An access token whose amr claim says when the session signed in; getUser is mocked, so it is never verified here. */
const token = (authenticatedAt: number, issuedAt = authenticatedAt) => `${encode({ alg: 'HS256', typ: 'JWT' })}.${encode({ sub: MEMBER, iat: issuedAt, exp: issuedAt + 3_600, amr: [{ method: 'password', timestamp: authenticatedAt }] })}.${encode('unsigned-test-fixture')}`;
let address = 0;
/** Each test gets its own connection, so the per-connection window starts empty. */
const connection = () => `203.0.113.${++address}`;
const remove = (ip: string, origin = 'https://lotline.dev', path = '/api/account') =>
  new Request(`https://lotline.dev${path}`, { method: 'DELETE', headers: { origin, 'x-real-ip': ip } });

beforeEach(() => {
  vi.stubEnv('NEXT_PUBLIC_SUPABASE_URL', 'https://project.supabase.test');
  vi.stubEnv('SUPABASE_SECRET_KEY', 'sb_secret_unit_test');
  mocks.server.mockResolvedValue({ auth: { getUser: mocks.getUser, getSession: mocks.getSession } });
  mocks.getUser.mockResolvedValue({ data: { user: { id: MEMBER, email: 'reader@example.test' } }, error: null });
  mocks.getSession.mockResolvedValue({ data: { session: { access_token: token(now - 60) } }, error: null });
  vi.spyOn(console, 'error').mockImplementation(() => undefined);
  mocks.admin.mockReturnValue({ auth: { admin: { deleteUser: mocks.deleteUser } }, rpc: mocks.rpc });
  mocks.deleteUser.mockResolvedValue({ data: { user: null }, error: null });
  mocks.rpc.mockResolvedValue({ data: true, error: null });
});
afterEach(() => { vi.unstubAllEnvs(); vi.clearAllMocks(); });

describe('account deletion route', () => {
  it('refuses another origin before reading the session', async () => {
    const { DELETE } = await import('../app/api/account/route');
    const response = await DELETE(remove(connection(), 'https://attacker.test'));
    expect(response.status).toBe(403);
    expect(response.headers.get('cache-control')).toBe('no-store');
    expect(mocks.getUser).not.toHaveBeenCalled();
    expect(mocks.deleteUser).not.toHaveBeenCalled();
  });

  it('requires a signed-in session', async () => {
    const { DELETE } = await import('../app/api/account/route');
    mocks.getUser.mockResolvedValueOnce({ data: { user: null }, error: { name: 'AuthSessionMissingError', status: 400 } });
    expect((await DELETE(remove(connection()))).status).toBe(401);
    mocks.getUser.mockResolvedValueOnce({ data: { user: null }, error: { name: 'AuthApiError', status: 403 } });
    expect((await DELETE(remove(connection()))).status).toBe(401);
    mocks.server.mockResolvedValueOnce(null);
    expect((await DELETE(remove(connection()))).status).toBe(503);
    expect(mocks.deleteUser).not.toHaveBeenCalled();
  });

  it('deletes the session’s own user with the admin API, whatever the request names', async () => {
    const { DELETE } = await import('../app/api/account/route');
    const response = await DELETE(remove(connection(), 'https://lotline.dev', '/api/account?id=00000000-0000-4000-8000-000000000001'));
    expect(response.status).toBe(200);
    expect(await response.json()).toEqual({ state: 'deleted' });
    expect(mocks.deleteUser).toHaveBeenCalledTimes(1);
    expect(mocks.deleteUser).toHaveBeenCalledWith(MEMBER);
  });

  it('reports a failed or unavailable deletion without claiming success', async () => {
    const { DELETE } = await import('../app/api/account/route');
    mocks.deleteUser.mockResolvedValueOnce({ data: null, error: { status: 500, message: 'Database error deleting user' } });
    const failed = await DELETE(remove(connection()));
    expect(failed.status).toBe(503);
    expect((await failed.json()).state).toBe('unavailable');
    mocks.getUser.mockResolvedValueOnce({ data: { user: null }, error: { name: 'AuthRetryableFetchError', status: 0 } });
    expect((await DELETE(remove(connection()))).status).toBe(503);
    mocks.admin.mockReturnValue(null);
    const unconfigured = await DELETE(remove(connection()));
    expect(unconfigured.status).toBe(503);
    expect((await unconfigured.json()).state).toBe('configuration-required');
    expect(mocks.deleteUser).toHaveBeenCalledTimes(1);
  });

  it('is rate limited per connection, in this instance and in the shared bucket', async () => {
    const { DELETE } = await import('../app/api/account/route');
    const ip = connection();
    mocks.deleteUser.mockResolvedValue({ data: null, error: { status: 500 } });
    for (let attempt = 0; attempt < 5; attempt += 1) expect((await DELETE(remove(ip))).status).toBe(503);
    const limited = await DELETE(remove(ip));
    expect(limited.status).toBe(429);
    expect((await limited.json()).state).toBe('rate-limited');
    expect(mocks.deleteUser).toHaveBeenCalledTimes(5);
    // The shared bucket is keyed by a salted hash of the address, never the address itself.
    const [name, args] = mocks.rpc.mock.calls[0] as [string, { p_ip_hash: string; p_limit: number; p_window_seconds: number }];
    expect(name).toBe('lotline_consume_guest_execution_ip_slot');
    expect(args.p_ip_hash).toMatch(/^[a-f0-9]{64}$/);
    expect(JSON.stringify(mocks.rpc.mock.calls)).not.toContain(ip);
    mocks.rpc.mockResolvedValueOnce({ data: false, error: null });
    expect((await DELETE(remove(connection()))).status).toBe(429);
  });
});

describe('account deletion freshness and logging', () => {
  it('refuses a session whose sign-in is older than ten minutes, telling the member to sign in again', async () => {
    const { DELETE } = await import('../app/api/account/route');
    mocks.getSession.mockResolvedValueOnce({ data: { session: { access_token: token(now - 601) } }, error: null });
    const stale = await DELETE(remove(connection()));
    expect(stale.status).toBe(403);
    expect(await stale.json()).toMatchObject({ state: 'reauth-required', code: 'reauth_required', message: ACCOUNT_REAUTH_MESSAGE });
    mocks.getSession.mockResolvedValueOnce({ data: { session: null }, error: null });
    expect((await DELETE(remove(connection()))).status).toBe(403);
    mocks.getSession.mockResolvedValueOnce({ data: { session: { access_token: 'not-a-token' } }, error: null });
    expect((await DELETE(remove(connection()))).status).toBe(403);
    expect(mocks.deleteUser).not.toHaveBeenCalled();
    // A fresh sign-in, even on a token refreshed since, is enough.
    mocks.getSession.mockResolvedValueOnce({ data: { session: { access_token: token(now - 120, now - 5) } }, error: null });
    expect((await DELETE(remove(connection()))).status).toBe(200);
    expect(mocks.deleteUser).toHaveBeenCalledTimes(1);
  });

  it('logs only the failure’s class, status and code, never the member', async () => {
    const { DELETE } = await import('../app/api/account/route');
    const log = vi.mocked(console.error);
    mocks.deleteUser.mockResolvedValueOnce({ data: null, error: { name: 'AuthApiError', status: 500, code: 'unexpected_failure', message: `Database error deleting user ${MEMBER} reader@example.test` } });
    expect((await DELETE(remove(connection()))).status).toBe(503);
    mocks.deleteUser.mockRejectedValueOnce(new TypeError('fetch failed'));
    expect((await DELETE(remove(connection()))).status).toBe(503);
    expect(log).toHaveBeenCalledTimes(2);
    expect(log.mock.calls[0]).toEqual(['[account] deletion failed', { name: 'AuthApiError', status: 500, code: 'unexpected_failure' }]);
    expect(log.mock.calls[1]).toEqual(['[account] deletion failed', { name: 'TypeError', status: undefined, code: undefined }]);
    const logged = JSON.stringify(log.mock.calls);
    expect(logged).not.toContain(MEMBER);
    expect(logged).not.toContain('reader@example.test');
  });
});

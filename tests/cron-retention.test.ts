import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { cronAccess } from '../lib/server/cron-auth';

const mocks = vi.hoisted(() => ({ admin: vi.fn(), rpc: vi.fn(), from: vi.fn() }));
vi.mock('../lib/supabase/admin', () => ({ adminSupabase: mocks.admin }));

const SECRET = 'cron-secret-for-unit-tests';
const call = (authorization?: string) => new Request('https://lotline.dev/api/cron/retention', { headers: authorization ? { authorization } : {} });
type Deletion = { table: string; column: string; value: string };

function database(answer: (table: string) => { count: number | null; error: { message: string } | null } = () => ({ count: 2, error: null })) {
  const deletions: Deletion[] = [];
  mocks.from.mockImplementation((table: string) => ({ delete: () => ({ lt: async (column: string, value: string) => { deletions.push({ table, column, value }); return answer(table); } }) }));
  return deletions;
}

beforeEach(() => {
  vi.stubEnv('CRON_SECRET', SECRET);
  mocks.admin.mockReturnValue({ rpc: mocks.rpc, from: mocks.from });
  mocks.rpc.mockResolvedValue({ data: null, error: null });
});
afterEach(() => { vi.unstubAllEnvs(); vi.clearAllMocks(); });

describe('cron access', () => {
  it('matches only the configured bearer secret, and refuses everything when none is set', () => {
    expect(cronAccess(call(`Bearer ${SECRET}`), SECRET)).toBe('ok');
    expect(cronAccess(call(`bearer ${SECRET}`), SECRET)).toBe('ok');
    for (const header of [undefined, '', 'Bearer', `Bearer ${SECRET}x`, `Bearer ${SECRET.slice(0, -1)}`, SECRET, `Basic ${SECRET}`, `Bearer ${SECRET} extra`]) {
      expect(cronAccess(call(header), SECRET), String(header)).toBe('denied');
    }
    expect(cronAccess(call(`Bearer ${SECRET}`), '')).toBe('unconfigured');
    vi.stubEnv('CRON_SECRET', '   ');
    expect(cronAccess(call(`Bearer ${SECRET}`))).toBe('unconfigured');
  });
});

describe('retention cron route', () => {
  it('answers 401 to a missing or wrong bearer token before touching the database', async () => {
    const { GET } = await import('../app/api/cron/retention/route');
    database();
    for (const header of [undefined, 'Bearer nope', SECRET]) {
      const response = await GET(call(header));
      expect(response.status, String(header)).toBe(401);
      expect(response.headers.get('cache-control')).toBe('no-store');
      expect((await response.json()).state).toBe('unauthorized');
    }
    expect(mocks.admin).not.toHaveBeenCalled();
    expect(mocks.rpc).not.toHaveBeenCalled();
    expect(mocks.from).not.toHaveBeenCalled();
  });

  it('refuses to run without CRON_SECRET or the server secret key', async () => {
    const { GET } = await import('../app/api/cron/retention/route');
    vi.stubEnv('CRON_SECRET', '');
    expect((await GET(call(`Bearer ${SECRET}`))).status).toBe(503);
    vi.stubEnv('CRON_SECRET', SECRET);
    mocks.admin.mockReturnValueOnce(null);
    const unconfigured = await GET(call(`Bearer ${SECRET}`));
    expect(unconfigured.status).toBe(503);
    expect((await unconfigured.json()).state).toBe('configuration-required');
    expect(mocks.rpc).not.toHaveBeenCalled();
  });

  it('prunes guest runs, spent IP buckets and old daily counters through the service role', async () => {
    const { GET } = await import('../app/api/cron/retention/route');
    const deletions = database(table => ({ count: table === 'lotline_guest_execution_ip_limits' ? 7 : 1, error: null }));
    const before = Date.now();
    const response = await GET(call(`Bearer ${SECRET}`));
    expect(response.status).toBe(200);
    expect(await response.json()).toEqual({ state: 'success', prunePasses: 10, ipBucketsDeleted: 7, dailyLimitsDeleted: 1, failures: [] });
    expect(mocks.rpc).toHaveBeenCalledTimes(10);
    expect(mocks.rpc.mock.calls.every(([name]) => name === 'lotline_prune_guest_execution_runs')).toBe(true);
    expect(deletions.map(deletion => [deletion.table, deletion.column])).toEqual([['lotline_guest_execution_ip_limits', 'window_started_at'], ['lotline_execution_daily_limits', 'quota_day']]);
    // Buckets older than an hour are spent for every window; counters older than thirty days are kept by nothing.
    expect(before - Date.parse(deletions[0].value)).toBeGreaterThanOrEqual(60 * 60 * 1_000 - 1_000);
    expect(before - Date.parse(deletions[0].value)).toBeLessThan(2 * 60 * 60 * 1_000);
    expect(deletions[1].value).toBe(new Date(before - 30 * 24 * 60 * 60 * 1_000).toISOString().slice(0, 10));
  });

  it('reports a step that failed and still runs the others', async () => {
    const { GET } = await import('../app/api/cron/retention/route');
    database(table => table === 'lotline_guest_execution_ip_limits' ? { count: null, error: { message: 'permission denied' } } : { count: 0, error: null });
    mocks.rpc.mockResolvedValueOnce({ data: null, error: null }).mockResolvedValueOnce({ data: null, error: { message: 'function missing' } });
    const response = await GET(call(`Bearer ${SECRET}`));
    expect(response.status).toBe(503);
    expect(await response.json()).toEqual({ state: 'partial', prunePasses: 1, ipBucketsDeleted: 0, dailyLimitsDeleted: 0, failures: ['guest-runs', 'ip-buckets'] });
  });
});

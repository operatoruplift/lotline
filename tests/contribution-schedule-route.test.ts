import { beforeEach, expect, it, vi } from 'vitest';
import { PLAN_MINTS } from '@/lib/supabase/plans';

const mocks = vi.hoisted(() => ({ results: [] as unknown[], operations: [] as { action: string; payload?: unknown; filters: [string, unknown][] }[] }));
vi.mock('@/lib/supabase/server', () => ({ serverSupabase: async () => ({
  auth: { getUser: async () => ({ data: { user: { id: 'signed-in-owner' } }, error: null }) },
  from: () => {
    const operation = { action: '', payload: undefined as unknown, filters: [] as [string, unknown][] };
    mocks.operations.push(operation);
    const chain = {
      select: () => { operation.action ||= 'select'; return chain; },
      insert: (payload: unknown) => { operation.action = 'insert'; operation.payload = payload; return chain; },
      update: (payload: unknown) => { operation.action = 'update'; operation.payload = payload; return chain; },
      eq: (key: string, value: unknown) => { operation.filters.push([key, value]); return chain; },
      maybeSingle: async () => mocks.results.shift(),
      single: async () => mocks.results.shift(),
    };
    return chain;
  },
}) }));
import { POST } from '../app/api/contribution-schedules/route';

const id = 'a42e77cf-e1c7-405e-9eee-5a79894da0db';
const request = () => new Request('https://lotline.test/api/contribution-schedules', {
  method: 'POST', headers: { origin: 'https://lotline.test', 'content-type': 'application/json' },
  body: JSON.stringify({ id, name: 'Monthly contribution', budgetRaw: '1000000', allocations: [{ mint: PLAN_MINTS[0], bps: '10000' }], cadence: 'monthly', timezone: 'Asia/Ho_Chi_Minh', nextDueAt: '2026-10-19T12:00:00Z', paused: true }),
});
beforeEach(() => { mocks.results.length = 0; mocks.operations.length = 0; });

it('recovers a lost creation acknowledgement without creating a second reminder', async () => {
  mocks.results.push({ data: { id }, error: null }, { data: { id, paused: true, plan_version: 2 }, error: null });
  const response = await POST(request());
  expect(response.status).toBe(200);
  expect(await response.json()).toMatchObject({ state: 'success', schedule: { id, paused: true } });
  expect(mocks.operations.map(operation => operation.action)).toEqual(['select', 'update']);
  for (const operation of mocks.operations) expect(operation.filters).toEqual([['id', id], ['user_id', 'signed-in-owner']]);
  expect(mocks.operations[1].payload).toMatchObject({ paused: true, budget_raw: '1000000' });
});

it('recovers a concurrent duplicate insert only within the authenticated owner', async () => {
  mocks.results.push({ data: null, error: null }, { data: null, error: { code: '23505' } }, { data: { id }, error: null });
  expect((await POST(request())).status).toBe(200);
  expect(mocks.operations.map(operation => operation.action)).toEqual(['select', 'insert', 'update']);
  expect(mocks.operations[1].payload).toMatchObject({ id, user_id: 'signed-in-owner' });
  expect(mocks.operations[2].filters).toEqual([['id', id], ['user_id', 'signed-in-owner']]);
});

it('does not acknowledge or mutate a duplicate ID owned by someone else', async () => {
  mocks.results.push({ data: null, error: null }, { data: null, error: { code: '23505' } }, { data: null, error: null });
  const response = await POST(request());
  expect(response.status).toBe(503);
  expect(await response.json()).toMatchObject({ state: 'unavailable' });
  expect(mocks.operations[2].filters).toContainEqual(['user_id', 'signed-in-owner']);
});

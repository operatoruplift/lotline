import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { PGlite } from '@electric-sql/pglite';
import { readFile, readdir } from 'node:fs/promises';

// Isolated PostgreSQL/WASM: never reads credentials or connects to Supabase.
const db = new PGlite();
const [alice, bruno, chen] = ['00000000-0000-4000-8000-00000000000a', '00000000-0000-4000-8000-00000000000b', '00000000-0000-4000-8000-00000000000c'];
const AAPLX = 'XsbEhLAtcf6HdfpFZ5xEMdqW8nfAvcsP5bdudRLJzJp';
const MSFTX = 'XspzcW1PRtgf6Wj92HCiZdjzKCyFekVD8P5Ueh3dRMX';
const split = (a = '6000', b = '4000') => JSON.stringify([{ mint: AAPLX, bps: a }, { mint: MSFTX, bps: b }]);

async function as<T = unknown>(user: string | null, sql: string, params: unknown[] = []): Promise<T> {
  await db.exec(`reset role; set role ${user ? 'authenticated' : 'anon'}; select set_config('request.jwt.claim.sub', '${user ?? ''}', false);`);
  try { return (await db.query<{ result: T }>(sql, params)).rows[0]?.result as T; }
  finally { await db.exec('reset role;'); }
}
async function savePlan(user: string, name: string, allocations = split(), budget = '250000000') {
  return as<string>(user, `insert into public.lotline_contribution_plans (user_id, name, budget_raw, allocations) values ($1, $2, $3, $4::jsonb) returning id as result`, [user, name, budget, allocations]);
}
const publish = (user: string | null, planId: string, name: string | null = null) => as<string>(user, 'select public.lotline_publish_plan($1, $2) as result', [planId, name]);
const gallery = (sort = 'copies', limit = 24, offset = 0) => as<Record<string, unknown>[]>(null, 'select public.lotline_plan_gallery($1, $2, $3) as result', [sort, limit, offset]);
const copy = (user: string | null, id: string) => as<number>(user, 'select public.lotline_record_plan_copy($1) as result', [id]);

beforeAll(async () => {
  await db.exec(`create role anon; create role authenticated; create role service_role bypassrls;
    create schema auth; create table auth.users (id uuid primary key);
    create function auth.uid() returns uuid language sql stable as
    $$ select nullif(current_setting('request.jwt.claim.sub', true), '')::uuid $$;
    grant usage on schema auth to anon, authenticated;
    grant execute on function auth.uid() to anon, authenticated;`);
  const directory = new URL('../supabase/migrations/', import.meta.url);
  for (const name of (await readdir(directory)).filter(name => name.endsWith('.sql')).sort()) await db.exec(await readFile(new URL(name, directory), 'utf8'));
  await db.exec(`insert into auth.users (id) values ('${alice}'), ('${bruno}'), ('${chen}');`);
}, 120_000);
afterAll(async () => { await db.close(); });

describe('community plan gallery', () => {
  it('publishes only the name and split, never the budget or the owner', async () => {
    const planId = await savePlan(alice, 'Big tech core');
    const id = await publish(alice, planId, 'Alice P.');
    const [entry] = await gallery();
    expect(Object.keys(entry).sort()).toEqual(['allocations', 'copy_count', 'display_name', 'id', 'name', 'published_at', 'split_updated_at']);
    expect(entry.split_updated_at).toBeNull();
    expect(entry).toMatchObject({ id, name: 'Big tech core', display_name: 'Alice P.', copy_count: 0, allocations: [{ mint: AAPLX, bps: '6000' }, { mint: MSFTX, bps: '4000' }] });
    expect(JSON.stringify(entry)).not.toContain('250000000');
    expect(JSON.stringify(entry)).not.toContain(alice);
    expect(await as(null, 'select public.lotline_published_plan($1) as result', [id])).toMatchObject({ id, name: 'Big tech core' });
  });

  it('lets only the owner share, update or stop sharing their plan', async () => {
    const planId = await savePlan(bruno, 'Index tilt', split('5000', '5000'));
    await expect(publish(null, planId)).rejects.toMatchObject({ code: '42501' });
    await expect(publish(alice, planId)).rejects.toMatchObject({ code: 'P0002' });
    const id = await publish(bruno, planId, 'Bruno');
    expect(await publish(bruno, planId, 'Bruno R')).toBe(id);
    expect((await gallery()).find(entry => entry.id === id)?.display_name).toBe('Bruno R');
    expect(await as<boolean>(alice, 'select public.lotline_unpublish_plan($1) as result', [planId])).toBe(false);
    expect(await as<boolean>(bruno, 'select public.lotline_unpublish_plan($1) as result', [planId])).toBe(true);
    expect((await gallery()).some(entry => entry.id === id)).toBe(false);
  });

  it('lets only the author point a shared plan at a newer split, keeping its link and copies', async () => {
    const update = (user: string | null, published: string, planId: string) => as<string>(user, 'select public.lotline_update_published_plan($1, $2) as result', [published, planId]);
    const first = await savePlan(alice, 'Steady core', split('7000', '3000'));
    const id = await publish(alice, first, 'Alice');
    expect(await copy(bruno, id)).toBe(1);
    const second = await savePlan(alice, 'Steady core v2', split('5000', '5000'));
    await expect(update(null, id, second)).rejects.toMatchObject({ code: '42501' });
    await expect(update(bruno, id, second)).rejects.toMatchObject({ code: 'P0002' });
    await expect(update(alice, id, await savePlan(bruno, 'Not yours'))).rejects.toMatchObject({ code: 'P0002' });
    const sharedAlready = await savePlan(alice, 'Shared on its own');
    await publish(alice, sharedAlready);
    await expect(update(alice, id, sharedAlready)).rejects.toMatchObject({ code: 'P0001' });
    expect(await update(alice, id, second)).toBe(id);
    const entry = await as<Record<string, unknown>>(null, 'select public.lotline_published_plan($1) as result', [id]);
    expect(entry).toMatchObject({ id, name: 'Steady core v2', display_name: 'Alice', copy_count: 1, allocations: [{ mint: AAPLX, bps: '5000' }, { mint: MSFTX, bps: '5000' }] });
    expect(Number.isFinite(Date.parse(String(entry.split_updated_at)))).toBe(true);
    expect((await gallery()).find(row => row.id === id)?.split_updated_at).toBe(entry.split_updated_at);
    // The earlier saved plan is no longer shared, so it can be shared again on its own.
    expect(await publish(alice, first)).not.toBe(id);
  });

  it('rejects display names that are links, too short or carry odd characters', async () => {
    const planId = await savePlan(chen, 'Chips');
    for (const name of ['x', 'visit https://spam.test', 'www.spam', 'buy.xyz', '<b>bold</b>', 'emoji 🚀', 'a'.repeat(33), ' trailing-']) {
      await expect(publish(chen, planId, name)).rejects.toMatchObject({ code: '23514' });
    }
    expect(await publish(chen, planId, '   ')).toBeTruthy();
    expect((await gallery()).find(entry => entry.name === 'Chips')?.display_name).toBeNull();
  });

  it('counts a copy once per member, never for the author or a guest', async () => {
    const planId = await savePlan(alice, 'Copy me');
    const id = await publish(alice, planId, 'Alice');
    expect(await copy(bruno, id)).toBe(1);
    expect(await copy(bruno, id)).toBe(1);
    expect(await copy(chen, id)).toBe(2);
    expect(await copy(alice, id)).toBe(2);
    await expect(copy(null, id)).rejects.toMatchObject({ code: '42501' });
    await expect(copy(bruno, '00000000-0000-4000-8000-000000000999')).rejects.toMatchObject({ code: 'P0002' });
    const ranked = await gallery('copies');
    expect(ranked[0]).toMatchObject({ id, copy_count: 2 });
    expect((await gallery('recent'))[0].name).toBe('Copy me');
  });

  it('limits each member to five shared plans and pages the gallery', async () => {
    const ids: string[] = [];
    for (let index = 0; index < 5; index += 1) ids.push(await savePlan(chen, `Limit ${index}`));
    const already = (await as<{ plan_id: string }[]>(chen, 'select public.lotline_my_published_plans() as result')).length;
    for (const planId of ids.slice(0, 5 - already)) await publish(chen, planId);
    await expect(publish(chen, ids[4])).rejects.toMatchObject({ code: 'P0001' });
    expect(await as<unknown[]>(chen, 'select public.lotline_my_published_plans() as result')).toHaveLength(5);
    expect(await gallery('recent', 2, 0)).toHaveLength(2);
    expect((await gallery('recent', 500, 0)).length).toBeLessThanOrEqual(48);
  });

  it('removes a shared plan with its saved plan, and keeps the tables closed to direct access', async () => {
    const planId = await savePlan(bruno, 'Temporary');
    const id = await publish(bruno, planId);
    await as(bruno, 'delete from public.lotline_contribution_plans where id = $1', [planId]);
    expect(await as(null, 'select public.lotline_published_plan($1) as result', [id])).toBeNull();
    for (const user of [null, bruno]) {
      await expect(as(user, 'select count(*)::int as result from public.lotline_published_plans')).rejects.toMatchObject({ code: '42501' });
      await expect(as(user, 'select count(*)::int as result from public.lotline_plan_copies')).rejects.toMatchObject({ code: '42501' });
    }
    await expect(as(null, 'select public.lotline_my_published_plans() as result')).rejects.toMatchObject({ code: '42501' });
    await expect(as(null, 'select public.lotline_unpublish_plan($1) as result', [planId])).rejects.toMatchObject({ code: '42501' });
  });
});

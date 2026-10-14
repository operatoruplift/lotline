import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { createHash } from 'node:crypto';
import type { PGlite } from '@electric-sql/pglite';
import { migratedDatabase, publish, runAs, savePlan, type Actor } from './migrated-database';

let db: PGlite;
const users = Array.from({ length: 8 }, (_, index) => `00000000-0000-4000-8000-0000000001${index.toString(16).padStart(2, '0')}`);
const [alice, bruno, chen, dana, emil, fay, gus, hana] = users;
const guest = (letter: string) => letter.repeat(64);
const MISSING = '00000000-0000-4000-8000-000000000999';

const report = (actor: Actor, id: string, reason = 'spam') => runAs<boolean>(db, actor, 'select public.lotline_report_plan($1, $2) as result', [id, reason]);
const reportAsGuest = (actor: Actor, id: string, reporter: string, reason = 'misleading') => runAs<boolean>(db, actor, 'select public.lotline_report_plan_as_guest($1, $2, $3) as result', [id, reason, reporter]);
const hide = (actor: Actor, id: string) => runAs<boolean>(db, actor, 'select public.lotline_hide_published_plan($1) as result', [id]);
const unhide = (actor: Actor, id: string) => runAs<boolean>(db, actor, 'select public.lotline_unhide_published_plan($1) as result', [id]);
const gallery = () => runAs<Record<string, unknown>[]>(db, null, `select public.lotline_plan_gallery('recent', 48, 0) as result`);
const listed = async (id: string) => (await gallery()).some(entry => entry.id === id);
const detail = (id: string) => runAs<Record<string, unknown> | null>(db, null, 'select public.lotline_published_plan($1) as result', [id]);
const reportsFor = async (id: string) => (await db.query<{ count: number }>('select count(*)::int as count from public.lotline_plan_reports where published_id = $1', [id])).rows[0].count;
async function sharedPlan(author: string, name: string) { return publish(db, author, await savePlan(db, author, name)); }

beforeAll(async () => {
  db = await migratedDatabase();
  await db.exec(`insert into auth.users (id) values ${users.map(id => `('${id}')`).join(', ')};`);
}, 120_000);
afterAll(async () => { await db.close(); });

describe('reporting a shared plan', () => {
  it('records one report per member and one per hashed guest, never the author’s own', async () => {
    const id = await sharedPlan(alice, 'Report once');
    expect(await report(bruno, id, 'spam')).toBe(true);
    expect(await report(bruno, id, 'offensive')).toBe(false);
    expect(await reportAsGuest('service', id, guest('a'))).toBe(true);
    expect(await reportAsGuest('service', id, guest('a'), 'other')).toBe(false);
    expect(await report(alice, id)).toBe(false);
    expect(await reportsFor(id)).toBe(2);
    expect(await listed(id)).toBe(true);
  });

  it('refuses unknown plans, unknown reasons, malformed guest hashes and the wrong caller', async () => {
    const id = await sharedPlan(alice, 'Strict reports');
    await expect(report(bruno, MISSING)).rejects.toMatchObject({ code: 'P0002' });
    await expect(report(bruno, id, 'returns')).rejects.toMatchObject({ code: '22023' });
    await expect(reportAsGuest('service', id, 'not-a-hash')).rejects.toMatchObject({ code: '22023' });
    await expect(reportAsGuest('service', id, guest('A'))).rejects.toMatchObject({ code: '22023' });
    // A guest's identity is the server's salted hash, so only the service role may send one.
    await expect(report(null, id)).rejects.toMatchObject({ code: '42501' });
    await expect(reportAsGuest(null, id, guest('b'))).rejects.toMatchObject({ code: '42501' });
    await expect(reportAsGuest(bruno, id, guest('b'))).rejects.toMatchObject({ code: '42501' });
    expect(await reportsFor(id)).toBe(0);
  });

  it('hides a plan from the gallery, its page and copies once three distinct reporters report it', async () => {
    const id = await sharedPlan(alice, 'Reported thrice');
    expect(await report(bruno, id)).toBe(true);
    expect(await reportAsGuest('service', id, guest('c'))).toBe(true);
    expect(await listed(id)).toBe(true);
    expect(await detail(id)).toMatchObject({ id });
    expect(await report(chen, id, 'offensive')).toBe(true);
    expect(await listed(id)).toBe(false);
    expect(await detail(id)).toBeNull();
    await expect(runAs(db, dana, 'select public.lotline_record_plan_copy($1) as result', [id])).rejects.toMatchObject({ code: 'P0002' });
    await expect(report(dana, id)).rejects.toMatchObject({ code: 'P0002' });
    // Renaming the share keeps it hidden.
    const planId = (await db.query<{ plan_id: string }>('select plan_id from public.lotline_published_plans where id = $1', [id])).rows[0].plan_id;
    expect(await publish(db, alice, planId, 'Renamed')).toBe(id);
    expect(await listed(id)).toBe(false);
  });

  it('limits each reporter to ten reports an hour', async () => {
    const plans: string[] = [];
    for (const author of [dana, emil, fay]) for (const name of ['One', 'Two', 'Three', 'Four']) plans.push(await sharedPlan(author, `${name} by ${author.slice(-2)}`));
    for (const id of plans.slice(0, 10)) expect(await report(gus, id)).toBe(true);
    await expect(report(gus, plans[10])).rejects.toMatchObject({ code: 'P0001' });
    for (const id of plans.slice(0, 10)) expect(await reportAsGuest('service', id, guest('d'))).toBe(true);
    await expect(reportAsGuest('service', plans[10], guest('d'))).rejects.toMatchObject({ code: 'P0001' });
    expect(await report(hana, plans[10])).toBe(true);
  });
});

describe('operator moderation', () => {
  it('lets only the service role or the database owner hide and restore a shared plan', async () => {
    const id = await sharedPlan(bruno, 'Operator review');
    for (const actor of [null, bruno, chen] as Actor[]) {
      await expect(hide(actor, id)).rejects.toMatchObject({ code: '42501' });
      await expect(unhide(actor, id)).rejects.toMatchObject({ code: '42501' });
    }
    expect(await hide('service', id)).toBe(true);
    expect(await listed(id)).toBe(false);
    expect(await detail(id)).toBeNull();
    expect(await unhide('service', id)).toBe(true);
    expect(await listed(id)).toBe(true);
    // The database owner (the SQL editor) can moderate too.
    expect((await db.query<{ result: boolean }>('select public.lotline_hide_published_plan($1) as result', [id])).rows[0].result).toBe(true);
    expect(await listed(id)).toBe(false);
    expect((await db.query<{ result: boolean }>('select public.lotline_unhide_published_plan($1) as result', [id])).rows[0].result).toBe(true);
    expect(await hide('service', MISSING)).toBe(false);
  });

  it('needs three new reporters to hide a plan again after an operator restores it', async () => {
    const id = await sharedPlan(chen, 'Restored');
    for (const actor of [alice, bruno, dana]) await report(actor, id);
    expect(await listed(id)).toBe(false);
    expect(await unhide('service', id)).toBe(true);
    expect(await listed(id)).toBe(true);
    expect(await report(alice, id)).toBe(false);
    expect(await report(emil, id)).toBe(true);
    expect(await reportAsGuest('service', id, guest('e'))).toBe(true);
    expect(await listed(id)).toBe(true);
    expect(await reportAsGuest('service', id, guest('f'))).toBe(true);
    expect(await listed(id)).toBe(false);
  });

  it('keeps reports and the author salt closed to direct access', async () => {
    for (const actor of [null, alice, 'service'] as Actor[]) {
      await expect(runAs(db, actor, 'select author_salt as result from lotline_private.gallery_secrets')).rejects.toMatchObject({ code: '42501' });
      await expect(runAs(db, actor, 'select lotline_private.author_key($1) as result', [alice])).rejects.toMatchObject({ code: '42501' });
      await expect(runAs(db, actor, `select lotline_private.record_plan_report($1, 'spam', $2, null) as result`, [MISSING, alice])).rejects.toMatchObject({ code: '42501' });
    }
    for (const actor of [null, alice] as Actor[]) {
      await expect(runAs(db, actor, 'select count(*)::int as result from public.lotline_plan_reports')).rejects.toMatchObject({ code: '42501' });
    }
  });
});

describe('author keys', () => {
  it('give every plan from one author the same key, without revealing the account', async () => {
    const first = await sharedPlan(hana, 'Hana one');
    const second = await sharedPlan(hana, 'Hana two');
    const other = await sharedPlan(gus, 'Gus one');
    const rows = await gallery();
    const key = (id: string) => rows.find(entry => entry.id === id)?.author_key as string;
    expect(key(first)).toMatch(/^[a-f0-9]{24}$/);
    expect(key(second)).toBe(key(first));
    expect(key(other)).toMatch(/^[a-f0-9]{24}$/);
    expect(key(other)).not.toBe(key(first));
    expect(await detail(first)).toMatchObject({ id: first, author_key: key(first) });
    // Salted: not the plain hash of the account id, and the id itself never appears.
    expect(createHash('sha256').update(hana).digest('hex')).not.toContain(key(first));
    expect(JSON.stringify(rows)).not.toContain(hana);
  });
});

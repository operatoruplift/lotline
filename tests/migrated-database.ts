import { PGlite } from '@electric-sql/pglite';
import { readFile, readdir } from 'node:fs/promises';

/**
 * Isolated PostgreSQL/WASM with Supabase's roles and a minimal auth schema, after
 * every migration in timestamp order. It never reads credentials or connects to Supabase.
 */
export async function migratedDatabase(): Promise<PGlite> {
  const db = new PGlite();
  await db.exec(`create role anon; create role authenticated; create role service_role bypassrls;
    create schema auth; create table auth.users (id uuid primary key);
    create function auth.uid() returns uuid language sql stable as
    $$ select nullif(current_setting('request.jwt.claim.sub', true), '')::uuid $$;
    grant usage on schema auth to anon, authenticated;
    grant execute on function auth.uid() to anon, authenticated;`);
  const directory = new URL('../supabase/migrations/', import.meta.url);
  for (const name of (await readdir(directory)).filter(name => name.endsWith('.sql')).sort()) await db.exec(await readFile(new URL(name, directory), 'utf8'));
  return db;
}

/** Who runs a statement: a guest (anon), a signed-in member's id, or the server's service role. */
export type Actor = string | null | 'service';

/** Runs one statement as that actor and returns the `result` column of its first row. */
export async function runAs<T = unknown>(db: PGlite, actor: Actor, sql: string, params: unknown[] = []): Promise<T> {
  const role = actor === 'service' ? 'service_role' : actor ? 'authenticated' : 'anon';
  const member = actor && actor !== 'service' ? actor : '';
  await db.exec(`reset role; set role ${role}; select set_config('request.jwt.claim.sub', '${member}', false);`);
  try { return (await db.query<{ result: T }>(sql, params)).rows[0]?.result as T; }
  finally { await db.exec(`reset role; select set_config('request.jwt.claim.sub', '', false);`); }
}

export const AAPLX = 'XsbEhLAtcf6HdfpFZ5xEMdqW8nfAvcsP5bdudRLJzJp';
export const MSFTX = 'XspzcW1PRtgf6Wj92HCiZdjzKCyFekVD8P5Ueh3dRMX';
export const split = (a = '6000', b = '4000') => JSON.stringify([{ mint: AAPLX, bps: a }, { mint: MSFTX, bps: b }]);

/** Saves a plan as its owner, through the same row-level security the account API uses. */
export function savePlan(db: PGlite, user: string, name: string, allocations = split()): Promise<string> {
  return runAs<string>(db, user, `insert into public.lotline_contribution_plans (user_id, name, budget_raw, allocations) values ($1, $2, '250000000', $3::jsonb) returning id as result`, [user, name, allocations]);
}

/** Shares a saved plan to community plans and returns the shared plan's id. */
export function publish(db: PGlite, user: string, planId: string, displayName: string | null = null): Promise<string> {
  return runAs<string>(db, user, 'select public.lotline_publish_plan($1, $2) as result', [planId, displayName]);
}

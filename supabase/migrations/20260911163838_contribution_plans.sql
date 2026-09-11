-- The cloud stores only user-requested amounts and splits, never wallet addresses or quotes.
create schema if not exists lotline_private;
revoke all on schema lotline_private from public, anon;
grant usage on schema lotline_private to authenticated;

create function lotline_private.valid_plan_allocations(payload jsonb)
returns boolean
language plpgsql
immutable
security invoker
set search_path = ''
as $$
declare
  item jsonb;
  mint text;
  weight text;
  seen text[] := array[]::text[];
  total integer := 0;
begin
  if payload is null or jsonb_typeof(payload) <> 'array' then return false; end if;
  if jsonb_array_length(payload) not between 1 and 3 then return false; end if;
  for item in select value from jsonb_array_elements(payload) loop
    if jsonb_typeof(item) <> 'object' then return false; end if;
    if (select array_agg(key order by key) from jsonb_object_keys(item) as key) is distinct from array['bps','mint'] then return false; end if;
    if jsonb_typeof(item->'mint') is distinct from 'string' or jsonb_typeof(item->'bps') is distinct from 'string' then return false; end if;
    mint := item->>'mint';
    weight := item->>'bps';
    if mint is null or not (mint = any (array[
      'XsbEhLAtcf6HdfpFZ5xEMdqW8nfAvcsP5bdudRLJzJp',
      'XspzcW1PRtgf6Wj92HCiZdjzKCyFekVD8P5Ueh3dRMX',
      'Xsc9qvGR1efVDFGLrVsmkzv3qi45LTBjeUKSPmx9qEh',
      'XsDoVfqeBukxuZHWhdvWHBhgEHjGNst4MLodqsJHzoB',
      'XsoCS1TfEyfFhfvj8EtZ528L3CaKBDBRqRapnBbDF2W',
      'Xs8S1uUs1zvS2p7iwtsG3b6fkhpvmwz4GYU3gWAmWHZ'
    ])) or mint = any(seen) then return false; end if;
    if weight is null or weight !~ '^(0|[1-9][0-9]{0,4})$' then return false; end if;
    if weight::integer > 10000 then return false; end if;
    seen := array_append(seen, mint);
    total := total + weight::integer;
  end loop;
  return total = 10000;
end;
$$;
revoke all on function lotline_private.valid_plan_allocations(jsonb) from public, anon;
grant execute on function lotline_private.valid_plan_allocations(jsonb) to authenticated;

create table public.lotline_contribution_plans (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  name text not null check (char_length(name) between 1 and 60 and name = btrim(name) and name !~ '[[:cntrl:]]'),
  budget_raw text not null check (budget_raw ~ '^[1-9][0-9]{0,12}$' and case when budget_raw ~ '^[1-9][0-9]{0,12}$' then budget_raw::bigint <= 1000000000000 else false end),
  allocations jsonb not null check (lotline_private.valid_plan_allocations(allocations)),
  created_at timestamptz not null default now()
);
create index lotline_contribution_plans_user_created_idx on public.lotline_contribution_plans (user_id, created_at desc);

alter table public.lotline_contribution_plans enable row level security;
alter table public.lotline_contribution_plans force row level security;
revoke all on table public.lotline_contribution_plans from public, anon, authenticated;
grant select, insert, delete on table public.lotline_contribution_plans to authenticated;
create policy "Read own contribution plans" on public.lotline_contribution_plans for select to authenticated using ((select auth.uid()) = user_id);
create policy "Create own contribution plans" on public.lotline_contribution_plans for insert to authenticated with check ((select auth.uid()) = user_id);
create policy "Delete own contribution plans" on public.lotline_contribution_plans for delete to authenticated using ((select auth.uid()) = user_id);

-- Serialize inserts per user, so concurrent requests cannot bypass the account limit.
create function lotline_private.limit_plan_count()
returns trigger
language plpgsql
security invoker
set search_path = ''
as $$
begin
  if auth.uid() is null or auth.uid() <> new.user_id then
    raise exception 'Plan ownership is required' using errcode = '42501';
  end if;
  perform pg_advisory_xact_lock(hashtextextended(new.user_id::text, 0));
  if (select count(*) from public.lotline_contribution_plans where user_id = new.user_id) >= 20 then
    raise exception 'Cloud plan limit reached' using errcode = 'P0001';
  end if;
  return new;
end;
$$;
revoke all on function lotline_private.limit_plan_count() from public, anon;
grant execute on function lotline_private.limit_plan_count() to authenticated;
create trigger lotline_contribution_plans_limit before insert on public.lotline_contribution_plans for each row execute function lotline_private.limit_plan_count();

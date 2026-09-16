-- Guest execution capabilities are per-browser owners. The original owner index
-- coalesced all guest rows to one sentinel UUID, which would incorrectly make
-- two guests with the same intent collide. Replace it with owner-specific
-- partial unique indexes while preserving idempotency for each owner.
drop index if exists public.lotline_execution_runs_owner_intent_idx;
create unique index if not exists lotline_execution_runs_user_intent_idx
  on public.lotline_execution_runs (user_id, intent_hash)
  where user_id is not null;
create unique index if not exists lotline_execution_runs_guest_intent_idx
  on public.lotline_execution_runs (guest_capability_hash, intent_hash)
  where guest_capability_hash is not null;

create table if not exists public.lotline_execution_daily_limits (
  quota_day date primary key,
  request_count integer not null check (request_count >= 0)
);
alter table public.lotline_execution_daily_limits enable row level security;
alter table public.lotline_execution_daily_limits force row level security;
revoke all on public.lotline_execution_daily_limits from public, anon, authenticated;
grant all on public.lotline_execution_daily_limits to service_role;

create or replace function public.lotline_consume_execution_daily_slot(p_limit integer)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  bucket public.lotline_execution_daily_limits%rowtype;
begin
  if p_limit < 1 then raise exception 'invalid_execution_quota'; end if;
  insert into public.lotline_execution_daily_limits (quota_day, request_count)
  values (current_date, 0)
  on conflict (quota_day) do nothing;
  select * into bucket
  from public.lotline_execution_daily_limits
  where quota_day = current_date
  for update;
  if bucket.request_count >= p_limit then raise exception 'execution_daily_quota_exceeded'; end if;
  update public.lotline_execution_daily_limits
  set request_count = request_count + 1
  where quota_day = current_date;
  delete from public.lotline_execution_daily_limits where quota_day < current_date - 30;
end;
$$;
revoke all on function public.lotline_consume_execution_daily_slot(integer) from public, anon, authenticated;
grant execute on function public.lotline_consume_execution_daily_slot(integer) to service_role;

create index if not exists lotline_execution_runs_owner_created_idx
  on public.lotline_execution_runs (user_id, created_at);
create index if not exists lotline_execution_runs_guest_updated_idx
  on public.lotline_execution_runs (updated_at)
  where guest_capability_hash is not null;
create index if not exists lotline_execution_runs_guest_retention_idx
  on public.lotline_execution_runs (updated_at)
  where guest_capability_hash is not null
    and state in ('confirmed', 'rejected', 'failed-onchain', 'expired-unbroadcast');

create or replace function public.lotline_prune_guest_execution_runs()
returns void
language plpgsql
security definer
set search_path = public
as $$
begin
  -- Guest cookies expire after one day. Remove stale, non-broadcast reviews
  -- after a short grace period, while retaining any run that still has a
  -- signed/submitted/confirming/unknown attempt. Terminal evidence is kept
  -- for 30 days. Every invocation is bounded so cleanup cannot become a
  -- request-sized table scan or delete burst.
  delete from public.lotline_execution_runs
  where id in (
    select id
    from public.lotline_execution_runs
    where guest_capability_hash is not null
      and updated_at < now() - interval '2 days'
      and (
        (state in ('confirmed', 'rejected', 'failed-onchain', 'expired-unbroadcast')
          and updated_at < now() - interval '30 days')
        or (
          state in ('planned', 'quoting', 'review-required', 'awaiting-wallet')
          and not exists (
            select 1
            from public.lotline_execution_attempts attempt
            join public.lotline_execution_legs leg on leg.id = attempt.leg_id
            where leg.run_id = lotline_execution_runs.id
              and attempt.state in ('signed', 'submitted', 'confirming', 'unknown')
          )
        )
      )
    order by updated_at
    limit 100
  );
end;
$$;
revoke all on function public.lotline_prune_guest_execution_runs() from public, anon, authenticated;
grant execute on function public.lotline_prune_guest_execution_runs() to service_role;

-- Keep an unauthenticated capability from filling the journal indefinitely.
-- This is enforced in the database so it remains effective across application
-- instances. Authenticated owners are governed by their account limits.
create or replace function public.lotline_limit_guest_execution_runs()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  owner_count integer;
begin
  if new.guest_capability_hash is not null then
    perform pg_advisory_xact_lock(hashtextextended(encode(new.guest_capability_hash, 'hex'), 0));
    if (
    select count(*)
    from public.lotline_execution_runs
    where guest_capability_hash = new.guest_capability_hash
    ) >= 20 then
      raise exception 'guest_execution_quota_exceeded';
    end if;
  elsif new.user_id is not null then
    -- Authenticated owners receive a daily run bound as well; this protects
    -- the journal if a client repeatedly starts fresh reviewed intents.
    perform pg_advisory_xact_lock(hashtextextended(new.user_id::text, 0));
    select count(*) into owner_count
    from public.lotline_execution_runs
    where user_id = new.user_id
      and created_at >= now() - interval '1 day';
    if owner_count >= 100 then
      raise exception 'user_execution_daily_quota_exceeded';
    end if;
  end if;
  perform pg_advisory_xact_lock(hashtextextended('lotline-execution-global', 0));
  perform public.lotline_prune_guest_execution_runs();
  if (
    select count(*)
    from public.lotline_execution_runs
    where guest_capability_hash is not null
  ) >= 50000 then
    raise exception 'guest_execution_global_quota_exceeded';
  end if;
  perform public.lotline_consume_execution_daily_slot(5000);
  return new;
end;
$$;
revoke all on function public.lotline_limit_guest_execution_runs() from public, anon, authenticated;
grant execute on function public.lotline_limit_guest_execution_runs() to service_role;

drop trigger if exists lotline_guest_execution_quota on public.lotline_execution_runs;
create trigger lotline_guest_execution_quota
before insert on public.lotline_execution_runs
for each row execute function public.lotline_limit_guest_execution_runs();

-- A capability can be rotated, so retain a shared edge/IP bucket as a second
-- line of defense. Only the service role can read or mutate these hashes.
create table if not exists public.lotline_guest_execution_ip_limits (
  ip_hash text primary key check (ip_hash ~ '^[a-f0-9]{64}$'),
  window_started_at timestamptz not null,
  request_count integer not null check (request_count >= 0)
);
alter table public.lotline_guest_execution_ip_limits enable row level security;
alter table public.lotline_guest_execution_ip_limits force row level security;
revoke all on public.lotline_guest_execution_ip_limits from public, anon, authenticated;
grant all on public.lotline_guest_execution_ip_limits to service_role;
create index if not exists lotline_guest_execution_ip_limits_window_idx
  on public.lotline_guest_execution_ip_limits (window_started_at);

create or replace function public.lotline_consume_guest_execution_ip_slot(
  p_ip_hash text,
  p_limit integer default 180,
  p_window_seconds integer default 60
)
returns boolean
language plpgsql
security definer
set search_path = public
as $$
declare
  bucket public.lotline_guest_execution_ip_limits%rowtype;
begin
  if p_ip_hash !~ '^[a-f0-9]{64}$' or p_limit < 1 or p_window_seconds < 1 then
    return false;
  end if;
  -- Retain only a bounded history of IP buckets. Cleanup is sampled so the
  -- request-critical path does not scan the table on every mutation.
  if mod(extract(epoch from clock_timestamp())::bigint, 64) = 0 then
    delete from public.lotline_guest_execution_ip_limits
    where window_started_at < now() - interval '1 day'
      and ip_hash <> p_ip_hash;
  end if;
  insert into public.lotline_guest_execution_ip_limits (ip_hash, window_started_at, request_count)
  values (p_ip_hash, now(), 0)
  on conflict (ip_hash) do nothing;
  select * into bucket
  from public.lotline_guest_execution_ip_limits
  where ip_hash = p_ip_hash
  for update;
  if bucket.window_started_at <= now() - make_interval(secs => p_window_seconds) then
    update public.lotline_guest_execution_ip_limits
    set window_started_at = now(), request_count = 1
    where ip_hash = p_ip_hash;
    return true;
  end if;
  if bucket.request_count >= p_limit then
    return false;
  end if;
  update public.lotline_guest_execution_ip_limits
  set request_count = request_count + 1
  where ip_hash = p_ip_hash;
  return true;
end;
$$;
revoke all on function public.lotline_consume_guest_execution_ip_slot(text, integer, integer) from public, anon, authenticated;
grant execute on function public.lotline_consume_guest_execution_ip_slot(text, integer, integer) to service_role;

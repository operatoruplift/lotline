-- Community moderation for shared plans; docs/community-moderation.md has the
-- operator's SQL. Anyone can report a shared plan with a short reason. A
-- signed-in member is one reporter. A guest is one reporter per salted hash of
-- their connection, which only the server computes and sends. A plan reported
-- by three distinct reporters is hidden until an operator reviews it, and an
-- operator can hide or restore any shared plan. Hidden plans leave the gallery,
-- the plan page and copy counting. Shared plans also gain an author key: a
-- salted hash that lets a reader hide every plan from one author on their own
-- device without learning who the author is.
-- Only the SECURITY DEFINER functions below touch the new tables; RLS with no
-- policies keeps every direct REST read and write closed.

alter table public.lotline_published_plans
  add column hidden_at timestamptz,
  add column hidden_reason text check (hidden_reason in ('reports', 'operator')),
  add constraint lotline_published_plans_hidden_check check ((hidden_at is null) = (hidden_reason is null));

create table public.lotline_plan_reports (
  id bigint generated always as identity primary key,
  published_id uuid not null references public.lotline_published_plans(id) on delete cascade,
  reporter_id uuid references auth.users(id) on delete cascade,
  reporter_hash text check (reporter_hash ~ '^[a-f0-9]{64}$'),
  reason text not null check (reason in ('spam', 'misleading', 'offensive', 'other')),
  created_at timestamptz not null default now(),
  -- Set when an operator restores the plan; reviewed reports no longer count toward hiding it.
  reviewed_at timestamptz,
  check ((reporter_id is null) <> (reporter_hash is null))
);
create unique index lotline_plan_reports_member_idx on public.lotline_plan_reports (published_id, reporter_id) where reporter_id is not null;
create unique index lotline_plan_reports_guest_idx on public.lotline_plan_reports (published_id, reporter_hash) where reporter_hash is not null;
create index lotline_plan_reports_member_recent_idx on public.lotline_plan_reports (reporter_id, created_at) where reporter_id is not null;
create index lotline_plan_reports_guest_recent_idx on public.lotline_plan_reports (reporter_hash, created_at) where reporter_hash is not null;
alter table public.lotline_plan_reports enable row level security;
revoke all on table public.lotline_plan_reports from public, anon, authenticated;

-- The author key's salt never leaves the database; only the owner can read it.
create table lotline_private.gallery_secrets (
  singleton boolean primary key default true check (singleton),
  author_salt text not null check (char_length(author_salt) >= 64)
);
alter table lotline_private.gallery_secrets enable row level security;
revoke all on table lotline_private.gallery_secrets from public, anon, authenticated, service_role;
insert into lotline_private.gallery_secrets (author_salt)
  values (replace(gen_random_uuid()::text || gen_random_uuid()::text || gen_random_uuid()::text, '-', ''));

-- The same 24 hex characters for every plan one author shares. Without the salt
-- it cannot be turned back into an account.
create function lotline_private.author_key(p_user uuid)
returns text
language sql
stable
security invoker
set search_path = ''
as $$
  select left(encode(sha256(convert_to(secrets.author_salt || ':' || p_user::text, 'UTF8')), 'hex'), 24)
  from lotline_private.gallery_secrets secrets;
$$;

create function lotline_private.record_plan_report(p_id uuid, p_reason text, p_member uuid, p_guest text)
returns boolean
language plpgsql
security invoker
set search_path = ''
as $$
declare
  author uuid;
  open_reports integer;
begin
  if p_reason is null or p_reason not in ('spam', 'misleading', 'offensive', 'other') then
    raise exception 'Choose spam, misleading, offensive or other' using errcode = '22023';
  end if;
  if (p_member is null) = (p_guest is null) then
    raise exception 'Name exactly one reporter' using errcode = '22023';
  end if;
  -- Lock the shared plan first, so concurrent reports agree on the count.
  select user_id into author from public.lotline_published_plans where id = p_id and hidden_at is null for update;
  if author is null then raise exception 'Shared plan not found' using errcode = 'P0002'; end if;
  if author = p_member then return false; end if;
  perform pg_advisory_xact_lock(hashtextextended(coalesce(p_member::text, p_guest), 1007));
  if (select count(*) from public.lotline_plan_reports
      where (reporter_id = p_member or reporter_hash = p_guest) and created_at > now() - interval '1 hour') >= 10 then
    raise exception 'Report limit reached' using errcode = 'P0001';
  end if;
  if p_guest is not null and (select count(*) from public.lotline_plan_reports
      where reporter_hash is not null and created_at > now() - interval '1 hour') >= 300 then
    raise exception 'Guest report limit reached' using errcode = 'P0001';
  end if;
  insert into public.lotline_plan_reports (published_id, reporter_id, reporter_hash, reason)
    values (p_id, p_member, p_guest, p_reason)
    on conflict do nothing;
  if not found then return false; end if;
  select count(*) into open_reports from public.lotline_plan_reports where published_id = p_id and reviewed_at is null;
  if open_reports >= 3 then
    update public.lotline_published_plans set hidden_at = now(), hidden_reason = 'reports' where id = p_id;
  end if;
  return true;
end;
$$;

revoke all on function lotline_private.author_key(uuid), lotline_private.record_plan_report(uuid, text, uuid, text) from public, anon, authenticated;

-- A signed-in member reports as their account. True when this report is new.
create function public.lotline_report_plan(p_id uuid, p_reason text)
returns boolean
language plpgsql
security definer
set search_path = ''
as $$
declare member uuid := auth.uid();
begin
  if member is null then raise exception 'Sign in to report as a member' using errcode = '42501'; end if;
  return lotline_private.record_plan_report(p_id, p_reason, member, null);
end;
$$;

-- A guest reports through the server, which sends a salted hash of the connection.
create function public.lotline_report_plan_as_guest(p_id uuid, p_reason text, p_reporter text)
returns boolean
language plpgsql
security definer
set search_path = ''
as $$
begin
  if p_reporter is null or p_reporter !~ '^[a-f0-9]{64}$' then
    raise exception 'Send the salted reporter hash' using errcode = '22023';
  end if;
  return lotline_private.record_plan_report(p_id, p_reason, null, p_reporter);
end;
$$;

-- Operator moderation: the service role or the database owner only.
create function public.lotline_hide_published_plan(p_id uuid)
returns boolean
language plpgsql
security definer
set search_path = ''
as $$
begin
  update public.lotline_published_plans
    set hidden_at = coalesce(hidden_at, now()), hidden_reason = 'operator'
    where id = p_id;
  return found;
end;
$$;

create function public.lotline_unhide_published_plan(p_id uuid)
returns boolean
language plpgsql
security definer
set search_path = ''
as $$
begin
  update public.lotline_published_plans set hidden_at = null, hidden_reason = null where id = p_id;
  if not found then return false; end if;
  -- The open reports are now reviewed, so hiding the plan again takes three new reporters.
  update public.lotline_plan_reports set reviewed_at = now() where published_id = p_id and reviewed_at is null;
  return true;
end;
$$;

-- The public views skip hidden plans and add the author key. Replacing a
-- function keeps its owner and grants.
create or replace function public.lotline_plan_gallery(p_sort text default 'copies', p_limit integer default 24, p_offset integer default 0)
returns jsonb
language sql
stable
security definer
set search_path = ''
as $$
  select coalesce(jsonb_agg(to_jsonb(ranked) - 'position' order by ranked.position), '[]'::jsonb)
  from (
    select row_number() over (order by
        case when p_sort = 'recent' then 0 else published.copy_count end desc,
        published.published_at desc, published.id) as position,
      published.id, plan.name, published.display_name, plan.allocations, published.copy_count, published.published_at, published.split_updated_at,
      lotline_private.author_key(published.user_id) as author_key
    from public.lotline_published_plans published
    join public.lotline_contribution_plans plan on plan.id = published.plan_id
    where published.hidden_at is null
    order by position
    limit least(greatest(coalesce(p_limit, 24), 1), 48)
    offset least(greatest(coalesce(p_offset, 0), 0), 960)
  ) ranked;
$$;

create or replace function public.lotline_published_plan(p_id uuid)
returns jsonb
language sql
stable
security definer
set search_path = ''
as $$
  select to_jsonb(item) from (
    select published.id, plan.name, published.display_name, plan.allocations, published.copy_count, published.published_at, published.split_updated_at,
      lotline_private.author_key(published.user_id) as author_key
    from public.lotline_published_plans published
    join public.lotline_contribution_plans plan on plan.id = published.plan_id
    where published.id = p_id and published.hidden_at is null
  ) item;
$$;

-- A hidden plan cannot gain copies.
create or replace function public.lotline_record_plan_copy(p_id uuid)
returns integer
language plpgsql
security definer
set search_path = ''
as $$
declare
  member uuid := auth.uid();
  author uuid;
  total integer;
begin
  if member is null then raise exception 'Sign in to count a copy' using errcode = '42501'; end if;
  select user_id, copy_count into author, total from public.lotline_published_plans where id = p_id and hidden_at is null;
  if author is null then raise exception 'Shared plan not found' using errcode = 'P0002'; end if;
  if author = member then return total; end if;
  insert into public.lotline_plan_copies (published_id, user_id) values (p_id, member) on conflict do nothing;
  if found then
    update public.lotline_published_plans set copy_count = copy_count + 1 where id = p_id returning copy_count into total;
  end if;
  return total;
end;
$$;

revoke all on function public.lotline_report_plan(uuid, text), public.lotline_report_plan_as_guest(uuid, text, text),
  public.lotline_hide_published_plan(uuid), public.lotline_unhide_published_plan(uuid) from public, anon, authenticated;
grant execute on function public.lotline_report_plan(uuid, text) to authenticated;
grant execute on function public.lotline_report_plan_as_guest(uuid, text, text),
  public.lotline_hide_published_plan(uuid), public.lotline_unhide_published_plan(uuid) to service_role;

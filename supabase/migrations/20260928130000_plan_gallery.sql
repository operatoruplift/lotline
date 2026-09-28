-- Community plan gallery. An owner may share a saved plan's name and split under
-- an optional display name. The budget, the owner's identity, wallets, balances
-- and quotes are never published. Copies are counted once per signed-in member,
-- never for the owner. Ranking uses copies or recency, never returns.
-- Only the SECURITY DEFINER functions below touch these tables; RLS with no
-- policies keeps every direct REST read and write closed.

create table public.lotline_published_plans (
  id uuid primary key default gen_random_uuid(),
  plan_id uuid not null unique references public.lotline_contribution_plans(id) on delete cascade,
  user_id uuid not null references auth.users(id) on delete cascade,
  display_name text check (
    display_name is null or (
      char_length(display_name) between 2 and 32
      and display_name ~ '^[A-Za-z0-9][A-Za-z0-9 ._-]*[A-Za-z0-9.]$'
      and display_name !~* '(https?|www|://|\.(com|io|xyz|net|org|app|dev)\y)'
    )
  ),
  copy_count integer not null default 0 check (copy_count >= 0),
  published_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create index lotline_published_plans_rank_idx on public.lotline_published_plans (copy_count desc, published_at desc);
create index lotline_published_plans_recent_idx on public.lotline_published_plans (published_at desc);
create index lotline_published_plans_user_idx on public.lotline_published_plans (user_id);

create table public.lotline_plan_copies (
  published_id uuid not null references public.lotline_published_plans(id) on delete cascade,
  user_id uuid not null references auth.users(id) on delete cascade,
  copied_at timestamptz not null default now(),
  primary key (published_id, user_id)
);
create index lotline_plan_copies_user_idx on public.lotline_plan_copies (user_id);

alter table public.lotline_published_plans enable row level security;
alter table public.lotline_plan_copies enable row level security;
revoke all on table public.lotline_published_plans, public.lotline_plan_copies from public, anon, authenticated;

create function public.lotline_publish_plan(p_plan_id uuid, p_display_name text default null)
returns uuid
language plpgsql
security definer
set search_path = ''
as $$
declare
  owner uuid := auth.uid();
  chosen text := nullif(btrim(coalesce(p_display_name, '')), '');
  result uuid;
begin
  if owner is null then raise exception 'Sign in to share a plan' using errcode = '42501'; end if;
  if not exists (select 1 from public.lotline_contribution_plans where id = p_plan_id and user_id = owner) then
    raise exception 'Saved plan not found' using errcode = 'P0002';
  end if;
  perform pg_advisory_xact_lock(hashtextextended(owner::text, 928));
  if not exists (select 1 from public.lotline_published_plans where plan_id = p_plan_id)
    and (select count(*) from public.lotline_published_plans where user_id = owner) >= 5 then
    raise exception 'Share limit reached' using errcode = 'P0001';
  end if;
  insert into public.lotline_published_plans (plan_id, user_id, display_name)
    values (p_plan_id, owner, chosen)
    on conflict (plan_id) do update set display_name = excluded.display_name, updated_at = now()
    returning id into result;
  return result;
end;
$$;

create function public.lotline_unpublish_plan(p_plan_id uuid)
returns boolean
language plpgsql
security definer
set search_path = ''
as $$
declare owner uuid := auth.uid();
begin
  if owner is null then raise exception 'Sign in to stop sharing a plan' using errcode = '42501'; end if;
  delete from public.lotline_published_plans where plan_id = p_plan_id and user_id = owner;
  return found;
end;
$$;

-- Public columns only: name and split from the saved plan, the display name, counts and dates.
create function public.lotline_plan_gallery(p_sort text default 'copies', p_limit integer default 24, p_offset integer default 0)
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
      published.id, plan.name, published.display_name, plan.allocations, published.copy_count, published.published_at
    from public.lotline_published_plans published
    join public.lotline_contribution_plans plan on plan.id = published.plan_id
    order by position
    limit least(greatest(coalesce(p_limit, 24), 1), 48)
    offset least(greatest(coalesce(p_offset, 0), 0), 960)
  ) ranked;
$$;

create function public.lotline_published_plan(p_id uuid)
returns jsonb
language sql
stable
security definer
set search_path = ''
as $$
  select to_jsonb(item) from (
    select published.id, plan.name, published.display_name, plan.allocations, published.copy_count, published.published_at
    from public.lotline_published_plans published
    join public.lotline_contribution_plans plan on plan.id = published.plan_id
    where published.id = p_id
  ) item;
$$;

create function public.lotline_record_plan_copy(p_id uuid)
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
  select user_id, copy_count into author, total from public.lotline_published_plans where id = p_id;
  if author is null then raise exception 'Shared plan not found' using errcode = 'P0002'; end if;
  if author = member then return total; end if;
  insert into public.lotline_plan_copies (published_id, user_id) values (p_id, member) on conflict do nothing;
  if found then
    update public.lotline_published_plans set copy_count = copy_count + 1 where id = p_id returning copy_count into total;
  end if;
  return total;
end;
$$;

create function public.lotline_my_published_plans()
returns jsonb
language sql
stable
security definer
set search_path = ''
as $$
  select coalesce(jsonb_agg(jsonb_build_object('id', id, 'plan_id', plan_id, 'display_name', display_name, 'copy_count', copy_count, 'published_at', published_at) order by published_at desc), '[]'::jsonb)
  from public.lotline_published_plans where user_id = auth.uid();
$$;

revoke all on function public.lotline_publish_plan(uuid, text), public.lotline_unpublish_plan(uuid), public.lotline_plan_gallery(text, integer, integer),
  public.lotline_published_plan(uuid), public.lotline_record_plan_copy(uuid), public.lotline_my_published_plans() from public, anon, authenticated;
grant execute on function public.lotline_plan_gallery(text, integer, integer), public.lotline_published_plan(uuid) to anon, authenticated;
grant execute on function public.lotline_publish_plan(uuid, text), public.lotline_unpublish_plan(uuid), public.lotline_record_plan_copy(uuid), public.lotline_my_published_plans() to authenticated;

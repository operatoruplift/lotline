-- Following a shared plan. An author can point their shared plan at a newer saved
-- split; the copy count, display name and share date carry over, and
-- split_updated_at tells members who copied it that the split changed.
-- Saved plans stay immutable: an update swaps which saved plan is shared.

alter table public.lotline_published_plans add column if not exists split_updated_at timestamptz;

create function public.lotline_update_published_plan(p_published_id uuid, p_plan_id uuid)
returns uuid
language plpgsql
security definer
set search_path = ''
as $$
declare owner uuid := auth.uid();
begin
  if owner is null then raise exception 'Sign in to update a shared plan' using errcode = '42501'; end if;
  perform pg_advisory_xact_lock(hashtextextended(owner::text, 928));
  if not exists (select 1 from public.lotline_published_plans where id = p_published_id and user_id = owner) then
    raise exception 'Shared plan not found' using errcode = 'P0002';
  end if;
  if not exists (select 1 from public.lotline_contribution_plans where id = p_plan_id and user_id = owner) then
    raise exception 'Saved plan not found' using errcode = 'P0002';
  end if;
  if exists (select 1 from public.lotline_published_plans where plan_id = p_plan_id and id <> p_published_id) then
    raise exception 'That saved plan is already shared' using errcode = 'P0001';
  end if;
  update public.lotline_published_plans
    set plan_id = p_plan_id, split_updated_at = now(), updated_at = now()
    where id = p_published_id and user_id = owner and plan_id <> p_plan_id;
  return p_published_id;
end;
$$;

-- The public views gain split_updated_at (null until the first update). Replacing
-- a function keeps its owner and grants.
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
      published.id, plan.name, published.display_name, plan.allocations, published.copy_count, published.published_at, published.split_updated_at
    from public.lotline_published_plans published
    join public.lotline_contribution_plans plan on plan.id = published.plan_id
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
    select published.id, plan.name, published.display_name, plan.allocations, published.copy_count, published.published_at, published.split_updated_at
    from public.lotline_published_plans published
    join public.lotline_contribution_plans plan on plan.id = published.plan_id
    where published.id = p_id
  ) item;
$$;

revoke all on function public.lotline_update_published_plan(uuid, uuid) from public, anon, authenticated;
grant execute on function public.lotline_update_published_plan(uuid, uuid) to authenticated;

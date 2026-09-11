-- Shared provider start-time reservations. These two rows contain no personal data.
create table public.lotline_provider_limits (
  provider text primary key check (provider in ('jupiter', 'solana')),
  next_start timestamptz not null
);
alter table public.lotline_provider_limits enable row level security;
revoke all on public.lotline_provider_limits from public, anon, authenticated;
grant select, insert, update on public.lotline_provider_limits to service_role;

create function public.lotline_reserve_provider_slot(provider text)
returns jsonb
language plpgsql
security invoker
set search_path = ''
as $$
declare
  observed_at timestamptz;
  reserved_time timestamptz;
  delay_ms integer;
  spacing interval;
begin
  if provider not in ('jupiter', 'solana') or provider is null then
    raise exception 'Unsupported provider';
  end if;
  spacing := case when provider = 'jupiter' then interval '2100 milliseconds' else interval '150 milliseconds' end;
  insert into public.lotline_provider_limits(provider, next_start)
  values (lotline_reserve_provider_slot.provider, clock_timestamp())
  on conflict on constraint lotline_provider_limits_pkey do nothing;

  select next_start into reserved_time
  from public.lotline_provider_limits
  where lotline_provider_limits.provider = lotline_reserve_provider_slot.provider
  for update;
  observed_at := clock_timestamp();
  reserved_time := greatest(reserved_time, observed_at);
  delay_ms := ceil(extract(epoch from (reserved_time - observed_at)) * 1000)::integer;
  -- Bound distributed backlog rather than retrying or retaining an unbounded queue.
  if delay_ms > 12600 then
    return jsonb_build_object('allowed', false, 'wait_ms', 0);
  end if;
  update public.lotline_provider_limits set next_start = reserved_time + spacing
  where lotline_provider_limits.provider = lotline_reserve_provider_slot.provider;
  return jsonb_build_object('allowed', true, 'wait_ms', delay_ms);
end;
$$;
revoke all on function public.lotline_reserve_provider_slot(text) from public, anon, authenticated;
grant execute on function public.lotline_reserve_provider_slot(text) to service_role;

-- Additive: several legs of one run may be reviewed together and approved in one
-- wallet prompt. A batch is the unit of approval: its attempts may be active
-- together, never alongside an attempt from another batch or a single review.
alter table public.lotline_execution_attempts add column if not exists batch_id uuid;
create index if not exists lotline_execution_attempt_batch_idx
  on public.lotline_execution_attempts (batch_id) where batch_id is not null;

create or replace function public.lotline_guard_execution_attempt()
returns trigger language plpgsql security definer set search_path = '' as $$
declare
  parent_run uuid;
begin
  if tg_op = 'UPDATE' then
    if new.leg_id is distinct from old.leg_id
      or new.provider_request_id is distinct from old.provider_request_id
      or new.transaction_message_hash is distinct from old.transaction_message_hash
      or new.original_blockhash is distinct from old.original_blockhash
      or new.original_last_valid_block_height is distinct from old.original_last_valid_block_height
      or new.minimum_output_raw is distinct from old.minimum_output_raw
      or new.provider_expires_at is distinct from old.provider_expires_at
      or new.batch_id is distinct from old.batch_id
      or (old.signature is not null and new.signature is distinct from old.signature) then
      raise exception 'execution_identity_immutable';
    end if;
  end if;
  if new.state = 'expired-unbroadcast' and new.signature is not null then
    raise exception 'signed_attempt_cannot_expire';
  end if;
  select leg.run_id into parent_run from public.lotline_execution_legs leg where leg.id = new.leg_id;
  perform 1 from public.lotline_execution_runs where id = parent_run for update;
  if tg_op = 'INSERT' and not exists (
    select 1 from public.lotline_execution_legs
    where id = new.leg_id and input_raw <> '0'
      and state in ('planned','quoting','expired-unbroadcast')
  ) then
    raise exception 'execution_leg_not_reviewable';
  end if;
  if new.state in ('review-required','awaiting-wallet','signed','submitted','confirming','unknown')
    and exists (
      select 1 from public.lotline_execution_attempts attempt
      join public.lotline_execution_legs leg on leg.id = attempt.leg_id
      where leg.run_id = parent_run and attempt.id <> new.id
        and attempt.state in ('review-required','awaiting-wallet','signed','submitted','confirming','unknown')
        and (new.batch_id is null or attempt.batch_id is distinct from new.batch_id)
    ) then
    raise exception 'run_active_attempt_exists';
  end if;
  if new.batch_id is not null then
    if exists (
      select 1 from public.lotline_execution_attempts attempt
      join public.lotline_execution_legs leg on leg.id = attempt.leg_id
      where attempt.batch_id = new.batch_id and attempt.id <> new.id and leg.run_id <> parent_run
    ) then
      raise exception 'execution_batch_run_mismatch';
    end if;
    if tg_op = 'INSERT' and (
      select count(*) from public.lotline_execution_attempts attempt
      where attempt.batch_id = new.batch_id and attempt.id <> new.id
    ) >= 10 then
      raise exception 'execution_batch_too_large';
    end if;
  end if;
  return new;
end;
$$;
revoke all on function public.lotline_guard_execution_attempt() from public, anon, authenticated;
grant execute on function public.lotline_guard_execution_attempt() to service_role;

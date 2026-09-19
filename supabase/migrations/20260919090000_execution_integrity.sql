-- Additive repair; do not rewrite the already applied base journal migration.
create unique index lotline_execution_runs_user_occurrence_idx
  on public.lotline_execution_runs (user_id, (intent->>'scheduleOccurrenceId'))
  where user_id is not null and intent->>'scheduleOccurrenceId' is not null;
create unique index lotline_execution_runs_guest_occurrence_idx
  on public.lotline_execution_runs (guest_capability_hash, (intent->>'scheduleOccurrenceId'))
  where guest_capability_hash is not null and intent->>'scheduleOccurrenceId' is not null;

alter table public.lotline_execution_attempts
  drop constraint lotline_execution_attempts_state_check;
alter table public.lotline_execution_attempts
  add constraint lotline_execution_attempts_state_check check (state in (
    'review-required','awaiting-wallet','signed','submitted','confirming',
    'confirmed','rejected','failed-onchain','expired-unbroadcast','unknown'
  ));

-- A row lock on the parent run serializes separate legs too. Application-level
-- snapshots and the per-leg unique index alone cannot prevent this race.
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
    ) then
    raise exception 'run_active_attempt_exists';
  end if;
  return new;
end;
$$;
revoke all on function public.lotline_guard_execution_attempt() from public, anon, authenticated;
grant execute on function public.lotline_guard_execution_attempt() to service_role;
create trigger lotline_guard_execution_attempt
  before insert or update on public.lotline_execution_attempts
  for each row execute function public.lotline_guard_execution_attempt();

-- Commit the attempt, user-visible summaries and event together. Separate HTTP
-- updates can otherwise let an older confirming write overwrite a newer receipt.
create or replace function public.lotline_sync_execution_attempt()
returns trigger language plpgsql security definer set search_path = '' as $$
declare
  parent_run uuid;
  previous_state text;
  summary_state text;
begin
  select run_id, state into parent_run, previous_state
    from public.lotline_execution_legs where id = new.leg_id;
  update public.lotline_execution_legs
    set state = new.state, state_version = state_version + 1,
      receipt = case when new.state in ('confirmed','failed-onchain') then new.evidence - 'transaction' else receipt end,
      updated_at = now()
    where id = new.leg_id;
  select case when state = 'expired-unbroadcast' then 'planned' else state end
    into summary_state from public.lotline_execution_legs
    where run_id = parent_run and input_raw <> '0'
    order by case state
      when 'unknown' then 0 when 'signed' then 1 when 'submitted' then 2
      when 'confirming' then 3 when 'awaiting-wallet' then 4 when 'review-required' then 5
      when 'quoting' then 6 when 'failed-onchain' then 7 when 'rejected' then 8
      when 'planned' then 9 when 'expired-unbroadcast' then 9 when 'confirmed' then 10
    end limit 1;
  summary_state := coalesce(summary_state, 'planned');
  update public.lotline_execution_runs set state = summary_state, updated_at = now() where id = parent_run;
  insert into public.lotline_execution_events (run_id,leg_id,from_state,to_state,reason,evidence)
    values (parent_run,new.leg_id,previous_state,new.state,new.evidence->>'reason',new.evidence - 'transaction');
  return new;
end;
$$;
revoke all on function public.lotline_sync_execution_attempt() from public, anon, authenticated;
create trigger lotline_sync_execution_attempt
  after insert or update of state, evidence on public.lotline_execution_attempts
  for each row execute function public.lotline_sync_execution_attempt();
revoke update, delete on public.lotline_execution_events from service_role;

-- A run's summary may lag an attempt after a disrupted multi-request write.
-- Never prune unresolved evidence based only on that summary.
create or replace function public.lotline_prune_guest_execution_runs()
returns void language plpgsql security definer set search_path = '' as $$
declare
  candidate uuid;
begin
  -- Lock candidates before checking attempts. Each subsequent statement gets
  -- a fresh READ COMMITTED snapshot, after any earlier signer has committed.
  for candidate in
    select run.id from public.lotline_execution_runs run
    where run.guest_capability_hash is not null
      and run.updated_at < now() - interval '2 days'
      and (
        (run.state in ('confirmed','rejected','failed-onchain','expired-unbroadcast')
          and run.updated_at < now() - interval '30 days')
        or run.state in ('planned','quoting','review-required','awaiting-wallet')
      )
    order by run.updated_at limit 100
    for update of run skip locked
  loop
    if not exists (
      select 1 from public.lotline_execution_attempts attempt
      join public.lotline_execution_legs leg on leg.id = attempt.leg_id
      where leg.run_id = candidate and (
        attempt.state in ('signed','submitted','confirming','unknown')
        or attempt.updated_at >= now() - interval '2 days'
        or (attempt.state in ('confirmed','failed-onchain','rejected','expired-unbroadcast')
          and attempt.updated_at >= now() - interval '30 days')
      )
    ) then
      delete from public.lotline_execution_runs where id = candidate;
    end if;
  end loop;
end;
$$;
revoke all on function public.lotline_prune_guest_execution_runs() from public, anon, authenticated;
grant execute on function public.lotline_prune_guest_execution_runs() to service_role;

-- The schedule table is directly writable through owner-scoped RLS. Validate
-- the same data there as at the HTTP boundary and version every meaningful edit.
create or replace function lotline_private.guard_contribution_schedule()
returns trigger language plpgsql security definer set search_path = '' as $$
begin
  if not lotline_private.valid_plan_allocations(new.allocations)
    or new.budget_raw !~ '^[1-9][0-9]{0,12}$'
    or new.budget_raw::numeric > 1000000000000
    or not exists (select 1 from pg_catalog.pg_timezone_names where name = new.timezone)
    or new.name <> btrim(new.name) or new.name ~ '[[:cntrl:]]' then
    raise exception 'invalid_contribution_schedule';
  end if;
  if tg_op = 'INSERT' then
    if new.user_id is null then raise exception 'schedule_account_required'; end if;
    perform pg_advisory_xact_lock(hashtextextended('schedule:' || new.user_id::text, 0));
    if (select count(*) from public.lotline_contribution_schedules where user_id = new.user_id) >= 50 then
      raise exception 'schedule_quota_exceeded';
    end if;
    new.plan_version := 1;
  else
    if new.user_id is distinct from old.user_id
      or new.guest_capability_hash is distinct from old.guest_capability_hash then
      raise exception 'schedule_owner_immutable';
    end if;
    new.plan_version := old.plan_version;
    if (new.name, new.budget_raw, new.allocations, new.cadence, new.timezone, new.next_due_at, new.paused)
      is distinct from
      (old.name, old.budget_raw, old.allocations, old.cadence, old.timezone, old.next_due_at, old.paused) then
      new.plan_version := old.plan_version + 1;
    end if;
  end if;
  new.updated_at := now();
  return new;
end;
$$;
revoke all on function lotline_private.guard_contribution_schedule() from public, anon, authenticated;
create trigger lotline_guard_contribution_schedule
  before insert or update on public.lotline_contribution_schedules
  for each row execute function lotline_private.guard_contribution_schedule();

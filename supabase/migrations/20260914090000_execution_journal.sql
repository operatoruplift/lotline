-- Durable, append-only journal for explicitly user-approved contribution legs.
-- The browser never receives a service key or direct table grants. Route handlers
-- use the server client after validating the wallet, immutable intent and origin.
create schema if not exists lotline_private;

create table if not exists public.lotline_execution_runs (
  id uuid primary key default gen_random_uuid(),
  user_id uuid references auth.users(id) on delete cascade,
  guest_capability_hash bytea,
  chain text not null check (chain = 'solana:mainnet'),
  wallet text not null check (wallet ~ '^[1-9A-HJ-NP-Za-km-z]{32,44}$'),
  input_mint text not null check (input_mint ~ '^[1-9A-HJ-NP-Za-km-z]{32,44}$'),
  budget_raw text not null check (budget_raw ~ '^[1-9][0-9]{0,19}$'),
  intent jsonb not null,
  intent_hash text not null check (intent_hash ~ '^[a-f0-9]{64}$'),
  policy_version text not null,
  state text not null check (state in ('planned','quoting','review-required','awaiting-wallet','signed','submitted','confirming','confirmed','rejected','failed-onchain','expired-unbroadcast','unknown')),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  check ((user_id is not null) <> (guest_capability_hash is not null))
);
create unique index if not exists lotline_execution_runs_owner_intent_idx on public.lotline_execution_runs (coalesce(user_id, '00000000-0000-0000-0000-000000000000'::uuid), intent_hash);
create index if not exists lotline_execution_runs_guest_idx on public.lotline_execution_runs (guest_capability_hash);

create table if not exists public.lotline_execution_legs (
  id uuid primary key default gen_random_uuid(),
  run_id uuid not null references public.lotline_execution_runs(id) on delete cascade,
  leg_key text not null check (leg_key ~ '^[a-zA-Z0-9_-]{1,64}$'),
  issuer_id text not null,
  mint text not null check (mint ~ '^[1-9A-HJ-NP-Za-km-z]{32,44}$'),
  allocation_bps integer not null check (allocation_bps between 0 and 10000),
  input_raw text not null check (input_raw ~ '^(0|[1-9][0-9]{0,19})$'),
  state text not null check (state in ('planned','quoting','review-required','awaiting-wallet','signed','submitted','confirming','confirmed','rejected','failed-onchain','expired-unbroadcast','unknown')),
  state_version integer not null default 0 check (state_version >= 0),
  receipt jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (run_id, leg_key),
  unique (run_id, mint)
);
create index if not exists lotline_execution_legs_run_idx on public.lotline_execution_legs (run_id, created_at);

create table if not exists public.lotline_execution_attempts (
  id uuid primary key default gen_random_uuid(),
  leg_id uuid not null references public.lotline_execution_legs(id) on delete cascade,
  provider_request_id text not null check (char_length(provider_request_id) between 1 and 160),
  transaction_message_hash text not null check (transaction_message_hash ~ '^[a-f0-9]{64}$'),
  original_blockhash text not null,
  original_last_valid_block_height text check (original_last_valid_block_height is null or original_last_valid_block_height ~ '^(0|[1-9][0-9]{0,19})$'),
  provider_expires_at timestamptz,
  minimum_output_raw text not null check (minimum_output_raw ~ '^[1-9][0-9]{0,19}$'),
  signed_transaction_ciphertext bytea,
  signature text,
  state text not null check (state in ('review-required','awaiting-wallet','signed','submitted','confirming','confirmed','rejected','failed-onchain','unknown')),
  state_version integer not null default 0 check (state_version >= 0),
  evidence jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create unique index if not exists lotline_execution_attempt_request_idx on public.lotline_execution_attempts (provider_request_id);
create unique index if not exists lotline_execution_attempt_signature_idx on public.lotline_execution_attempts (signature) where signature is not null;
create unique index if not exists lotline_execution_attempt_one_active_idx on public.lotline_execution_attempts (leg_id) where state in ('review-required','awaiting-wallet','signed','submitted','confirming','unknown');

create table if not exists public.lotline_execution_events (
  id bigint generated always as identity primary key,
  run_id uuid not null references public.lotline_execution_runs(id) on delete cascade,
  leg_id uuid references public.lotline_execution_legs(id) on delete cascade,
  from_state text,
  to_state text not null,
  reason text,
  evidence jsonb,
  created_at timestamptz not null default now()
);
create index if not exists lotline_execution_events_run_idx on public.lotline_execution_events (run_id, created_at);

create table if not exists public.lotline_contribution_schedules (
  id uuid primary key default gen_random_uuid(),
  user_id uuid references auth.users(id) on delete cascade,
  guest_capability_hash bytea,
  name text not null check (char_length(name) between 1 and 60 and name = btrim(name)),
  budget_raw text not null check (budget_raw ~ '^[1-9][0-9]{0,19}$'),
  allocations jsonb not null,
  cadence text not null check (cadence in ('weekly','monthly')),
  timezone text not null check (char_length(timezone) between 1 and 80),
  next_due_at timestamptz not null,
  paused boolean not null default false,
  plan_version integer not null default 1 check (plan_version > 0),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  check ((user_id is not null) <> (guest_capability_hash is not null))
);
create index if not exists lotline_contribution_schedules_owner_idx on public.lotline_contribution_schedules (user_id, next_due_at);
create table if not exists public.lotline_contribution_occurrences (
  id uuid primary key default gen_random_uuid(),
  schedule_id uuid not null references public.lotline_contribution_schedules(id) on delete cascade,
  occurrence_key text not null,
  due_at timestamptz not null,
  plan_snapshot jsonb not null,
  run_id uuid references public.lotline_execution_runs(id),
  created_at timestamptz not null default now(),
  unique (schedule_id, occurrence_key)
);

alter table public.lotline_execution_runs enable row level security;
alter table public.lotline_execution_runs force row level security;
alter table public.lotline_execution_legs enable row level security;
alter table public.lotline_execution_legs force row level security;
alter table public.lotline_execution_attempts enable row level security;
alter table public.lotline_execution_attempts force row level security;
alter table public.lotline_execution_events enable row level security;
alter table public.lotline_execution_events force row level security;
alter table public.lotline_contribution_schedules enable row level security;
alter table public.lotline_contribution_schedules force row level security;
alter table public.lotline_contribution_occurrences enable row level security;
alter table public.lotline_contribution_occurrences force row level security;

revoke all on public.lotline_execution_runs, public.lotline_execution_legs, public.lotline_execution_attempts, public.lotline_execution_events, public.lotline_contribution_schedules, public.lotline_contribution_occurrences from public, anon, authenticated;
grant all on public.lotline_execution_runs, public.lotline_execution_legs, public.lotline_execution_attempts, public.lotline_execution_events, public.lotline_contribution_schedules, public.lotline_contribution_occurrences to service_role;

-- Schedules are user-managed metadata. The execution journal remains service-role only.
grant select, insert, update, delete on public.lotline_contribution_schedules to authenticated;
create policy contribution_schedules_select_own on public.lotline_contribution_schedules
  for select to authenticated using (user_id = auth.uid());
create policy contribution_schedules_insert_own on public.lotline_contribution_schedules
  for insert to authenticated with check (user_id = auth.uid());
create policy contribution_schedules_update_own on public.lotline_contribution_schedules
  for update to authenticated using (user_id = auth.uid()) with check (user_id = auth.uid());
create policy contribution_schedules_delete_own on public.lotline_contribution_schedules
  for delete to authenticated using (user_id = auth.uid());

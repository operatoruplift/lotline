-- Account deletion. Deleting a user in Supabase Auth removes every row that
-- references auth.users through ON DELETE CASCADE: saved plans, shared plans and
-- their copies, reminders and their occurrences, and execution runs with their
-- legs, attempts and events. One link stopped it. A reminder occurrence that
-- started a run referenced that run with no ON DELETE action, so deleting the
-- run in the same statement as the occurrence failed and the account stayed.
-- The link now clears instead. One constraint changes; no data does.
alter table public.lotline_contribution_occurrences
  drop constraint lotline_contribution_occurrences_run_id_fkey,
  add constraint lotline_contribution_occurrences_run_id_fkey
    foreign key (run_id) references public.lotline_execution_runs(id) on delete set null;

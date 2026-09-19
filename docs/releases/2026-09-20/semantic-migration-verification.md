# Production semantic-proof migration verification

Observed 2026-09-19T18:37:34.043Z (September 20 in Asia/Ho_Chi_Minh).

Project: uemunksopacicpbjubtg. Evidence class: deployed database schema and rolled-back database behavior. No wallet signature, provider execution, token transfer, or real settlement was performed.

## Applied change

- Additive migration: supabase/migrations/20260920090000_execution_proof_immutability.sql
- SHA-256: 2e31be8cbba7fd2d1d0af154de1ede8764e25d4e6219874a5a95e1f4c46f398e
- Authenticated linked Supabase CLI 2.117.0 confirmed the project reference and the previous six matching migrations.
- Dry run listed only 20260920090000_execution_proof_immutability.sql, with no seed or role changes.
- Applied that file using db push --linked --yes.
- A fresh connector migration listing confirms all seven versions: 20260911170809, 20260911170815, 20260912094113, 20260914090000, 20260915090000, 20260919090000, 20260920090000.

## Hosted verification

- lotline_guard_execution_evidence exists and is enabled (O).
- lotline_private.guard_execution_evidence is SECURITY DEFINER with an empty search_path.
- PUBLIC, anon and authenticated lack function EXECUTE privileges.
- service_role still lacks UPDATE and DELETE on the append-only execution event table.
- The initial hosted database had zero runs and zero attempts.

Inside an explicit BEGIN/ROLLBACK, synthetic journal rows were inserted while SET LOCAL ROLE service_role was active. An ordinary observation update succeeded. Changes to the original semantic proof, slippage, transaction bytes, and proof removal each failed with execution_evidence_immutable. Attaching proof retrospectively to a legacy attempt also failed. Audit events were present. The transaction was rolled back.

The final verification returned all_assertions_passed=true, runs_after_rollback=0, attempts_after_rollback=0, events_after_rollback=0, transactions_signed_or_submitted=false. This is a single-session behavioral check, not load or concurrency certification. The first audit query was aborted by an ambiguous local SQL variable; the corrected transaction passed and no test records remained.

## Local evidence

The isolated PostgreSQL suite executes every migration and tests the same immutability rules. The combined receipt, lookup-receipt, reconciliation, database, and client request run passed 55 tests. Application typechecking subsequently passed.

## Activation and rollback

No execution flag or deployment environment was changed by this database task. The application release must separately use LOTLINE_EXECUTION_PROOF_MIGRATIONS_READY=true only after this verified migration; that flag does not prove settlement or authorize trading.

If rolling back this guard is necessary, first pause new purchases, drop trigger lotline_guard_execution_evidence on public.lotline_execution_attempts, then drop function lotline_private.guard_execution_evidence(). Preserve every run, attempt, event, signature and proof. Prefer reverting the application while retaining this additive guard.

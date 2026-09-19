-- Preserve the exact reviewed bytes, bounds and lookup resolution for later receipt reads.
-- This is an additive guard; existing attempts and append-only events remain intact.
create or replace function lotline_private.guard_execution_evidence()
returns trigger language plpgsql security definer set search_path = '' as $$
declare
  field text;
begin
  foreach field in array array[
    'transaction','router','inputMint','outputMint','inAmount','outAmount',
    'prioritizationFeeLamports','signatureFeeLamports','rentFeeLamports','totalSolCostLamports',
    'feeBps','feeMint','platformFee','validation','slippageBps','semanticProof',
    'expectedSignature','signedTransactionHash'
  ] loop
    if (coalesce(old.evidence ? field, false) or field in ('slippageBps','semanticProof'))
      and (new.evidence -> field) is distinct from (old.evidence -> field) then
      raise exception 'execution_evidence_immutable';
    end if;
  end loop;
  return new;
end;
$$;
revoke all on function lotline_private.guard_execution_evidence() from public, anon, authenticated;
create trigger lotline_guard_execution_evidence
  before update of evidence on public.lotline_execution_attempts
  for each row execute function lotline_private.guard_execution_evidence();

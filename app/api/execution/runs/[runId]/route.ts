import { getSnapshot } from '@/lib/server/execution/repository';
import { failure, json, requireExecutionOwner } from '@/lib/server/execution/http';
import { requireJournalReadiness } from '@/lib/server/execution/reconciliation';

export const dynamic = 'force-dynamic';

export async function GET(_request: Request, context: { params: Promise<{ runId: string }> }) {
  try {
    requireJournalReadiness(false);
    const { runId } = await context.params;
    const owner = await requireExecutionOwner();
    const snapshot = await getSnapshot(owner, runId);
    if (!snapshot) return json({ state: 'not-found', message: 'That contribution review is no longer available.' }, 404);
    const attempts = snapshot.attempts.map(attempt => ({ ...attempt, evidence: attempt.evidence ? Object.fromEntries(Object.entries(attempt.evidence).filter(([key]) => key !== 'transaction')) : null }));
    const publicRun = Object.fromEntries(Object.entries(snapshot.run).filter(([key]) => key !== 'user_id' && key !== 'guest_capability_hash'));
    return json({ state: 'success', run: publicRun, legs: snapshot.legs, attempts });
  } catch (error) { return failure(error); }
}

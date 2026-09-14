import { getSnapshot } from '@/lib/server/execution/repository';
import { ensureExecutionEnabled, failure, json, requireUser } from '@/lib/server/execution/http';

export const dynamic = 'force-dynamic';

export async function GET(_request: Request, context: { params: Promise<{ runId: string }> }) {
  try {
    const ready = ensureExecutionEnabled();
    if (ready.response) return ready.response;
    const { runId } = await context.params;
    const user = await requireUser();
    const snapshot = await getSnapshot(user.id, runId);
    if (!snapshot) return json({ state: 'not-found', message: 'That contribution review is no longer available.' }, 404);
    const attempts = snapshot.attempts.map(attempt => ({ ...attempt, evidence: attempt.evidence ? Object.fromEntries(Object.entries(attempt.evidence).filter(([key]) => key !== 'transaction')) : null }));
    return json({ state: 'success', run: snapshot.run, legs: snapshot.legs, attempts });
  } catch (error) { return failure(error); }
}

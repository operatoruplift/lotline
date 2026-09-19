import { reconcileExecution } from '@/lib/server/execution/reconciliation';

export const dynamic = 'force-dynamic';
export const maxDuration = 30;

export async function POST(request: Request, context: { params: Promise<{ runId: string; legId: string }> }) {
  return reconcileExecution(request, await context.params);
}

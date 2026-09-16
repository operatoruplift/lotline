import { executionConfig } from '@/lib/server/execution/config';
import { noStore } from '@/lib/server/requests';

export const dynamic = 'force-dynamic';

export async function GET() {
  const config = executionConfig();
  // The readiness resource is always retrievable; whether execution is enabled
  // is its content, not its availability. A 503 here made every page load log
  // a failed request in the browser, which reads as breakage.
  return Response.json({ state: config.enabled ? 'success' : 'configuration-required', ...config }, { status: 200, headers: noStore });
}

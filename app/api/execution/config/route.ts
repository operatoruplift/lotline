import { executionConfig } from '@/lib/server/execution/config';
import { noStore } from '@/lib/server/requests';

export const dynamic = 'force-dynamic';

export async function GET() {
  const config = executionConfig();
  return Response.json({ state: config.enabled ? 'success' : 'configuration-required', ...config }, { status: config.enabled ? 200 : 503, headers: noStore });
}

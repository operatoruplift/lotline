import 'server-only';
import { ServiceError } from '@/lib/server/common';

export const JUPITER_EXECUTION_ACCESS_REQUIRED = 'Executable orders need a server-side Jupiter API key or explicit keyless execution access.';

/** Keyless access is an operator opt-in, independent of every purchase readiness gate. */
export function jupiterExecutionHeaders(): Record<string, string> | null {
  const key = process.env.JUPITER_API_KEY?.trim();
  if (key) return { 'x-api-key': key };
  return process.env.LOTLINE_EXECUTION_KEYLESS_JUPITER === 'true' ? {} : null;
}

export function requireJupiterExecutionHeaders(): Record<string, string> {
  const headers = jupiterExecutionHeaders();
  if (!headers) throw new ServiceError('configuration-required', JUPITER_EXECUTION_ACCESS_REQUIRED);
  return headers;
}

import 'server-only';
import { serverSupabase } from '@/lib/supabase/server';
import { executionConfig } from './config';
import { noStore } from '@/lib/server/requests';
import { isSameOriginMutation } from '@/lib/supabase/plans';
import { ServiceError } from '@/lib/server/common';

export function json(body: unknown, status = 200) {
  return Response.json(body, { status, headers: noStore });
}

export function ensureExecutionEnabled() {
  const config = executionConfig();
  if (!config.enabled) return { response: json({ state: 'configuration-required', ...config }, 503), config };
  return { config };
}

export function requireSameOrigin(request: Request) {
  if (!isSameOriginMutation(request)) throw new ServiceError('invalid-input', 'Reload Lotline before approving a contribution.');
}

export async function requireUser() {
  const client = await serverSupabase();
  if (!client) throw new ServiceError('configuration-required', 'Sign-in is required before execution can be enabled.');
  const { data, error } = await client.auth.getUser();
  if (error || !data.user) throw new ServiceError('invalid-input', 'Sign in before reviewing a live contribution.');
  return data.user;
}

export function failure(error: unknown) {
  if (error instanceof ServiceError) {
    const status = error.kind === 'invalid-input' ? 400 : 503;
    return json({ state: error.kind, message: error.message }, status);
  }
  return json({ state: 'unavailable', message: 'The execution service is temporarily unavailable. Your plan is unchanged.' }, 503);
}

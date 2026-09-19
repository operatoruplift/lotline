import 'server-only';
import { createClient } from '@supabase/supabase-js';
import { createHash, createHmac, randomBytes } from 'node:crypto';
import { serverSupabase } from '@/lib/supabase/server';
import { cookies } from 'next/headers';
import { executionConfig, publicExecutionConfig } from './config';
import { noStore } from '@/lib/server/requests';
import { isSameOriginMutation } from '@/lib/supabase/plans';
import { ServiceError } from '@/lib/server/common';

const EXECUTION_CAPABILITY_COOKIE = 'lotline_execution_capability';
const EXECUTION_CAPABILITY_BYTES = 32;
const EXECUTION_CAPABILITY_MAX_AGE = 60 * 60 * 24;

export type ExecutionOwner =
  | { kind: 'user'; id: string; guestCapabilityHash?: string }
  | { kind: 'guest'; capabilityHash: string; issuedToken?: string };

function capabilityHash(token: string): string {
  return createHash('sha256').update(token).digest('hex');
}

function validCapability(value: string | undefined): value is string {
  return Boolean(value && /^[A-Za-z0-9_-]{43}$/.test(value));
}

/** Resolve an authenticated owner, or a short-lived guest journal capability. */
export async function requireExecutionOwner(options: { issueGuest?: boolean } = {}): Promise<ExecutionOwner> {
  const jar = await cookies();
  const existing = jar.get(EXECUTION_CAPABILITY_COOKIE)?.value;
  const existingHash = validCapability(existing) ? capabilityHash(existing) : undefined;
  const client = await serverSupabase();
  if (client) {
    const { data } = await client.auth.getUser();
    if (data.user) return { kind: 'user', id: data.user.id, ...(existingHash ? { guestCapabilityHash: existingHash } : {}) };
  }
  if (existingHash) return { kind: 'guest', capabilityHash: existingHash };
  if (!options.issueGuest) throw new ServiceError('invalid-input', 'Start this contribution from the same browser session that created it.');
  const token = randomBytes(EXECUTION_CAPABILITY_BYTES).toString('base64url');
  jar.set(EXECUTION_CAPABILITY_COOKIE, token, {
    httpOnly: true,
    sameSite: 'lax',
    secure: process.env.NODE_ENV === 'production',
    path: '/api/execution',
    maxAge: EXECUTION_CAPABILITY_MAX_AGE,
  });
  return { kind: 'guest', capabilityHash: capabilityHash(token), issuedToken: token };
}

const guestRateWindows = new Map<string, { startedAt: number; count: number }>();
const GUEST_RATE_WINDOW_MS = 60_000;
// A ten-leg run needs one create, one order, one execute and at least one
// reconciliation per leg. Leave room for retries and a resumed browser.
const GUEST_RATE_LIMIT = 180;
const GUEST_GLOBAL_RATE_LIMIT = 600;
const GUEST_RATE_MAX_KEYS = 2_048;

/** A small per-instance abuse guard for unauthenticated execution journal writes. */
export async function enforceExecutionRateLimit(owner: ExecutionOwner, request: Request) {
  if (owner.kind !== 'guest') return;
  // Prefer the platform-normalized address. Never trust a client-supplied
  // forwarded chain; when absent, the shared global bucket still applies.
  const ip = request.headers.get('x-real-ip')?.trim() || 'edge-unknown';
  const key = createHash('sha256').update(`${owner.capabilityHash}:${ip}`).digest('hex');
  const now = Date.now();
  if (guestRateWindows.size >= GUEST_RATE_MAX_KEYS) {
    for (const [candidate, window] of guestRateWindows) {
      if (now - window.startedAt >= GUEST_RATE_WINDOW_MS) guestRateWindows.delete(candidate);
    }
    if (guestRateWindows.size >= GUEST_RATE_MAX_KEYS) guestRateWindows.delete(guestRateWindows.keys().next().value as string);
  }
  const current = guestRateWindows.get(key);
  if (!current || now - current.startedAt >= GUEST_RATE_WINDOW_MS) {
    guestRateWindows.set(key, { startedAt: now, count: 1 });
  } else {
    if (current.count >= GUEST_RATE_LIMIT) throw new ServiceError('unavailable', 'This browser has reached the contribution activity limit. Try again in a minute.');
    current.count += 1;
  }

  const url = process.env.NEXT_PUBLIC_SUPABASE_URL?.trim();
  const secret = process.env.SUPABASE_SECRET_KEY?.trim();
  if (!url || !secret?.startsWith('sb_secret_')) throw new ServiceError('configuration-required', 'Guest execution limits are not configured.');
  const db = createClient(url, secret, {
    auth: { autoRefreshToken: false, persistSession: false },
    global: { fetch: (input, init) => fetch(input, { ...init, cache: 'no-store', signal: init?.signal ? AbortSignal.any([init.signal, AbortSignal.timeout(8_000)]) : AbortSignal.timeout(8_000) }) },
  });
  const consume = async (ipHash: string, limit: number) => {
    const { data, error } = await db.rpc('lotline_consume_guest_execution_ip_slot', { p_ip_hash: ipHash, p_limit: limit, p_window_seconds: GUEST_RATE_WINDOW_MS / 1000 });
    if (error) throw new ServiceError('configuration-required', 'Guest execution limits are not available until the latest journal migration is applied.');
    return data === true;
  };
  const ipHash = createHmac('sha256', secret).update(`ip:${ip}`).digest('hex');
  const globalHash = createHmac('sha256', secret).update('guest-global').digest('hex');
  if (!(await consume(ipHash, GUEST_RATE_LIMIT))) throw new ServiceError('unavailable', 'This network has reached the contribution activity limit. Try again in a minute.');
  if (!(await consume(globalHash, GUEST_GLOBAL_RATE_LIMIT))) throw new ServiceError('unavailable', 'Guest contribution traffic is temporarily full. Try again in a minute.');
}

export function json(body: unknown, status = 200) {
  return Response.json(body, { status, headers: noStore });
}

export function ensureExecutionEnabled() {
  const config = executionConfig();
  if (!config.enabled) return { response: json({ state: 'configuration-required', ...publicExecutionConfig(config) }, 503), config };
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

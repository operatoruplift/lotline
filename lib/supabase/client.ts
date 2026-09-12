'use client';

import { createBrowserClient } from '@supabase/ssr';
import { supabaseConfig } from './config';

const REQUEST_TIMEOUT_MS = 12_000;
const MAX_AUTH_RESPONSE_BYTES = 256 * 1024;

function abortable<T>(pending: Promise<T>, signal: AbortSignal): Promise<T> {
  return new Promise((resolve, reject) => {
    const cleanup = () => signal.removeEventListener('abort', abort);
    const abort = () => { cleanup(); reject(signal.reason); };
    signal.addEventListener('abort', abort, { once: true });
    if (signal.aborted) abort();
    pending.then(value => { cleanup(); resolve(value); }, error => { cleanup(); reject(error); });
  });
}

async function bufferedAuthResponse(response: Response, signal: AbortSignal) {
  const reader = response.body?.getReader();
  const chunks: Uint8Array[] = [];
  let size = 0;
  try {
    while (reader) {
      const { done, value } = await abortable(reader.read(), signal);
      signal.throwIfAborted();
      if (done) break;
      size += value.byteLength;
      if (size > MAX_AUTH_RESPONSE_BYTES) throw new Error('Account response exceeded its size limit');
      chunks.push(value);
    }
  } finally {
    // Also close a stalled body when a fetch implementation ignores abort.
    if (reader) { void reader.cancel().catch(() => undefined); reader.releaseLock(); }
  }
  signal.throwIfAborted();
  const body = new Uint8Array(size);
  let offset = 0;
  for (const chunk of chunks) { body.set(chunk, offset); offset += chunk.byteLength; }
  const buffered = new Response(size ? body : null, { status: response.status, statusText: response.statusText, headers: response.headers });
  const json = buffered.json.bind(buffered);
  // The SDK calls json() after fetch resolves. Recheck on both sides of that
  // asynchronous boundary before it can turn the payload into a saved session.
  buffered.json = async () => { signal.throwIfAborted(); const data: unknown = await json(); signal.throwIfAborted(); return data; };
  return buffered;
}

/** Serialize explicit account mutations without creating more SDK clients. */
export function createAuthTransport(projectUrl: string, fetcher: typeof fetch) {
  const authUrl = new URL('/auth/v1/', projectUrl);
  let queued: AbortController | undefined;
  let dispatchSignal: AbortSignal | undefined;
  let tail: Promise<void> = Promise.resolve();

  function isAccountMutation(input: RequestInfo | URL, init?: RequestInit) {
    const url = new URL(input instanceof Request ? input.url : String(input));
    if (url.origin !== authUrl.origin) return false;
    const method = (init?.method ?? (input instanceof Request ? input.method : 'GET')).toUpperCase();
    const path = url.pathname.slice(authUrl.pathname.length);
    if (!url.pathname.startsWith(authUrl.pathname)) return false;
    return method === 'PUT' && path === 'user' || method === 'POST' && (
      path === 'signup' || path === 'recover' || path === 'logout' ||
      path === 'token' && url.searchParams.get('grant_type') === 'password'
    );
  }

  const transport: typeof fetch = async (input, init) => {
    // Background refresh and getUser must not inherit a form's cancellation.
    const scope = isAccountMutation(input, init) ? dispatchSignal : undefined;
    const originalSignal = init?.signal ?? (input instanceof Request ? input.signal : undefined);
    const signal = AbortSignal.any([AbortSignal.timeout(REQUEST_TIMEOUT_MS), ...(originalSignal ? [originalSignal] : []), ...(scope ? [scope] : [])]);
    signal.throwIfAborted();
    const pending = fetcher(input, { ...init, signal }).then(response => {
      if (signal.aborted) { void response.body?.cancel().catch(() => undefined); signal.throwIfAborted(); }
      return response;
    });
    const response = await abortable(pending, signal);
    return scope ? bufferedAuthResponse(response, signal) : response;
  };

  function run<T>(signal: AbortSignal, operation: () => Promise<T>): Promise<T> {
    queued?.abort();
    const controller = new AbortController();
    queued = controller;
    const scope = AbortSignal.any([signal, controller.signal]);
    // Some SDK methods await initialization or PKCE before fetching; keep their
    // scope until ALL SDK cleanup finishes, then permit the next operation.
    const result = tail.then(async () => {
      scope.throwIfAborted();
      dispatchSignal = scope;
      try { return await operation(); }
      finally { dispatchSignal = undefined; if (queued === controller) queued = undefined; }
    });
    tail = result.then(() => undefined, () => undefined);
    return result;
  }

  return { fetch: transport, run };
}

let accountTransport: ReturnType<typeof createAuthTransport> | undefined;

export function browserSupabase() {
  const config = supabaseConfig();
  if (!config) return null;
  accountTransport ??= createAuthTransport(config.url, (input, init) => fetch(input, init));
  return createBrowserClient(config.url, config.key, { global: { fetch: accountTransport.fetch } });
}

export function runBrowserAuth<T>(signal: AbortSignal, operation: (auth: NonNullable<ReturnType<typeof browserSupabase>>['auth']) => Promise<T>): Promise<T> {
  const client = browserSupabase();
  if (!client || !accountTransport) return Promise.reject(new Error('Accounts are unavailable'));
  return accountTransport.run(signal, () => operation(client.auth));
}

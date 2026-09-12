import { createBrowserClient } from '@supabase/ssr';
import { describe, expect, it, vi } from 'vitest';
import { createAuthTransport } from '@/lib/supabase/client';

const projectUrl = 'https://auth-fixture.invalid';
const tokenUrl = `${projectUrl}/auth/v1/token?grant_type=password`;
const password = 'only-a-local-test-password';

function deferred<T>() {
  let resolve!: (value: T) => void;
  const promise = new Promise<T>(done => { resolve = done; });
  return { promise, resolve };
}

function session(id: string) {
  const encode = (value: unknown) => Buffer.from(JSON.stringify(value)).toString('base64url');
  const now = Math.floor(Date.now() / 1000);
  return {
    access_token: `${encode({ alg: 'HS256', typ: 'JWT' })}.${encode({ sub: id, aud: 'authenticated', exp: now + 3600, iat: now })}.${Buffer.from('unsigned-test-fixture').toString('base64url')}`,
    refresh_token: `fixture-refresh-${id}`, token_type: 'bearer', expires_in: 3600,
    user: { id, aud: 'authenticated', role: 'authenticated', email: `${id}@example.test`, app_metadata: {}, user_metadata: {}, created_at: '2026-01-01T00:00:00Z' },
  };
}

async function fixture(fetcher: typeof fetch) {
  const cookies = new Map<string, string>();
  const transport = createAuthTransport(projectUrl, fetcher);
  const client = createBrowserClient(projectUrl, 'sb_publishable_fixture', {
    isSingleton: false,
    auth: { autoRefreshToken: false, detectSessionInUrl: false },
    global: { fetch: transport.fetch },
    cookies: {
      getAll: () => Array.from(cookies, ([name, value]) => ({ name, value })),
      setAll: changes => { for (const { name, value } of changes) { if (value) cookies.set(name, value); else cookies.delete(name); } },
    },
  });
  await client.auth.initialize();
  const identities: string[] = [];
  client.auth.onAuthStateChange((event, value) => { if (event === 'SIGNED_IN' && value) identities.push(value.user.id); });
  const signIn = (id: string, signal = new AbortController().signal) => transport.run(signal, () => client.auth.signInWithPassword({ email: `${id}@example.test`, password }));
  return { client, cookies, transport, identities, signIn };
}

function delayedBody(value: unknown) {
  let controller!: ReadableStreamDefaultController<Uint8Array>;
  let cancelled = false;
  const body = new TextEncoder().encode(JSON.stringify(value));
  const reading = deferred<void>();
  const stream = new ReadableStream<Uint8Array>({
    start(next) { controller = next; next.enqueue(body.slice(0, 8)); },
    pull() { reading.resolve(); },
    cancel() { cancelled = true; },
  });
  return {
    response: new Response(stream, { headers: { 'content-type': 'application/json' } }),
    reading: reading.promise,
    get cancelled() { return cancelled; },
    release() { if (!cancelled) { controller.enqueue(body.slice(8)); controller.close(); } },
  };
}

describe('real Supabase SDK account cancellation', () => {
  it('cannot replace B cookies or identity when cancelled A returns its headers later', async () => {
    const held = deferred<Response>();
    const requested = deferred<void>();
    const fetcher: typeof fetch = async (_input, init) => {
      if (JSON.parse(String(init?.body)).email === 'a@example.test') { requested.resolve(); return held.promise; }
      return Response.json(session('b'));
    };
    const context = await fixture(fetcher);
    const first = context.signIn('a');
    await requested.promise;
    expect((await context.signIn('b')).error).toBeNull();
    expect((await first).error).toBeTruthy();
    const saved = Array.from(context.cookies);
    expect(saved.length).toBeGreaterThan(0);
    held.resolve(Response.json(session('a')));
    await new Promise(resolve => setTimeout(resolve, 0));
    expect(Array.from(context.cookies)).toEqual(saved);
    expect((await context.client.auth.getSession()).data.session?.user.id).toBe('b');
    expect(context.identities).toEqual(['b']);
  });

  it('cancels A after headers while reading its body, allowing only B to reach SDK cookie storage', async () => {
    const body = delayedBody(session('a'));
    const context = await fixture(async (_input, init) => JSON.parse(String(init?.body)).email === 'a@example.test' ? body.response : Response.json(session('b')));
    const first = context.signIn('a');
    await body.reading;
    expect((await context.signIn('b')).error).toBeNull();
    expect((await first).error).toBeTruthy();
    expect(body.cancelled).toBe(true);
    body.release();
    expect((await context.client.auth.getSession()).data.session?.user.id).toBe('b');
    expect(context.identities).toEqual(['b']);
  });

  it('leaves no session when an abandoned form cancels a partially decoded response', async () => {
    const body = delayedBody(session('a'));
    const controller = new AbortController();
    const context = await fixture(async () => body.response);
    const result = context.signIn('a', controller.signal);
    await body.reading;
    controller.abort();
    expect((await result).error).toBeTruthy();
    expect(body.cancelled).toBe(true);
    expect(context.cookies.size).toBe(0);
    expect(context.identities).toEqual([]);
  });

  it('cannot restore account A from a cancelled password-update response after B signs in', async () => {
    const body = delayedBody(session('a').user);
    const context = await fixture(async (_input, init) => {
      if (init?.method === 'PUT') return body.response;
      return Response.json(session(JSON.parse(String(init?.body)).email.split('@')[0]));
    });
    await context.signIn('a');
    const update = context.transport.run(new AbortController().signal, () => context.client.auth.updateUser({ password }));
    await body.reading;
    expect((await context.signIn('b')).error).toBeNull();
    expect((await update).error).toBeTruthy();
    expect(body.cancelled).toBe(true);
    expect((await context.client.auth.getSession()).data.session?.user.id).toBe('b');
  });

  it('does not let an SDK method awaiting initialization borrow the next operation’s signal', async () => {
    const ready = deferred<void>();
    const started = deferred<void>();
    const fetcher = vi.fn<typeof fetch>(async () => Response.json(session('b')));
    const context = await fixture(fetcher);
    const first = context.transport.run(new AbortController().signal, async () => {
      started.resolve(); await ready.promise;
      return context.client.auth.signInWithPassword({ email: 'a@example.test', password });
    });
    await started.promise;
    const second = context.signIn('b');
    ready.resolve();
    expect((await first).error).toBeTruthy();
    expect((await second).error).toBeNull();
    expect(fetcher).toHaveBeenCalledTimes(1);
    expect(JSON.parse(String(fetcher.mock.calls[0][1]?.body)).email).toBe('b@example.test');
  });

  it('finishes cancelled sign-out cleanup before a newer sign-in can persist B', async () => {
    const requested = deferred<void>();
    const logout = deferred<Response>();
    const context = await fixture(async (input, init) => {
      if (String(input).includes('/logout')) { requested.resolve(); return logout.promise; }
      return Response.json(session(JSON.parse(String(init?.body)).email.split('@')[0]));
    });
    await context.signIn('a');
    const result = context.transport.run(new AbortController().signal, () => context.client.auth.signOut({ scope: 'local' }));
    await requested.promise;
    expect((await context.signIn('b')).error).toBeNull();
    await result;
    const saved = Array.from(context.cookies);
    logout.resolve(new Response(null, { status: 204 }));
    await new Promise(resolve => setTimeout(resolve, 0));
    expect(Array.from(context.cookies)).toEqual(saved);
    expect((await context.client.auth.getSession()).data.session?.user.id).toBe('b');
  });

  it('finishes an invalid recovery-session check before allowing another account to sign in', async () => {
    const requested = deferred<void>();
    const held = deferred<Response>();
    const calls: string[] = [];
    const context = await fixture(async (input, init) => {
      if (String(input).endsWith('/user')) { requested.resolve(); return held.promise; }
      const id = JSON.parse(String(init?.body)).email.split('@')[0];
      calls.push(id);
      return Response.json(session(id));
    });
    await context.signIn('a');
    const controller = new AbortController();
    const check = context.transport.run(controller.signal, () => context.client.auth.getUser());
    await requested.promise;
    controller.abort();
    const second = context.signIn('b');
    await Promise.resolve();
    expect(calls).toEqual(['a']);
    held.resolve(Response.json({ error_code: 'session_not_found', msg: 'Fixture session expired' }, { status: 401 }));
    expect((await check).error).toBeTruthy();
    expect((await second).error).toBeNull();
    expect((await context.client.auth.getSession()).data.session?.user.id).toBe('b');
  });
});

describe('scoped auth transport boundaries', () => {
  it.each([
    [`${projectUrl}/auth/v1/user`, 'GET'],
    [`${projectUrl}/auth/v1/token?grant_type=refresh_token`, 'POST'],
    ['https://other-fixture.invalid/auth/v1/token?grant_type=password', 'POST'],
  ])('does not cancel independent %s %s requests with a form', async (url, method) => {
    const controller = new AbortController();
    const held = deferred<Response>();
    const started = deferred<void>();
    let actualSignal: AbortSignal | null | undefined;
    const transport = createAuthTransport(projectUrl, async (_input, init) => { actualSignal = init?.signal; started.resolve(); return held.promise; });
    const result = transport.run(controller.signal, () => transport.fetch(url, { method }));
    await started.promise;
    controller.abort();
    expect(actualSignal?.aborted).toBe(false);
    held.resolve(Response.json({ ok: true }));
    expect((await result).status).toBe(200);
  });

  it('rejects cancellation between fetch completion and SDK JSON parsing', async () => {
    const controller = new AbortController();
    const transport = createAuthTransport(projectUrl, async () => Response.json(session('a')));
    const response = await transport.run(controller.signal, () => transport.fetch(tokenUrl, { method: 'POST' }));
    controller.abort();
    await expect(response.json()).rejects.toMatchObject({ name: 'AbortError' });
  });

  it('bounds buffered account responses and never saves an oversized session', async () => {
    const context = await fixture(async () => Response.json({ ...session('a'), padding: 'x'.repeat(256 * 1024) }));
    expect((await context.signIn('a')).error).toBeTruthy();
    expect(context.cookies.size).toBe(0);
  });
});

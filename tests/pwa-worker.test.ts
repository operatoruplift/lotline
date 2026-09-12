import { readFileSync } from 'node:fs';
import { runInNewContext } from 'node:vm';
import { describe, expect, it, vi } from 'vitest';
import manifest from '@/app/manifest';

type WorkerEvent = {
  request?: { url: string; method: string; mode: string };
  data?: { type: string };
  source?: { url: string; postMessage: ReturnType<typeof vi.fn> };
  waitUntil: (promise: Promise<unknown>) => void;
  respondWith: (response: Promise<Response>) => void;
};

function worker() {
  const origin = 'https://lotline.example';
  const listeners = new Map<string, (event: WorkerEvent) => void>();
  const stored = new Map<string, Response>();
  const key = (input: string | { url: string }) => new URL(typeof input === 'string' ? input : input.url, origin).href;
  const cache = {
    put: vi.fn(async (input: string | { url: string }, response: Response) => { stored.set(key(input), response.clone()); }),
    match: vi.fn(async (input: string | { url: string }) => stored.get(key(input))?.clone()),
    keys: vi.fn(async () => [...stored.keys()].map(url => ({ url }))),
    delete: vi.fn(async (input: { url: string }) => stored.delete(key(input))),
  };
  const caches = {
    open: vi.fn(async () => cache),
    match: cache.match,
    keys: vi.fn(async () => ['lotline-public-example-v0', 'lotline-public-example-v1', 'lotline-public-example-v2', 'lotline-public-example-v3', 'unrelated-cache']),
    delete: vi.fn(async () => true),
  };
  const fetch = vi.fn<(input: string | { url: string }, options?: RequestInit) => Promise<Response>>(async (input) => {
    const url = new URL(key(input));
    if (url.pathname === '/offline') return new Response('<html><link href="/favicon.ico" rel="icon"><link href="/icon.svg?v=123" rel="icon"><link href="/apple-icon.png?v=123" rel="apple-touch-icon"><script src="/_next/static/chunks/example.js"></script><link href="/_next/static/css/example.css" rel="stylesheet"><a href="/auth/callback?code=secret">Sign in</a><img src="https://external.example/track"><a href="/api/holdings?owner=secret">Never cache</a></html>', { headers: { 'content-type': 'text/html' } });
    return new Response(`public asset ${url.pathname}`);
  });
  const self = { location: { origin }, addEventListener: (type: string, listener: (event: WorkerEvent) => void) => listeners.set(type, listener), skipWaiting: vi.fn(async () => {}), clients: { claim: vi.fn(async () => {}) } };
  runInNewContext(readFileSync(new URL('../public/sw.js', import.meta.url), 'utf8'), { self, fetch, caches, URL, Response, AbortSignal });
  function dispatch(type: string, fields: Partial<WorkerEvent> = {}) {
    let waiting: Promise<unknown> | undefined;
    let response: Promise<Response> | undefined;
    listeners.get(type)?.({ waitUntil: (promise) => { waiting = promise; }, respondWith: (promise) => { response = promise; }, ...fields });
    return { waiting, response };
  }
  return { dispatch, stored, fetch, caches, self, origin };
}

describe('public offline cache boundary', () => {
  it('prepares only the synthetic document and same-origin immutable assets without cookies', async () => {
    const w = worker();
    await w.dispatch('install').waiting;
    const paths = [...w.stored.keys()].map(url => new URL(url).pathname);
    expect(paths).toContain('/offline');
    expect(paths).toContain('/_next/static/chunks/example.js');
    expect(paths).toContain('/_next/static/css/example.css');
    expect(paths.every(path => path === '/offline' || path === '/favicon.ico' || path === '/icon.svg' || path === '/apple-icon.png' || path.startsWith('/_next/static/') || path.startsWith('/icons/') || path.startsWith('/brand/') || path.startsWith('/logos/'))).toBe(true);
    for (const [, options] of w.fetch.mock.calls) expect(options?.credentials).toBe('omit');
    expect(w.self.skipWaiting).toHaveBeenCalledOnce();
  });

  it('keeps a working Example document if a refresh asset fails', async () => {
    const w = worker();
    await w.dispatch('install').waiting;
    const original = await w.stored.get(`${w.origin}/offline`)?.clone().text();
    w.fetch.mockImplementation(async (input) => new URL(typeof input === 'string' ? input : input.url, w.origin).pathname === '/offline'
      ? new Response('<html>New version<script src="/_next/static/chunks/missing.js"></script></html>', { headers: { 'content-type': 'text/html' } })
      : new Response('missing', { status: 404 }));
    const source = { url: `${w.origin}/app`, postMessage: vi.fn() };
    await w.dispatch('message', { data: { type: 'LOTLINE_PREPARE_OFFLINE' }, source }).waiting;
    expect(await w.stored.get(`${w.origin}/offline`)?.clone().text()).toBe(original);
    expect(source.postMessage).toHaveBeenCalledWith({ type: 'LOTLINE_OFFLINE_READY' });
  });

  it('falls back to an explicitly synthetic Example for public offline navigations', async () => {
    const w = worker();
    await w.dispatch('install').waiting;
    w.fetch.mockRejectedValue(new TypeError('offline'));
    const { response } = w.dispatch('fetch', { request: { url: `${w.origin}/app`, method: 'GET', mode: 'navigate' } });
    expect(await (await response)?.text()).toContain('example.js');
  });

  it('never intercepts APIs, authentication, third parties, mutations, or private document routes', async () => {
    const w = worker();
    const requests = [
      { url: `${w.origin}/api/holdings?owner=private`, method: 'GET', mode: 'cors' },
      { url: `${w.origin}/api/quotes`, method: 'POST', mode: 'cors' },
      { url: `${w.origin}/auth/callback?code=secret`, method: 'GET', mode: 'navigate' },
      { url: `${w.origin}/sign-in`, method: 'GET', mode: 'navigate' },
      { url: `${w.origin}/sign-up`, method: 'GET', mode: 'navigate' },
      { url: `${w.origin}/account`, method: 'GET', mode: 'navigate' },
      { url: `${w.origin}/app?_rsc=private`, method: 'GET', mode: 'cors' },
      { url: 'https://api.jup.ag/ultra/v1/order', method: 'GET', mode: 'cors' },
    ];
    for (const request of requests) expect(w.dispatch('fetch', { request }).response).toBeUndefined();
    expect(w.fetch).not.toHaveBeenCalled();
    expect(w.stored.size).toBe(0);
  });

  it('does not store an online live page and only removes its own outdated caches', async () => {
    const w = worker();
    await w.dispatch('activate').waiting;
    expect(w.caches.delete).toHaveBeenCalledTimes(3);
    expect(w.caches.delete).toHaveBeenCalledWith('lotline-public-example-v0');
    expect(w.caches.delete).toHaveBeenCalledWith('lotline-public-example-v1');
    expect(w.caches.delete).toHaveBeenCalledWith('lotline-public-example-v2');
    expect(w.caches.delete).not.toHaveBeenCalledWith('lotline-public-example-v3');
    expect(w.caches.delete).not.toHaveBeenCalledWith('unrelated-cache');
    const { response } = w.dispatch('fetch', { request: { url: `${w.origin}/app`, method: 'GET', mode: 'navigate' } });
    expect((await response)?.ok).toBe(true);
    expect(w.stored.size).toBe(0);
  });
});

it('provides installable manifest dimensions and a maskable icon with a stable app identity', () => {
  const value = manifest();
  expect(value.id).toBe('/');
  expect(value.scope).toBe('/');
  expect(value.display).toBe('standalone');
  expect(value.start_url).toBe('/app');
  expect(value.icons?.some(icon => icon.purpose === 'maskable')).toBe(true);
  for (const icon of value.icons ?? []) {
    const pathname = new URL(icon.src, 'https://lotline.example').pathname;
    const png = readFileSync(new URL(`../public${pathname}`, import.meta.url));
    expect(png.subarray(1, 4).toString()).toBe('PNG');
    const expected = Number(icon.sizes?.split('x')[0]);
    expect(png.readUInt32BE(16)).toBe(expected);
    expect(png.readUInt32BE(20)).toBe(expected);
  }
});

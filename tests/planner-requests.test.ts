import { afterEach, expect, it, vi } from 'vitest';
import { requestHoldings, requestQuotes, requestUnits } from '../lib/client/planner-requests';
import { XSTOCK_MINTS } from '../lib/domain/assets';
import { USDC_MINT } from '../lib/demo/example';

const items = XSTOCK_MINTS.slice(0, 10).map(mint => ({ mint, usdcRaw: '1000001' }));
const fetchedAt = '2026-09-12T10:00:00.000Z';
const quote = (item: typeof items[number]) => ({ ...item, state: 'success', outRaw: '100', units: '0.000001', fetchedAt, expiresAt: '2026-09-12T10:00:30.000Z' });
afterEach(() => vi.unstubAllGlobals());

it('loads ten quotes in sequential groups of three, preserving partial success and quote age', async () => {
  let active = 0;
  let maximum = 0;
  const requests: number[] = [];
  const fetchMock = vi.fn(async (_url, options) => {
    active += 1; maximum = Math.max(maximum, active);
    const batch = JSON.parse(options.body).items as typeof items;
    requests.push(batch.length);
    await Promise.resolve(); active -= 1;
    return requests.length === 2 ? Response.json({ state: 'unavailable', quotes: [], message: 'Provider busy' }, { status: 503 }) : Response.json({ state: 'success', quotes: batch.map(quote) });
  });
  vi.stubGlobal('fetch', fetchMock);
  const progress = vi.fn();
  const result = await requestQuotes(items, new AbortController().signal, progress);
  expect(requests).toEqual([3, 3, 3, 1]);
  expect(maximum).toBe(1);
  expect(progress.mock.calls.map(call => call[1])).toEqual([3, 6, 9, 10]);
  expect(result.state).toBe('partial');
  expect(result.quotes).toHaveLength(10);
  expect(result.quotes[0]).toMatchObject({ fetchedAt, expiresAt: '2026-09-12T10:00:30.000Z' });
  expect(result.quotes.slice(3, 6).every(item => item.state === 'unavailable' && item.units === null && item.message === 'Provider busy')).toBe(true);
});

it('stops subsequent quote batches immediately when a plan edit aborts the request', async () => {
  const controller = new AbortController();
  const fetchMock = vi.fn(async (_url, options) => Response.json({ state: 'success', quotes: JSON.parse(options.body).items.map(quote) }));
  vi.stubGlobal('fetch', fetchMock);
  await expect(requestQuotes(items, controller.signal, () => controller.abort())).rejects.toMatchObject({ name: 'AbortError' });
  expect(fetchMock).toHaveBeenCalledTimes(1);
});

it('does not present an empty successful response as successful estimates', async () => {
  vi.stubGlobal('fetch', vi.fn(async () => Response.json({ state: 'success', quotes: [] })));
  const result = await requestQuotes(items.slice(0, 3), new AbortController().signal, () => {});
  expect(result.state).toBe('unavailable');
  expect(result.quotes).toHaveLength(3);
  expect(result.quotes.every(item => item.units === null)).toBe(true);
});

it('combines holdings batches without losing a verified zero USDC balance to a later failure', async () => {
  let count = 0;
  vi.stubGlobal('fetch', vi.fn(async (url: string) => {
    const mints = new URL(url, 'https://lotline.example').searchParams.get('mints')!.split(',');
    expect(mints.length).toBeLessThanOrEqual(3);
    count += 1;
    if (count === 2) return Response.json({ message: 'Balances unavailable' }, { status: 503 });
    return Response.json({ state: 'success', holdings: mints.map(mint => ({ mint, state: 'success', raw: '0', units: '0' })), usdc: { mint: USDC_MINT, state: 'success', raw: '0', units: '0' }, fetchedAt });
  }));
  const result = await requestHoldings('public-owner', items.map(item => item.mint), new AbortController().signal);
  expect(count).toBe(4);
  expect(result.holdings).toHaveLength(10);
  expect(result.state).toBe('partial');
  expect(result.usdc).toMatchObject({ state: 'success', raw: '0', units: '0' });
  expect(result.fetchedAt).toBe(fetchedAt);
});

it('projects all raw amounts in bounded requests and marks missing units explicitly', async () => {
  const sizes: number[] = [];
  vi.stubGlobal('fetch', vi.fn(async (_url, options) => {
    const batch = JSON.parse(options.body).items as { mint: string; raw: string }[];
    sizes.push(batch.length);
    expect(batch.every(item => item.raw === '9007199254740993')).toBe(true);
    return Response.json({ state: 'success', items: sizes.length === 2 ? [] : batch.map(({ mint }) => ({ mint, units: '1' })) });
  }));
  const result = await requestUnits(items.map(({ mint }) => ({ mint, raw: '9007199254740993' })), new AbortController().signal);
  expect(sizes).toEqual([3, 3, 3, 1]);
  expect(result.state).toBe('partial');
  expect(result.items).toHaveLength(10);
  expect(result.items.slice(3, 6).every(item => item.units === null)).toBe(true);
});

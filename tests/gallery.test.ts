import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { galleryPlanSchema, galleryPlanToBasket, leadingWeights, type GalleryPlan } from '../lib/domain/gallery';

const mocks = vi.hoisted(() => ({ server: vi.fn(), rpc: vi.fn(), getUser: vi.fn() }));
vi.mock('../lib/supabase/server', () => ({ serverSupabase: mocks.server }));

const AAPLX = 'XsbEhLAtcf6HdfpFZ5xEMdqW8nfAvcsP5bdudRLJzJp';
const MSFTX = 'XspzcW1PRtgf6Wj92HCiZdjzKCyFekVD8P5Ueh3dRMX';
const NVDAX = 'Xsc9qvGR1efVDFGLrVsmkzv3qi45LTBjeUKSPmx9qEh';
const ID = '6a1f8c4e-2b7d-4c1e-9f0a-3d5b7e9c1a2b';
const PLAN_ID = '0d9c8b7a-6f5e-4d3c-8b1a-0f9e8d7c6b5a';
const plan = (over: Partial<GalleryPlan> = {}): GalleryPlan => ({
  id: ID, name: 'Big tech core', display_name: 'Alice', copy_count: 3, published_at: '2026-09-28T12:00:00.000Z',
  allocations: [{ mint: AAPLX, bps: '2550' }, { mint: MSFTX, bps: '5000' }, { mint: NVDAX, bps: '2450' }], ...over,
});
const same = (path: string, init: RequestInit = {}) => new Request(`https://lotline.dev${path}`, { ...init, headers: { origin: 'https://lotline.dev', 'content-type': 'application/json', ...(init.headers ?? {}) } });

describe('community plan shape', () => {
  it('accepts only catalog mints in a complete, unique split and nothing else', () => {
    expect(galleryPlanSchema.parse(plan())).toEqual(plan());
    for (const bad of [
      plan({ allocations: [{ mint: 'So11111111111111111111111111111111111111112', bps: '10000' }] }),
      plan({ allocations: [{ mint: AAPLX, bps: '5000' }, { mint: MSFTX, bps: '4000' }] }),
      plan({ allocations: [{ mint: AAPLX, bps: '5000' }, { mint: AAPLX, bps: '5000' }] }),
      { ...plan(), budget_raw: '250000000' },
      { ...plan(), user_id: '00000000-0000-4000-8000-00000000000a' },
      plan({ display_name: 'x' }),
    ]) expect(galleryPlanSchema.safeParse(bad).success).toBe(false);
  });
  it('opens with the reader’s budget and shows the largest weights first', () => {
    expect(galleryPlanToBasket(plan(), '75.5')).toEqual({ version: 1, budget: '75.5', items: [{ mint: AAPLX, percent: '25.5' }, { mint: MSFTX, percent: '50' }, { mint: NVDAX, percent: '24.5' }] });
    expect(galleryPlanToBasket(plan()).budget).toBe('1000');
    expect(leadingWeights(plan(), 2)).toEqual({ shown: [{ mint: MSFTX, bps: 5000 }, { mint: AAPLX, bps: 2550 }], more: 1 });
    expect(leadingWeights(plan()).more).toBe(0);
  });
});

describe('community plan routes', () => {
  beforeEach(() => {
    vi.stubEnv('LOTLINE_GALLERY_ENABLED', 'true');
    mocks.server.mockResolvedValue({ rpc: mocks.rpc, auth: { getUser: mocks.getUser } });
    mocks.getUser.mockResolvedValue({ data: { user: { id: 'member' } }, error: null });
  });
  afterEach(() => { vi.unstubAllEnvs(); vi.clearAllMocks(); });

  it('stay dark without the operator flag', async () => {
    vi.stubEnv('LOTLINE_GALLERY_ENABLED', 'false');
    const list = await import('../app/api/gallery/route');
    const copy = await import('../app/api/gallery/copy/route');
    const publish = await import('../app/api/gallery/publish/route');
    expect((await list.GET(new Request('https://lotline.dev/api/gallery'))).status).toBe(404);
    expect((await copy.POST(same('/api/gallery/copy', { method: 'POST', body: JSON.stringify({ id: ID }) }))).status).toBe(404);
    expect((await publish.POST(same('/api/gallery/publish', { method: 'POST', body: JSON.stringify({ planId: PLAN_ID }) }))).status).toBe(404);
    expect(mocks.rpc).not.toHaveBeenCalled();
  });

  it('lists validated plans a page at a time, dropping rows that fail the shape', async () => {
    const { GET } = await import('../app/api/gallery/route');
    mocks.rpc.mockResolvedValueOnce({ data: [plan(), { ...plan({ id: PLAN_ID }), allocations: [{ mint: AAPLX, bps: '1' }] }], error: null });
    const response = await GET(new Request('https://lotline.dev/api/gallery?sort=recent&page=2'));
    expect(response.status).toBe(200);
    expect(response.headers.get('cache-control')).toContain('s-maxage=60');
    expect(await response.json()).toEqual({ state: 'success', sort: 'recent', page: 2, hasMore: false, plans: [plan()] });
    expect(mocks.rpc).toHaveBeenCalledWith('lotline_plan_gallery', { p_sort: 'recent', p_limit: 25, p_offset: 24 });
    for (const query of ['sort=returns', 'page=0', 'page=41', 'page=1.5', 'owner=alice']) expect((await GET(new Request(`https://lotline.dev/api/gallery?${query}`))).status).toBe(400);
    mocks.rpc.mockResolvedValueOnce({ data: null, error: { code: 'XX000' } });
    expect((await GET(new Request('https://lotline.dev/api/gallery'))).status).toBe(503);
  });

  it('serves one shared plan or says it is gone', async () => {
    const { GET } = await import('../app/api/gallery/[id]/route');
    mocks.rpc.mockResolvedValueOnce({ data: plan(), error: null });
    expect(await (await GET(new Request('https://lotline.dev'), { params: Promise.resolve({ id: ID }) })).json()).toEqual({ state: 'success', plan: plan() });
    mocks.rpc.mockResolvedValueOnce({ data: null, error: null });
    expect((await GET(new Request('https://lotline.dev'), { params: Promise.resolve({ id: ID }) })).status).toBe(404);
    expect((await GET(new Request('https://lotline.dev'), { params: Promise.resolve({ id: 'not-a-uuid' }) })).status).toBe(400);
  });

  it('counts copies for signed-in members only and refuses other origins', async () => {
    const { POST } = await import('../app/api/gallery/copy/route');
    mocks.rpc.mockResolvedValueOnce({ data: 4, error: null });
    expect(await (await POST(same('/api/gallery/copy', { method: 'POST', body: JSON.stringify({ id: ID }) }))).json()).toEqual({ state: 'success', counted: true, copies: 4 });
    expect(mocks.rpc).toHaveBeenCalledWith('lotline_record_plan_copy', { p_id: ID });
    mocks.getUser.mockResolvedValueOnce({ data: { user: null }, error: null });
    expect(await (await POST(same('/api/gallery/copy', { method: 'POST', body: JSON.stringify({ id: ID }) }))).json()).toEqual({ state: 'success', counted: false });
    mocks.rpc.mockResolvedValueOnce({ data: null, error: { code: 'P0002' } });
    expect((await POST(same('/api/gallery/copy', { method: 'POST', body: JSON.stringify({ id: ID }) }))).status).toBe(404);
    expect((await POST(new Request('https://lotline.dev/api/gallery/copy', { method: 'POST', headers: { origin: 'https://evil.example', 'content-type': 'application/json' }, body: JSON.stringify({ id: ID }) }))).status).toBe(403);
    expect((await POST(same('/api/gallery/copy', { method: 'POST', body: JSON.stringify({ id: ID, count: 99 }) }))).status).toBe(400);
  });

  it('shares and unshares only for the signed-in owner, with a clean display name', async () => {
    const { POST, DELETE } = await import('../app/api/gallery/publish/route');
    const post = (body: unknown) => POST(same('/api/gallery/publish', { method: 'POST', body: JSON.stringify(body) }));
    mocks.rpc.mockResolvedValueOnce({ data: ID, error: null });
    const created = await post({ planId: PLAN_ID, displayName: '  Alice P.  ' });
    expect(created.status).toBe(201);
    expect(mocks.rpc).toHaveBeenCalledWith('lotline_publish_plan', { p_plan_id: PLAN_ID, p_display_name: 'Alice P.' });
    mocks.rpc.mockResolvedValueOnce({ data: ID, error: null });
    await post({ planId: PLAN_ID });
    expect(mocks.rpc).toHaveBeenLastCalledWith('lotline_publish_plan', { p_plan_id: PLAN_ID, p_display_name: null });
    for (const displayName of ['x', 'visit https://spam.test', '<b>', 'a'.repeat(33)]) expect((await post({ planId: PLAN_ID, displayName })).status).toBe(400);
    expect((await post({ planId: 'nope' })).status).toBe(400);
    for (const [code, status] of [['P0001', 409], ['P0002', 404], ['23514', 400], ['XX000', 503]] as const) {
      mocks.rpc.mockResolvedValueOnce({ data: null, error: { code } });
      expect((await post({ planId: PLAN_ID })).status).toBe(status);
    }
    mocks.getUser.mockResolvedValueOnce({ data: { user: null }, error: { status: 401 } });
    expect((await post({ planId: PLAN_ID })).status).toBe(401);
    mocks.rpc.mockResolvedValueOnce({ data: false, error: null });
    expect((await DELETE(same(`/api/gallery/publish?planId=${PLAN_ID}`, { method: 'DELETE' }))).status).toBe(404);
    mocks.rpc.mockResolvedValueOnce({ data: true, error: null });
    expect((await DELETE(same(`/api/gallery/publish?planId=${PLAN_ID}`, { method: 'DELETE' }))).status).toBe(200);
    expect(mocks.rpc).toHaveBeenLastCalledWith('lotline_unpublish_plan', { p_plan_id: PLAN_ID });
  });

  it('points a shared plan at another saved split only for its author, from this site', async () => {
    const { PATCH } = await import('../app/api/gallery/publish/route');
    const patch = (body: unknown, init: RequestInit = {}) => PATCH(same('/api/gallery/publish', { method: 'PATCH', body: JSON.stringify(body), ...init }));
    mocks.rpc.mockResolvedValueOnce({ data: ID, error: null });
    const updated = await patch({ publishedId: ID, planId: PLAN_ID });
    expect(updated.status).toBe(200);
    expect(await updated.json()).toEqual({ state: 'success', id: ID });
    expect(mocks.rpc).toHaveBeenCalledWith('lotline_update_published_plan', { p_published_id: ID, p_plan_id: PLAN_ID });
    for (const body of [{ publishedId: ID }, { publishedId: 'nope', planId: PLAN_ID }, { publishedId: ID, planId: PLAN_ID, extra: true }]) expect((await patch(body)).status).toBe(400);
    for (const [code, status] of [['P0002', 404], ['P0001', 409], ['XX000', 503]] as const) {
      mocks.rpc.mockResolvedValueOnce({ data: null, error: { code } });
      expect((await patch({ publishedId: ID, planId: PLAN_ID })).status).toBe(status);
    }
    mocks.getUser.mockResolvedValueOnce({ data: { user: null }, error: { status: 401 } });
    expect((await patch({ publishedId: ID, planId: PLAN_ID })).status).toBe(401);
    const foreign = await PATCH(new Request('https://lotline.dev/api/gallery/publish', { method: 'PATCH', headers: { origin: 'https://attacker.test', 'content-type': 'application/json' }, body: JSON.stringify({ publishedId: ID, planId: PLAN_ID }) }));
    expect(foreign.status).toBe(403);
    vi.stubEnv('LOTLINE_GALLERY_ENABLED', 'false');
    expect((await patch({ publishedId: ID, planId: PLAN_ID })).status).toBe(404);
    expect(mocks.rpc).toHaveBeenCalledTimes(4);
  });

  it('accepts when a split was last updated, and nothing else new', () => {
    expect(galleryPlanSchema.parse(plan({ split_updated_at: '2026-09-30T10:00:00.000Z' })).split_updated_at).toBe('2026-09-30T10:00:00.000Z');
    expect(galleryPlanSchema.parse(plan({ split_updated_at: null })).split_updated_at).toBeNull();
    expect(galleryPlanSchema.safeParse(plan({ split_updated_at: 'yesterday' })).success).toBe(false);
  });

  it('lists the member’s own shares and nothing for a guest', async () => {
    const { GET } = await import('../app/api/gallery/mine/route');
    mocks.rpc.mockResolvedValueOnce({ data: [{ id: ID, plan_id: PLAN_ID, display_name: null, copy_count: 2, published_at: '2026-09-28T12:00:00.000Z' }], error: null });
    expect(await (await GET()).json()).toEqual({ state: 'success', shared: [{ id: ID, plan_id: PLAN_ID, display_name: null, copy_count: 2, published_at: '2026-09-28T12:00:00.000Z' }] });
    mocks.getUser.mockResolvedValueOnce({ data: { user: null }, error: null });
    expect((await GET()).status).toBe(401);
  });
});

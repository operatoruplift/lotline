import 'server-only';
import { GALLERY_PAGE_SIZE, galleryPlanSchema, type GalleryPlan, type GalleryResponse, type GallerySort } from '../domain/gallery';
import { serverSupabase } from '../supabase/server';

/** The gallery needs its migration applied first, so it has its own operator switch. */
export function galleryEnabled(): boolean {
  return process.env.LOTLINE_GALLERY_ENABLED?.trim() === 'true';
}

type Client = NonNullable<Awaited<ReturnType<typeof serverSupabase>>>;
const unavailable = (message = 'Community plans are temporarily unavailable. Your own plan is unaffected.'): GalleryResponse => ({ state: 'unavailable', message });

export async function readGallery(sort: GallerySort, page: number, client?: Client | null): Promise<GalleryResponse> {
  const supabase = client === undefined ? await serverSupabase() : client;
  if (!supabase) return { state: 'configuration-required', message: 'Community plans need accounts, which this deployment has not configured.' };
  // One extra row says whether another page exists without counting the table.
  const { data, error } = await supabase.rpc('lotline_plan_gallery', { p_sort: sort, p_limit: GALLERY_PAGE_SIZE + 1, p_offset: (page - 1) * GALLERY_PAGE_SIZE });
  if (error || !Array.isArray(data)) return unavailable();
  const plans: GalleryPlan[] = [];
  for (const row of data) { const parsed = galleryPlanSchema.safeParse(row); if (parsed.success) plans.push(parsed.data); }
  return { state: 'success', sort, page, plans: plans.slice(0, GALLERY_PAGE_SIZE), hasMore: data.length > GALLERY_PAGE_SIZE };
}

export async function readPublishedPlan(id: string, client?: Client | null): Promise<GalleryPlan | null | 'unavailable'> {
  const supabase = client === undefined ? await serverSupabase() : client;
  if (!supabase) return 'unavailable';
  const { data, error } = await supabase.rpc('lotline_published_plan', { p_id: id });
  if (error) return 'unavailable';
  if (data === null) return null;
  const parsed = galleryPlanSchema.safeParse(data);
  return parsed.success ? parsed.data : 'unavailable';
}

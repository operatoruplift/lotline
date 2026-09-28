import { GALLERY_SORTS, type GallerySort } from '@/lib/domain/gallery';
import { galleryEnabled, readGallery } from '@/lib/server/gallery';
import { noStore } from '@/lib/server/requests';

export const dynamic = 'force-dynamic';

export async function GET(request: Request) {
  if (!galleryEnabled()) return Response.json({ state: 'unavailable', message: 'Community plans are not enabled on this deployment.' }, { status: 404, headers: noStore });
  const params = new URL(request.url).searchParams;
  const sort = (params.get('sort') ?? 'copies') as GallerySort;
  const page = Number(params.get('page') ?? '1');
  if ([...params.keys()].some(key => key !== 'sort' && key !== 'page') || !GALLERY_SORTS.includes(sort) || !Number.isInteger(page) || page < 1 || page > 40) {
    return Response.json({ state: 'invalid-input', message: 'Choose copies or recent, and a page from 1 to 40.' }, { status: 400, headers: noStore });
  }
  try {
    const result = await readGallery(sort, page);
    return Response.json(result, { status: result.state === 'success' ? 200 : 503, headers: result.state === 'success' ? { 'Cache-Control': 'public, max-age=30, s-maxage=60, stale-while-revalidate=300', 'X-Content-Type-Options': 'nosniff' } : noStore });
  } catch { return Response.json({ state: 'unavailable', message: 'Community plans are temporarily unavailable.' }, { status: 503, headers: noStore }); }
}

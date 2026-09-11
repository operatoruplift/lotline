import { NextResponse } from 'next/server';
import { serverSupabase } from '@/lib/supabase/server';
import { requestOrigin, safeAuthNext } from '@/lib/supabase/plans';

export const dynamic = 'force-dynamic';
export async function GET(request: Request) {
  const url = new URL(request.url);
  const origin = requestOrigin(request);
  if (!origin) return new Response('Invalid callback origin.', { status: 400, headers: { 'Cache-Control': 'no-store' } });
  const code = url.searchParams.get('code');
  try {
    const supabase = await serverSupabase();
    if (supabase && code && code.length <= 2048) {
      const { error } = await supabase.auth.exchangeCodeForSession(code);
      if (!error) return NextResponse.redirect(new URL(safeAuthNext(url.searchParams.get('next')), origin), { headers: { 'Cache-Control': 'no-store' } });
    }
  } catch { /* A failed or expired link returns to an actionable retry screen. */ }
  return NextResponse.redirect(new URL('/sign-in?error=confirmation', origin), { headers: { 'Cache-Control': 'no-store' } });
}

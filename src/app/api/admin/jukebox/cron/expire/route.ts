import { NextRequest, NextResponse } from 'next/server';
import { getServiceClient } from '@/lib/supabase';
import { getJukeboxVenueId } from '@/lib/jukebox/venue';
import { requireCronSecret } from '@/lib/jukebox/auth';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

/** Expires stale `pending` rows past `pending_request_ttl_minutes`.
 *  Hit by Vercel Cron with header `x-cron-secret: $JUKEBOX_CRON_SECRET`.
 *  Safe to call repeatedly. */
export async function POST(req: NextRequest) {
  const denied = requireCronSecret(req);
  if (denied) return denied;

  const venueId = await getJukeboxVenueId();
  const sb = getServiceClient();

  const { data: settings } = await sb
    .from('jukebox_settings')
    .select('pending_request_ttl_minutes')
    .eq('venue_id', venueId)
    .single();
  const ttl = settings?.pending_request_ttl_minutes ?? 240;
  const cutoff = new Date(Date.now() - ttl * 60_000).toISOString();

  const { data, error } = await sb
    .from('jukebox_requests')
    .update({ status: 'expired' })
    .eq('venue_id', venueId)
    .eq('status', 'pending')
    .lt('created_at', cutoff)
    .select('id');

  if (error) {
    return NextResponse.json({ ok: false, error: { code: 'server_error', message: error.message } }, { status: 500 });
  }
  return NextResponse.json({ ok: true, data: { expired: (data || []).length, cutoff, ttl_minutes: ttl } });
}

// GET allowed for manual smoke-tests with the same auth.
export async function GET(req: NextRequest) {
  return POST(req);
}

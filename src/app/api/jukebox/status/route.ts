import { NextRequest, NextResponse } from 'next/server';
import { getServiceClient } from '@/lib/supabase';
import { getJukeboxVenueId } from '@/lib/jukebox/venue';
import { rateLimit, sweepRateLimit } from '@/lib/jukebox/rateLimit';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

export async function GET(req: NextRequest) {
  sweepRateLimit();
  const url = new URL(req.url);
  const deviceId = (url.searchParams.get('device_id') || '').trim();
  if (!deviceId || !/^[A-Za-z0-9_-]{8,64}$/.test(deviceId)) {
    return NextResponse.json(
      { ok: false, error: { code: 'invalid_input', message: 'device_id required.' } },
      { status: 400 },
    );
  }

  const rl = rateLimit(`status:dev:${deviceId}`, 30, 60);
  if (rl.ok === false) {
    return NextResponse.json(
      { ok: false, error: { code: 'rate_limited', message: 'Slow down.', retryAfterSec: rl.retryAfterSec } },
      { status: 429, headers: { 'retry-after': String(rl.retryAfterSec) } },
    );
  }

  const venueId = await getJukeboxVenueId();
  const sb = getServiceClient();

  const { data } = await sb
    .from('jukebox_requests')
    .select('id, status, track_name, artist_name, album_art_url, created_at, approved_at, played_at, rejection_reason')
    .eq('venue_id', venueId)
    .eq('device_id', deviceId)
    .order('created_at', { ascending: false })
    .limit(10);

  return NextResponse.json({ ok: true, data: { requests: data || [] } });
}

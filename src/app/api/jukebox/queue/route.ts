import { NextRequest, NextResponse } from 'next/server';
import { getServiceClient } from '@/lib/supabase';
import { getJukeboxVenueId } from '@/lib/jukebox/venue';
import { getRequestIp, hashIp } from '@/lib/jukebox/crypto';
import { rateLimit, sweepRateLimit } from '@/lib/jukebox/rateLimit';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

const NOW_PLAYING_WINDOW_MS = 8 * 60_000;

export async function GET(req: NextRequest) {
  sweepRateLimit();
  const ipHash = hashIp(getRequestIp(req)) || 'no-ip';
  const rl = rateLimit(`queue:ip:${ipHash}`, 60, 60);
  if (rl.ok === false) {
    return NextResponse.json(
      { ok: false, error: { code: 'rate_limited', message: 'Slow down.', retryAfterSec: rl.retryAfterSec } },
      { status: 429, headers: { 'retry-after': String(rl.retryAfterSec) } },
    );
  }

  const venueId = await getJukeboxVenueId();
  const sb = getServiceClient();

  const [queueRes, nowRes] = await Promise.all([
    sb
      .from('jukebox_public_queue')
      .select('*')
      .eq('venue_id', venueId)
      .order('approved_at', { ascending: true, nullsFirst: false }),
    sb
      .from('jukebox_requests')
      .select('id, track_name, artist_name, album_art_url, played_at')
      .eq('venue_id', venueId)
      .eq('status', 'played')
      .gte('played_at', new Date(Date.now() - NOW_PLAYING_WINDOW_MS).toISOString())
      .order('played_at', { ascending: false })
      .limit(1)
      .maybeSingle(),
  ]);

  const rows = (queueRes.data || []).map((r, i) => ({ ...r, position: i + 1 }));
  return NextResponse.json({
    ok: true,
    data: {
      queue: rows,
      now_playing: nowRes.data ?? null,
    },
  });
}

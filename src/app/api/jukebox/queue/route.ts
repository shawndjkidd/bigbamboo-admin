import { NextRequest, NextResponse } from 'next/server';
import { getServiceClient } from '@/lib/supabase';
import { getJukeboxVenueId } from '@/lib/jukebox/venue';
import { getRequestIp, hashIp } from '@/lib/jukebox/crypto';
import { rateLimit, sweepRateLimit } from '@/lib/jukebox/rateLimit';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

export async function GET(req: NextRequest) {
  sweepRateLimit();
  const ipHash = hashIp(getRequestIp(req)) || 'no-ip';
  const rl = rateLimit(`queue:ip:${ipHash}`, 60, 60);
  if (!rl.ok) {
    return NextResponse.json(
      { ok: false, error: { code: 'rate_limited', message: 'Slow down.', retryAfterSec: rl.retryAfterSec } },
      { status: 429, headers: { 'retry-after': String(rl.retryAfterSec) } },
    );
  }

  const venueId = await getJukeboxVenueId();
  const sb = getServiceClient();
  const { data } = await sb
    .from('jukebox_public_queue')
    .select('*')
    .eq('venue_id', venueId)
    .order('approved_at', { ascending: true, nullsFirst: false });

  // Synthesize 1-based positions.
  const rows = (data || []).map((r, i) => ({ ...r, position: i + 1 }));

  // Now Playing: most recently marked-played track within an 8-minute window.
  // Until Phase 2 wires real Spotify Connect playback, this is the staff's
  // "Mark played" stamp — close enough for the kiosk to look alive.
  const since = new Date(Date.now() - 8 * 60 * 1000).toISOString();
  const { data: nowRow } = await sb
    .from('jukebox_requests')
    .select(
      'id, track_name, artist_name, album_art_url, duration_ms, requested_by, requested_by_hidden, played_at',
    )
    .eq('venue_id', venueId)
    .eq('status', 'played')
    .gte('played_at', since)
    .order('played_at', { ascending: false })
    .limit(1)
    .maybeSingle();

  // If nothing was recently marked played, fall back to the head of the queue.
  // The display shows it in the same hero "On Air / Up Next" card so the
  // kiosk always has something visually anchored at the top.
  let now_playing: {
    id: string;
    track_name: string;
    artist_name: string;
    album_art_url: string | null;
    duration_ms: number;
    requested_by: string;
    played_at: string | null;
    is_fallback: boolean;
  } | null = null;

  if (nowRow) {
    now_playing = {
      id: nowRow.id,
      track_name: nowRow.track_name,
      artist_name: nowRow.artist_name,
      album_art_url: nowRow.album_art_url,
      duration_ms: nowRow.duration_ms,
      requested_by: nowRow.requested_by_hidden ? 'anonymous' : nowRow.requested_by,
      played_at: nowRow.played_at,
      is_fallback: false,
    };
  } else if (rows.length > 0) {
    // jukebox_public_queue view already collapses requested_by_hidden into
    // the requested_by string ('anonymous jungle friend'), so we use it as-is.
    const head = rows[0] as {
      id: string;
      track_name: string;
      artist_name: string;
      album_art_url: string | null;
      duration_ms: number;
      requested_by: string;
    };
    now_playing = {
      id: head.id,
      track_name: head.track_name,
      artist_name: head.artist_name,
      album_art_url: head.album_art_url,
      duration_ms: head.duration_ms,
      requested_by: head.requested_by,
      played_at: null,
      is_fallback: true,
    };
  }

  return NextResponse.json({ ok: true, data: { queue: rows, now_playing } });
}

// ═══════════════════════════════════════════════════════════════
//  Cron — poll Spotify, auto-mark-as-played, expire stuck queued.
//  Runs every minute via Vercel Cron (vercel.json).
//
//  Logic:
//  1. If Spotify says track X is currently playing, find the oldest
//     `queued` request for the same provider_track_id and mark it
//     `played`. (Idempotent — if already played, no-op.)
//  2. Sweep: any `queued` row whose queued_at + duration + 60s grace
//     has passed and was never marked played gets `expired`.
//
//  Edge case: same track requested twice in a session. The "oldest
//  queued match" rule takes the older one. Good enough.
// ═══════════════════════════════════════════════════════════════

import { NextRequest, NextResponse } from 'next/server';
import { requireCronSecret } from '@/lib/jukebox/auth';
import { getProvider } from '@/lib/jukebox/providers';
import { getServiceClient } from '@/lib/supabase';
import { getSpotifyAuthStatus } from '@/lib/jukebox/spotifyAuth';
import { getJukeboxVenueId } from '@/lib/jukebox/venue';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

export async function POST(req: NextRequest) {
  const denied = requireCronSecret(req);
  if (denied) return denied;

  const venueId = await getJukeboxVenueId();
  const sb = getServiceClient();

  const status = await getSpotifyAuthStatus(venueId);
  if (!status.isConnected) {
    return NextResponse.json({
      ok: true,
      data: { skipped: 'not_connected', marked_played: 0, expired: 0 },
    });
  }

  // 1. Match currently-playing → oldest queued row.
  let markedPlayed = 0;
  let nowPlayingTrackId: string | null = null;
  let nowPlayingError: string | null = null;

  const provider = getProvider('spotify', venueId);
  const np = await provider.getNowPlaying();
  if ('error' in np) {
    nowPlayingError = np.error.kind;
  } else if (np.value) {
    nowPlayingTrackId = np.value.track.id;
  }

  if (nowPlayingTrackId) {
    const { data: candidates } = await sb
      .from('jukebox_requests')
      .select('id, queued_at')
      .eq('venue_id', venueId)
      .eq('status', 'queued')
      .eq('provider_track_id', nowPlayingTrackId)
      .order('queued_at', { ascending: true, nullsFirst: false })
      .limit(1);
    const target = candidates && candidates[0];
    if (target) {
      const { error } = await sb
        .from('jukebox_requests')
        .update({
          status: 'played',
          played_at: new Date().toISOString(),
        })
        .eq('id', target.id);
      if (!error) markedPlayed = 1;
    }
  }

  // 2. Sweep: any queued row whose queued_at + duration_ms + 60s grace has
  //    passed and that wasn't matched above gets expired. Otherwise it sits
  //    forever after Spotify drops it from the live queue.
  const { data: stuck } = await sb
    .from('jukebox_requests')
    .select('id, queued_at, duration_ms')
    .eq('venue_id', venueId)
    .eq('status', 'queued');
  let expired = 0;
  const now = Date.now();
  for (const row of stuck || []) {
    if (!row.queued_at) continue;
    const queuedAt = new Date(row.queued_at).getTime();
    const cutoff = queuedAt + (row.duration_ms || 0) + 60_000;
    if (now > cutoff) {
      const { error } = await sb
        .from('jukebox_requests')
        .update({ status: 'expired' })
        .eq('id', row.id);
      if (!error) expired += 1;
    }
  }

  return NextResponse.json({
    ok: true,
    data: {
      marked_played: markedPlayed,
      expired,
      now_playing_track_id: nowPlayingTrackId,
      now_playing_error: nowPlayingError,
    },
  });
}

// GET allowed for manual smoke tests.
export async function GET(req: NextRequest) {
  return POST(req);
}

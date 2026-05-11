// ═══════════════════════════════════════════════════════════════
//  Public now-playing — drives the kiosk's "On Air" hero card.
//  Server-side cached with 10s TTL so a busy room can hit this
//  endpoint freely without hammering Spotify.
//  No device info, no internal flags — guest-safe projection only.
//
//  Side effect on CACHE-MISS: when Spotify reports a track playing,
//  we mark the matching `queued` jukebox_request as `played`. This
//  replaces the auto-mark cron (Hobby plan can't run minute-level
//  crons). The kiosk polls every ~8s, so this fires roughly every
//  10s and is idempotent (already-played rows are no-ops).
// ═══════════════════════════════════════════════════════════════

import { NextRequest, NextResponse } from 'next/server';
import { getRequestIp, hashIp } from '@/lib/jukebox/crypto';
import { getProvider } from '@/lib/jukebox/providers';
import { rateLimit, sweepRateLimit } from '@/lib/jukebox/rateLimit';
import { getServiceClient } from '@/lib/supabase';
import { getJukeboxVenueId } from '@/lib/jukebox/venue';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

interface PublicNowPlaying {
  track_name: string;
  artist_name: string;
  album_art_url: string | null;
  duration_ms: number;
  progress_ms: number;
  is_playing: boolean;
}

interface CacheEntry {
  data: PublicNowPlaying | null;
  expiresAt: number;
  // null = not connected / nothing playing — still cache to avoid spam
}

const CACHE = new Map<string, CacheEntry>();
const TTL_MS = 10_000;

/** Idempotent auto-mark: if Spotify says trackId is currently playing,
 *  find the matching jukebox_request (queued or approved) and stamp it played.
 *  Also marks any older approved/queued rows as skipped — they were bypassed.
 *  Quiet on errors; this is best-effort housekeeping driven by the kiosk poll. */
async function autoMarkPlayed(venueId: string, trackId: string): Promise<void> {
  try {
    const sb = getServiceClient();
    const now = new Date().toISOString();

    // Find the matching active row (queued takes priority over approved)
    const { data: rows } = await sb
      .from('jukebox_requests')
      .select('id, status, approved_at')
      .eq('venue_id', venueId)
      .in('status', ['queued', 'approved'])
      .eq('provider_track_id', trackId)
      .order('approved_at', { ascending: true, nullsFirst: false })
      .limit(1);

    const target = rows?.[0];
    if (!target) return;

    // Mark it played (in() guard makes this idempotent against concurrent calls)
    await sb
      .from('jukebox_requests')
      .update({ status: 'played', played_at: now })
      .eq('id', target.id)
      .in('status', ['queued', 'approved']);

    // Any row approved BEFORE this one that's still active was skipped by Spotify
    // (played out of order or bypassed by the DJ). Move them to History.
    if (target.approved_at) {
      await sb
        .from('jukebox_requests')
        .update({ status: 'skipped', skipped_at: now })
        .eq('venue_id', venueId)
        .in('status', ['queued', 'approved'])
        .lt('approved_at', target.approved_at);
    }
  } catch (e) {
    console.error('[now-playing autoMarkPlayed] failed:', e);
  }
}

export async function GET(req: NextRequest) {
  sweepRateLimit();
  const ipHash = hashIp(getRequestIp(req)) || 'no-ip';
  const rl = rateLimit(`np:ip:${ipHash}`, 60, 60);
  if (!rl.ok) {
    return NextResponse.json(
      {
        ok: false,
        error: {
          code: 'rate_limited',
          message: 'Slow down.',
          retryAfterSec: rl.retryAfterSec,
        },
      },
      { status: 429, headers: { 'retry-after': String(rl.retryAfterSec) } },
    );
  }

  const venueId = await getJukeboxVenueId();
  const cached = CACHE.get(venueId);
  if (cached && cached.expiresAt > Date.now()) {
    return NextResponse.json({ ok: true, data: cached.data });
  }

  const provider = getProvider('spotify', venueId);
  const res = await provider.getNowPlaying();

  let data: PublicNowPlaying | null = null;
  let liveTrackId: string | null = null;
  if ('value' in res && res.value) {
    data = {
      track_name: res.value.track.name,
      artist_name: res.value.track.artists[0]?.name || '',
      album_art_url: res.value.track.album.artUrl,
      duration_ms: res.value.track.durationMs,
      progress_ms: res.value.progressMs,
      is_playing: res.value.isPlaying,
    };
    liveTrackId = res.value.track.id;
  }
  // If 'error' in res or value === null, data stays null. Cache that too —
  // we don't want to keep hitting Spotify when nothing's playing.

  CACHE.set(venueId, { data, expiresAt: Date.now() + TTL_MS });

  // Side effect: roll any matching queued request to played. Don't await
  // before responding to the kiosk — fire and forget so the page paints fast.
  if (liveTrackId) {
    void autoMarkPlayed(venueId, liveTrackId);
  }

  return NextResponse.json({ ok: true, data });
}

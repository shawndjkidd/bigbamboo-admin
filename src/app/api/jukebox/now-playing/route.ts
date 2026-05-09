// ═══════════════════════════════════════════════════════════════
//  Public now-playing — drives the kiosk's "On Air" hero card.
//  Server-side cached with 10s TTL so a busy room can hit this
//  endpoint freely without hammering Spotify.
//  No device info, no internal flags — guest-safe projection only.
// ═══════════════════════════════════════════════════════════════

import { NextRequest, NextResponse } from 'next/server';
import { getRequestIp, hashIp } from '@/lib/jukebox/crypto';
import { getProvider } from '@/lib/jukebox/providers';
import { rateLimit, sweepRateLimit } from '@/lib/jukebox/rateLimit';
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
  if ('value' in res && res.value) {
    data = {
      track_name: res.value.track.name,
      artist_name: res.value.track.artists[0]?.name || '',
      album_art_url: res.value.track.album.artUrl,
      duration_ms: res.value.track.durationMs,
      progress_ms: res.value.progressMs,
      is_playing: res.value.isPlaying,
    };
  }
  // If 'error' in res or value === null, data stays null. Cache that too —
  // we don't want to keep hitting Spotify when nothing's playing.

  CACHE.set(venueId, { data, expiresAt: Date.now() + TTL_MS });
  return NextResponse.json({ ok: true, data });
}

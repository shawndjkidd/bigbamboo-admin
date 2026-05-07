import { NextRequest, NextResponse } from 'next/server';
import { getProvider } from '@/lib/jukebox/providers';
import { getRequestIp, hashIp } from '@/lib/jukebox/crypto';
import { rateLimit, sweepRateLimit } from '@/lib/jukebox/rateLimit';
import { getJukeboxVenueId } from '@/lib/jukebox/venue';
import {
  ensureCuratedFresh,
  getCuratedSettings,
  searchCuratedTracks,
} from '@/lib/jukebox/curated';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

export async function GET(req: NextRequest) {
  sweepRateLimit();
  const url = new URL(req.url);
  const q = (url.searchParams.get('q') || '').trim();
  const market = (url.searchParams.get('market') || 'VN').slice(0, 2).toUpperCase();
  const deviceId = (url.searchParams.get('device_id') || '').slice(0, 64);

  const ipHash = hashIp(getRequestIp(req)) || 'no-ip';

  // Per-IP and (when present) per-device throttle.
  const ipRl = rateLimit(`search:ip:${ipHash}`, 60, 60);
  if (ipRl.ok === false) {
    return NextResponse.json(
      { ok: false, error: { code: 'rate_limited', message: 'Search throttled. Try again shortly.', retryAfterSec: ipRl.retryAfterSec } },
      { status: 429, headers: { 'retry-after': String(ipRl.retryAfterSec) } },
    );
  }
  if (deviceId) {
    const devRl = rateLimit(`search:dev:${deviceId}`, 10, 60);
    if (devRl.ok === false) {
      return NextResponse.json(
        { ok: false, error: { code: 'rate_limited', message: 'Slow down a sec.', retryAfterSec: devRl.retryAfterSec } },
        { status: 429, headers: { 'retry-after': String(devRl.retryAfterSec) } },
      );
    }
  }

  if (!q) return NextResponse.json({ ok: true, data: { tracks: [] } });
  if (q.length > 80) {
    return NextResponse.json(
      { ok: false, error: { code: 'invalid_input', message: 'Query too long.' } },
      { status: 400 },
    );
  }

  // Curated mode: search the local cache, not Spotify.
  const venueId = await getJukeboxVenueId();
  const curated = await getCuratedSettings(venueId);
  if (curated?.curated_mode_enabled && curated.curated_playlist_id) {
    void ensureCuratedFresh(venueId);
    const tracks = await searchCuratedTracks(venueId, q, 12);
    return NextResponse.json({ ok: true, data: { tracks, curated: true } });
  }

  // Free mode: hit Spotify.
  const provider = getProvider('spotify');
  const res = await provider.searchTracks(q, { limit: 12, market });
  if (res.ok === false) {
    return NextResponse.json(
      { ok: false, error: { code: res.error.kind, message: 'Search failed.', meta: res.error } },
      { status: res.error.kind === 'rate_limited' ? 429 : 502 },
    );
  }
  return NextResponse.json({ ok: true, data: { tracks: res.value, curated: false } });
}

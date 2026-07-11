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

// Spotify Dev Mode max limit is 10 as of Feb 2026 (was 50). Once we move to
// Extended Quota Mode we can bump this back to 50 for fewer round-trips.
const PAGE_SIZE = 10;
const MAX_OFFSET = 1000;

export async function GET(req: NextRequest) {
  sweepRateLimit();
  const url = new URL(req.url);
  const q = (url.searchParams.get('q') || '').trim();
  // Empty string → global search (no market filter). Was 'VN' but VN's country
  // catalog is thin — Luke Bryan queries returned ~5 tracks. Global surfaces
  // the full catalog; unplayable-in-market tracks are rare and get caught at
  // request time by getTrack().
  const market = (url.searchParams.get('market') || '').slice(0, 2).toUpperCase();
  const deviceId = (url.searchParams.get('device_id') || '').slice(0, 64);
  const offsetRaw = parseInt(url.searchParams.get('offset') || '0', 10);
  const offset = Number.isFinite(offsetRaw)
    ? Math.max(0, Math.min(offsetRaw, MAX_OFFSET))
    : 0;

  const ipHash = hashIp(getRequestIp(req)) || 'no-ip';

  // Per-IP and (when present) per-device throttle. Bumped to accommodate
  // infinite-scroll pagination: 30/min per device is enough for a guest to
  // type + scroll through several pages of results without tripping the
  // limit, but still protects against runaway loops.
  const ipRl = rateLimit(`search:ip:${ipHash}`, 90, 60);
  if (ipRl.ok === false) {
    return NextResponse.json(
      { ok: false, error: { code: 'rate_limited', message: 'Search throttled. Try again shortly.', retryAfterSec: ipRl.retryAfterSec } },
      { status: 429, headers: { 'retry-after': String(ipRl.retryAfterSec) } },
    );
  }
  if (deviceId) {
    const devRl = rateLimit(`search:dev:${deviceId}`, 30, 60);
    if (devRl.ok === false) {
      return NextResponse.json(
        { ok: false, error: { code: 'rate_limited', message: 'Slow down a sec.', retryAfterSec: devRl.retryAfterSec } },
        { status: 429, headers: { 'retry-after': String(devRl.retryAfterSec) } },
      );
    }
  }

  if (!q) return NextResponse.json({ ok: true, data: { tracks: [], next_offset: null } });
  if (q.length > 80) {
    return NextResponse.json(
      { ok: false, error: { code: 'invalid_input', message: 'Query too long.' } },
      { status: 400 },
    );
  }

  // Curated mode: search the local cache, not Spotify. Curated catalogs are
  // usually small (a single playlist) so we ignore offset and return everything
  // that matches — the client just receives one page.
  const venueId = await getJukeboxVenueId();
  const curated = await getCuratedSettings(venueId);
  if (curated?.curated_mode_enabled && curated.curated_playlist_id) {
    void ensureCuratedFresh(venueId);
    const tracks = await searchCuratedTracks(venueId, q, 100);
    return NextResponse.json({ ok: true, data: { tracks, curated: true, next_offset: null } });
  }

  // Free mode: hit Spotify.
  const provider = getProvider('spotify', venueId);
  const res = await provider.searchTracks(q, { limit: PAGE_SIZE, offset, market });
  if (res.ok === false) {
    console.error('[jukebox/search] provider error', { q, market, offset, err: res.error });
    return NextResponse.json(
      { ok: false, error: { code: res.error.kind, message: 'Search failed.', meta: res.error } },
      { status: res.error.kind === 'rate_limited' ? 429 : 502 },
    );
  }
  // If we got a full page, there's probably more. If we got fewer than PAGE_SIZE
  // (or the offset is already at the ceiling), stop paginating client-side.
  const hasMore = res.value.length === PAGE_SIZE && offset + PAGE_SIZE < MAX_OFFSET;
  const nextOffset = hasMore ? offset + PAGE_SIZE : null;
  // Diagnostic: log the result count so we can see when Spotify's market
  // filter starves a query.
  console.log('[jukebox/search]', { q, market, offset, returned: res.value.length, hasMore });
  return NextResponse.json({
    ok: true,
    data: { tracks: res.value, curated: false, next_offset: nextOffset },
  });
}

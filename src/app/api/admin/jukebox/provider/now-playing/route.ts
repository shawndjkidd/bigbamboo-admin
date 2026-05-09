// ═══════════════════════════════════════════════════════════════
//  Provider now-playing — admin view
//  Returns Spotify's currently-playing track plus device info.
//  Public version is /api/jukebox/now-playing (no device info).
// ═══════════════════════════════════════════════════════════════

import { NextRequest, NextResponse } from 'next/server';
import { requireStaff } from '@/lib/jukebox/auth';
import { getProvider } from '@/lib/jukebox/providers';
import { getJukeboxVenueId } from '@/lib/jukebox/venue';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

export async function GET(req: NextRequest) {
  const auth = await requireStaff(req);
  if ('error' in auth) return auth.error;

  const venueId = await getJukeboxVenueId();
  const provider = getProvider('spotify', venueId);
  const result = await provider.getNowPlaying();
  if ('error' in result) {
    return NextResponse.json(
      { ok: false, error: { code: result.error.kind, meta: result.error } },
      { status: result.error.kind === 'rate_limited' ? 429 : 502 },
    );
  }
  return NextResponse.json({ ok: true, data: result.value });
}

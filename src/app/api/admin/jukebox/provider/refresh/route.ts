// ═══════════════════════════════════════════════════════════════
//  Provider refresh — force a token refresh now
//  Used by the admin UI's "Force token refresh" button. Useful for
//  smoke-testing the refresh flow without waiting for expiry.
// ═══════════════════════════════════════════════════════════════

import { NextRequest, NextResponse } from 'next/server';
import { hasAdminRole, requireStaff } from '@/lib/jukebox/auth';
import { getProvider } from '@/lib/jukebox/providers';
import { getSpotifyAuthStatus } from '@/lib/jukebox/spotifyAuth';
import { getJukeboxVenueId } from '@/lib/jukebox/venue';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

export async function POST(req: NextRequest) {
  const auth = await requireStaff(req);
  if ('error' in auth) return auth.error;
  if (!hasAdminRole(auth.staff.role)) {
    return NextResponse.json(
      { ok: false, error: { code: 'forbidden', message: 'Admin role required.' } },
      { status: 403 },
    );
  }

  const venueId = await getJukeboxVenueId();
  const provider = getProvider('spotify', venueId);
  const result = await provider.refreshAuthIfNeeded();
  if ('error' in result) {
    return NextResponse.json(
      { ok: false, error: { code: result.error.kind, meta: result.error } },
      { status: 400 },
    );
  }
  const status = await getSpotifyAuthStatus(venueId);
  return NextResponse.json({
    ok: true,
    data: {
      expires_at: status.expiresAt ? status.expiresAt.toISOString() : null,
      connected: status.isConnected,
    },
  });
}

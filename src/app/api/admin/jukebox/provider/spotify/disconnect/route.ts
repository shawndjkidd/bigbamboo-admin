// ═══════════════════════════════════════════════════════════════
//  Spotify OAuth — disconnect
//  Clears tokens and flips is_connected=false. Idempotent.
// ═══════════════════════════════════════════════════════════════

import { NextRequest, NextResponse } from 'next/server';
import { hasAdminRole, requireStaff } from '@/lib/jukebox/auth';
import { disconnectSpotify } from '@/lib/jukebox/spotifyAuth';
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
  await disconnectSpotify(venueId);
  return NextResponse.json({ ok: true });
}

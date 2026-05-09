// ═══════════════════════════════════════════════════════════════
//  Provider status — connection metadata + active device
//  Drives the admin UI's Spotify section. No tokens leaked.
// ═══════════════════════════════════════════════════════════════

import { NextRequest, NextResponse } from 'next/server';
import { requireStaff } from '@/lib/jukebox/auth';
import { getProvider } from '@/lib/jukebox/providers';
import { getSpotifyAuthStatus } from '@/lib/jukebox/spotifyAuth';
import { getJukeboxVenueId } from '@/lib/jukebox/venue';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

export async function GET(req: NextRequest) {
  const auth = await requireStaff(req);
  if ('error' in auth) return auth.error;

  const venueId = await getJukeboxVenueId();
  const status = await getSpotifyAuthStatus(venueId);

  let activeDevice:
    | { id: string; name: string; is_active: boolean }
    | null = null;
  let allDevices: { id: string; name: string; is_active: boolean }[] = [];
  let devicesError: string | null = null;

  if (status.isConnected) {
    const provider = getProvider('spotify', venueId);
    const dev = await provider.getAvailableDevices();
    if ('error' in dev) {
      devicesError = dev.error.kind;
    } else {
      allDevices = dev.value.map((d) => ({
        id: d.id,
        name: d.name,
        is_active: d.isActive,
      }));
      activeDevice = allDevices.find((d) => d.is_active) || null;
    }
  }

  return NextResponse.json({
    ok: true,
    data: {
      connected: status.isConnected,
      provider_user_id: status.providerUserId,
      provider_display_name: status.providerDisplayName,
      scopes: status.scopes,
      expires_at: status.expiresAt ? status.expiresAt.toISOString() : null,
      active_device: activeDevice,
      all_devices: allDevices,
      devices_error: devicesError,
    },
  });
}

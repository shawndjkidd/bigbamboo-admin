// Public — kiosk polls this to drive the poster rotator.
// No auth required; returns active posters + rotation settings.
import { NextResponse } from 'next/server';
import { getServiceClient } from '@/lib/supabase';
import { getJukeboxVenueId } from '@/lib/jukebox/venue';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

export async function GET() {
  const sb = getServiceClient();
  const venueId = await getJukeboxVenueId();

  const [postersResult, settingsResult] = await Promise.all([
    sb
      .from('jukebox_display_posters')
      .select('id, public_url, position')
      .eq('venue_id', venueId)
      .eq('is_active', true)
      .order('position', { ascending: true }),
    sb
      .from('jukebox_settings')
      .select('rotate_posters, poster_rotation_seconds')
      .eq('venue_id', venueId)
      .maybeSingle(),
  ]);

  if (postersResult.error) {
    // Table may not exist yet (pre-migration) — return empty gracefully.
    console.error('[/api/jukebox/posters]', postersResult.error.message);
    return NextResponse.json({ ok: true, data: { posters: [], rotate_posters: true, poster_rotation_seconds: 8 } });
  }

  return NextResponse.json({
    ok: true,
    data: {
      posters: postersResult.data || [],
      rotate_posters: settingsResult.data?.rotate_posters ?? true,
      poster_rotation_seconds: settingsResult.data?.poster_rotation_seconds ?? 8,
    },
  });
}

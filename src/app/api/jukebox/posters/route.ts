// Public — kiosk polls this to drive the poster rotator.
// No auth required; returns only active posters, public_url only.
import { NextResponse } from 'next/server';
import { getServiceClient } from '@/lib/supabase';
import { getJukeboxVenueId } from '@/lib/jukebox/venue';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

export async function GET() {
  const sb = getServiceClient();
  const venueId = await getJukeboxVenueId();

  const { data, error } = await sb
    .from('jukebox_display_posters')
    .select('id, public_url, position')
    .eq('venue_id', venueId)
    .eq('is_active', true)
    .order('position', { ascending: true });

  if (error) {
    // Table may not exist yet (pre-migration) — return empty gracefully.
    console.error('[/api/jukebox/posters]', error.message);
    return NextResponse.json({ ok: true, data: { posters: [] } });
  }

  return NextResponse.json({ ok: true, data: { posters: data || [] } });
}

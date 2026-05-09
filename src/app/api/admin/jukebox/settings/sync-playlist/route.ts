import { NextRequest, NextResponse } from 'next/server';
import { getServiceClient } from '@/lib/supabase';
import { getJukeboxVenueId } from '@/lib/jukebox/venue';
import { requireModerator } from '@/lib/jukebox/auth';
import { getCuratedSettings, syncCuratedPlaylist } from '@/lib/jukebox/curated';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

export async function POST(req: NextRequest) {
  const auth = await requireModerator(req);
  if ('error' in auth) return auth.error;

  const venueId = await getJukeboxVenueId();
  const settings = await getCuratedSettings(venueId);
  if (!settings || !settings.curated_playlist_id) {
    return NextResponse.json(
      { ok: false, error: { code: 'not_configured', message: 'No curated playlist set.' } },
      { status: 400 },
    );
  }

  const result = await syncCuratedPlaylist(venueId, settings.curated_playlist_id);
  if (result.ok === false) {
    const sb = getServiceClient();
    await sb
      .from('jukebox_settings')
      .update({ curated_playlist_error: result.error })
      .eq('venue_id', venueId);
    return NextResponse.json(
      { ok: false, error: { code: 'sync_failed', message: result.error } },
      { status: 502 },
    );
  }

  return NextResponse.json({
    ok: true,
    data: {
      count: result.count,
      name: result.meta.name,
      owner: result.meta.owner,
      image: result.meta.image,
    },
  });
}

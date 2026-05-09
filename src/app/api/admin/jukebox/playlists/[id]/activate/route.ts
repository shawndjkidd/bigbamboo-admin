import { NextRequest, NextResponse } from 'next/server';
import { getServiceClient } from '@/lib/supabase';
import { getJukeboxVenueId } from '@/lib/jukebox/venue';
import { requireModerator } from '@/lib/jukebox/auth';
import { syncCuratedPlaylist } from '@/lib/jukebox/curated';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

// POST /api/admin/jukebox/playlists/[id]/activate
// Sets this preset as the active curated playlist + triggers a track sync.
export async function POST(req: NextRequest, ctx: { params: { id: string } }) {
  const auth = await requireModerator(req);
  if ('error' in auth) return auth.error;

  const venueId = await getJukeboxVenueId();
  const sb = getServiceClient();

  const { data: preset } = await sb
    .from('jukebox_playlist_presets')
    .select('*')
    .eq('id', ctx.params.id)
    .eq('venue_id', venueId)
    .maybeSingle();
  if (!preset) {
    return NextResponse.json(
      { ok: false, error: { code: 'not_found', message: 'Preset not found.' } },
      { status: 404 },
    );
  }

  // Write the active state to settings.
  await sb
    .from('jukebox_settings')
    .update({
      curated_playlist_url: preset.playlist_url,
      curated_playlist_id: preset.playlist_id,
      curated_playlist_name: preset.playlist_name,
      curated_playlist_owner: preset.playlist_owner,
      curated_playlist_image_url: preset.playlist_image_url,
      curated_playlist_error: null,
    })
    .eq('venue_id', venueId);

  // Sync the tracks to the local cache.
  const sync = await syncCuratedPlaylist(venueId, preset.playlist_id);
  if (sync.ok === false) {
    await sb
      .from('jukebox_settings')
      .update({ curated_playlist_error: sync.error })
      .eq('venue_id', venueId);
    return NextResponse.json(
      { ok: false, error: { code: 'sync_failed', message: sync.error } },
      { status: 502 },
    );
  }

  // Mirror updated metadata back to the preset record too.
  await sb
    .from('jukebox_playlist_presets')
    .update({
      playlist_track_count: sync.count,
      last_synced_at: new Date().toISOString(),
      updated_at: new Date().toISOString(),
    })
    .eq('id', ctx.params.id);

  return NextResponse.json({
    ok: true,
    data: {
      preset_id: ctx.params.id,
      playlist_name: sync.meta.name,
      track_count: sync.count,
    },
  });
}

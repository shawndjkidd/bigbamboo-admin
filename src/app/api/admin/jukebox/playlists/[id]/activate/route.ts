import { NextRequest, NextResponse } from 'next/server';
import { getServiceClient } from '@/lib/supabase';
import { getJukeboxVenueId } from '@/lib/jukebox/venue';
import { requireStaff } from '@/lib/jukebox/auth';
import { syncCuratedPlaylist } from '@/lib/jukebox/curated';
import { getProvider } from '@/lib/jukebox/providers';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

export async function POST(
  req: NextRequest,
  { params }: { params: { id: string } },
) {
  const auth = await requireStaff(req);
  if ('error' in auth) return auth.error;

  const venueId = await getJukeboxVenueId();
  const sb = getServiceClient();

  // Fetch the preset
  const { data: preset, error: fetchErr } = await sb
    .from('jukebox_playlist_presets')
    .select('*')
    .eq('id', params.id)
    .eq('venue_id', venueId)
    .single();
  if (fetchErr || !preset) {
    return NextResponse.json({ ok: false, error: { code: 'not_found', message: 'Preset not found.' } }, { status: 404 });
  }

  // Fetch fresh metadata from Spotify
  const provider = getProvider('spotify');
  const meta = await provider.getPlaylistMeta(preset.playlist_id);

  // Update jukebox_settings with the active playlist info
  const settingsUpdate: Record<string, unknown> = {
    curated_mode_enabled: true,
    curated_playlist_id: preset.playlist_id,
    curated_playlist_url: preset.playlist_url,
    curated_playlist_name: meta.ok ? meta.value.name : preset.playlist_name,
    curated_playlist_owner: meta.ok ? meta.value.owner : preset.playlist_owner,
    curated_playlist_image_url: meta.ok ? meta.value.image : preset.playlist_image_url,
    curated_playlist_track_count: meta.ok ? (meta.value.trackCount ?? preset.track_count ?? 0) : (preset.track_count ?? 0),
    curated_playlist_error: null,
  };
  await sb.from('jukebox_settings').update(settingsUpdate).eq('venue_id', venueId);

  // Mark this preset active, all others inactive
  await sb.from('jukebox_playlist_presets').update({ is_active: false }).eq('venue_id', venueId);
  await sb.from('jukebox_playlist_presets').update({ is_active: true }).eq('id', params.id);

  // Kick off background sync (populates jukebox_curated_tracks cache)
  void syncCuratedPlaylist(venueId, preset.playlist_id).catch((e) => {
    console.error('[activate] background sync failed:', e);
  });

  // Return updated presets list
  const { data: presets } = await sb
    .from('jukebox_playlist_presets')
    .select('*')
    .eq('venue_id', venueId)
    .order('created_at', { ascending: true });

  return NextResponse.json({ ok: true, data: { presets: presets || [] } });
}

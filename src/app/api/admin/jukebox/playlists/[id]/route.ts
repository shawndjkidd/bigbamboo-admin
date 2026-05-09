import { NextRequest, NextResponse } from 'next/server';
import { getServiceClient } from '@/lib/supabase';
import { getJukeboxVenueId } from '@/lib/jukebox/venue';
import { requireModerator } from '@/lib/jukebox/auth';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

interface UpdateBody {
  name?: string;
}

// PATCH /api/admin/jukebox/playlists/[id] — rename a preset
export async function PATCH(req: NextRequest, ctx: { params: { id: string } }) {
  const auth = await requireModerator(req);
  if ('error' in auth) return auth.error;

  let body: UpdateBody;
  try { body = (await req.json()) as UpdateBody; } catch {
    return NextResponse.json({ ok: false, error: { code: 'invalid_input', message: 'Body must be JSON.' } }, { status: 400 });
  }
  const name = (body.name || '').trim();
  if (!name) {
    return NextResponse.json({ ok: false, error: { code: 'invalid_input', message: 'Name required.' } }, { status: 400 });
  }

  const venueId = await getJukeboxVenueId();
  const sb = getServiceClient();
  const { data, error } = await sb
    .from('jukebox_playlist_presets')
    .update({ name, updated_at: new Date().toISOString() })
    .eq('id', ctx.params.id)
    .eq('venue_id', venueId)
    .select('*')
    .single();
  if (error) {
    return NextResponse.json({ ok: false, error: { code: 'server_error', message: error.message } }, { status: 500 });
  }
  return NextResponse.json({ ok: true, data });
}

// DELETE /api/admin/jukebox/playlists/[id] — remove a preset.
// If it was the active curated playlist, clear the active state.
export async function DELETE(req: NextRequest, ctx: { params: { id: string } }) {
  const auth = await requireModerator(req);
  if ('error' in auth) return auth.error;

  const venueId = await getJukeboxVenueId();
  const sb = getServiceClient();

  // Fetch the preset first so we know its playlist_id (to clear active if matching)
  const { data: preset } = await sb
    .from('jukebox_playlist_presets')
    .select('playlist_id')
    .eq('id', ctx.params.id)
    .eq('venue_id', venueId)
    .maybeSingle();

  if (preset) {
    // Clear active curated state if this preset was the active one
    const { data: settings } = await sb
      .from('jukebox_settings')
      .select('curated_playlist_id')
      .eq('venue_id', venueId)
      .maybeSingle();
    if (settings?.curated_playlist_id === preset.playlist_id) {
      await sb
        .from('jukebox_settings')
        .update({
          curated_mode_enabled: false,
          curated_playlist_url: null,
          curated_playlist_id: null,
          curated_playlist_name: null,
          curated_playlist_owner: null,
          curated_playlist_image_url: null,
          curated_playlist_track_count: 0,
          curated_playlist_synced_at: null,
          curated_playlist_error: null,
        })
        .eq('venue_id', venueId);
      await sb.from('jukebox_curated_tracks').delete().eq('venue_id', venueId);
    }
  }

  const { error } = await sb
    .from('jukebox_playlist_presets')
    .delete()
    .eq('id', ctx.params.id)
    .eq('venue_id', venueId);
  if (error) {
    return NextResponse.json({ ok: false, error: { code: 'server_error', message: error.message } }, { status: 500 });
  }
  return NextResponse.json({ ok: true, data: { id: ctx.params.id } });
}

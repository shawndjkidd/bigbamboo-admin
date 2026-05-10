import { NextRequest, NextResponse } from 'next/server';
import { getServiceClient } from '@/lib/supabase';
import { getJukeboxVenueId } from '@/lib/jukebox/venue';
import { requireModerator } from '@/lib/jukebox/auth';
import { extractPlaylistId } from '@/lib/jukebox/curated';
import { getProvider } from '@/lib/jukebox/providers';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

// GET /api/admin/jukebox/playlists — list all saved presets for the venue
export async function GET(req: NextRequest) {
  const auth = await requireModerator(req);
  if ('error' in auth) return auth.error;

  const venueId = await getJukeboxVenueId();
  const sb = getServiceClient();
  const { data } = await sb
    .from('jukebox_playlist_presets')
    .select('*')
    .eq('venue_id', venueId)
    .order('sort_order', { ascending: true })
    .order('created_at', { ascending: true });
  return NextResponse.json({ ok: true, data: { presets: data || [] } });
}

interface AddBody {
  url?: string;
  name?: string;
}

// POST /api/admin/jukebox/playlists — save a new preset (fetches metadata, no track sync yet)
export async function POST(req: NextRequest) {
  const auth = await requireModerator(req);
  if ('error' in auth) return auth.error;

  let body: AddBody;
  try {
    body = (await req.json()) as AddBody;
  } catch {
    return NextResponse.json(
      { ok: false, error: { code: 'invalid_input', message: 'Body must be JSON.' } },
      { status: 400 },
    );
  }
  const url = (body.url || '').trim();
  const playlistId = extractPlaylistId(url);
  if (!playlistId) {
    return NextResponse.json(
      { ok: false, error: { code: 'invalid_input', message: "That doesn't look like a Spotify playlist link." } },
      { status: 400 },
    );
  }

  const venueId = await getJukeboxVenueId();
  const provider = getProvider('spotify', venueId);
  const meta = await provider.getPlaylistMeta(playlistId);
  if (meta.ok === false) {
    return NextResponse.json(
      { ok: false, error: { code: 'playlist_fetch_failed', message: `Could not fetch playlist (${meta.error.kind}).` } },
      { status: 502 },
    );
  }
  const sb = getServiceClient();
  const friendlyName = (body.name || '').trim() || meta.value.name;

  const { data, error } = await sb
    .from('jukebox_playlist_presets')
    .insert({
      venue_id: venueId,
      name: friendlyName,
      playlist_url: url,
      playlist_id: playlistId,
      playlist_name: meta.value.name,
      playlist_owner: meta.value.owner,
      playlist_image_url: meta.value.image,
      playlist_track_count: meta.value.trackCount,
      last_synced_at: null,
    })
    .select('*')
    .single();
  if (error) {
    if (error.code === '23505') {
      return NextResponse.json(
        { ok: false, error: { code: 'duplicate', message: 'This playlist is already saved.' } },
        { status: 409 },
      );
    }
    return NextResponse.json({ ok: false, error: { code: 'server_error', message: error.message } }, { status: 500 });
  }
  return NextResponse.json({ ok: true, data });
}

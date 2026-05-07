import { NextRequest, NextResponse } from 'next/server';
import { getServiceClient } from '@/lib/supabase';
import { getJukeboxVenueId } from '@/lib/jukebox/venue';
import { requireStaff } from '@/lib/jukebox/auth';
import { extractPlaylistId } from '@/lib/jukebox/curated';
import { getProvider } from '@/lib/jukebox/providers';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

export async function GET(req: NextRequest) {
  const auth = await requireStaff(req);
  if ('error' in auth) return auth.error;

  const venueId = await getJukeboxVenueId();
  const sb = getServiceClient();
  const { data } = await sb
    .from('jukebox_playlist_presets')
    .select('*')
    .eq('venue_id', venueId)
    .order('created_at', { ascending: true });
  return NextResponse.json({ ok: true, data: { presets: data || [] } });
}

export async function POST(req: NextRequest) {
  const auth = await requireStaff(req);
  if ('error' in auth) return auth.error;

  let body: Record<string, unknown> = {};
  try { body = await req.json(); } catch {
    return NextResponse.json({ ok: false, error: { code: 'invalid_input', message: 'Body must be JSON.' } }, { status: 400 });
  }
  const name = String(body.name || '').trim();
  const rawUrl = String(body.playlist_url || '').trim();
  if (!name) {
    return NextResponse.json({ ok: false, error: { code: 'invalid_input', message: 'Name is required.' } }, { status: 400 });
  }
  const playlistId = extractPlaylistId(rawUrl);
  if (!playlistId) {
    return NextResponse.json(
      { ok: false, error: { code: 'invalid_input', message: "That doesn't look like a Spotify playlist link." } },
      { status: 400 },
    );
  }

  // Fetch playlist meta (single call, no track pagination)
  const provider = getProvider('spotify');
  const meta = await provider.getPlaylistMeta(playlistId);

  const venueId = await getJukeboxVenueId();
  const sb = getServiceClient();
  const { data, error } = await sb
    .from('jukebox_playlist_presets')
    .insert({
      venue_id: venueId,
      name,
      playlist_id: playlistId,
      playlist_url: rawUrl,
      playlist_name: meta.ok ? meta.value.name : null,
      playlist_owner: meta.ok ? meta.value.owner : null,
      playlist_image_url: meta.ok ? meta.value.image : null,
      track_count: meta.ok ? (meta.value.trackCount ?? null) : null,
      is_active: false,
    })
    .select('*')
    .single();
  if (error) {
    return NextResponse.json({ ok: false, error: { code: 'server_error', message: error.message } }, { status: 500 });
  }
  return NextResponse.json({ ok: true, data }, { status: 201 });
}

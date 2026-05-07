import { NextRequest, NextResponse } from 'next/server';
import { getServiceClient } from '@/lib/supabase';
import { getJukeboxVenueId } from '@/lib/jukebox/venue';
import { requireStaff } from '@/lib/jukebox/auth';
import { extractPlaylistId, syncCuratedPlaylist } from '@/lib/jukebox/curated';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

const ALLOWED_PATCH_FIELDS = new Set([
  'is_active',
  'mode',
  'guest_cooldown_minutes',
  'member_cooldown_minutes',
  'max_song_length_seconds',
  'duplicate_cooldown_minutes',
  'same_artist_cooldown_minutes',
  'allow_explicit',
  'provider',
  'auto_add_to_provider',
  'max_queue_length',
  'pending_request_ttl_minutes',
  'timezone',
  'curated_mode_enabled',
  'curated_playlist_url',
]);

const VALID_MODES = new Set(['approval', 'open', 'locked', 'event']);

export async function GET(req: NextRequest) {
  const auth = await requireStaff(req);
  if ('error' in auth) return auth.error;

  const venueId = await getJukeboxVenueId();
  const sb = getServiceClient();
  const { data } = await sb
    .from('jukebox_settings')
    .select('*')
    .eq('venue_id', venueId)
    .maybeSingle();
  if (!data) {
    return NextResponse.json(
      { ok: false, error: { code: 'not_configured', message: 'Settings row missing.' } },
      { status: 404 },
    );
  }
  return NextResponse.json({ ok: true, data });
}

export async function PATCH(req: NextRequest) {
  const auth = await requireStaff(req);
  if ('error' in auth) return auth.error;

  let body: Record<string, unknown> = {};
  try { body = (await req.json()) as Record<string, unknown>; } catch {
    return NextResponse.json({ ok: false, error: { code: 'invalid_input', message: 'Body must be JSON.' } }, { status: 400 });
  }

  const update: Record<string, unknown> = {};
  for (const [k, v] of Object.entries(body)) {
    if (!ALLOWED_PATCH_FIELDS.has(k)) continue;
    update[k] = v;
  }
  if (typeof update.mode === 'string' && !VALID_MODES.has(update.mode)) {
    return NextResponse.json({ ok: false, error: { code: 'invalid_input', message: 'Bad mode.' } }, { status: 400 });
  }

  // If curated playlist URL changes, parse it and trigger an initial sync.
  let postSyncPlaylistId: string | null = null;
  if (typeof update.curated_playlist_url === 'string') {
    const raw = update.curated_playlist_url.trim();
    if (raw.length === 0) {
      update.curated_playlist_url = null;
      update.curated_playlist_id = null;
      update.curated_playlist_name = null;
      update.curated_playlist_owner = null;
      update.curated_playlist_image_url = null;
      update.curated_playlist_track_count = 0;
      update.curated_playlist_synced_at = null;
      update.curated_playlist_error = null;
    } else {
      const id = extractPlaylistId(raw);
      if (!id) {
        return NextResponse.json(
          { ok: false, error: { code: 'invalid_input', message: "That doesn't look like a Spotify playlist link." } },
          { status: 400 },
        );
      }
      update.curated_playlist_url = raw;
      update.curated_playlist_id = id;
      postSyncPlaylistId = id;
    }
  }

  if (Object.keys(update).length === 0) {
    return NextResponse.json({ ok: false, error: { code: 'invalid_input', message: 'No allowed fields.' } }, { status: 400 });
  }

  const venueId = await getJukeboxVenueId();
  const sb = getServiceClient();
  const { data, error } = await sb
    .from('jukebox_settings')
    .update(update)
    .eq('venue_id', venueId)
    .select('*')
    .single();
  if (error) {
    return NextResponse.json({ ok: false, error: { code: 'server_error', message: error.message } }, { status: 500 });
  }

  // Initial sync of the new playlist (if URL changed). Errors surface as
  // curated_playlist_error in the row but don't fail the PATCH.
  if (postSyncPlaylistId) {
    const sync = await syncCuratedPlaylist(venueId, postSyncPlaylistId);
    if (sync.ok === false) {
      await sb
        .from('jukebox_settings')
        .update({ curated_playlist_error: sync.error })
        .eq('venue_id', venueId);
    }
    const { data: fresh } = await sb
      .from('jukebox_settings')
      .select('*')
      .eq('venue_id', venueId)
      .single();
    return NextResponse.json({ ok: true, data: fresh ?? data });
  }

  return NextResponse.json({ ok: true, data });
}

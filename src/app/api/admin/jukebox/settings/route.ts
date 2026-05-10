import { NextRequest, NextResponse } from 'next/server';
import { getServiceClient } from '@/lib/supabase';
import { getJukeboxVenueId } from '@/lib/jukebox/venue';
import { requireModerator } from '@/lib/jukebox/auth';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

// Note: curated_playlist_* fields are now managed by the presets routes
// (POST /admin/jukebox/playlists, /[id], /[id]/activate). max_song_length
// removed per product decision — we don't gate by song length anymore.
const ALLOWED_PATCH_FIELDS = new Set([
  'is_active',
  'mode',
  'guest_cooldown_minutes',
  'member_cooldown_minutes',
  'duplicate_cooldown_minutes',
  'same_artist_cooldown_minutes',
  'allow_explicit',
  'provider',
  'auto_add_to_provider',
  'max_queue_length',
  'pending_request_ttl_minutes',
  'timezone',
  'wifi_network',
  'wifi_password',
  'blocked_genres',
]);

const VALID_MODES = new Set(['approval', 'open', 'autopilot', 'locked', 'event']);

export async function GET(req: NextRequest) {
  const auth = await requireModerator(req);
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
  const auth = await requireModerator(req);
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

  return NextResponse.json({ ok: true, data });
}

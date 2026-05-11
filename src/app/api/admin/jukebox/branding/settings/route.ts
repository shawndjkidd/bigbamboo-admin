import { NextRequest, NextResponse } from 'next/server';
import { requireModerator } from '@/lib/jukebox/auth';
import { getServiceClient } from '@/lib/supabase';
import { getJukeboxVenueId } from '@/lib/jukebox/venue';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

export async function PATCH(req: NextRequest) {
  const auth = await requireModerator(req);
  if ('error' in auth) return auth.error;

  let body: Record<string, unknown>;
  try {
    body = (await req.json()) as Record<string, unknown>;
  } catch {
    return NextResponse.json(
      { ok: false, error: { code: 'invalid_input', message: 'Invalid JSON.' } },
      { status: 400 },
    );
  }

  const patch: Record<string, unknown> = {};
  if (typeof body.rotate_posters === 'boolean') patch.rotate_posters = body.rotate_posters;
  if (typeof body.poster_rotation_seconds === 'number') {
    const secs = Math.round(body.poster_rotation_seconds);
    if (secs < 3 || secs > 60) {
      return NextResponse.json(
        { ok: false, error: { code: 'invalid_input', message: 'poster_rotation_seconds must be between 3 and 60.' } },
        { status: 400 },
      );
    }
    patch.poster_rotation_seconds = secs;
  }

  if (Object.keys(patch).length === 0) {
    return NextResponse.json(
      { ok: false, error: { code: 'invalid_input', message: 'Nothing to update.' } },
      { status: 400 },
    );
  }

  const venueId = await getJukeboxVenueId();
  const sb = getServiceClient();
  const { data, error } = await sb
    .from('jukebox_settings')
    .update(patch)
    .eq('venue_id', venueId)
    .select('id, rotate_posters, poster_rotation_seconds')
    .single();

  if (error) {
    console.error('[branding/settings PATCH]', error.message);
    return NextResponse.json(
      { ok: false, error: { code: 'server_error', message: error.message } },
      { status: 500 },
    );
  }

  return NextResponse.json({ ok: true, data });
}

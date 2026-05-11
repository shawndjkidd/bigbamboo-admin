import { NextRequest, NextResponse } from 'next/server';
import { requireModerator } from '@/lib/jukebox/auth';
import { getServiceClient } from '@/lib/supabase';
import { getJukeboxVenueId } from '@/lib/jukebox/venue';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

const BUCKET = 'venue-display-posters';

export async function PATCH(req: NextRequest, ctx: { params: { id: string } }) {
  const auth = await requireModerator(req);
  if ('error' in auth) return auth.error;

  let body: Record<string, unknown>;
  try {
    body = await req.json();
  } catch {
    return NextResponse.json(
      { ok: false, error: { code: 'invalid_input', message: 'Invalid JSON.' } },
      { status: 400 },
    );
  }

  const patch: Record<string, unknown> = {};
  if (typeof body.is_active === 'boolean') patch.is_active = body.is_active;
  if (typeof body.position === 'number') patch.position = body.position;

  if (Object.keys(patch).length === 0) {
    return NextResponse.json(
      { ok: false, error: { code: 'invalid_input', message: 'Nothing to update.' } },
      { status: 400 },
    );
  }

  const sb = getServiceClient();
  const venueId = await getJukeboxVenueId();

  const { data, error } = await sb
    .from('jukebox_display_posters')
    .update(patch)
    .eq('id', ctx.params.id)
    .eq('venue_id', venueId)
    .select('id, position, is_active')
    .single();

  if (error) {
    console.error('[branding/posters PATCH]', error.message);
    return NextResponse.json(
      { ok: false, error: { code: 'server_error', message: error.message } },
      { status: 500 },
    );
  }

  return NextResponse.json({ ok: true, data });
}

export async function DELETE(req: NextRequest, ctx: { params: { id: string } }) {
  const auth = await requireModerator(req);
  if ('error' in auth) return auth.error;

  const sb = getServiceClient();
  const venueId = await getJukeboxVenueId();

  const { data: row } = await sb
    .from('jukebox_display_posters')
    .select('id, storage_path')
    .eq('id', ctx.params.id)
    .eq('venue_id', venueId)
    .maybeSingle();

  if (!row) {
    return NextResponse.json(
      { ok: false, error: { code: 'not_found', message: 'Poster not found.' } },
      { status: 404 },
    );
  }

  const { error: dbErr } = await sb
    .from('jukebox_display_posters')
    .delete()
    .eq('id', ctx.params.id)
    .eq('venue_id', venueId);

  if (dbErr) {
    console.error('[branding/posters DELETE] db error:', dbErr.message);
    return NextResponse.json(
      { ok: false, error: { code: 'server_error', message: dbErr.message } },
      { status: 500 },
    );
  }

  await sb.storage.from(BUCKET).remove([row.storage_path]).catch((e: unknown) => {
    console.error('[branding/posters DELETE] storage remove error:', e);
  });

  return NextResponse.json({ ok: true });
}

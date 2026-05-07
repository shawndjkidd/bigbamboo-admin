import { NextRequest, NextResponse } from 'next/server';
import { getServiceClient } from '@/lib/supabase';
import { getJukeboxVenueId } from '@/lib/jukebox/venue';
import { requireStaff } from '@/lib/jukebox/auth';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

export async function PATCH(
  req: NextRequest,
  { params }: { params: { id: string } },
) {
  const auth = await requireStaff(req);
  if ('error' in auth) return auth.error;

  let body: Record<string, unknown> = {};
  try { body = await req.json(); } catch {
    return NextResponse.json({ ok: false, error: { code: 'invalid_input', message: 'Body must be JSON.' } }, { status: 400 });
  }
  const name = String(body.name || '').trim();
  if (!name) {
    return NextResponse.json({ ok: false, error: { code: 'invalid_input', message: 'Name is required.' } }, { status: 400 });
  }

  const venueId = await getJukeboxVenueId();
  const sb = getServiceClient();
  const { data, error } = await sb
    .from('jukebox_playlist_presets')
    .update({ name })
    .eq('id', params.id)
    .eq('venue_id', venueId)
    .select('*')
    .single();
  if (error || !data) {
    return NextResponse.json({ ok: false, error: { code: 'not_found', message: 'Preset not found.' } }, { status: 404 });
  }
  return NextResponse.json({ ok: true, data });
}

export async function DELETE(
  req: NextRequest,
  { params }: { params: { id: string } },
) {
  const auth = await requireStaff(req);
  if ('error' in auth) return auth.error;

  const venueId = await getJukeboxVenueId();
  const sb = getServiceClient();
  const { error } = await sb
    .from('jukebox_playlist_presets')
    .delete()
    .eq('id', params.id)
    .eq('venue_id', venueId);
  if (error) {
    return NextResponse.json({ ok: false, error: { code: 'server_error', message: error.message } }, { status: 500 });
  }
  return NextResponse.json({ ok: true });
}

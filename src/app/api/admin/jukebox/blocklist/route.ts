import { NextRequest, NextResponse } from 'next/server';
import { getServiceClient } from '@/lib/supabase';
import { getJukeboxVenueId } from '@/lib/jukebox/venue';
import { requireStaff } from '@/lib/jukebox/auth';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

export async function GET(req: NextRequest) {
  const auth = await requireStaff(req);
  if ('error' in auth) return auth.error;

  const venueId = await getJukeboxVenueId();
  const sb = getServiceClient();
  const { data } = await sb
    .from('jukebox_blocklist')
    .select('*')
    .eq('venue_id', venueId)
    .order('created_at', { ascending: false });
  return NextResponse.json({ ok: true, data: { entries: data || [] } });
}

interface AddBody {
  type?: 'track' | 'artist';
  provider_id?: string;
  name?: string;
  reason?: string;
  provider?: string;
}

export async function POST(req: NextRequest) {
  const auth = await requireStaff(req);
  if ('error' in auth) return auth.error;

  let body: AddBody;
  try { body = (await req.json()) as AddBody; } catch {
    return NextResponse.json({ ok: false, error: { code: 'invalid_input', message: 'Body must be JSON.' } }, { status: 400 });
  }
  const type = body.type;
  const providerId = (body.provider_id || '').trim();
  const name = (body.name || '').trim();
  const provider = body.provider || 'spotify';
  const reason = (body.reason || '').trim().slice(0, 200) || null;

  if (!type || !['track', 'artist'].includes(type) || !providerId || !name) {
    return NextResponse.json(
      { ok: false, error: { code: 'invalid_input', message: 'type, provider_id, name required.' } },
      { status: 400 },
    );
  }

  const venueId = await getJukeboxVenueId();
  const sb = getServiceClient();
  const { data, error } = await sb
    .from('jukebox_blocklist')
    .insert({
      venue_id: venueId,
      type,
      provider,
      provider_id: providerId,
      spotify_id: provider === 'spotify' ? providerId : null,
      name,
      reason,
      created_by: auth.staff.id,
    })
    .select('*')
    .single();
  if (error) {
    if (error.code === '23505') {
      return NextResponse.json({ ok: false, error: { code: 'duplicate', message: 'Already on the blocklist.' } }, { status: 409 });
    }
    return NextResponse.json({ ok: false, error: { code: 'server_error', message: error.message } }, { status: 500 });
  }
  return NextResponse.json({ ok: true, data });
}

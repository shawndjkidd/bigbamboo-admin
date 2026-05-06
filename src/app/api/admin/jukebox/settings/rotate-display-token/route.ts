import { NextRequest, NextResponse } from 'next/server';
import { getServiceClient } from '@/lib/supabase';
import { getJukeboxVenueId } from '@/lib/jukebox/venue';
import { requireStaff } from '@/lib/jukebox/auth';
import { randomToken } from '@/lib/jukebox/crypto';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

export async function POST(req: NextRequest) {
  const auth = await requireStaff(req);
  if ('error' in auth) return auth.error;

  const venueId = await getJukeboxVenueId();
  const sb = getServiceClient();
  const newToken = randomToken(16);
  const { data, error } = await sb
    .from('jukebox_settings')
    .update({ display_token: newToken })
    .eq('venue_id', venueId)
    .select('display_token')
    .single();
  if (error) {
    return NextResponse.json({ ok: false, error: { code: 'server_error', message: error.message } }, { status: 500 });
  }
  return NextResponse.json({ ok: true, data });
}

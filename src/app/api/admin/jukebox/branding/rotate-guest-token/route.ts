import { randomUUID } from 'crypto';
import { NextRequest, NextResponse } from 'next/server';
import { requireModerator } from '@/lib/jukebox/auth';
import { getServiceClient } from '@/lib/supabase';
import { getJukeboxVenueId } from '@/lib/jukebox/venue';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

export async function POST(req: NextRequest) {
  const auth = await requireModerator(req);
  if ('error' in auth) return auth.error;

  const venueId = await getJukeboxVenueId();
  const sb = getServiceClient();
  const nowIso = new Date().toISOString();

  const { data, error } = await sb
    .from('jukebox_settings')
    .update({ guest_token: randomUUID(), guest_token_rotated_at: nowIso })
    .eq('venue_id', venueId)
    .select('guest_token, guest_token_rotated_at, guest_token_rotation_hours')
    .single();

  if (error) {
    console.error('[rotate-guest-token]', error.message);
    return NextResponse.json(
      { ok: false, error: { code: 'server_error', message: error.message } },
      { status: 500 },
    );
  }

  return NextResponse.json({ ok: true, data });
}

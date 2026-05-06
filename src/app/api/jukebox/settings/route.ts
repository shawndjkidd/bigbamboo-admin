import { NextRequest, NextResponse } from 'next/server';
import { getServiceClient } from '@/lib/supabase';
import { getJukeboxVenueId } from '@/lib/jukebox/venue';
import { getRequestIp, hashIp } from '@/lib/jukebox/crypto';
import { rateLimit, sweepRateLimit } from '@/lib/jukebox/rateLimit';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

export async function GET(req: NextRequest) {
  sweepRateLimit();
  const ipHash = hashIp(getRequestIp(req)) || 'no-ip';
  const rl = rateLimit(`settings:ip:${ipHash}`, 60, 60);
  if (rl.ok === false) {
    return NextResponse.json(
      { ok: false, error: { code: 'rate_limited', message: 'Slow down a touch.', retryAfterSec: rl.retryAfterSec } },
      { status: 429, headers: { 'retry-after': String(rl.retryAfterSec) } },
    );
  }

  try {
    const venueId = await getJukeboxVenueId();
    const sb = getServiceClient();
    const { data } = await sb
      .from('jukebox_public_settings')
      .select('*')
      .eq('venue_id', venueId)
      .maybeSingle();

    if (!data) {
      return NextResponse.json(
        { ok: false, error: { code: 'not_configured', message: 'Jukebox not configured.' } },
        { status: 404 },
      );
    }
    return NextResponse.json({ ok: true, data });
  } catch (e: unknown) {
    return NextResponse.json(
      { ok: false, error: { code: 'server_error', message: String(e) } },
      { status: 500 },
    );
  }
}

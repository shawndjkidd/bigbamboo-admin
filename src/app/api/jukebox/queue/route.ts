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
  const rl = rateLimit(`queue:ip:${ipHash}`, 60, 60);
  if (rl.ok === false) {
    return NextResponse.json(
      { ok: false, error: { code: 'rate_limited', message: 'Slow down.', retryAfterSec: rl.retryAfterSec } },
      { status: 429, headers: { 'retry-after': String(rl.retryAfterSec) } },
    );
  }

  const venueId = await getJukeboxVenueId();
  const sb = getServiceClient();
  const { data } = await sb
    .from('jukebox_public_queue')
    .select('*')
    .eq('venue_id', venueId)
    .order('approved_at', { ascending: true, nullsFirst: false });

  // Synthesize 1-based positions.
  const rows = (data || []).map((r, i) => ({ ...r, position: i + 1 }));
  return NextResponse.json({ ok: true, data: { queue: rows } });
}

import { NextRequest, NextResponse } from 'next/server';
import { getServiceClient } from '@/lib/supabase';
import { getJukeboxVenueId } from '@/lib/jukebox/venue';
import { requireStaff } from '@/lib/jukebox/auth';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

const VALID = new Set([
  'pending',
  'approved',
  'rejected',
  'queued',
  'played',
  'skipped',
  'removed',
  'failed',
  'expired',
]);

export async function GET(req: NextRequest) {
  const auth = await requireStaff(req);
  if ('error' in auth) return auth.error;

  const url = new URL(req.url);
  const statusParam = url.searchParams.get('status') || 'pending';
  const statuses = statusParam.split(',').map((s) => s.trim()).filter((s) => VALID.has(s));
  if (!statuses.length) {
    return NextResponse.json(
      { ok: false, error: { code: 'invalid_input', message: 'Invalid status filter.' } },
      { status: 400 },
    );
  }
  const limit = Math.min(parseInt(url.searchParams.get('limit') || '100', 10) || 100, 500);

  const venueId = await getJukeboxVenueId();
  const sb = getServiceClient();

  const { data, error } = await sb
    .from('jukebox_requests')
    .select('*')
    .eq('venue_id', venueId)
    .in('status', statuses)
    .order(statuses.includes('approved') || statuses.includes('queued') ? 'approved_at' : 'created_at', {
      ascending: statuses.includes('approved') || statuses.includes('queued'),
      nullsFirst: false,
    })
    .limit(limit);

  if (error) {
    return NextResponse.json(
      { ok: false, error: { code: 'server_error', message: error.message } },
      { status: 500 },
    );
  }
  return NextResponse.json({ ok: true, data: { requests: data || [] } });
}

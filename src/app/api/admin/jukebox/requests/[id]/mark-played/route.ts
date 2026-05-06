import { NextRequest, NextResponse } from 'next/server';
import { getServiceClient } from '@/lib/supabase';
import { requireStaff } from '@/lib/jukebox/auth';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

export async function POST(req: NextRequest, ctx: { params: { id: string } }) {
  const auth = await requireStaff(req);
  if ('error' in auth) return auth.error;

  const sb = getServiceClient();
  const { data: row } = await sb
    .from('jukebox_requests')
    .select('id, status')
    .eq('id', ctx.params.id)
    .maybeSingle();
  if (!row) {
    return NextResponse.json({ ok: false, error: { code: 'not_found', message: 'Request not found.' } }, { status: 404 });
  }
  if (!['approved', 'queued'].includes(row.status)) {
    return NextResponse.json(
      { ok: false, error: { code: 'state_conflict', message: `Cannot mark played a ${row.status} request.` } },
      { status: 409 },
    );
  }
  const { data, error } = await sb
    .from('jukebox_requests')
    .update({ status: 'played', played_at: new Date().toISOString() })
    .eq('id', ctx.params.id)
    .select('id, status, played_at')
    .single();
  if (error) {
    return NextResponse.json({ ok: false, error: { code: 'server_error', message: error.message } }, { status: 500 });
  }
  return NextResponse.json({ ok: true, data });
}

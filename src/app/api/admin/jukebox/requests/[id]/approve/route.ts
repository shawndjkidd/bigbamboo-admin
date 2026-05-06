import { NextRequest, NextResponse } from 'next/server';
import { getServiceClient } from '@/lib/supabase';
import { requireStaff } from '@/lib/jukebox/auth';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

export async function POST(req: NextRequest, ctx: { params: { id: string } }) {
  const auth = await requireStaff(req);
  if ('error' in auth) return auth.error;

  const { id } = ctx.params;
  const sb = getServiceClient();
  const { data: row } = await sb
    .from('jukebox_requests')
    .select('id, status')
    .eq('id', id)
    .maybeSingle();
  if (!row) {
    return NextResponse.json({ ok: false, error: { code: 'not_found', message: 'Request not found.' } }, { status: 404 });
  }
  if (row.status !== 'pending') {
    return NextResponse.json(
      { ok: false, error: { code: 'state_conflict', message: `Cannot approve a ${row.status} request.` } },
      { status: 409 },
    );
  }
  const { data, error } = await sb
    .from('jukebox_requests')
    .update({ status: 'approved', approved_at: new Date().toISOString() })
    .eq('id', id)
    .select('id, status, approved_at')
    .single();
  if (error) {
    return NextResponse.json({ ok: false, error: { code: 'server_error', message: error.message } }, { status: 500 });
  }
  return NextResponse.json({ ok: true, data });
}

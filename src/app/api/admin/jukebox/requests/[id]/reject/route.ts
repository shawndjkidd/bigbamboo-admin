import { NextRequest, NextResponse } from 'next/server';
import { getServiceClient } from '@/lib/supabase';
import { requireModerator } from '@/lib/jukebox/auth';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

export async function POST(req: NextRequest, ctx: { params: { id: string } }) {
  const auth = await requireModerator(req);
  if ('error' in auth) return auth.error;

  const { id } = ctx.params;
  let body: { reason?: string } = {};
  try { body = (await req.json()) as { reason?: string }; } catch { /* allow empty body */ }
  const reason = (body.reason || '').trim().slice(0, 200) || null;

  const sb = getServiceClient();
  const { data: row } = await sb
    .from('jukebox_requests')
    .select('id, status')
    .eq('id', id)
    .maybeSingle();
  if (!row) {
    return NextResponse.json({ ok: false, error: { code: 'not_found', message: 'Request not found.' } }, { status: 404 });
  }
  if (!['pending', 'approved'].includes(row.status)) {
    return NextResponse.json(
      { ok: false, error: { code: 'state_conflict', message: `Cannot reject a ${row.status} request.` } },
      { status: 409 },
    );
  }
  const { data, error } = await sb
    .from('jukebox_requests')
    .update({ status: 'rejected', rejection_reason: reason })
    .eq('id', id)
    .select('id, status, rejection_reason')
    .single();
  if (error) {
    return NextResponse.json({ ok: false, error: { code: 'server_error', message: error.message } }, { status: 500 });
  }
  return NextResponse.json({ ok: true, data });
}

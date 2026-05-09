import { NextRequest, NextResponse } from 'next/server';
import { getServiceClient } from '@/lib/supabase';
import { requireModerator } from '@/lib/jukebox/auth';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

export async function POST(req: NextRequest, ctx: { params: { id: string } }) {
  const auth = await requireModerator(req);
  if ('error' in auth) return auth.error;

  let body: { hidden?: boolean } = {};
  try { body = (await req.json()) as { hidden?: boolean }; } catch { /* default true */ }
  const hidden = body.hidden !== false; // default true

  const sb = getServiceClient();
  const { data, error } = await sb
    .from('jukebox_requests')
    .update({ requested_by_hidden: hidden })
    .eq('id', ctx.params.id)
    .select('id, requested_by_hidden')
    .single();
  if (error || !data) {
    return NextResponse.json(
      { ok: false, error: { code: error ? 'server_error' : 'not_found', message: error?.message || 'Request not found.' } },
      { status: error ? 500 : 404 },
    );
  }
  return NextResponse.json({ ok: true, data });
}

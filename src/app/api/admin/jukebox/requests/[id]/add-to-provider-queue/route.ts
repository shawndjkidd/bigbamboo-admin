// ═══════════════════════════════════════════════════════════════
//  Add an approved jukebox request to Spotify's playback queue.
//  On success: status 'approved' → 'queued', queued_at = now().
//  On no_active_device / token_invalid / not_premium: status stays
//  'approved' (so the row stays in the up-next list); provider_error
//  is set so the admin UI can surface the friendly message.
// ═══════════════════════════════════════════════════════════════

import { NextRequest, NextResponse } from 'next/server';
import { requireModerator } from '@/lib/jukebox/auth';
import { getProvider } from '@/lib/jukebox/providers';
import { getServiceClient } from '@/lib/supabase';
import { getJukeboxVenueId } from '@/lib/jukebox/venue';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

export async function POST(
  req: NextRequest,
  ctx: { params: { id: string } },
) {
  const auth = await requireModerator(req);
  if ('error' in auth) return auth.error;

  const sb = getServiceClient();
  const venueId = await getJukeboxVenueId();

  const { data: row } = await sb
    .from('jukebox_requests')
    .select('id, status, provider_track_id, provider, venue_id')
    .eq('id', ctx.params.id)
    .maybeSingle();
  if (!row) {
    return NextResponse.json(
      { ok: false, error: { code: 'not_found', message: 'Request not found.' } },
      { status: 404 },
    );
  }
  if (row.venue_id !== venueId) {
    return NextResponse.json(
      { ok: false, error: { code: 'forbidden', message: 'Wrong venue.' } },
      { status: 403 },
    );
  }
  if (row.status !== 'approved') {
    return NextResponse.json(
      {
        ok: false,
        error: {
          code: 'state_conflict',
          message: `Cannot add a ${row.status} request to the provider queue.`,
        },
      },
      { status: 409 },
    );
  }

  const provider = getProvider(row.provider || 'spotify', venueId);
  const result = await provider.addToQueue(row.provider_track_id);

  if ('error' in result) {
    // Persist the error so the admin UI can show a sticky indicator.
    await sb
      .from('jukebox_requests')
      .update({
        provider_queue_status: 'failed',
        provider_error: result.error.kind,
      })
      .eq('id', ctx.params.id);

    const httpStatus =
      result.error.kind === 'rate_limited'
        ? 429
        : result.error.kind === 'no_active_device' ||
            result.error.kind === 'not_premium' ||
            result.error.kind === 'product_restricted' ||
            result.error.kind === 'token_invalid' ||
            result.error.kind === 'token_expired'
          ? 400
          : 502;

    return NextResponse.json(
      { ok: false, error: { code: result.error.kind, meta: result.error } },
      { status: httpStatus },
    );
  }

  // Success — flip to queued.
  const nowIso = new Date().toISOString();
  const { data: updated, error } = await sb
    .from('jukebox_requests')
    .update({
      status: 'queued',
      queued_at: nowIso,
      provider_queue_status: 'queued',
      provider_error: null,
    })
    .eq('id', ctx.params.id)
    .select('id, status, queued_at, provider_queue_status')
    .single();

  if (error) {
    return NextResponse.json(
      { ok: false, error: { code: 'server_error', message: error.message } },
      { status: 500 },
    );
  }
  return NextResponse.json({ ok: true, data: updated });
}

import { NextRequest, NextResponse } from 'next/server';
import { getServiceClient } from '@/lib/supabase';
import { requireModerator } from '@/lib/jukebox/auth';
import { getProvider } from '@/lib/jukebox/providers';
import { getSpotifyAuthStatus } from '@/lib/jukebox/spotifyAuth';
import { getJukeboxVenueId } from '@/lib/jukebox/venue';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

/** Approve a pending request. If the venue's Spotify is connected, also push
 *  it to the Spotify queue in the same call — single click does the whole
 *  thing. On Spotify failure (no active device, etc.), status stays 'approved'
 *  with provider_error set so staff can retry from the Up Next tab.
 */
export async function POST(req: NextRequest, ctx: { params: { id: string } }) {
  const auth = await requireModerator(req);
  if ('error' in auth) return auth.error;

  const { id } = ctx.params;
  const sb = getServiceClient();

  const { data: row } = await sb
    .from('jukebox_requests')
    .select('id, status, provider, provider_track_id')
    .eq('id', id)
    .maybeSingle();
  if (!row) {
    return NextResponse.json(
      { ok: false, error: { code: 'not_found', message: 'Request not found.' } },
      { status: 404 },
    );
  }
  if (row.status !== 'pending') {
    return NextResponse.json(
      { ok: false, error: { code: 'state_conflict', message: `Cannot approve a ${row.status} request.` } },
      { status: 409 },
    );
  }

  const nowIso = new Date().toISOString();

  // 1. Mark approved first so the UI updates fast even if Spotify push lags.
  const { error: approveErr } = await sb
    .from('jukebox_requests')
    .update({ status: 'approved', approved_at: nowIso })
    .eq('id', id);
  if (approveErr) {
    return NextResponse.json(
      { ok: false, error: { code: 'server_error', message: approveErr.message } },
      { status: 500 },
    );
  }

  // 2. If Spotify is connected, push to the playback queue in the same click.
  const venueId = await getJukeboxVenueId();
  const status = await getSpotifyAuthStatus(venueId);
  if (status.isConnected) {
    const provider = getProvider(row.provider || 'spotify', venueId);
    const result = await provider.addToQueue(row.provider_track_id);
    if ('error' in result) {
      // Approved is still correct — operator can retry via "Add to Spotify
      // Queue" button on the Up Next tab. Surface the reason so the toast
      // tells the truth.
      await sb
        .from('jukebox_requests')
        .update({
          provider_queue_status: 'failed',
          provider_error: result.error.kind,
        })
        .eq('id', id);
      return NextResponse.json({
        ok: true,
        data: {
          id,
          status: 'approved',
          approved_at: nowIso,
          spotify: { ok: false, code: result.error.kind },
        },
      });
    }
    // Spotify push succeeded — flip to queued.
    const { data: queued } = await sb
      .from('jukebox_requests')
      .update({
        status: 'queued',
        queued_at: new Date().toISOString(),
        provider_queue_status: 'queued',
        provider_error: null,
      })
      .eq('id', id)
      .select('id, status, approved_at, queued_at')
      .single();
    return NextResponse.json({
      ok: true,
      data: { ...(queued || {}), spotify: { ok: true } },
    });
  }

  // Spotify not connected — approval alone is enough. Staff can manage
  // playback themselves until they connect Spotify.
  return NextResponse.json({
    ok: true,
    data: { id, status: 'approved', approved_at: nowIso, spotify: { ok: false, code: 'not_connected' } },
  });
}

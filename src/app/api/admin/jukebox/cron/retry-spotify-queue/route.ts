// Cron: retry autopilot Spotify-queue pushes that failed at request time.
// Called by Vercel Cron every minute (minimum interval). Each run retries
// up to 10 approved requests where provider_queue_status = 'failed'.
// Protected by CRON_SECRET so only Vercel can trigger it.

import { NextRequest, NextResponse } from 'next/server';
import { getServiceClient } from '@/lib/supabase';
import { getJukeboxVenueId } from '@/lib/jukebox/venue';
import { getSpotifyAuthStatus } from '@/lib/jukebox/spotifyAuth';
import { getProvider } from '@/lib/jukebox/providers';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

export async function POST(req: NextRequest) {
  const secret = process.env.CRON_SECRET;
  const authHeader = req.headers.get('authorization');
  if (secret && authHeader !== `Bearer ${secret}`) {
    return NextResponse.json({ ok: false, error: 'Unauthorized' }, { status: 401 });
  }

  const venueId = await getJukeboxVenueId();
  const sb = getServiceClient();

  // Only retry if venue is in autopilot mode and Spotify is connected.
  const { data: settingsRow } = await sb
    .from('jukebox_settings')
    .select('mode, is_active')
    .eq('venue_id', venueId)
    .maybeSingle();

  if (!settingsRow?.is_active || settingsRow.mode !== 'autopilot') {
    return NextResponse.json({ ok: true, skipped: true, reason: 'not autopilot' });
  }

  const spotifyStatus = await getSpotifyAuthStatus(venueId);
  if (!spotifyStatus.isConnected) {
    return NextResponse.json({ ok: true, skipped: true, reason: 'spotify not connected' });
  }

  const { data: failedRows } = await sb
    .from('jukebox_requests')
    .select('id, provider_track_id')
    .eq('venue_id', venueId)
    .eq('status', 'approved')
    .eq('provider_queue_status', 'failed')
    .order('approved_at', { ascending: true })
    .limit(10);

  if (!failedRows?.length) {
    return NextResponse.json({ ok: true, retried: 0 });
  }

  const provider = getProvider('spotify', venueId);
  let succeeded = 0;
  let failed = 0;
  const nowIso = new Date().toISOString();

  for (const row of failedRows) {
    const result = await provider.addToQueue(row.provider_track_id);
    if (!('error' in result)) {
      await sb
        .from('jukebox_requests')
        .update({
          status: 'queued',
          queued_at: nowIso,
          provider_queue_status: 'queued',
          provider_error: null,
        })
        .eq('id', row.id);
      succeeded++;
    } else {
      await sb
        .from('jukebox_requests')
        .update({ provider_error: result.error.kind })
        .eq('id', row.id);
      failed++;
    }
  }

  return NextResponse.json({ ok: true, retried: failedRows.length, succeeded, failed });
}

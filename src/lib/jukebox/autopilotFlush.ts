// ═══════════════════════════════════════════════════════════════
//  Autopilot self-healing flush
//  ───────────────────────────
//  When autopilot is on and a Spotify Connect device is unavailable
//  at the moment a request is approved, the request lands in the DB
//  with status='approved' and provider_queue_status='failed'
//  (typically provider_error='no_active_device'). Without this
//  helper, those rows sit there until a human retries — brutal
//  during a busy service.
//
//  This helper runs opportunistically from the public queue GET
//  endpoint (the kiosk polls it every ~12s). Each call:
//    1. Checks the venue is in autopilot mode.
//    2. Rate-limits per venue (one attempt every ~8 s) so a busy
//       kiosk + admin + guest pages don't slam Spotify.
//    3. Finds approved+failed rows (oldest first), caps at 3 per
//       tick to keep the queue GET response snappy.
//    4. Attempts provider.addToQueue on each. Success → 'queued'.
//       no_active_device → leave as-is for next tick.
//
//  No cron required; the kiosk itself drives recovery whenever a
//  Spotify device comes back online.
// ═══════════════════════════════════════════════════════════════

import { getServiceClient } from '@/lib/supabase';
import { getProvider } from './providers';

// venueId → next-allowed-tick timestamp (ms). In-memory; per warm lambda.
// If Vercel spawns multiple lambdas, some overlap is OK — the DB conditional
// updates (status = 'approved' filter) mean a lost race just no-ops.
const nextTickAt = new Map<string, number>();
const MIN_INTERVAL_MS = 8_000;
const MAX_PER_TICK = 3;

export async function autopilotFlushIfDue(venueId: string): Promise<void> {
  const now = Date.now();
  const due = nextTickAt.get(venueId) ?? 0;
  if (now < due) return;
  nextTickAt.set(venueId, now + MIN_INTERVAL_MS);

  const sb = getServiceClient();

  // Only run when the venue is actually in autopilot.
  const { data: settings } = await sb
    .from('jukebox_settings')
    .select('mode, is_active')
    .eq('venue_id', venueId)
    .maybeSingle();
  if (!settings || !settings.is_active || settings.mode !== 'autopilot') return;

  // Grab up to MAX_PER_TICK stuck rows, oldest first.
  const { data: stuck } = await sb
    .from('jukebox_requests')
    .select('id, provider, provider_track_id')
    .eq('venue_id', venueId)
    .eq('status', 'approved')
    .eq('provider_queue_status', 'failed')
    .order('approved_at', { ascending: true, nullsFirst: false })
    .limit(MAX_PER_TICK);

  if (!stuck || stuck.length === 0) return;

  // Try each in order. Bail on the whole batch as soon as we see another
  // no_active_device — no point burning API calls for the rest of the batch.
  for (const row of stuck) {
    const provider = getProvider(row.provider || 'spotify', venueId);
    const res = await provider.addToQueue(row.provider_track_id);
    if ('error' in res) {
      // Update the error kind (may have changed since last attempt) but leave
      // status='approved' so it re-attempts next tick.
      await sb
        .from('jukebox_requests')
        .update({ provider_error: res.error.kind })
        .eq('id', row.id);
      if (res.error.kind === 'no_active_device') break;
      // Other errors: keep going with the next row.
      continue;
    }
    await sb
      .from('jukebox_requests')
      .update({
        status: 'queued',
        queued_at: new Date().toISOString(),
        provider_queue_status: 'queued',
        provider_error: null,
      })
      .eq('id', row.id)
      .eq('status', 'approved'); // conditional: skip if a concurrent flush already promoted this row
  }
}

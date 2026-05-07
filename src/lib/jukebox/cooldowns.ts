// ═══════════════════════════════════════════════════════════════
//  Jukebox — cooldown + duplicate + capacity checks
// ═══════════════════════════════════════════════════════════════

import { getServiceClient } from '@/lib/supabase';
import type { JukeboxSettings } from './types';

export function normalizeName(s: string): string {
  return s
    .toLowerCase()
    .normalize('NFKD')
    .replace(/[̀-ͯ]/g, '') // strip diacritics
    .replace(/\s+/g, ' ')
    .trim();
}

export function formatMmSs(ms: number): string {
  const s = Math.max(0, Math.ceil(ms / 1000));
  const mm = Math.floor(s / 60).toString().padStart(2, '0');
  const ss = (s % 60).toString().padStart(2, '0');
  return `${mm}:${ss}`;
}

interface CtxIds {
  venueId: string;
  deviceId: string;
  ipHash: string | null;
  userId: string | null;
}

/** Returns ms remaining on the strictest matching cooldown; 0 if clear. */
export async function checkCooldown(
  ctx: CtxIds,
  settings: JukeboxSettings,
): Promise<number> {
  const now = Date.now();
  const guestWindowMs = settings.guest_cooldown_minutes * 60_000;
  const memberWindowMs = settings.member_cooldown_minutes * 60_000;
  const windowMs = ctx.userId ? memberWindowMs : guestWindowMs;

  const sb = getServiceClient();
  const sinceIso = new Date(now - windowMs).toISOString();

  // Look up the most recent successful-ish request per identifier.
  // 'rejected' / 'expired' don't count toward cooldown.
  // ip_hash intentionally excluded: at a venue everyone shares the same
  // public IP, so including it would block the whole room after one request.
  // ip_hash is still stored per-row for analytics/abuse detection.
  const ors: string[] = [`device_id.eq.${ctx.deviceId}`];
  if (ctx.userId) ors.push(`user_id.eq.${ctx.userId}`);

  const { data } = await sb
    .from('jukebox_requests')
    .select('created_at, device_id, ip_hash, user_id, status')
    .eq('venue_id', ctx.venueId)
    .gte('created_at', sinceIso)
    .or(ors.join(','))
    .in('status', ['pending', 'approved', 'queued', 'played']);

  if (!data || data.length === 0) return 0;

  // Strictest = max remaining ms across matching identifiers.
  let worst = 0;
  for (const row of data) {
    const created = new Date(row.created_at).getTime();
    const elapsed = now - created;
    const remaining = windowMs - elapsed;
    if (remaining > worst) worst = remaining;
  }
  return Math.max(0, worst);
}

/** True if the same track was requested within the duplicate window.
 *  Two queries (by provider_track_id, then by normalized name+artist) instead
 *  of a single .or() — keeps us safe from special characters in track names. */
export async function wasRecentlyRequested(
  venueId: string,
  trackNorm: string,
  artistNorm: string,
  providerTrackId: string,
  duplicateMinutes: number,
): Promise<boolean> {
  const sb = getServiceClient();
  const sinceIso = new Date(Date.now() - duplicateMinutes * 60_000).toISOString();
  const ACTIVE = ['pending', 'approved', 'queued', 'played'];

  const byId = await sb
    .from('jukebox_requests')
    .select('id', { count: 'exact', head: true })
    .eq('venue_id', venueId)
    .eq('provider_track_id', providerTrackId)
    .gte('created_at', sinceIso)
    .in('status', ACTIVE);
  if ((byId.count ?? 0) > 0) return true;

  if (!trackNorm || !artistNorm) return false;
  const byName = await sb
    .from('jukebox_requests')
    .select('id', { count: 'exact', head: true })
    .eq('venue_id', venueId)
    .eq('track_name_normalized', trackNorm)
    .eq('artist_name_normalized', artistNorm)
    .gte('created_at', sinceIso)
    .in('status', ACTIVE);
  return (byName.count ?? 0) > 0;
}

/** True if the artist is already in the upcoming queue (approved+queued). */
export async function artistAlreadyUpcoming(
  venueId: string,
  artistNorm: string,
  sameArtistMinutes: number,
): Promise<boolean> {
  const sb = getServiceClient();
  // Same-artist check is "in current upcoming queue OR approved within window"
  const sinceIso = new Date(Date.now() - sameArtistMinutes * 60_000).toISOString();
  const { count } = await sb
    .from('jukebox_requests')
    .select('id', { count: 'exact', head: true })
    .eq('venue_id', venueId)
    .eq('artist_name_normalized', artistNorm)
    .or(`status.eq.approved,status.eq.queued,and(status.eq.played,played_at.gte.${sinceIso})`);
  return (count ?? 0) > 0;
}

/** True if approved+queued >= max_queue_length. */
export async function queueAtCapacity(
  venueId: string,
  maxQueueLength: number,
): Promise<boolean> {
  const sb = getServiceClient();
  const { count } = await sb
    .from('jukebox_requests')
    .select('id', { count: 'exact', head: true })
    .eq('venue_id', venueId)
    .in('status', ['approved', 'queued']);
  return (count ?? 0) >= maxQueueLength;
}

/** True if (track, artist or track-id) is on the blocklist. */
export async function isBlocked(
  venueId: string,
  providerTrackId: string,
  artistIds: string[],
): Promise<boolean> {
  const sb = getServiceClient();
  const candidates: { type: string; provider_id: string }[] = [
    { type: 'track', provider_id: providerTrackId },
    ...artistIds.map((id) => ({ type: 'artist', provider_id: id })),
  ];
  if (candidates.length === 0) return false;

  // Build an OR over (type, provider_id) tuples
  const ors = candidates
    .map((c) => `and(type.eq.${c.type},provider_id.eq.${c.provider_id})`)
    .join(',');

  const { count } = await sb
    .from('jukebox_blocklist')
    .select('id', { count: 'exact', head: true })
    .eq('venue_id', venueId)
    .or(ors);
  return (count ?? 0) > 0;
}

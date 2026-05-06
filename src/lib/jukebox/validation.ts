// ═══════════════════════════════════════════════════════════════
//  Jukebox — request validation pipeline
//  Cheap checks first, network calls last. Order matters.
// ═══════════════════════════════════════════════════════════════

import { getServiceClient } from '@/lib/supabase';
import type { PlaybackProvider, Track } from './providers/types';
import type { JukeboxSettings, RejectionCode } from './types';
import {
  artistAlreadyUpcoming,
  checkCooldown,
  formatMmSs,
  isBlocked,
  normalizeName,
  queueAtCapacity,
  wasRecentlyRequested,
} from './cooldowns';

export interface ValidationContext {
  venueId: string;
  deviceId: string;
  ipHash: string | null;
  userId: string | null;
  provider: PlaybackProvider;
}

export interface RequestInput {
  providerTrackId: string;
  nickname: string;
}

export type ValidationResult =
  | { ok: true; track: Track; settings: JukeboxSettings }
  | {
      ok: false;
      code: RejectionCode;
      message: string;
      meta?: Record<string, unknown>;
    };

async function loadSettings(venueId: string): Promise<JukeboxSettings | null> {
  const sb = getServiceClient();
  const { data } = await sb
    .from('jukebox_settings')
    .select('*')
    .eq('venue_id', venueId)
    .maybeSingle();
  return (data as JukeboxSettings | null) ?? null;
}

function reject(
  code: RejectionCode,
  message: string,
  meta?: Record<string, unknown>,
): ValidationResult {
  return { ok: false, code, message, meta };
}

export async function validateRequest(
  input: RequestInput,
  ctx: ValidationContext,
): Promise<ValidationResult> {
  // 0. Settings exist?
  const settings = await loadSettings(ctx.venueId);
  if (!settings) {
    return reject('paused', 'Jukebox is not configured for this venue.');
  }

  // 1. Active?
  if (!settings.is_active) return reject('paused', 'The jukebox is paused right now.');

  // 2. Mode locked?
  if (settings.mode === 'locked') {
    return reject('locked', 'Requests are off right now.');
  }

  // 3. Track lookup
  const trackRes = await ctx.provider.getTrack(input.providerTrackId);
  if (trackRes.ok === false) {
    return reject('track_lookup', "We couldn't find that track. Try another.");
  }
  const track = trackRes.value;

  // 4. Length cap
  if (track.durationMs > settings.max_song_length_seconds * 1000) {
    return reject('too_long', 'This track is too long for regular jukebox mode.');
  }

  // 5. Explicit
  if (track.explicit && !settings.allow_explicit) {
    return reject('explicit', "Explicit tracks aren't allowed tonight.");
  }

  // 6. Blocklist
  const artistIds = (track.artists || []).map((a) => a.id).filter(Boolean);
  if (await isBlocked(ctx.venueId, track.id, artistIds)) {
    return reject('blocklisted', 'This song is blocked tonight.');
  }

  // 7. Cooldown (strictest of device / ip / user)
  const cdMs = await checkCooldown(
    {
      venueId: ctx.venueId,
      deviceId: ctx.deviceId,
      ipHash: ctx.ipHash,
      userId: ctx.userId,
    },
    settings,
  );
  if (cdMs > 0) {
    const mmss = formatMmSs(cdMs);
    return reject(
      'cooldown',
      `You're still cooling down. Next request available in ${mmss}.`,
      { mmss, retryAfterSec: Math.ceil(cdMs / 1000) },
    );
  }

  // 8. Duplicate (normalized)
  const trackNorm = normalizeName(track.name);
  const primaryArtist = track.artists?.[0]?.name || '';
  const artistNorm = normalizeName(primaryArtist);
  if (
    await wasRecentlyRequested(
      ctx.venueId,
      trackNorm,
      artistNorm,
      track.id,
      settings.duplicate_cooldown_minutes,
    )
  ) {
    return reject('duplicate', 'This song was already requested recently.');
  }

  // 9. Same artist already coming up
  if (await artistAlreadyUpcoming(ctx.venueId, artistNorm, settings.same_artist_cooldown_minutes)) {
    return reject('same_artist', 'We already have this artist coming up. Try another track.');
  }

  // 10. Queue capacity
  if (await queueAtCapacity(ctx.venueId, settings.max_queue_length)) {
    return reject('queue_full', 'Queue is full right now. Try again in a few minutes.');
  }

  return { ok: true, track, settings };
}

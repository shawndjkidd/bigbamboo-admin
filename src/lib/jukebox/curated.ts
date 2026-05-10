// ═══════════════════════════════════════════════════════════════
//  Jukebox — Curated playlist mode
//  When enabled, only tracks in the configured Spotify playlist
//  can be searched / requested. The playlist is cached locally
//  in jukebox_curated_tracks; refreshes on demand + on a 5-minute
//  TTL whenever a search runs.
// ═══════════════════════════════════════════════════════════════

import { getServiceClient } from '@/lib/supabase';
import { normalizeName } from './cooldowns';
import { getProvider } from './providers';
import type { Track } from './providers/types';

const SYNC_TTL_MS = 5 * 60 * 1000; // 5 minutes

export interface CuratedSettings {
  curated_mode_enabled: boolean;
  curated_playlist_url: string | null;
  curated_playlist_id: string | null;
  curated_playlist_name: string | null;
  curated_playlist_owner: string | null;
  curated_playlist_image_url: string | null;
  curated_playlist_track_count: number;
  curated_playlist_synced_at: string | null;
  curated_playlist_error: string | null;
}

/** Parse a Spotify playlist URL or URI into the bare playlist ID.
 *  Accepts:
 *    https://open.spotify.com/playlist/37i9dQZF1DXcBWIGoYBM5M[?si=...]
 *    spotify:playlist:37i9dQZF1DXcBWIGoYBM5M
 *    37i9dQZF1DXcBWIGoYBM5M
 */
export function extractPlaylistId(input: string): string | null {
  if (!input) return null;
  const trimmed = input.trim();

  // Bare ID (alphanumeric, length ~22)
  if (/^[A-Za-z0-9]{16,40}$/.test(trimmed)) return trimmed;

  // Spotify URI
  const uriMatch = trimmed.match(/^spotify:playlist:([A-Za-z0-9]{16,40})/);
  if (uriMatch) return uriMatch[1]!;

  // Web URL
  const urlMatch = trimmed.match(/playlist\/([A-Za-z0-9]{16,40})/);
  if (urlMatch) return urlMatch[1]!;

  return null;
}

export async function getCuratedSettings(venueId: string): Promise<CuratedSettings | null> {
  const sb = getServiceClient();
  const { data } = await sb
    .from('jukebox_settings')
    .select(
      'curated_mode_enabled, curated_playlist_url, curated_playlist_id, curated_playlist_name, curated_playlist_owner, curated_playlist_image_url, curated_playlist_track_count, curated_playlist_synced_at, curated_playlist_error',
    )
    .eq('venue_id', venueId)
    .maybeSingle();
  return (data as CuratedSettings | null) ?? null;
}

/** True if the cache was synced within SYNC_TTL_MS. */
export function isCacheFresh(syncedAtIso: string | null): boolean {
  if (!syncedAtIso) return false;
  const age = Date.now() - new Date(syncedAtIso).getTime();
  return age < SYNC_TTL_MS;
}

/** Pull the playlist from Spotify and replace the local cache.
 *  Returns the count of cached tracks on success, or an error message. */
export async function syncCuratedPlaylist(
  venueId: string,
  playlistId: string,
): Promise<{ ok: true; count: number; meta: { name: string; owner: string; image: string | null } } | { ok: false; error: string }> {
  const provider = getProvider('spotify', venueId);
  if (!('getPlaylistTracks' in provider)) {
    return { ok: false, error: 'provider_no_playlist_support' };
  }

  const result = await provider.getPlaylistTracks(playlistId);
  if (result.ok === false) {
    return { ok: false, error: `spotify_${result.error.kind}` };
  }
  const { tracks, meta } = result.value;

  const sb = getServiceClient();
  const nowIso = new Date().toISOString();

  // Replace cache: delete all existing rows for this venue, insert fresh.
  const del = await sb.from('jukebox_curated_tracks').delete().eq('venue_id', venueId);
  if (del.error) return { ok: false, error: del.error.message };

  if (tracks.length > 0) {
    const rows = tracks.map((t, i) => ({
      venue_id: venueId,
      provider: 'spotify',
      provider_track_id: t.id,
      spotify_track_id: t.id,
      track_name: t.name,
      track_name_normalized: normalizeName(t.name),
      artist_name: t.artists?.[0]?.name || '',
      artist_name_normalized: normalizeName(t.artists?.[0]?.name || ''),
      artist_ids: t.artists?.map((a) => a.id) || [],
      album_name: t.album?.name || null,
      album_art_url: t.album?.artUrl || null,
      duration_ms: t.durationMs,
      explicit: t.explicit,
      position: i,
    }));
    // Insert in chunks to avoid hitting payload limits.
    const CHUNK = 200;
    for (let i = 0; i < rows.length; i += CHUNK) {
      const slice = rows.slice(i, i + CHUNK);
      const ins = await sb.from('jukebox_curated_tracks').insert(slice);
      if (ins.error) return { ok: false, error: ins.error.message };
    }
  }

  // Update settings with the fresh metadata.
  await sb
    .from('jukebox_settings')
    .update({
      curated_playlist_id: playlistId,
      curated_playlist_name: meta.name,
      curated_playlist_owner: meta.owner,
      curated_playlist_image_url: meta.image,
      curated_playlist_track_count: tracks.length,
      curated_playlist_synced_at: nowIso,
      curated_playlist_error: null,
    })
    .eq('venue_id', venueId);

  return { ok: true, count: tracks.length, meta };
}

/** Lazy sync: if the cache is stale, refresh in the background. Non-blocking. */
export async function ensureCuratedFresh(venueId: string): Promise<void> {
  const settings = await getCuratedSettings(venueId);
  if (!settings || !settings.curated_mode_enabled || !settings.curated_playlist_id) return;
  if (isCacheFresh(settings.curated_playlist_synced_at)) return;
  // Fire and forget — don't block the search response on a network call.
  void syncCuratedPlaylist(venueId, settings.curated_playlist_id).catch((e) => {
    console.error('[curated] background sync failed', e);
  });
}

/** Search the local curated cache. Returns Track shape. */
export async function searchCuratedTracks(
  venueId: string,
  query: string,
  limit = 12,
): Promise<Track[]> {
  const q = (query || '').trim();
  if (!q) return [];
  const qNorm = normalizeName(q);

  const sb = getServiceClient();
  // Pull all tracks for the venue (typical playlist <500, fits easily).
  const { data } = await sb
    .from('jukebox_curated_tracks')
    .select(
      'provider_track_id, track_name, track_name_normalized, artist_name, artist_name_normalized, artist_ids, album_name, album_art_url, duration_ms, explicit',
    )
    .eq('venue_id', venueId)
    .order('position', { ascending: true });

  if (!data) return [];

  const tokens = qNorm.split(/\s+/).filter(Boolean);
  if (tokens.length === 0) return [];

  type Row = (typeof data)[number];
  const scored: { row: Row; score: number }[] = [];

  for (const row of data) {
    const haystack = `${row.track_name_normalized} ${row.artist_name_normalized}`;
    let allHit = true;
    let score = 0;
    for (const t of tokens) {
      const idx = haystack.indexOf(t);
      if (idx < 0) {
        allHit = false;
        break;
      }
      // Earlier match in track name = higher score
      score += 100 - Math.min(idx, 100);
    }
    if (allHit) scored.push({ row, score });
  }

  scored.sort((a, b) => b.score - a.score);

  return scored.slice(0, limit).map(({ row }) => ({
    id: row.provider_track_id,
    name: row.track_name,
    artists: [{ id: '', name: row.artist_name }],
    album: { name: row.album_name || '', artUrl: row.album_art_url },
    durationMs: row.duration_ms,
    explicit: row.explicit,
  }));
}

/** Membership check: is this provider_track_id in the curated cache? */
export async function isTrackInCurated(
  venueId: string,
  providerTrackId: string,
): Promise<boolean> {
  const sb = getServiceClient();
  const { count } = await sb
    .from('jukebox_curated_tracks')
    .select('id', { count: 'exact', head: true })
    .eq('venue_id', venueId)
    .eq('provider_track_id', providerTrackId);
  return (count ?? 0) > 0;
}

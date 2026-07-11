// ═══════════════════════════════════════════════════════════════
//  Artist genre fetcher — calls Spotify /v1/artists/{id} and caches
//  results in jukebox_artist_genre_cache for 24 h.
// ═══════════════════════════════════════════════════════════════

import { getServiceClient } from '@/lib/supabase';
import { getValidAccessToken } from './spotifyAuth';

const CACHE_TTL_HOURS = 24;

export async function getArtistGenres(
  venueId: string,
  artistId: string,
): Promise<string[]> {
  if (!artistId) return [];

  const sb = getServiceClient();

  // Check cache first.
  const cutoff = new Date(Date.now() - CACHE_TTL_HOURS * 60 * 60 * 1000).toISOString();
  const { data: cached } = await sb
    .from('jukebox_artist_genre_cache')
    .select('genres')
    .eq('spotify_artist_id', artistId)
    .gt('created_at', cutoff)
    .maybeSingle();

  if (cached) {
    return (cached.genres as string[]) ?? [];
  }

  // Not cached — fetch from Spotify.
  const token = await getValidAccessToken(venueId);
  if (!token) return [];

  let genres: string[] = [];
  try {
    const res = await fetch(`https://api.spotify.com/v1/artists/${encodeURIComponent(artistId)}`, {
      headers: { Authorization: `Bearer ${token}` },
    });
    if (res.ok) {
      const body = (await res.json()) as { genres?: string[] };
      genres = body.genres ?? [];
    }
  } catch {
    return [];
  }

  // Write to cache (upsert so a concurrent request doesn't race-write duplicates).
  await sb
    .from('jukebox_artist_genre_cache')
    .upsert(
      { spotify_artist_id: artistId, genres, created_at: new Date().toISOString() },
      { onConflict: 'spotify_artist_id' },
    );

  return genres;
}

export function isGenreBlocked(artistGenres: string[], blockedGenres: string[]): boolean {
  if (!blockedGenres.length || !artistGenres.length) return false;
  const lower = artistGenres.map((g) => g.toLowerCase());
  return blockedGenres.some((blocked) =>
    lower.some((g) => g.includes(blocked.toLowerCase())),
  );
}

/**
 * Genre allowlist check. Returns true if the request should be ALLOWED, false
 * if it should be rejected.
 *
 * Behavior:
 *   - empty allowlist → feature off, everything passes (returns true)
 *   - non-empty allowlist + artist has no genres → reject (returns false)
 *     Reason: allowlist is strict. If we can't classify the artist, we can't
 *     confirm they fit the venue's musical brief tonight.
 *   - non-empty allowlist + artist has genres → substring match, any hit wins.
 *     e.g. allowedGenres ['country'] passes 'contemporary country', 'outlaw
 *     country', 'country rock'. Case-insensitive.
 */
export function isGenreAllowed(artistGenres: string[], allowedGenres: string[]): boolean {
  if (!allowedGenres.length) return true;              // feature off
  if (!artistGenres.length) return false;              // unclassified → strict reject
  const lower = artistGenres.map((g) => g.toLowerCase());
  return allowedGenres.some((allowed) =>
    lower.some((g) => g.includes(allowed.toLowerCase())),
  );
}

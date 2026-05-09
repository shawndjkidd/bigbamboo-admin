// ═══════════════════════════════════════════════════════════════
//  Jukebox — provider factory
//  Cache by (kind, venueId) so each venue's Spotify provider keeps
//  its own per-instance state (search cache, etc) and routes pass
//  the right venue context to user-scoped Spotify calls.
//  Single-tenant today: venueId defaults to 'default' and there's
//  one entry. Multi-tenant later: cache holds one entry per venue.
// ═══════════════════════════════════════════════════════════════

import { ManualProvider } from './manual';
import { SpotifyProvider } from './spotify';
import type { PlaybackProvider } from './types';

const cache = new Map<string, PlaybackProvider>();

export function getProvider(kind = 'spotify', venueId?: string): PlaybackProvider {
  const v = venueId || 'default';
  const key = `${kind}|${v}`;
  const existing = cache.get(key);
  if (existing) return existing;
  const inst: PlaybackProvider =
    kind === 'manual' ? new ManualProvider() : new SpotifyProvider(v);
  cache.set(key, inst);
  return inst;
}

export type { PlaybackProvider } from './types';

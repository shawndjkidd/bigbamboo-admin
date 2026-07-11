// ═══════════════════════════════════════════════════════════════
//  Jukebox — playback provider abstraction
//  The DB owns the queue; providers are I/O for search and
//  (Phase 2) for pushing tracks to the venue's playback device.
// ═══════════════════════════════════════════════════════════════

export interface Track {
  id: string;
  name: string;
  artists: { id: string; name: string }[];
  album: { name: string; artUrl: string | null };
  durationMs: number;
  explicit: boolean;
  externalUrl?: string;
}

export interface NowPlaying {
  track: Track;
  isPlaying: boolean;
  progressMs: number;
  device?: { id: string; name: string; type: string };
}

export type ProviderError =
  | { kind: 'no_active_device' }
  | { kind: 'token_expired' }
  | { kind: 'token_invalid' }
  | { kind: 'missing_permissions'; scope?: string }
  | { kind: 'rate_limited'; retryAfterSec?: number }
  | { kind: 'track_unavailable' }
  | { kind: 'not_premium' }
  | { kind: 'product_restricted' }
  | { kind: 'network_error'; message: string }
  | { kind: 'unknown'; message: string };

export type ProviderResult<T> =
  | { ok: true; value: T }
  | { ok: false; error: ProviderError };

export interface PlaylistMeta {
  name: string;
  owner: string;
  image: string | null;
  trackCount: number;
}

export interface PlaylistFetchResult {
  tracks: Track[];
  meta: { name: string; owner: string; image: string | null };
}

export interface PlaybackProvider {
  searchTracks(
    query: string,
    opts?: { limit?: number; market?: string; offset?: number },
  ): Promise<ProviderResult<Track[]>>;
  getTrack(trackId: string): Promise<ProviderResult<Track>>;
  addToQueue(trackId: string): Promise<ProviderResult<void>>;
  getNowPlaying(): Promise<ProviderResult<NowPlaying | null>>;
  getAvailableDevices(): Promise<
    ProviderResult<{ id: string; name: string; isActive: boolean }[]>
  >;
  isConnected(): Promise<boolean>;
  refreshAuthIfNeeded(): Promise<ProviderResult<void>>;
  /** Fetch metadata only (name, owner, image, total track count) — one API call. */
  getPlaylistMeta(playlistId: string): Promise<ProviderResult<PlaylistMeta>>;
  /** Fetch all tracks of a public playlist (paginated internally). */
  getPlaylistTracks(playlistId: string): Promise<ProviderResult<PlaylistFetchResult>>;
}

// ═══════════════════════════════════════════════════════════════
//  Jukebox — Manual provider
//  No external service. Search/getTrack are unsupported (the UI
//  shouldn't expose a search box when this provider is selected).
//  addToQueue is a no-op success — staff queue songs themselves.
// ═══════════════════════════════════════════════════════════════

import type {
  NowPlaying,
  PlaybackProvider,
  PlaylistFetchResult,
  PlaylistMeta,
  ProviderResult,
  Track,
} from './types';

export class ManualProvider implements PlaybackProvider {
  async searchTracks(): Promise<ProviderResult<Track[]>> {
    return {
      ok: false,
      error: { kind: 'unknown', message: 'manual provider has no search' },
    };
  }
  async getTrack(): Promise<ProviderResult<Track>> {
    return {
      ok: false,
      error: { kind: 'unknown', message: 'manual provider has no track lookup' },
    };
  }
  async addToQueue(): Promise<ProviderResult<void>> {
    return { ok: true, value: undefined };
  }
  async getNowPlaying(): Promise<ProviderResult<NowPlaying | null>> {
    return { ok: true, value: null };
  }
  async getAvailableDevices(): Promise<
    ProviderResult<{ id: string; name: string; isActive: boolean }[]>
  > {
    return { ok: true, value: [] };
  }
  async isConnected(): Promise<boolean> {
    return true;
  }
  async refreshAuthIfNeeded(): Promise<ProviderResult<void>> {
    return { ok: true, value: undefined };
  }
  async getPlaylistTracks(): Promise<ProviderResult<PlaylistFetchResult>> {
    return {
      ok: false,
      error: { kind: 'unknown', message: 'manual provider has no playlist support' },
    };
  }
  async getPlaylistMeta(): Promise<ProviderResult<PlaylistMeta>> {
    return {
      ok: false,
      error: { kind: 'unknown', message: 'manual provider has no playlist support' },
    };
  }
}

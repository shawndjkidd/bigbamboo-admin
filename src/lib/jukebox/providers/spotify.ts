// ═══════════════════════════════════════════════════════════════
//  Jukebox — Spotify provider
//  Phase 1: searchTracks + getTrack via Client Credentials flow.
//  Phase 2: addToQueue / getNowPlaying / getAvailableDevices via
//           Authorization Code + PKCE per-venue tokens (stubbed
//           with token_invalid until OAuth lands).
// ═══════════════════════════════════════════════════════════════

import type {
  NowPlaying,
  PlaybackProvider,
  ProviderError,
  ProviderResult,
  Track,
} from './types';

const SPOTIFY_API = 'https://api.spotify.com/v1';
const SPOTIFY_TOKEN = 'https://accounts.spotify.com/api/token';

// ── App token cache (Client Credentials) ───────────────────────
interface AppToken {
  token: string;
  expiresAt: number; // epoch ms
}
let appTokenCache: AppToken | null = null;

async function getAppToken(): Promise<ProviderResult<string>> {
  if (appTokenCache && appTokenCache.expiresAt > Date.now() + 30_000) {
    return { ok: true, value: appTokenCache.token };
  }
  const id = process.env.SPOTIFY_CLIENT_ID || '';
  const secret = process.env.SPOTIFY_CLIENT_SECRET || '';
  if (!id || !secret) {
    return {
      ok: false,
      error: { kind: 'missing_permissions', scope: 'client_credentials' },
    };
  }
  const basic = Buffer.from(`${id}:${secret}`).toString('base64');
  let res: Response;
  try {
    res = await fetch(SPOTIFY_TOKEN, {
      method: 'POST',
      headers: {
        Authorization: `Basic ${basic}`,
        'Content-Type': 'application/x-www-form-urlencoded',
      },
      body: 'grant_type=client_credentials',
      cache: 'no-store',
    });
  } catch (e: unknown) {
    return { ok: false, error: { kind: 'network_error', message: String(e) } };
  }
  if (res.ok === false) {
    let body = '';
    try { body = (await res.text()).slice(0, 500); } catch {}
    console.error('[spotify.token] http', res.status, 'body:', body);
    if (res.status === 429) {
      const retry = Number(res.headers.get('retry-after')) || 30;
      return { ok: false, error: { kind: 'rate_limited', retryAfterSec: retry } };
    }
    return {
      ok: false,
      error: { kind: 'unknown', message: `token http ${res.status}` },
    };
  }
  const json = (await res.json()) as { access_token?: string; expires_in?: number };
  if (!json.access_token) {
    return { ok: false, error: { kind: 'unknown', message: 'no access_token' } };
  }
  appTokenCache = {
    token: json.access_token,
    expiresAt: Date.now() + (json.expires_in ?? 3600) * 1000,
  };
  return { ok: true, value: json.access_token };
}

// ── Search cache ───────────────────────────────────────────────
interface CacheEntry {
  tracks: Track[];
  expiresAt: number;
}
const searchCache = new Map<string, CacheEntry>();
const SEARCH_TTL_MS = 60_000;

function cacheKey(q: string, market: string): string {
  return `${market}|${q.toLowerCase().trim()}`;
}

// ── Mappers ────────────────────────────────────────────────────
interface SpotifyTrackJson {
  id: string;
  name: string;
  duration_ms: number;
  explicit: boolean;
  external_urls?: { spotify?: string };
  artists?: { id: string; name: string }[];
  album?: { name?: string; images?: { url: string; width?: number }[] };
}

function pickArt(images?: { url: string; width?: number }[]): string | null {
  if (!images || !images.length) return null;
  // Prefer ~300px image; fall back to the first.
  const sorted = [...images].sort(
    (a, b) => Math.abs((a.width ?? 0) - 300) - Math.abs((b.width ?? 0) - 300),
  );
  return sorted[0]?.url ?? images[0]?.url ?? null;
}

function mapTrack(t: SpotifyTrackJson): Track {
  return {
    id: t.id,
    name: t.name,
    artists: (t.artists || []).map((a) => ({ id: a.id, name: a.name })),
    album: {
      name: t.album?.name || '',
      artUrl: pickArt(t.album?.images),
    },
    durationMs: t.duration_ms,
    explicit: !!t.explicit,
    externalUrl: t.external_urls?.spotify,
  };
}

function mapHttpError(status: number, retryAfter?: string | null): ProviderError {
  if (status === 401 || status === 403) return { kind: 'token_invalid' };
  if (status === 429) {
    const r = Number(retryAfter || '30');
    return { kind: 'rate_limited', retryAfterSec: Number.isFinite(r) ? r : 30 };
  }
  if (status === 404) return { kind: 'track_unavailable' };
  return { kind: 'unknown', message: `http ${status}` };
}

// ── Provider ───────────────────────────────────────────────────
export class SpotifyProvider implements PlaybackProvider {
  async searchTracks(
    query: string,
    opts?: { limit?: number; market?: string },
  ): Promise<ProviderResult<Track[]>> {
    const q = (query || '').trim();
    if (!q) return { ok: true, value: [] };
    const market = opts?.market || 'VN';
    const limit = Math.min(Math.max(opts?.limit ?? 12, 1), 20);

    const key = cacheKey(q, market);
    const cached = searchCache.get(key);
    if (cached && cached.expiresAt > Date.now()) {
      return { ok: true, value: cached.tracks.slice(0, limit) };
    }

    const tok = await getAppToken();
    if (tok.ok === false) return { ok: false, error: tok.error };

    const url = `${SPOTIFY_API}/search?type=track&limit=${limit}&market=${encodeURIComponent(
      market,
    )}&q=${encodeURIComponent(q)}`;
    let res: Response;
    try {
      res = await fetch(url, {
        headers: { Authorization: `Bearer ${tok.value}` },
        cache: 'no-store',
      });
    } catch (e: unknown) {
      return { ok: false, error: { kind: 'network_error', message: String(e) } };
    }
    if (res.ok === false) {
      let body = '';
      try { body = (await res.text()).slice(0, 500); } catch {}
      console.error('[spotify.search] http', res.status, 'url:', url, 'body:', body);
      return { ok: false, error: mapHttpError(res.status, res.headers.get('retry-after')) };
    }
    const json = (await res.json()) as { tracks?: { items?: SpotifyTrackJson[] } };
    const items = (json.tracks?.items || []).map(mapTrack);
    searchCache.set(key, { tracks: items, expiresAt: Date.now() + SEARCH_TTL_MS });
    return { ok: true, value: items };
  }

  async getTrack(trackId: string): Promise<ProviderResult<Track>> {
    if (!trackId || !/^[a-zA-Z0-9]+$/.test(trackId)) {
      return { ok: false, error: { kind: 'track_unavailable' } };
    }
    const tok = await getAppToken();
    if (tok.ok === false) return { ok: false, error: tok.error };

    let res: Response;
    try {
      res = await fetch(`${SPOTIFY_API}/tracks/${trackId}?market=VN`, {
        headers: { Authorization: `Bearer ${tok.value}` },
        cache: 'no-store',
      });
    } catch (e: unknown) {
      return { ok: false, error: { kind: 'network_error', message: String(e) } };
    }
    if (res.ok === false) {
      let body = '';
      try { body = (await res.text()).slice(0, 500); } catch {}
      console.error('[spotify.getTrack] http', res.status, 'id:', trackId, 'body:', body);
      return { ok: false, error: mapHttpError(res.status, res.headers.get('retry-after')) };
    }
    const json = (await res.json()) as SpotifyTrackJson;
    if (!json?.id) return { ok: false, error: { kind: 'track_unavailable' } };
    return { ok: true, value: mapTrack(json) };
  }

  // ── Phase 2 stubs ─────────────────────────────────────────────
  async addToQueue(): Promise<ProviderResult<void>> {
    return { ok: false, error: { kind: 'token_invalid' } };
  }
  async getNowPlaying(): Promise<ProviderResult<NowPlaying | null>> {
    return { ok: false, error: { kind: 'token_invalid' } };
  }
  async getAvailableDevices(): Promise<
    ProviderResult<{ id: string; name: string; isActive: boolean }[]>
  > {
    return { ok: false, error: { kind: 'token_invalid' } };
  }
  async isConnected(): Promise<boolean> {
    return false;
  }
  async refreshAuthIfNeeded(): Promise<ProviderResult<void>> {
    return { ok: true, value: undefined };
  }
}

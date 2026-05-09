// ═══════════════════════════════════════════════════════════════
//  Jukebox — Spotify provider
//  Phase 1: searchTracks + getTrack + playlist metadata via
//           Client Credentials flow (no user auth).
//  Phase 2: addToQueue / getNowPlaying / getAvailableDevices via
//           Authorization Code + PKCE per-venue tokens, managed
//           by ../spotifyAuth.ts.
// ═══════════════════════════════════════════════════════════════

import type {
  NowPlaying,
  PlaybackProvider,
  PlaylistFetchResult,
  PlaylistMeta,
  ProviderError,
  ProviderResult,
  Track,
} from './types';
import { getSpotifyAuthStatus, getValidAccessToken } from '../spotifyAuth';

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
  if (!res.ok) {
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

/** Like mapHttpError but inspects the response body for the few cases
 *  Spotify only signals via the JSON payload — namely "no active device"
 *  (404 with a specific reason) and "not premium" (403 with PREMIUM_REQUIRED).
 *  Use for user-scoped endpoints (player/queue, player/currently-playing,
 *  player/devices). */
async function mapUserScopedError(res: Response): Promise<ProviderError> {
  let body = '';
  let parsed: { error?: { reason?: string; message?: string; status?: number } } = {};
  try {
    body = await res.text();
    if (body) parsed = JSON.parse(body);
  } catch {
    /* body wasn't JSON; fall through */
  }
  const reason = parsed.error?.reason || '';
  const message = parsed.error?.message || '';

  // Spotify error reasons we care about:
  //   NO_ACTIVE_DEVICE — needs Spotify open + playing somewhere
  //   PREMIUM_REQUIRED — account isn't Premium
  if (reason === 'NO_ACTIVE_DEVICE') return { kind: 'no_active_device' };
  if (reason === 'PREMIUM_REQUIRED') return { kind: 'not_premium' };
  if (/premium/i.test(message)) return { kind: 'not_premium' };
  if (res.status === 401) return { kind: 'token_expired' };
  if (res.status === 403) return { kind: 'token_invalid' };
  if (res.status === 404) {
    // 404 on /me/player/queue often means "no active device"; on /currently-playing
    // it means "nothing playing", which the caller handles before we get here.
    return { kind: 'no_active_device' };
  }
  if (res.status === 429) {
    const r = Number(res.headers.get('retry-after') || '30');
    return { kind: 'rate_limited', retryAfterSec: Number.isFinite(r) ? r : 30 };
  }
  console.error(
    '[spotify] user-scoped http',
    res.status,
    'reason:',
    reason,
    'body:',
    body.slice(0, 300),
  );
  return { kind: 'unknown', message: `http ${res.status}` };
}

// ── Provider ───────────────────────────────────────────────────
export class SpotifyProvider implements PlaybackProvider {
  /** venueId is needed for user-scoped calls (addToQueue, getNowPlaying, etc).
   *  Search and getTrack don't use it (Client Credentials flow). Defaults
   *  to 'default' so existing callers that pass no venueId still work. */
  constructor(private readonly venueId: string = 'default') {}

  async searchTracks(
    query: string,
    opts?: { limit?: number; market?: string },
  ): Promise<ProviderResult<Track[]>> {
    const q = (query || '').trim();
    if (!q) return { ok: true, value: [] };
    const market = opts?.market || 'VN';
    // Spotify rejects `limit=N` for some Development-mode apps with
    // {"error":{"status":400,"message":"Invalid limit"}} — let Spotify use
    // its default of 20 and clamp client-side instead.
    const cap = Math.min(Math.max(opts?.limit ?? 12, 1), 20);

    const key = cacheKey(q, market);
    const cached = searchCache.get(key);
    if (cached && cached.expiresAt > Date.now()) {
      return { ok: true, value: cached.tracks.slice(0, cap) };
    }

    const tok = await getAppToken();
    if (tok.ok === false) return { ok: false, error: tok.error };

    const url = `${SPOTIFY_API}/search?q=${encodeURIComponent(
      q,
    )}&type=track&market=${encodeURIComponent(market)}`;
    let res: Response;
    try {
      res = await fetch(url, {
        headers: { Authorization: `Bearer ${tok.value}` },
        cache: 'no-store',
      });
    } catch (e: unknown) {
      return { ok: false, error: { kind: 'network_error', message: String(e) } };
    }
    if (!res.ok) {
      // Log the actual Spotify error body so Vercel logs show the cause.
      let body = '';
      try { body = (await res.text()).slice(0, 500); } catch { /* ignore */ }
      console.error('[spotify.search] http', res.status, 'url:', url, 'body:', body);
      return { ok: false, error: mapHttpError(res.status, res.headers.get('retry-after')) };
    }
    const json = (await res.json()) as { tracks?: { items?: SpotifyTrackJson[] } };
    const items = (json.tracks?.items || []).map(mapTrack);
    searchCache.set(key, { tracks: items, expiresAt: Date.now() + SEARCH_TTL_MS });
    return { ok: true, value: items.slice(0, cap) };
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
    if (!res.ok) {
      return { ok: false, error: mapHttpError(res.status, res.headers.get('retry-after')) };
    }
    const json = (await res.json()) as SpotifyTrackJson;
    if (!json?.id) return { ok: false, error: { kind: 'track_unavailable' } };
    return { ok: true, value: mapTrack(json) };
  }

  /** Pick the best token for playlist endpoints. Prefer the venue's
   *  connected user token — it can read private playlists AND avoids
   *  the Spotify Development-Mode restrictions on Client Credentials.
   *  Fall back to Client Credentials so public playlists keep working
   *  before the venue connects Spotify. */
  private async getPlaylistAuthToken(): Promise<ProviderResult<string>> {
    const userTok = await getValidAccessToken(this.venueId);
    if (userTok.ok === true) return { ok: true, value: userTok.token };
    // Fallback: Client Credentials. Only public, non-editorial playlists.
    return await getAppToken();
  }

  // ── Playlist metadata (single cheap call) ────────────────────
  async getPlaylistMeta(playlistId: string): Promise<ProviderResult<PlaylistMeta>> {
    if (!playlistId || !/^[A-Za-z0-9]{16,40}$/.test(playlistId)) {
      return { ok: false, error: { kind: 'unknown', message: 'invalid playlist id' } };
    }
    const tok = await this.getPlaylistAuthToken();
    if (tok.ok === false) return { ok: false, error: tok.error };

    let res: Response;
    try {
      res = await fetch(
        `${SPOTIFY_API}/playlists/${playlistId}?fields=name,owner(display_name,id),images(url,width),tracks(total)`,
        {
          headers: { Authorization: `Bearer ${tok.value}` },
          cache: 'no-store',
        },
      );
    } catch (e: unknown) {
      return { ok: false, error: { kind: 'network_error', message: String(e) } };
    }
    if (!res.ok) {
      let body = '';
      try { body = (await res.text()).slice(0, 500); } catch { /* ignore */ }
      console.error('[spotify.getPlaylistMeta] http', res.status, 'id:', playlistId, 'body:', body);
      return { ok: false, error: mapHttpError(res.status, res.headers.get('retry-after')) };
    }
    const json = (await res.json()) as {
      name?: string;
      owner?: { display_name?: string; id?: string };
      images?: { url: string; width?: number }[];
      tracks?: { total?: number };
    };
    return {
      ok: true,
      value: {
        name: json.name || '(untitled)',
        owner: json.owner?.display_name || json.owner?.id || '',
        image: pickArt(json.images),
        trackCount: json.tracks?.total ?? 0,
      },
    };
  }

  // ── Curated playlist fetch — uses venue user token when connected ──
  async getPlaylistTracks(playlistId: string): Promise<ProviderResult<PlaylistFetchResult>> {
    if (!playlistId || !/^[A-Za-z0-9]{16,40}$/.test(playlistId)) {
      return { ok: false, error: { kind: 'unknown', message: 'invalid playlist id' } };
    }
    const tok = await this.getPlaylistAuthToken();
    if (tok.ok === false) return { ok: false, error: tok.error };

    // Fetch metadata first
    let metaRes: Response;
    try {
      metaRes = await fetch(
        `${SPOTIFY_API}/playlists/${playlistId}?fields=name,owner(display_name,id),images(url,width)`,
        {
          headers: { Authorization: `Bearer ${tok.value}` },
          cache: 'no-store',
        },
      );
    } catch (e: unknown) {
      return { ok: false, error: { kind: 'network_error', message: String(e) } };
    }
    if (!metaRes.ok) {
      let body = '';
      try { body = (await metaRes.text()).slice(0, 500); } catch { /* ignore */ }
      console.error('[spotify.getPlaylistTracks meta] http', metaRes.status, 'id:', playlistId, 'body:', body);
      return { ok: false, error: mapHttpError(metaRes.status, metaRes.headers.get('retry-after')) };
    }
    const metaJson = (await metaRes.json()) as {
      name?: string;
      owner?: { display_name?: string; id?: string };
      images?: { url: string; width?: number }[];
    };
    const name = metaJson.name || '(untitled)';
    const owner = metaJson.owner?.display_name || metaJson.owner?.id || '';
    const image = pickArt(metaJson.images);

    // Paginate through tracks
    const tracks: Track[] = [];
    let next: string | null =
      `${SPOTIFY_API}/playlists/${playlistId}/tracks?limit=100&market=VN&fields=next,items(track(id,name,duration_ms,explicit,external_urls,artists(id,name),album(name,images)))`;
    let safety = 50; // max 5,000 tracks
    while (next && safety-- > 0) {
      let pageRes: Response;
      try {
        pageRes = await fetch(next, {
          headers: { Authorization: `Bearer ${tok.value}` },
          cache: 'no-store',
        });
      } catch (e: unknown) {
        return { ok: false, error: { kind: 'network_error', message: String(e) } };
      }
      if (!pageRes.ok) {
        let body = '';
        try { body = (await pageRes.text()).slice(0, 500); } catch { /* ignore */ }
        console.error('[spotify.getPlaylistTracks page] http', pageRes.status, 'url:', next, 'body:', body);
        return { ok: false, error: mapHttpError(pageRes.status, pageRes.headers.get('retry-after')) };
      }
      const json = (await pageRes.json()) as {
        next: string | null;
        items?: { track: SpotifyTrackJson | null }[];
      };
      for (const item of json.items || []) {
        if (item.track && item.track.id) tracks.push(mapTrack(item.track));
      }
      next = json.next;
    }

    return { ok: true, value: { tracks, meta: { name, owner, image } } };
  }

  // ── Phase 2: user-scoped Spotify calls ────────────────────────

  /** Add a track to the venue's playback queue.
   *  Common failure: 'no_active_device' — Spotify needs SOMETHING
   *  playing on a device before queue adds work. The route surfaces
   *  this as a friendly "open Spotify and hit play" message. */
  async addToQueue(trackId: string): Promise<ProviderResult<void>> {
    if (!trackId || !/^[A-Za-z0-9]+$/.test(trackId)) {
      return { ok: false, error: { kind: 'track_unavailable' } };
    }
    const tok = await getValidAccessToken(this.venueId);
    if (tok.ok === false) return { ok: false, error: tok.error };

    const uri = `spotify:track:${trackId}`;
    const url = `${SPOTIFY_API}/me/player/queue?uri=${encodeURIComponent(uri)}`;
    let res: Response;
    try {
      res = await fetch(url, {
        method: 'POST',
        headers: { Authorization: `Bearer ${tok.token}` },
        cache: 'no-store',
      });
    } catch (e: unknown) {
      return { ok: false, error: { kind: 'network_error', message: String(e) } };
    }
    if (res.status === 204 || res.status === 200) {
      return { ok: true, value: undefined };
    }
    return { ok: false, error: await mapUserScopedError(res) };
  }

  async getNowPlaying(): Promise<ProviderResult<NowPlaying | null>> {
    const tok = await getValidAccessToken(this.venueId);
    if (tok.ok === false) return { ok: false, error: tok.error };

    let res: Response;
    try {
      res = await fetch(`${SPOTIFY_API}/me/player/currently-playing?market=VN`, {
        headers: { Authorization: `Bearer ${tok.token}` },
        cache: 'no-store',
      });
    } catch (e: unknown) {
      return { ok: false, error: { kind: 'network_error', message: String(e) } };
    }
    // 204 = nothing playing
    if (res.status === 204) return { ok: true, value: null };
    if (!res.ok) return { ok: false, error: await mapUserScopedError(res) };

    const json = (await res.json()) as {
      is_playing?: boolean;
      progress_ms?: number;
      item?: SpotifyTrackJson | null;
      device?: { id?: string; name?: string; type?: string };
    };
    if (!json.item) return { ok: true, value: null };
    return {
      ok: true,
      value: {
        track: mapTrack(json.item),
        isPlaying: !!json.is_playing,
        progressMs: json.progress_ms ?? 0,
        device:
          json.device && json.device.id
            ? {
                id: json.device.id,
                name: json.device.name || 'Unknown device',
                type: json.device.type || 'unknown',
              }
            : undefined,
      },
    };
  }

  async getAvailableDevices(): Promise<
    ProviderResult<{ id: string; name: string; isActive: boolean }[]>
  > {
    const tok = await getValidAccessToken(this.venueId);
    if (tok.ok === false) return { ok: false, error: tok.error };

    let res: Response;
    try {
      res = await fetch(`${SPOTIFY_API}/me/player/devices`, {
        headers: { Authorization: `Bearer ${tok.token}` },
        cache: 'no-store',
      });
    } catch (e: unknown) {
      return { ok: false, error: { kind: 'network_error', message: String(e) } };
    }
    if (!res.ok) return { ok: false, error: await mapUserScopedError(res) };
    const json = (await res.json()) as {
      devices?: { id?: string; name?: string; is_active?: boolean }[];
    };
    return {
      ok: true,
      value: (json.devices || [])
        .filter((d) => !!d.id)
        .map((d) => ({
          id: d.id!,
          name: d.name || 'Unknown device',
          isActive: !!d.is_active,
        })),
    };
  }

  async isConnected(): Promise<boolean> {
    const status = await getSpotifyAuthStatus(this.venueId);
    return status.isConnected;
  }

  /** Force a refresh if the access token is near-expiry. Used by the
   *  admin "Force token refresh" button. No-op if not connected. */
  async refreshAuthIfNeeded(): Promise<ProviderResult<void>> {
    console.log('[refreshAuthIfNeeded] entry venueId=' + this.venueId + ' (codes=' + Array.from(this.venueId).map(c => c.charCodeAt(0)).join(',') + ')');
    const status = await getSpotifyAuthStatus(this.venueId);
    console.log('[refreshAuthIfNeeded] status:', { isConnected: status.isConnected, providerUserId: status.providerUserId });
    if (!status.isConnected) {
      return { ok: false, error: { kind: 'token_invalid' } };
    }
    const tok = await getValidAccessToken(this.venueId);
    console.log('[refreshAuthIfNeeded] getValidAccessToken result:', tok.ok ? 'ok' : `error=${tok.error.kind}`);
    if (tok.ok === false) return { ok: false, error: tok.error };
    return { ok: true, value: undefined };
  }
}

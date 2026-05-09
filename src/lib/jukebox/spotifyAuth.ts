// ═══════════════════════════════════════════════════════════════
//  Jukebox — Spotify auth lifecycle (Phase 2)
//  The only module that touches jukebox_provider_auth.
//  Tokens are encrypted at rest with JUKEBOX_TOKEN_KEY (AES-256-GCM)
//  via crypto.ts. Plaintext tokens never leave this file or the
//  Spotify provider's HTTP layer; never log them.
// ═══════════════════════════════════════════════════════════════

import { getServiceClient } from '@/lib/supabase';
import { decryptToken, encryptToken } from './crypto';
import type { ProviderError } from './providers/types';

const SPOTIFY_TOKEN_URL = 'https://accounts.spotify.com/api/token';

// Refresh proactively if the access token expires within this window.
// 60s is enough to cover slow networks plus a single retry.
const REFRESH_BUFFER_MS = 60_000;

export interface VenueSpotifyAuth {
  isConnected: boolean;
  providerUserId: string | null;
  providerDisplayName: string | null;
  scopes: string[];
  expiresAt: Date | null;
}

/** Encrypt and persist Spotify credentials. Used by the OAuth callback
 *  (initial connect) and by getValidAccessToken (after refresh).
 *  Upserts on (venue_id, provider). If refreshToken is undefined we
 *  preserve whatever's already stored — Spotify may omit it on refresh. */
export async function storeSpotifyTokens(args: {
  venueId: string;
  accessToken: string;
  refreshToken?: string;
  expiresInSec: number;
  scopes?: string[];
  providerUserId?: string;
  providerDisplayName?: string;
}): Promise<void> {
  const sb = getServiceClient();
  const expiresAt = new Date(Date.now() + args.expiresInSec * 1000).toISOString();
  const nowIso = new Date().toISOString();

  const row: Record<string, unknown> = {
    venue_id: args.venueId,
    provider: 'spotify',
    access_token_encrypted: encryptToken(args.accessToken),
    token_expires_at: expiresAt,
    is_connected: true,
    updated_at: nowIso,
  };
  if (args.refreshToken) {
    row.refresh_token_encrypted = encryptToken(args.refreshToken);
  }
  if (args.scopes && args.scopes.length > 0) {
    row.scopes = args.scopes.join(' ');
  }
  if (args.providerUserId !== undefined) {
    row.provider_user_id = args.providerUserId;
  }
  if (args.providerDisplayName !== undefined) {
    row.provider_display_name = args.providerDisplayName;
  }

  console.log('[storeSpotifyTokens] upserting', {
    venue_id: args.venueId,
    has_access: !!args.accessToken,
    has_refresh: !!args.refreshToken,
    expires_in: args.expiresInSec,
    scopes: args.scopes,
    user_id: args.providerUserId,
    user_name: args.providerDisplayName,
  });
  const { data, error } = await sb
    .from('jukebox_provider_auth')
    .upsert(row, { onConflict: 'venue_id,provider' })
    .select('id, venue_id, is_connected, provider_user_id');
  if (error) {
    console.error('[storeSpotifyTokens] upsert error:', error.message, error);
    throw new Error(`storeSpotifyTokens: ${error.message}`);
  }
  console.log('[storeSpotifyTokens] upsert ok, returned rows:', data?.length, data);
}

/** Clear tokens; mark disconnected. Idempotent. */
export async function disconnectSpotify(venueId: string): Promise<void> {
  const sb = getServiceClient();
  await sb
    .from('jukebox_provider_auth')
    .update({
      access_token_encrypted: null,
      refresh_token_encrypted: null,
      token_expires_at: null,
      provider_user_id: null,
      provider_display_name: null,
      scopes: null,
      is_connected: false,
      updated_at: new Date().toISOString(),
    })
    .eq('venue_id', venueId)
    .eq('provider', 'spotify');
}

/** Read connection metadata only — no tokens. Safe to expose to admin UI. */
export async function getSpotifyAuthStatus(
  venueId: string,
): Promise<VenueSpotifyAuth> {
  const sb = getServiceClient();
  const { data } = await sb
    .from('jukebox_provider_auth')
    .select(
      'is_connected, provider_user_id, provider_display_name, scopes, token_expires_at',
    )
    .eq('venue_id', venueId)
    .eq('provider', 'spotify')
    .maybeSingle();

  if (!data) {
    return {
      isConnected: false,
      providerUserId: null,
      providerDisplayName: null,
      scopes: [],
      expiresAt: null,
    };
  }
  return {
    isConnected: !!data.is_connected,
    providerUserId: data.provider_user_id,
    providerDisplayName: data.provider_display_name,
    scopes: (data.scopes || '').split(/\s+/).filter(Boolean),
    expiresAt: data.token_expires_at ? new Date(data.token_expires_at) : null,
  };
}

/** Returns a valid access token. Refreshes if expired or near-expiry.
 *  Used by SpotifyProvider before any user-scoped Spotify API call.
 *
 *  Failure modes:
 *    - Not connected → token_invalid (admin must connect)
 *    - Refresh response 400/401 → token_invalid + auto-disconnect
 *      (refresh token is dead; admin must re-connect)
 *    - Refresh response 429 → rate_limited
 *    - Network/other → unknown / network_error */
export async function getValidAccessToken(
  venueId: string,
): Promise<{ ok: true; token: string } | { ok: false; error: ProviderError }> {
  const sb = getServiceClient();
  const { data } = await sb
    .from('jukebox_provider_auth')
    .select(
      'access_token_encrypted, refresh_token_encrypted, token_expires_at, is_connected',
    )
    .eq('venue_id', venueId)
    .eq('provider', 'spotify')
    .maybeSingle();

  if (!data || !data.is_connected) {
    return { ok: false, error: { kind: 'token_invalid' } };
  }

  const expiresAtMs = data.token_expires_at
    ? new Date(data.token_expires_at).getTime()
    : 0;
  const needsRefresh = expiresAtMs - Date.now() < REFRESH_BUFFER_MS;

  if (!needsRefresh && data.access_token_encrypted) {
    try {
      const tok = decryptToken(data.access_token_encrypted);
      return { ok: true, token: tok };
    } catch (e) {
      console.error('[spotifyAuth] decrypt access_token failed:', e);
      // fall through to refresh
    }
  }

  if (!data.refresh_token_encrypted) {
    return { ok: false, error: { kind: 'token_invalid' } };
  }

  let refreshToken: string;
  try {
    refreshToken = decryptToken(data.refresh_token_encrypted);
  } catch (e) {
    console.error('[spotifyAuth] decrypt refresh_token failed:', e);
    return { ok: false, error: { kind: 'token_invalid' } };
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
    res = await fetch(SPOTIFY_TOKEN_URL, {
      method: 'POST',
      headers: {
        Authorization: `Basic ${basic}`,
        'Content-Type': 'application/x-www-form-urlencoded',
      },
      body: new URLSearchParams({
        grant_type: 'refresh_token',
        refresh_token: refreshToken,
      }).toString(),
      cache: 'no-store',
    });
  } catch (e: unknown) {
    return { ok: false, error: { kind: 'network_error', message: String(e) } };
  }

  if (!res.ok) {
    if (res.status === 400 || res.status === 401) {
      // Refresh token is dead. Disconnect so admin must re-connect.
      await disconnectSpotify(venueId);
      return { ok: false, error: { kind: 'token_invalid' } };
    }
    if (res.status === 429) {
      const retry = Number(res.headers.get('retry-after')) || 30;
      return { ok: false, error: { kind: 'rate_limited', retryAfterSec: retry } };
    }
    let body = '';
    try {
      body = (await res.text()).slice(0, 500);
    } catch {
      /* ignore */
    }
    console.error('[spotifyAuth] refresh http', res.status, 'body:', body);
    return {
      ok: false,
      error: { kind: 'unknown', message: `refresh http ${res.status}` },
    };
  }

  const json = (await res.json()) as {
    access_token?: string;
    expires_in?: number;
    refresh_token?: string;
    scope?: string;
  };
  if (!json.access_token) {
    return {
      ok: false,
      error: { kind: 'unknown', message: 'no access_token in refresh response' },
    };
  }

  await storeSpotifyTokens({
    venueId,
    accessToken: json.access_token,
    refreshToken: json.refresh_token, // may be undefined; preserved if so
    expiresInSec: json.expires_in ?? 3600,
    scopes: json.scope ? json.scope.split(/\s+/).filter(Boolean) : undefined,
  });

  return { ok: true, token: json.access_token };
}

/** Exchange an OAuth authorization code for tokens, then store them.
 *  Used only by the /api/admin/jukebox/provider/spotify/callback route. */
export async function exchangeCodeAndStore(args: {
  venueId: string;
  code: string;
  codeVerifier: string;
  redirectUri: string;
}): Promise<
  | { ok: true; status: VenueSpotifyAuth }
  | { ok: false; error: string }
> {
  const id = process.env.SPOTIFY_CLIENT_ID || '';
  const secret = process.env.SPOTIFY_CLIENT_SECRET || '';
  if (!id || !secret) {
    return { ok: false, error: 'missing_client_credentials' };
  }
  const basic = Buffer.from(`${id}:${secret}`).toString('base64');

  let tokenRes: Response;
  try {
    tokenRes = await fetch(SPOTIFY_TOKEN_URL, {
      method: 'POST',
      headers: {
        Authorization: `Basic ${basic}`,
        'Content-Type': 'application/x-www-form-urlencoded',
      },
      body: new URLSearchParams({
        grant_type: 'authorization_code',
        code: args.code,
        redirect_uri: args.redirectUri,
        client_id: id,
        code_verifier: args.codeVerifier,
      }).toString(),
      cache: 'no-store',
    });
  } catch (e: unknown) {
    return { ok: false, error: `network_error: ${String(e)}` };
  }
  if (!tokenRes.ok) {
    let body = '';
    try {
      body = (await tokenRes.text()).slice(0, 500);
    } catch {
      /* ignore */
    }
    console.error('[spotifyAuth] code exchange http', tokenRes.status, 'body:', body);
    return { ok: false, error: `token_exchange_${tokenRes.status}` };
  }

  const tokenJson = (await tokenRes.json()) as {
    access_token?: string;
    refresh_token?: string;
    expires_in?: number;
    scope?: string;
  };
  if (!tokenJson.access_token || !tokenJson.refresh_token) {
    return { ok: false, error: 'incomplete_token_response' };
  }

  // Fetch /me to capture provider_user_id + display_name.
  let providerUserId: string | undefined;
  let providerDisplayName: string | undefined;
  try {
    const meRes = await fetch('https://api.spotify.com/v1/me', {
      headers: { Authorization: `Bearer ${tokenJson.access_token}` },
      cache: 'no-store',
    });
    if (meRes.ok) {
      const me = (await meRes.json()) as { id?: string; display_name?: string };
      providerUserId = me.id;
      providerDisplayName = me.display_name;
    }
  } catch (e) {
    console.error('[spotifyAuth] /me fetch failed:', e);
    // non-fatal — we can store without these
  }

  try {
    await storeSpotifyTokens({
      venueId: args.venueId,
      accessToken: tokenJson.access_token,
      refreshToken: tokenJson.refresh_token,
      expiresInSec: tokenJson.expires_in ?? 3600,
      scopes: tokenJson.scope ? tokenJson.scope.split(/\s+/).filter(Boolean) : undefined,
      providerUserId,
      providerDisplayName,
    });
  } catch (e: unknown) {
    console.error('[exchangeCodeAndStore] storeSpotifyTokens threw:', e);
    return { ok: false, error: `store_failed: ${String(e)}` };
  }

  const status = await getSpotifyAuthStatus(args.venueId);
  console.log('[exchangeCodeAndStore] post-store status:', {
    isConnected: status.isConnected,
    providerUserId: status.providerUserId,
    expiresAt: status.expiresAt?.toISOString(),
  });
  if (!status.isConnected) {
    return { ok: false, error: 'store_silently_failed' };
  }
  return { ok: true, status };
}

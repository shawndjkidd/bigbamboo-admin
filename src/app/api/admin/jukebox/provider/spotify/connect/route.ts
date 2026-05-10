// ═══════════════════════════════════════════════════════════════
//  Spotify OAuth — start
//  Generates state + PKCE verifier, stores both in a signed
//  httpOnly cookie, then redirects to Spotify's authorize page.
//  The callback verifies the state to defend against CSRF.
// ═══════════════════════════════════════════════════════════════

import { NextRequest, NextResponse } from 'next/server';
import { hasAdminRole, requireStaff } from '@/lib/jukebox/auth';
import {
  pkceChallenge,
  pkceVerifier,
  randomToken,
  signValue,
} from '@/lib/jukebox/crypto';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

const OAUTH_COOKIE = 'juke_oauth';
const OAUTH_TTL_SEC = 600; // 10 minutes
const SPOTIFY_AUTHORIZE = 'https://accounts.spotify.com/authorize';
const SCOPES = [
  'user-read-playback-state',
  'user-modify-playback-state',
  'user-read-currently-playing',
  'playlist-read-private',
  'playlist-read-collaborative',
];

export async function GET(req: NextRequest) {
  const auth = await requireStaff(req);
  if ('error' in auth) return auth.error;
  if (!hasAdminRole(auth.staff.role)) {
    return NextResponse.json(
      { ok: false, error: { code: 'forbidden', message: 'Admin role required.' } },
      { status: 403 },
    );
  }

  const clientId = process.env.SPOTIFY_CLIENT_ID || '';
  const redirectUri = process.env.SPOTIFY_REDIRECT_URI || '';
  if (!clientId || !redirectUri) {
    return NextResponse.json(
      {
        ok: false,
        error: {
          code: 'server_misconfigured',
          message:
            'SPOTIFY_CLIENT_ID and SPOTIFY_REDIRECT_URI must be set in environment.',
        },
      },
      { status: 500 },
    );
  }

  const state = randomToken(16);
  const verifier = pkceVerifier();
  const challenge = pkceChallenge(verifier);
  const cookiePayload = JSON.stringify({ state, verifier, ts: Date.now() });
  const signed = signValue(cookiePayload);

  const authorizeUrl = new URL(SPOTIFY_AUTHORIZE);
  authorizeUrl.searchParams.set('response_type', 'code');
  authorizeUrl.searchParams.set('client_id', clientId);
  authorizeUrl.searchParams.set('redirect_uri', redirectUri);
  authorizeUrl.searchParams.set('state', state);
  authorizeUrl.searchParams.set('code_challenge_method', 'S256');
  authorizeUrl.searchParams.set('code_challenge', challenge);
  authorizeUrl.searchParams.set('scope', SCOPES.join(' '));

  const res = NextResponse.redirect(authorizeUrl.toString());
  res.cookies.set(OAUTH_COOKIE, signed, {
    httpOnly: true,
    sameSite: 'lax',
    secure: process.env.NODE_ENV === 'production',
    path: '/api/admin/jukebox/provider/spotify',
    maxAge: OAUTH_TTL_SEC,
  });
  return res;
}

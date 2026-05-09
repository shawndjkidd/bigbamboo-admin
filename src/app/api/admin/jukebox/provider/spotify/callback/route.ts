// ═══════════════════════════════════════════════════════════════
//  Spotify OAuth — callback
//  Verifies state matches the signed cookie, exchanges the code
//  for tokens, stores them encrypted, then redirects to /jukebox/admin.
//  Staff must still be logged in — we don't trust the OAuth flow
//  alone to identify the venue.
// ═══════════════════════════════════════════════════════════════

import { NextRequest, NextResponse } from 'next/server';
import { hasAdminRole, requireStaff } from '@/lib/jukebox/auth';
import { verifySigned } from '@/lib/jukebox/crypto';
import { exchangeCodeAndStore } from '@/lib/jukebox/spotifyAuth';
import { getJukeboxVenueId } from '@/lib/jukebox/venue';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

const OAUTH_COOKIE = 'juke_oauth';
const COOKIE_TTL_MS = 10 * 60 * 1000;

function adminRedirect(req: NextRequest, qs: string): NextResponse {
  // Always redirect back to the SAME host the callback ran on (admin.*),
  // never to NEXT_PUBLIC_JUKEBOX_PUBLIC_URL — that's the guest subdomain
  // and the user's Supabase auth cookie isn't there.
  const origin = new URL(req.url).origin;
  return NextResponse.redirect(`${origin}/jukebox/admin?${qs}`);
}

export async function GET(req: NextRequest) {
  const auth = await requireStaff(req);
  if ('error' in auth) return auth.error;
  if (!hasAdminRole(auth.staff.role)) {
    return NextResponse.json(
      { ok: false, error: { code: 'forbidden', message: 'Admin role required.' } },
      { status: 403 },
    );
  }

  const url = new URL(req.url);
  const code = url.searchParams.get('code');
  const state = url.searchParams.get('state');
  const oauthError = url.searchParams.get('error');

  if (oauthError) {
    const res = adminRedirect(req, `spotify_error=${encodeURIComponent(oauthError)}`);
    res.cookies.delete(OAUTH_COOKIE);
    return res;
  }
  if (!code || !state) {
    const res = adminRedirect(req, 'spotify_error=missing_code_or_state');
    res.cookies.delete(OAUTH_COOKIE);
    return res;
  }

  const cookie = req.cookies.get(OAUTH_COOKIE)?.value;
  if (!cookie) {
    return adminRedirect(req, 'spotify_error=cookie_missing');
  }
  const verified = verifySigned(cookie);
  if (!verified) {
    return adminRedirect(req, 'spotify_error=cookie_invalid');
  }
  let payload: { state?: string; verifier?: string; ts?: number };
  try {
    payload = JSON.parse(verified);
  } catch {
    return adminRedirect(req, 'spotify_error=cookie_malformed');
  }
  if (
    !payload.state ||
    !payload.verifier ||
    !payload.ts ||
    Date.now() - payload.ts > COOKIE_TTL_MS
  ) {
    const res = adminRedirect(req, 'spotify_error=cookie_expired');
    res.cookies.delete(OAUTH_COOKIE);
    return res;
  }
  if (payload.state !== state) {
    const res = adminRedirect(req, 'spotify_error=state_mismatch');
    res.cookies.delete(OAUTH_COOKIE);
    return res;
  }

  const redirectUri = process.env.SPOTIFY_REDIRECT_URI || '';
  if (!redirectUri) {
    const res = adminRedirect(req, 'spotify_error=missing_redirect_uri');
    res.cookies.delete(OAUTH_COOKIE);
    return res;
  }

  const venueId = await getJukeboxVenueId();
  const result = await exchangeCodeAndStore({
    venueId,
    code,
    codeVerifier: payload.verifier,
    redirectUri,
  });

  let res: NextResponse;
  if ('error' in result) {
    res = adminRedirect(req, `spotify_error=${encodeURIComponent(result.error)}`);
  } else {
    res = adminRedirect(req, 'spotify_connected=1');
  }
  res.cookies.delete(OAUTH_COOKIE);
  return res;
}

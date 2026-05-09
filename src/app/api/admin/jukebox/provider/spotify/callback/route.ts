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

const ADMIN_BASE =
  process.env.NEXT_PUBLIC_JUKEBOX_PUBLIC_URL?.replace(/\/$/, '') ||
  process.env.APP_BASE_URL?.replace(/\/$/, '') ||
  '';

function adminRedirect(qs: string): NextResponse {
  // Build absolute URL if we have a base; otherwise fall back to a
  // relative redirect (works inside the same Vercel app).
  const target = ADMIN_BASE
    ? `${ADMIN_BASE}/jukebox/admin?${qs}`
    : `/jukebox/admin?${qs}`;
  return NextResponse.redirect(target);
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
    const res = adminRedirect(`spotify_error=${encodeURIComponent(oauthError)}`);
    res.cookies.delete(OAUTH_COOKIE);
    return res;
  }
  if (!code || !state) {
    const res = adminRedirect('spotify_error=missing_code_or_state');
    res.cookies.delete(OAUTH_COOKIE);
    return res;
  }

  const cookie = req.cookies.get(OAUTH_COOKIE)?.value;
  if (!cookie) {
    return adminRedirect('spotify_error=cookie_missing');
  }
  const verified = verifySigned(cookie);
  if (!verified) {
    return adminRedirect('spotify_error=cookie_invalid');
  }
  let payload: { state?: string; verifier?: string; ts?: number };
  try {
    payload = JSON.parse(verified);
  } catch {
    return adminRedirect('spotify_error=cookie_malformed');
  }
  if (
    !payload.state ||
    !payload.verifier ||
    !payload.ts ||
    Date.now() - payload.ts > COOKIE_TTL_MS
  ) {
    const res = adminRedirect('spotify_error=cookie_expired');
    res.cookies.delete(OAUTH_COOKIE);
    return res;
  }
  if (payload.state !== state) {
    const res = adminRedirect('spotify_error=state_mismatch');
    res.cookies.delete(OAUTH_COOKIE);
    return res;
  }

  const redirectUri = process.env.SPOTIFY_REDIRECT_URI || '';
  if (!redirectUri) {
    const res = adminRedirect('spotify_error=missing_redirect_uri');
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
    res = adminRedirect(`spotify_error=${encodeURIComponent(result.error)}`);
  } else {
    res = adminRedirect('spotify_connected=1');
  }
  res.cookies.delete(OAUTH_COOKIE);
  return res;
}

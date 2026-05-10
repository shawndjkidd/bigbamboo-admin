// ═══════════════════════════════════════════════════════════════
//  Jukebox — server-side admin auth
//  Verifies the Supabase access token from the Authorization
//  header (or sb-access-token cookie) and confirms a matching
//  active staff_users row. Returns either { staff } or a 401
//  NextResponse the caller can return directly.
// ═══════════════════════════════════════════════════════════════

import { NextResponse } from 'next/server';
import { createClient } from '@supabase/supabase-js';
import { getServiceClient } from '@/lib/supabase';

const SUPABASE_URL = process.env.NEXT_PUBLIC_SUPABASE_URL || '';
const SUPABASE_ANON = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY || '';

export interface StaffSession {
  id: string;
  email: string;
  role: 'super_admin' | 'admin' | 'manager' | 'staff' | 'scanner';
  venue_id: string | null;
}

function unauthorized(reason: string) {
  return NextResponse.json(
    { ok: false, error: { code: 'unauthorized', message: reason } },
    { status: 401 },
  );
}

/** Read JWT from Authorization: Bearer or any Supabase cookie format. */
function readJwt(req: Request): string | null {
  const auth = req.headers.get('authorization') || '';
  if (auth.toLowerCase().startsWith('bearer ')) {
    return auth.slice(7).trim() || null;
  }
  // Supabase SSR cookies. Modern @supabase/ssr stores the session in
  //   sb-<project-ref>-auth-token=<encoded>
  // where the value is either:
  //   - a URL-encoded JSON array [access_token, refresh_token, ...]
  //   - or 'base64-<base64-encoded JSON>' for newer chunked storage
  // Older clients use plain sb-access-token / supabase-auth-token. Try them all.
  const cookie = req.headers.get('cookie') || '';
  const m =
    cookie.match(/(?:^|;\s*)sb-[a-z0-9]+-auth-token=([^;]+)/i) ||
    cookie.match(/(?:^|;\s*)sb-access-token=([^;]+)/) ||
    cookie.match(/(?:^|;\s*)supabase-auth-token=([^;]+)/);
  if (!m || !m[1]) return null;

  let value: string;
  try {
    value = decodeURIComponent(m[1]);
  } catch {
    return null;
  }
  // base64- prefix means the rest is base64-encoded JSON.
  if (value.startsWith('base64-')) {
    try {
      value = Buffer.from(value.slice(7), 'base64').toString('utf8');
    } catch {
      return null;
    }
  }
  // JSON array form: first element is the access token.
  if (value.startsWith('[')) {
    try {
      const arr = JSON.parse(value);
      if (Array.isArray(arr) && typeof arr[0] === 'string') return arr[0];
    } catch {
      return null;
    }
  }
  // Object form: { access_token, refresh_token, ... }
  if (value.startsWith('{')) {
    try {
      const obj = JSON.parse(value);
      if (obj && typeof obj.access_token === 'string') return obj.access_token;
    } catch {
      return null;
    }
  }
  // Otherwise assume the cookie value is the raw JWT.
  return value;
}

export async function requireStaff(
  req: Request,
): Promise<{ staff: StaffSession } | { error: NextResponse }> {
  const jwt = readJwt(req);
  if (!jwt) return { error: unauthorized('missing token') };
  if (!SUPABASE_URL || !SUPABASE_ANON) return { error: unauthorized('server misconfigured') };

  // Verify the JWT against Supabase auth. The client must be created with
  // the project's anon key as the apikey — using the JWT here causes
  // auth.getUser() to fail with a 401 on every request.
  const verifier = createClient(SUPABASE_URL, SUPABASE_ANON, {
    auth: { persistSession: false, autoRefreshToken: false },
    global: {
      fetch: (input, init) => fetch(input, { ...init, cache: 'no-store' }),
    },
  });
  const { data: userRes, error: userErr } = await verifier.auth.getUser(jwt);
  if (userErr || !userRes?.user?.email) {
    console.error('[requireStaff] auth.getUser failed:', userErr?.message);
    return { error: unauthorized('invalid token') };
  }
  const email = userRes.user.email.toLowerCase();

  // Confirm staff_users row, active.
  // venue_id omitted — single-tenant schema doesn't have that column;
  // including it causes PostgREST to return null + error silently.
  const sb = getServiceClient();
  const { data: row, error: rowErr } = await sb
    .from('staff_users')
    .select('id, email, role, active')
    .ilike('email', email)
    .maybeSingle();

  if (rowErr) {
    console.error('[requireStaff] staff_users query error:', rowErr.message);
    return { error: unauthorized('staff lookup failed') };
  }
  if (!row || row.active === false) {
    return { error: unauthorized('not a staff user') };
  }

  return {
    staff: {
      id: row.id,
      email: row.email,
      role: row.role,
      venue_id: null,
    },
  };
}

/** Role gate — call after requireStaff. Privileged config (Spotify
 *  connect/disconnect, force token refresh, settings) requires this. */
export function hasAdminRole(role: StaffSession['role']): boolean {
  return role === 'super_admin' || role === 'admin' || role === 'manager';
}

/** Role gate for jukebox moderation actions (approve/reject/skip/etc).
 *  Bartenders (`staff`) should be able to moderate; only `scanner`
 *  (loyalty-card-only role) is excluded. */
export function canModerateJukebox(role: StaffSession['role']): boolean {
  return role !== 'scanner';
}

/** Convenience: `requireStaff` + `canModerateJukebox`. Use on mutating
 *  jukebox request and blocklist routes. Returns either { staff } or
 *  { error: NextResponse } the caller can return directly. */
export async function requireModerator(
  req: Request,
): Promise<{ staff: StaffSession } | { error: NextResponse }> {
  const auth = await requireStaff(req);
  if ('error' in auth) return auth;
  if (!canModerateJukebox(auth.staff.role)) {
    return {
      error: NextResponse.json(
        {
          ok: false,
          error: {
            code: 'forbidden',
            message: 'Your role cannot moderate the jukebox.',
          },
        },
        { status: 403 },
      ),
    };
  }
  return auth;
}

/** Cron secret guard for /api/admin/jukebox/cron/*.
 *  Accepts either:
 *    - x-cron-secret: $JUKEBOX_CRON_SECRET, or
 *    - Authorization: Bearer $CRON_SECRET (Vercel Cron's default), or
 *    - Authorization: Bearer $JUKEBOX_CRON_SECRET (manual smoke tests).
 *  Configure either env var; both work. */
export function requireCronSecret(req: Request): NextResponse | null {
  const jukebox = process.env.JUKEBOX_CRON_SECRET || '';
  const vercel = process.env.CRON_SECRET || '';
  if (!jukebox && !vercel) {
    return NextResponse.json(
      { ok: false, error: { code: 'unauthorized', message: 'cron secret not configured' } },
      { status: 401 },
    );
  }
  const headerSecret = req.headers.get('x-cron-secret') || '';
  const bearer = (req.headers.get('authorization') || '').replace(/^Bearer\s+/i, '');
  const candidates = [headerSecret, bearer].filter(Boolean);
  const accepted = candidates.some((c) => (jukebox && c === jukebox) || (vercel && c === vercel));
  if (!accepted) {
    return NextResponse.json(
      { ok: false, error: { code: 'unauthorized', message: 'bad cron secret' } },
      { status: 401 },
    );
  }
  return null;
}

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

const SUPABASE_URL =
  process.env.NEXT_PUBLIC_SUPABASE_URL || '';

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

/** Read JWT from Authorization: Bearer or Supabase cookies. */
function readJwt(req: Request): string | null {
  const auth = req.headers.get('authorization') || '';
  if (auth.toLowerCase().startsWith('bearer ')) {
    return auth.slice(7).trim() || null;
  }
  // Supabase SSR cookies — try the common names.
  const cookie = req.headers.get('cookie') || '';
  const m =
    cookie.match(/(?:^|;\s*)sb-access-token=([^;]+)/) ||
    cookie.match(/(?:^|;\s*)supabase-auth-token=([^;]+)/);
  if (m && m[1]) {
    try {
      // Newer Supabase SSR stores JSON-encoded array; older stores raw token.
      const decoded = decodeURIComponent(m[1]);
      if (decoded.startsWith('[')) {
        const arr = JSON.parse(decoded);
        if (Array.isArray(arr) && typeof arr[0] === 'string') return arr[0];
      }
      return decoded;
    } catch {
      return null;
    }
  }
  return null;
}

export async function requireStaff(
  req: Request,
): Promise<{ staff: StaffSession } | { error: NextResponse }> {
  const jwt = readJwt(req);
  if (!jwt) return { error: unauthorized('missing token') };
  if (!SUPABASE_URL) return { error: unauthorized('server misconfigured') };

  // Use a dedicated client that just verifies the JWT.
  const verifier = createClient(SUPABASE_URL, jwt, {
    global: { headers: { Authorization: `Bearer ${jwt}` } },
    auth: { persistSession: false, autoRefreshToken: false },
  });
  const { data: userRes, error: userErr } = await verifier.auth.getUser(jwt);
  if (userErr || !userRes?.user?.email) {
    return { error: unauthorized('invalid token') };
  }
  const email = userRes.user.email.toLowerCase();

  // Confirm staff_users row, active.
  const sb = getServiceClient();
  const { data: row } = await sb
    .from('staff_users')
    .select('id, email, role, venue_id, active')
    .ilike('email', email)
    .maybeSingle();

  if (!row || row.active === false) {
    return { error: unauthorized('not a staff user') };
  }

  return {
    staff: {
      id: row.id,
      email: row.email,
      role: row.role,
      venue_id: row.venue_id ?? null,
    },
  };
}

/** Role gate — call after requireStaff. */
export function hasAdminRole(role: StaffSession['role']): boolean {
  return role === 'super_admin' || role === 'admin' || role === 'manager';
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

// Temporary diagnostic endpoint — admin auth gated. Will delete once
// the connect/status flow is sorted.
import { NextRequest, NextResponse } from 'next/server';
import { requireStaff } from '@/lib/jukebox/auth';
import { getServiceClient } from '@/lib/supabase';
import { getJukeboxVenueId } from '@/lib/jukebox/venue';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

function charCodes(s: string | null | undefined): number[] {
  if (!s) return [];
  return Array.from(s).map((c) => c.charCodeAt(0));
}

export async function GET(req: NextRequest) {
  const auth = await requireStaff(req);
  if ('error' in auth) return auth.error;

  const venueIdResolved = await getJukeboxVenueId();
  const sb = getServiceClient();

  // Pull all rows. Avoid sensitive field names so the response isn't blocked.
  const all = await sb
    .from('jukebox_provider_auth')
    .select('id, venue_id, provider, is_connected');

  const rows = (all.data || []).map((r) => ({
    id: r.id,
    venue_id_value: r.venue_id,
    venue_id_len: (r.venue_id || '').length,
    venue_id_codes: charCodes(r.venue_id),
    provider_value: r.provider,
    provider_codes: charCodes(r.provider),
    is_active: r.is_connected,
    matches_resolved: r.venue_id === venueIdResolved,
  }));

  // Enriched token state for the resolved venue + spotify.
  const tokenRow = await sb
    .from('jukebox_provider_auth')
    .select(
      'id, is_connected, access_token, refresh_token, expires_at, scope, provider_user_id, display_name, last_error, created_at, updated_at'
    )
    .eq('venue_id', venueIdResolved)
    .eq('provider', 'spotify')
    .maybeSingle();

  let token_state: Record<string, unknown> | null = null;
  if (tokenRow.data) {
    const r = tokenRow.data;
    const expiresAt = r.expires_at ? new Date(r.expires_at) : null;
    const expiresInSec = expiresAt ? Math.round((expiresAt.getTime() - Date.now()) / 1000) : null;
    token_state = {
      row_id: r.id,
      is_connected: r.is_connected,
      has_access_token: r.access_token != null,
      access_token_len: r.access_token ? String(r.access_token).length : 0,
      has_refresh_token: r.refresh_token != null,
      refresh_token_len: r.refresh_token ? String(r.refresh_token).length : 0,
      expires_at: r.expires_at ?? null,
      expires_in_sec_from_now: expiresInSec,
      scope: r.scope ?? null,
      provider_user_id: r.provider_user_id ?? null,
      display_name: r.display_name ?? null,
      last_error: r.last_error ?? null,
      created_at: r.created_at ?? null,
      updated_at: r.updated_at ?? null,
    };
  }

  // Try the same query getSpotifyAuthStatus uses.
  const single = await sb
    .from('jukebox_provider_auth')
    .select('id, is_connected')
    .eq('venue_id', venueIdResolved)
    .eq('provider', 'spotify')
    .maybeSingle();

  // Try by row id directly (no venue_id filter)
  const byId = rows[0]?.id
    ? await sb
        .from('jukebox_provider_auth')
        .select('id, is_connected')
        .eq('id', rows[0].id)
        .maybeSingle()
    : null;

  return NextResponse.json({
    ok: true,
    data: {
      resolved_venue_id_value: venueIdResolved,
      resolved_venue_id_len: venueIdResolved.length,
      resolved_venue_id_codes: charCodes(venueIdResolved),
      url_len: (process.env.NEXT_PUBLIC_SUPABASE_URL || '').length,
      url_endswith_n: (process.env.NEXT_PUBLIC_SUPABASE_URL || '').endsWith('\n'),
      service_role_role_len: (process.env.SUPABASE_SERVICE_ROLE_KEY || '').length,
      env_venue_id: process.env.JUKEBOX_DEFAULT_VENUE_ID || null,
      env_venue_slug: process.env.JUKEBOX_DEFAULT_VENUE_SLUG || null,
      all_rows_count: rows.length,
      all_rows_error: all.error?.message || null,
      all_rows_summary: rows,
      token_state,
      token_state_error: tokenRow.error?.message || null,
      filtered_query: { data: single.data, error: single.error?.message || null },
      by_id_query: byId ? { data: byId.data, error: byId.error?.message || null } : null,
    },
  });
}

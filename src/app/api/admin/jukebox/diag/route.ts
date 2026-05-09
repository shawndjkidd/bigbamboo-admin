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
      filtered_query: { data: single.data, error: single.error?.message || null },
      by_id_query: byId ? { data: byId.data, error: byId.error?.message || null } : null,
    },
  });
}

// Temporary diagnostic endpoint — admin auth gated. Will delete once
// the connect/status flow is sorted.
import { NextRequest, NextResponse } from 'next/server';
import { requireStaff } from '@/lib/jukebox/auth';
import { getServiceClient } from '@/lib/supabase';
import { getJukeboxVenueId } from '@/lib/jukebox/venue';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

export async function GET(req: NextRequest) {
  const auth = await requireStaff(req);
  if ('error' in auth) return auth.error;

  const venueId = await getJukeboxVenueId();
  const sb = getServiceClient();

  // 1. All rows in jukebox_provider_auth — see what's actually in the DB.
  const all = await sb
    .from('jukebox_provider_auth')
    .select('id, venue_id, provider, is_connected, provider_user_id, provider_display_name, scopes, updated_at');

  // 2. Same query getSpotifyAuthStatus uses.
  const single = await sb
    .from('jukebox_provider_auth')
    .select('is_connected, provider_user_id, provider_display_name, scopes, token_expires_at')
    .eq('venue_id', venueId)
    .eq('provider', 'spotify')
    .maybeSingle();

  return NextResponse.json({
    ok: true,
    data: {
      env: {
        JUKEBOX_DEFAULT_VENUE_ID: process.env.JUKEBOX_DEFAULT_VENUE_ID || null,
        JUKEBOX_DEFAULT_VENUE_SLUG: process.env.JUKEBOX_DEFAULT_VENUE_SLUG || null,
        SUPABASE_URL: process.env.NEXT_PUBLIC_SUPABASE_URL || null,
        has_service_role_key: !!process.env.SUPABASE_SERVICE_ROLE_KEY,
        service_role_key_len: (process.env.SUPABASE_SERVICE_ROLE_KEY || '').length,
        has_token_key: !!process.env.JUKEBOX_TOKEN_KEY,
        token_key_len: (process.env.JUKEBOX_TOKEN_KEY || '').length,
        has_cookie_secret: !!process.env.JUKEBOX_COOKIE_SECRET,
        cookie_secret_len: (process.env.JUKEBOX_COOKIE_SECRET || '').length,
      },
      resolved_venue_id: venueId,
      all_provider_auth_rows: {
        count: all.data?.length ?? 0,
        rows: all.data,
        error: all.error?.message || null,
      },
      maybeSingle_with_eq: {
        data: single.data,
        error: single.error?.message || null,
      },
    },
  });
}

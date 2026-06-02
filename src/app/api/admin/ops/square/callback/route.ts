// Square OAuth callback. Exchanges the code for tokens and persists them.
//
// Auth model: the state cookie (set in /connect) is our CSRF + auth proof.
// We don't try to verify the user from Supabase session cookies here —
// this codebase doesn't use @supabase/ssr, so server-side getUser() returns
// null. The /connect endpoint is initiated from /dashboard/ops/square which
// is gated by DashboardLayout's client-side auth check, AND Square's own
// OAuth provides the real authorization (user has to sign in to Square).
// The state cookie chains those two trust points back to this callback.
import { NextRequest, NextResponse } from 'next/server'
import { exchangeCodeForToken, listLocations, SQUARE_ENV } from '@/lib/ops/square'
import { getServiceClient } from '@/lib/supabase'

export async function GET(req: NextRequest) {
  const code = req.nextUrl.searchParams.get('code')
  const state = req.nextUrl.searchParams.get('state')
  const stateCookie = req.cookies.get('square_oauth_state')?.value
  const error = req.nextUrl.searchParams.get('error')

  if (error) return NextResponse.redirect(new URL(`/dashboard/ops/square?error=${encodeURIComponent(error)}`, req.url))
  if (!code || !state || state !== stateCookie) {
    return NextResponse.redirect(new URL('/dashboard/ops/square?error=invalid_state', req.url))
  }

  try {
    const tok = await exchangeCodeForToken(code)
    const svc = getServiceClient()

    const { data: venue } = await svc.from('venues').select('id').eq('slug', 'bigbamboo').single()
    if (!venue) throw new Error('BigBamBoo venue not found')

    // Upsert connection — connected_by left null (see header comment)
    await svc.schema('ops').from('square_connections').upsert({
      venue_id: venue.id,
      square_merchant_id: tok.merchant_id,
      access_token: tok.access_token,
      refresh_token: tok.refresh_token,
      expires_at: tok.expires_at,
      environment: SQUARE_ENV,
    }, { onConflict: 'venue_id,environment' })

    // Discover locations and persist (mark first one default)
    const { locations = [] } = await listLocations(tok.access_token)
    for (let i = 0; i < locations.length; i++) {
      const loc = locations[i]
      await svc.schema('ops').from('square_locations').upsert({
        venue_id: venue.id,
        square_location_id: loc.id,
        name: loc.name,
        is_default: i === 0,
        active: loc.status === 'ACTIVE',
      }, { onConflict: 'venue_id,square_location_id' })
    }

    const res = NextResponse.redirect(new URL('/dashboard/ops/square?connected=1', req.url))
    res.cookies.delete('square_oauth_state')
    return res
  } catch (e: any) {
    return NextResponse.redirect(new URL(`/dashboard/ops/square?error=${encodeURIComponent(e.message || 'connect_failed')}`, req.url))
  }
}

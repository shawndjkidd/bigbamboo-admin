// Square OAuth callback. Exchanges the code for tokens and persists them.
import { NextRequest, NextResponse } from 'next/server'
import { exchangeCodeForToken, listLocations, SQUARE_ENV } from '@/lib/ops/square'
import { getServiceClient } from '@/lib/supabase'
import { createClient } from '@supabase/supabase-js'

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

    // Resolve venue + connected_by from the current authed user
    const supabase = createClient(
      process.env.NEXT_PUBLIC_SUPABASE_URL!,
      process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
      { global: { headers: { cookie: req.headers.get('cookie') || '' } } }
    )
    const { data: { user } } = await supabase.auth.getUser()
    const { data: venue } = await svc.from('venues').select('id').eq('slug', 'bigbamboo').single()
    const { data: staff } = user ? await svc.from('staff_users').select('id, role').eq('email', user.email).single() : { data: null }

    if (!venue) throw new Error('BigBamBoo venue not found')
    if (!staff || !['super_admin', 'admin', 'manager'].includes(staff.role)) {
      return NextResponse.redirect(new URL('/dashboard/ops/square?error=not_authorized', req.url))
    }

    // Upsert connection
    await svc.schema('ops').from('square_connections').upsert({
      venue_id: venue.id,
      square_merchant_id: tok.merchant_id,
      access_token: tok.access_token,
      refresh_token: tok.refresh_token,
      expires_at: tok.expires_at,
      environment: SQUARE_ENV,
      connected_by: staff.id,
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

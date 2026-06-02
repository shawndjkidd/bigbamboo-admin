// ════════════════════════════════════════════════════════════
//   Square POS integration — thin wrapper over Square REST API
// ════════════════════════════════════════════════════════════
// No SDK dependency. Plain fetch. Keeps the bundle small and
// avoids the Square Node SDK's edge-runtime issues on Vercel.
//
// Env vars required (Vercel + .env.local):
//   SQUARE_APP_ID          — from Square Developer Dashboard
//   SQUARE_APP_SECRET      — from Square Developer Dashboard
//   SQUARE_ENVIRONMENT     — 'production' | 'sandbox' (default 'production')
//   SQUARE_OAUTH_REDIRECT  — e.g. https://bigbamboo.app/api/admin/ops/square/callback
// ════════════════════════════════════════════════════════════
import { getServiceClient } from '@/lib/supabase'

export type SquareEnv = 'production' | 'sandbox'

export const SQUARE_ENV: SquareEnv =
  (process.env.SQUARE_ENVIRONMENT as SquareEnv) || 'production'

export const SQUARE_API_BASE =
  SQUARE_ENV === 'production' ? 'https://connect.squareup.com' : 'https://connect.squareupsandbox.com'

export const SQUARE_OAUTH_BASE =
  SQUARE_ENV === 'production' ? 'https://connect.squareup.com' : 'https://connect.squareupsandbox.com'

export const SQUARE_SCOPES = [
  'MERCHANT_PROFILE_READ',
  'PAYMENTS_READ',
  'ORDERS_READ',
  'ITEMS_READ',
  'CUSTOMERS_READ',
  'EMPLOYEES_READ',
  'TIMECARDS_READ',
].join('+')

export function squareAuthorizeUrl(state: string): string {
  const u = new URL(`${SQUARE_OAUTH_BASE}/oauth2/authorize`)
  u.searchParams.set('client_id', process.env.SQUARE_APP_ID!)
  u.searchParams.set('scope', SQUARE_SCOPES.replace(/\+/g, ' '))
  u.searchParams.set('session', 'false')
  u.searchParams.set('state', state)
  return u.toString()
}

export async function exchangeCodeForToken(code: string) {
  const r = await fetch(`${SQUARE_API_BASE}/oauth2/token`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', 'Square-Version': '2025-01-23' },
    body: JSON.stringify({
      client_id: process.env.SQUARE_APP_ID,
      client_secret: process.env.SQUARE_APP_SECRET,
      code,
      grant_type: 'authorization_code',
    }),
  })
  if (!r.ok) throw new Error(`Square OAuth exchange failed: ${r.status} ${await r.text()}`)
  return (await r.json()) as {
    access_token: string
    refresh_token: string
    expires_at: string
    merchant_id: string
    token_type: string
  }
}

export async function refreshSquareToken(refreshToken: string) {
  const r = await fetch(`${SQUARE_API_BASE}/oauth2/token`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', 'Square-Version': '2025-01-23' },
    body: JSON.stringify({
      client_id: process.env.SQUARE_APP_ID,
      client_secret: process.env.SQUARE_APP_SECRET,
      refresh_token: refreshToken,
      grant_type: 'refresh_token',
    }),
  })
  if (!r.ok) throw new Error(`Square token refresh failed: ${r.status} ${await r.text()}`)
  return (await r.json()) as { access_token: string; refresh_token: string; expires_at: string }
}

// Get a valid access token for a venue, refreshing if within 24h of expiry
export async function getActiveToken(venueId: string): Promise<{ token: string; merchantId: string }> {
  const svc = getServiceClient()
  const { data: conn, error } = await svc.schema('ops').from('square_connections')
    .select('*').eq('venue_id', venueId).eq('environment', SQUARE_ENV).single()
  if (error || !conn) throw new Error('No Square connection for venue')

  const expires = new Date(conn.expires_at).getTime()
  const now = Date.now()
  if (expires - now < 24 * 60 * 60 * 1000) {
    const refreshed = await refreshSquareToken(conn.refresh_token)
    await svc.schema('ops').from('square_connections').update({
      access_token: refreshed.access_token,
      refresh_token: refreshed.refresh_token,
      expires_at: refreshed.expires_at,
    }).eq('id', conn.id)
    return { token: refreshed.access_token, merchantId: conn.square_merchant_id }
  }
  return { token: conn.access_token, merchantId: conn.square_merchant_id }
}

// ----- API calls -----
async function squareApi(path: string, token: string, init?: RequestInit) {
  const r = await fetch(`${SQUARE_API_BASE}${path}`, {
    ...init,
    headers: {
      'Authorization': `Bearer ${token}`,
      'Square-Version': '2025-01-23',
      'Content-Type': 'application/json',
      ...(init?.headers || {}),
    },
  })
  if (!r.ok) throw new Error(`Square API ${path} failed: ${r.status} ${await r.text()}`)
  return r.json()
}

export async function listLocations(token: string) {
  return squareApi('/v2/locations', token) as Promise<{ locations: SquareLocation[] }>
}

export async function searchOrders(token: string, locationIds: string[], startAtUTC: string, endAtUTC: string, cursor?: string) {
  return squareApi('/v2/orders/search', token, {
    method: 'POST',
    body: JSON.stringify({
      location_ids: locationIds,
      query: {
        filter: {
          date_time_filter: { closed_at: { start_at: startAtUTC, end_at: endAtUTC } },
          state_filter: { states: ['COMPLETED'] },
        },
        sort: { sort_field: 'CLOSED_AT', sort_order: 'ASC' },
      },
      limit: 500,
      cursor,
    }),
  }) as Promise<{ orders?: SquareOrder[]; cursor?: string }>
}

export async function listCatalog(token: string, cursor?: string) {
  const qs = new URLSearchParams({ types: 'ITEM,ITEM_VARIATION' })
  if (cursor) qs.set('cursor', cursor)
  return squareApi(`/v2/catalog/list?${qs}`, token) as Promise<{ objects?: any[]; cursor?: string }>
}

// ----- Types (only what we use) -----
export type SquareLocation = { id: string; name: string; status: string; currency: string }

export type SquareOrder = {
  id: string
  location_id: string
  closed_at?: string
  state: string
  total_money?: { amount: number; currency: string }
  total_tip_money?: { amount: number; currency: string }
  total_discount_money?: { amount: number; currency: string }
  line_items?: SquareLineItem[]
  tenders?: { type: string; amount_money?: { amount: number } }[]
  customer_id?: string
}

export type SquareLineItem = {
  uid: string
  name: string
  quantity: string
  catalog_object_id?: string
  base_price_money?: { amount: number; currency: string }
  total_money?: { amount: number; currency: string }
  total_discount_money?: { amount: number; currency: string }
}

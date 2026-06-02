// Sync Square orders → ops.sales_daily + ops.sales_items
// Can be triggered manually from the Square page, OR by a Vercel Cron job nightly.
// Accepts ?days=1 (default) to sync the last N days. Idempotent via unique (source, source_id).
import { NextRequest, NextResponse } from 'next/server'
import { getActiveToken, searchOrders, SQUARE_ENV } from '@/lib/ops/square'
import { getServiceClient } from '@/lib/supabase'

export const dynamic = 'force-dynamic'
export const maxDuration = 60

export async function POST(req: NextRequest) {
  return run(req)
}
export async function GET(req: NextRequest) {
  // For Vercel Cron compatibility — Cron jobs hit GET. Protect with bearer token.
  const auth = req.headers.get('authorization')
  if (process.env.CRON_SECRET && auth !== `Bearer ${process.env.CRON_SECRET}`) {
    return NextResponse.json({ error: 'unauthorized' }, { status: 401 })
  }
  return run(req)
}

async function run(req: NextRequest) {
  const days = Math.max(1, Math.min(31, Number(req.nextUrl.searchParams.get('days') || '1')))
  const svc = getServiceClient()

  const { data: venue } = await svc.from('venues').select('id').eq('slug', 'bigbamboo').single()
  if (!venue) return NextResponse.json({ error: 'no venue' }, { status: 500 })

  const { data: locs } = await svc.schema('ops').from('square_locations').select('square_location_id').eq('venue_id', venue.id).eq('active', true)
  if (!locs || locs.length === 0) return NextResponse.json({ error: 'no active Square locations' }, { status: 400 })

  const end = new Date()
  const start = new Date(end.getTime() - days * 24 * 60 * 60 * 1000)

  // Start sync log
  const { data: logRow } = await svc.schema('ops').from('square_sync_log').insert({
    venue_id: venue.id, kind: 'orders', status: 'running',
    period_start: start.toISOString(), period_end: end.toISOString(),
  }).select('id').single()

  let synced = 0, skipped = 0, failed = 0
  try {
    const { token } = await getActiveToken(venue.id)
    const locationIds = locs.map((l: any) => l.square_location_id)

    // Fetch all orders (paginate)
    const orders: any[] = []
    let cursor: string | undefined
    do {
      const page = await searchOrders(token, locationIds, start.toISOString(), end.toISOString(), cursor)
      if (page.orders) orders.push(...page.orders)
      cursor = page.cursor
    } while (cursor)

    // Group orders by occurred_on (HCMC date) for daily rollup
    const dailyMap = new Map<string, { gross: number; tips: number; discounts: number; refunds: number }>()

    for (const order of orders) {
      const closedAt = order.closed_at ? new Date(order.closed_at) : null
      if (!closedAt) { skipped++; continue }
      const occurredOn = closedAt.toLocaleDateString('en-CA', { timeZone: 'Asia/Ho_Chi_Minh' }) // YYYY-MM-DD
      const total = (order.total_money?.amount || 0) / 100 * 1 // Square uses cents; for VND it's already whole units but /100 anyway because Square always returns minor units
      // ⚠️ Square VND uses base units (no /100). Detect by currency.
      const gross = (order.total_money?.currency === 'VND' ? (order.total_money?.amount || 0) : total)
      const tips = (order.total_tip_money?.currency === 'VND' ? (order.total_tip_money?.amount || 0) : (order.total_tip_money?.amount || 0) / 100)
      const discounts = (order.total_discount_money?.currency === 'VND' ? (order.total_discount_money?.amount || 0) : (order.total_discount_money?.amount || 0) / 100)

      const cur = dailyMap.get(occurredOn) || { gross: 0, tips: 0, discounts: 0, refunds: 0 }
      cur.gross += gross
      cur.tips += tips
      cur.discounts += discounts
      dailyMap.set(occurredOn, cur)

      // Insert items
      for (const li of (order.line_items || [])) {
        const liGross = li.total_money?.currency === 'VND' ? (li.total_money?.amount || 0) : (li.total_money?.amount || 0) / 100
        const liQty = Number(li.quantity || '1')
        const liUnit = liQty > 0 ? liGross / liQty : liGross
        const { error: itemErr } = await svc.schema('ops').from('sales_items').upsert({
          venue_id: venue.id,
          occurred_at: closedAt.toISOString(),
          menu_item_name: li.name || '(unnamed)',
          qty: liQty,
          unit_price: liUnit,
          discount: li.total_discount_money?.currency === 'VND' ? (li.total_discount_money?.amount || 0) : (li.total_discount_money?.amount || 0) / 100,
          source: 'square',
          source_id: `${order.id}:${li.uid}`,
          payment_method: order.tenders?.[0]?.type || null,
          square_customer_id: order.customer_id || null,
        }, { onConflict: 'source,source_id' })
        if (itemErr) failed++; else synced++
      }
    }

    // Upsert daily rollups from Square (source = 'square')
    for (const [date, totals] of Array.from(dailyMap.entries())) {
      await svc.schema('ops').from('sales_daily').upsert({
        venue_id: venue.id,
        occurred_on: date,
        gross: totals.gross,
        tips: totals.tips,
        discounts: totals.discounts,
        refunds: totals.refunds,
        source: 'square',
      }, { onConflict: 'venue_id,occurred_on,source' })
    }

    await svc.schema('ops').from('square_sync_log').update({
      status: failed > 0 ? 'partial' : 'success',
      finished_at: new Date().toISOString(),
      items_synced: synced, items_skipped: skipped, items_failed: failed,
      metadata: { orders_count: orders.length, days_count: dailyMap.size },
    }).eq('id', logRow!.id)

    return NextResponse.json({
      ok: true, env: SQUARE_ENV, orders: orders.length, items_synced: synced, items_failed: failed, days: dailyMap.size,
    })
  } catch (e: any) {
    await svc.schema('ops').from('square_sync_log').update({
      status: 'failed',
      finished_at: new Date().toISOString(),
      items_synced: synced, items_skipped: skipped, items_failed: failed,
      error_message: e.message || String(e),
    }).eq('id', logRow!.id)
    return NextResponse.json({ error: e.message || 'sync failed' }, { status: 500 })
  }
}

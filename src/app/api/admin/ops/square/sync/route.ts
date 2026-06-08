// Sync Square orders → ops.sales_daily + ops.sales_items
// Can be triggered manually from the Square page, OR by a Vercel Cron job nightly.
// Accepts ?days=1 (default) to sync the last N days. Idempotent via unique (source, source_id).
import { NextRequest, NextResponse } from 'next/server'
import { getActiveToken, searchOrders, listCashDrawerShifts, retrieveCashDrawerShift, SQUARE_ENV } from '@/lib/ops/square'
import { getServiceClient } from '@/lib/supabase'

export const dynamic = 'force-dynamic'
export const maxDuration = 300 // headroom for backfills (clamped to plan limit)

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
  const startParam = req.nextUrl.searchParams.get('start') // YYYY-MM-DD — explicit backfill window
  const endParam = req.nextUrl.searchParams.get('end')     // YYYY-MM-DD
  const backfill = req.nextUrl.searchParams.get('backfill') === '1' // skip stock deduction for historical pulls
  const svc = getServiceClient()

  const { data: venue } = await svc.from('venues').select('id').eq('slug', 'bigbamboo').single()
  if (!venue) return NextResponse.json({ error: 'no venue' }, { status: 500 })

  const { data: locs } = await svc.schema('ops').from('square_locations').select('square_location_id').eq('venue_id', venue.id).eq('active', true)
  if (!locs || locs.length === 0) return NextResponse.json({ error: 'no active Square locations' }, { status: 400 })

  const end = endParam ? new Date(endParam + 'T23:59:59+07:00') : new Date()
  const start = startParam ? new Date(startParam + 'T00:00:00+07:00') : new Date(end.getTime() - days * 24 * 60 * 60 * 1000)

  // Trading-night grouping: sales before 3am count toward the previous calendar day (HCMC).
  const BUSINESS_DAY_CUTOFF_H = 3
  const bizDate = (dt: Date) => new Date(dt.getTime() - BUSINESS_DAY_CUTOFF_H * 3600 * 1000).toLocaleDateString('en-CA', { timeZone: 'Asia/Ho_Chi_Minh' })

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

    // --- Recipe mapping for stock deduction: auto-match Square item names to recipes ---
    const [{ data: recipeRows }, { data: mapRows }] = await Promise.all([
      svc.schema('ops').from('recipes').select('id, name').eq('venue_id', venue.id),
      svc.schema('ops').from('pos_item_map').select('item_name, recipe_id, ignore').eq('venue_id', venue.id),
    ])
    const recipeByName = new Map<string, string>()
    ;(recipeRows || []).forEach((r: any) => r.name && recipeByName.set(String(r.name).trim().toLowerCase(), r.id))
    const mapByName = new Map<string, { recipe_id: string | null; ignore: boolean }>()
    ;(mapRows || []).forEach((m: any) => mapByName.set(String(m.item_name).trim().toLowerCase(), { recipe_id: m.recipe_id, ignore: !!m.ignore }))

    // Single pass: build daily rollups, collect line items, and note any new item names (no per-row awaits)
    const dailyMap = new Map<string, { gross: number; tips: number; discounts: number; refunds: number }>()
    const itemRows: any[] = []
    const newMapNames = new Map<string, string>() // itemName -> auto-matched recipe_id ('' if none)

    for (const order of orders) {
      const closedAt = order.closed_at ? new Date(order.closed_at) : null
      if (!closedAt) { skipped++; continue }
      const occurredOn = bizDate(closedAt) // trading-night date (3am cutoff, HCMC)
      // ⚠️ Square VND uses base units (no /100). Detect by currency.
      const gross = (order.total_money?.currency === 'VND' ? (order.total_money?.amount || 0) : (order.total_money?.amount || 0) / 100)
      const tips = (order.total_tip_money?.currency === 'VND' ? (order.total_tip_money?.amount || 0) : (order.total_tip_money?.amount || 0) / 100)
      const discounts = (order.total_discount_money?.currency === 'VND' ? (order.total_discount_money?.amount || 0) : (order.total_discount_money?.amount || 0) / 100)

      const cur = dailyMap.get(occurredOn) || { gross: 0, tips: 0, discounts: 0, refunds: 0 }
      cur.gross += gross; cur.tips += tips; cur.discounts += discounts
      dailyMap.set(occurredOn, cur)

      for (const li of (order.line_items || [])) {
        const liGross = li.total_money?.currency === 'VND' ? (li.total_money?.amount || 0) : (li.total_money?.amount || 0) / 100
        const liQty = Number(li.quantity || '1')
        const liUnit = liQty > 0 ? liGross / liQty : liGross
        const itemName = li.name || '(unnamed)'
        const key = itemName.trim().toLowerCase()
        if (!mapByName.has(key) && !newMapNames.has(itemName)) newMapNames.set(itemName, recipeByName.get(key) || '')
        itemRows.push({
          venue_id: venue.id,
          occurred_at: closedAt.toISOString(),
          menu_item_name: itemName,
          _key: key,
          qty: liQty,
          unit_price: liUnit,
          discount: li.total_discount_money?.currency === 'VND' ? (li.total_discount_money?.amount || 0) : (li.total_discount_money?.amount || 0) / 100,
          source: 'square',
          source_id: `${order.id}:${li.uid}`,
          payment_method: order.tenders?.[0]?.type || null,
          square_customer_id: order.customer_id || null,
        })
      }
    }

    // Batch-create any new POS item → recipe map rows (auto-matched by name), then index them
    if (newMapNames.size) {
      const inserts = Array.from(newMapNames.entries()).map(([item_name, rid]) => ({ venue_id: venue.id, item_name, recipe_id: rid || null }))
      const { error: mErr } = await svc.schema('ops').from('pos_item_map').insert(inserts)
      if (mErr) console.warn('pos_item_map batch insert:', mErr.message)
      inserts.forEach(i => mapByName.set(i.item_name.trim().toLowerCase(), { recipe_id: i.recipe_id, ignore: false }))
    }

    // Stamp recipe_id from the map (respecting "don't track"), then bulk-upsert line items in chunks
    const finalRows = itemRows.map(({ _key, ...rest }) => {
      const e = mapByName.get(_key)
      return { ...rest, recipe_id: e && !e.ignore ? e.recipe_id : null }
    })
    for (let i = 0; i < finalRows.length; i += 500) {
      const chunk = finalRows.slice(i, i + 500)
      const { error } = await svc.schema('ops').from('sales_items').upsert(chunk, { onConflict: 'source,source_id' })
      if (error) failed += chunk.length; else synced += chunk.length
    }

    // Bulk-upsert daily rollups from Square (source = 'square')
    const dailyRows = Array.from(dailyMap.entries()).map(([date, t]) => ({
      venue_id: venue.id, occurred_on: date, gross: t.gross, tips: t.tips, discounts: t.discounts, refunds: t.refunds, source: 'square',
    }))
    if (dailyRows.length) await svc.schema('ops').from('sales_daily').upsert(dailyRows, { onConflict: 'venue_id,occurred_on,source' })

    // --- Deduct ingredient stock for newly-synced sold lines (idempotent via stock_applied) ---
    // Skipped during a historical backfill so old sales don't drain current stock counts.
    if (!backfill) {
      try { await svc.schema('ops').rpc('apply_stock_deductions', { p_venue: venue.id }) }
      catch (e: any) { console.warn('stock deduction skipped:', e?.message || String(e)) }
    }

    // --- Cash drawer shifts → ops.cash_recon (POS cash figures). Non-fatal: needs CASH_DRAWER_READ scope. ---
    let drawerDays = 0
    try {
      const money = (m: any) => m ? (m.currency === 'VND' ? Number(m.amount || 0) : Number(m.amount || 0) / 100) : 0
      const dayAgg = new Map<string, { opening: number; cashSales: number; paidIn: number; paidOut: number; expected: number; closed: number }>()
      for (const locId of locationIds) {
        let scursor: string | undefined
        do {
          const sp: any = await listCashDrawerShifts(token, locId, start.toISOString(), end.toISOString(), scursor)
          for (const summary of (sp.cash_drawer_shifts || [])) {
            const closedAt = summary.closed_at || summary.ended_at
            if (!closedAt) continue
            const full: any = await retrieveCashDrawerShift(token, locId, summary.id)
            const sh = full.cash_drawer_shift || summary
            const day = bizDate(new Date(closedAt))
            const cur = dayAgg.get(day) || { opening: 0, cashSales: 0, paidIn: 0, paidOut: 0, expected: 0, closed: 0 }
            cur.opening += money(sh.opened_cash_money)
            cur.cashSales += money(sh.cash_payment_money)
            cur.paidIn += money(sh.cash_paid_in_money)
            cur.paidOut += money(sh.cash_paid_out_money)
            cur.expected += money(sh.expected_cash_money)
            cur.closed += money(sh.closed_cash_money)
            dayAgg.set(day, cur)
          }
          scursor = sp.cursor
        } while (scursor)
      }
      for (const [day, a] of Array.from(dayAgg.entries())) {
        await svc.schema('ops').from('cash_recon').upsert({
          venue_id: venue.id, occurred_on: day,
          pos_opening_cash: a.opening, pos_cash_sales: a.cashSales, pos_cash_paid_in: a.paidIn, pos_cash_paid_out: a.paidOut,
          pos_expected_cash: a.expected, pos_closed_cash: a.closed, pos_synced_at: new Date().toISOString(),
        }, { onConflict: 'venue_id,occurred_on' })
      }
      drawerDays = dayAgg.size
    } catch (e: any) { console.warn('cash drawer sync skipped:', e?.message || String(e)) }

    await svc.schema('ops').from('square_sync_log').update({
      status: failed > 0 ? 'partial' : 'success',
      finished_at: new Date().toISOString(),
      items_synced: synced, items_skipped: skipped, items_failed: failed,
      metadata: { orders_count: orders.length, days_count: dailyMap.size, drawer_days: drawerDays },
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

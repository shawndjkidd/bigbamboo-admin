'use client'
import { useEffect, useState } from 'react'
import Link from 'next/link'
import { ops, vnd, pct, today, canSeeDashboard, type StaffRole } from '@/lib/ops/api'
import { supabase } from '@/lib/supabase'

type Pnl = {
  period_month: string
  revenue: number
  cogs: number
  labor: number
  opex: number
  depreciation: number
  net: number
}

type SalesRow = { occurred_on: string; gross: number; source: string }
type LaborByDay = { occurred_on: string; total_cost: number; hours: number }
type CogsVar = { theoretical_cogs: number; actual_cogs: number; variance: number; variance_pct: number | null }

// ratio-percent that never shows NaN/∞ on an empty period
const rp = (num: number, den: number) => den ? pct(num / den) : '—'
const DRINK_CATS = new Set(['cocktail', 'beer', 'wine', 'na_drink'])
const FOOD_CATS = new Set(['food', 'snack'])
type CatBlock = { category: string; count: number; total: number; items: { name: string; sales: number; share: number }[] }

export default function OpsDashboard() {
  const [role, setRole] = useState<StaffRole | null>(null)
  const [pnl, setPnl] = useState<Pnl | null>(null)
  const [daily, setDaily] = useState<SalesRow[]>([])
  const [labor, setLabor] = useState<LaborByDay[]>([])
  const [cogsVar, setCogsVar] = useState<CogsVar | null>(null)
  const [topCats, setTopCats] = useState<CatBlock[]>([])
  const [bottomCats, setBottomCats] = useState<CatBlock[]>([])
  const [overallTop, setOverallTop] = useState<{ name: string; sales: number; category: string; share: number }[]>([])
  const [mix, setMix] = useState<{ bar: number; kitchen: number; other: number; total: number }>({ bar: 0, kitchen: 0, other: 0, total: 0 })
  const [loading, setLoading] = useState(true)
  const [period, setPeriod] = useState<'mtd' | 'last_month' | 'ytd' | 'month'>('mtd')
  /* Any specific month, for the questions the three presets can't answer —
     "how did the Tet week actually go", "compare March to March". Holds
     YYYY-MM; only consulted when period === 'month'. */
  const [pickedMonth, setPickedMonth] = useState('')

  useEffect(() => {
    (async () => {
      const { data: { session } } = await supabase.auth.getSession()

      const user = session?.user
      if (!user) return
      const { data: su } = await supabase.from('staff_users').select('role').eq('email', user.email).single()
      setRole(su?.role || 'staff')
      await load(period)
    })()
    // re-runs when a different month is picked, not just a different preset
  }, [period, pickedMonth])

  async function load(p: typeof period) {
    setLoading(true)
    /* Date range.
     *
     * This used to build the boundaries with `new Date(y, m, d)` — which is
     * LOCAL time — and then read them back with getUTCMonth()/getUTCDate().
     * In Vietnam (UTC+7) local midnight on 1 July is 30 June 17:00 UTC, so the
     * month came back one lower. "Last Month" in August therefore asked for
     * 2026-06-01 → 2026-07-30: two months of sales, and July's last day
     * missing. Every figure on the page was wrong, quietly.
     *
     * today() is already Asia/Ho_Chi_Minh, so the window is derived from that
     * same string and the arithmetic is plain integers. No Date object is ever
     * built in one zone and read in another. */
    const pad = (n: number) => String(n).padStart(2, '0')
    // day 0 of month m (1-based) = last day of month m; UTC in and UTC out.
    const lastDayOf = (yy: number, mm: number) => new Date(Date.UTC(yy, mm, 0)).getUTCDate()

    const [ty, tm] = today().split('-').map(Number)
    let start: string, end: string
    if (p === 'mtd') {
      start = `${ty}-${pad(tm)}-01`
      end = today()
    } else if (p === 'last_month') {
      const py = tm === 1 ? ty - 1 : ty
      const pm = tm === 1 ? 12 : tm - 1
      start = `${py}-${pad(pm)}-01`
      end = `${py}-${pad(pm)}-${pad(lastDayOf(py, pm))}`
    } else if (p === 'month' && /^\d{4}-\d{2}$/.test(pickedMonth)) {
      const [my, mm] = pickedMonth.split('-').map(Number)
      start = `${pickedMonth}-01`
      end = `${pickedMonth}-${pad(lastDayOf(my, mm))}`
    } else {
      start = `${ty}-01-01`
      end = today()
    }

    const startMonth = start.substring(0, 7) + '-01'
    const endMonth = end.substring(0, 7) + '-01'
    const [sales, pnlAcc, shifts, variance] = await Promise.all([
      ops().from('sales_daily').select('occurred_on,gross,source').gte('occurred_on', start).lte('occurred_on', end).order('occurred_on'),
      ops().from('v_pnl_accrual').select('revenue,cogs,labor,opex,depreciation,net_income_accrual').gte('period_month', startMonth).lte('period_month', endMonth),
      ops().from('labor_shifts').select('occurred_on,hours,shift_cost').gte('occurred_on', start).lte('occurred_on', end).order('occurred_on'),
      ops().from('v_theoretical_vs_actual_cogs').select('theoretical_cogs,actual_cogs,variance,variance_pct').eq('period_month', startMonth).maybeSingle(),
    ])
    setCogsVar((variance.data as CogsVar) || null)

    const salesRows = (sales.data || []) as SalesRow[]
    const shiftRows = (shifts.data || []) as any[]
    const accRows = (pnlAcc.data || []) as any[]
    const accSum = (k: string) => accRows.reduce((a, r) => a + Number(r[k] || 0), 0)

    // One row per day = SUM of every source (Square + manual adjustments like offline-flush fixes).
    // Newest day first, to match the Recent days list on the Overview.
    const byDayMap = new Map<string, number>()
    for (const sr of salesRows) byDayMap.set(sr.occurred_on, (byDayMap.get(sr.occurred_on) || 0) + Number(sr.gross || 0))
    const dedupedDaily: SalesRow[] = Array.from(byDayMap.entries()).map(([occurred_on, gross]) => ({ occurred_on, gross, source: 'sum' })).sort((a, b) => b.occurred_on.localeCompare(a.occurred_on))

    // P&L tiles come from the same accrual view the Overview P&L uses, so the two pages agree
    setPnl({
      period_month: start,
      revenue: accSum('revenue'),
      cogs: accSum('cogs'),
      labor: accSum('labor'),
      opex: accSum('opex'),
      depreciation: accSum('depreciation'),
      net: accSum('net_income_accrual'),
    })

    // Daily sales — every day, deduped (Square preferred); was previously manual-only so Square days vanished
    setDaily(dedupedDaily)

    // Labor per day
    const byDay = new Map<string, { hours: number; cost: number }>()
    shiftRows.forEach(s => {
      const cur = byDay.get(s.occurred_on) || { hours: 0, cost: 0 }
      cur.hours += Number(s.hours || 0)
      cur.cost  += Number(s.shift_cost || 0)
      byDay.set(s.occurred_on, cur)
    })
    setLabor(Array.from(byDay.entries()).map(([d, v]) => ({ occurred_on: d, total_cost: v.cost, hours: v.hours })))

    // Top sellers by category + Bar/Kitchen mix — item-level sales joined to recipe categories
    const [{ data: items }, { data: mapRows }, { data: recRows }] = await Promise.all([
      ops().from('sales_items').select('menu_item_name, gross').gte('occurred_on', start).lte('occurred_on', end).limit(10000),
      ops().from('pos_item_map').select('item_name, recipe_id, category'),
      ops().from('recipes').select('id, category'),
    ])
    const recCat = new Map<string, string>((recRows || []).map((r: any) => [r.id, r.category]))
    const itemCat = new Map<string, string>()
    ;(mapRows || []).forEach((m: any) => {
      if (m.recipe_id) itemCat.set(m.item_name, recCat.get(m.recipe_id) || 'other')
      else if (m.category) itemCat.set(m.item_name, m.category)
    })
    const prodSales = new Map<string, number>()
    let barT = 0, kitT = 0, othT = 0
    ;(items || []).forEach((it: any) => {
      const g = Number(it.gross || 0); const nm = it.menu_item_name || '—'
      prodSales.set(nm, (prodSales.get(nm) || 0) + g)
      const c = itemCat.get(nm)
      if (c && DRINK_CATS.has(c)) barT += g; else if (c && FOOD_CATS.has(c)) kitT += g; else othT += g
    })
    const totalItems = barT + kitT + othT
    setMix({ bar: barT, kitchen: kitT, other: othT, total: totalItems })
    const byCat = new Map<string, { name: string; sales: number }[]>()
    prodSales.forEach((sales, name) => {
      const c = itemCat.get(name) || 'other'
      const arr = byCat.get(c) || []; arr.push({ name, sales }); byCat.set(c, arr)
    })
    const catEntries = Array.from(byCat.entries()).filter(([category]) => category !== 'other' && category !== 'wine')
    const pick = (arr: { name: string; sales: number }[], asc: boolean) =>
      [...arr].sort((a, b) => asc ? a.sales - b.sales : b.sales - a.sales).slice(0, 3).map(i => ({ ...i, share: totalItems ? i.sales / totalItems : 0 }))
    const mkCats = (asc: boolean): CatBlock[] => catEntries
      .map(([category, arr]) => ({ category, count: arr.length, total: arr.reduce((s, i) => s + i.sales, 0), items: pick(arr, asc) }))
      .sort((a, b) => b.total - a.total)
    setTopCats(mkCats(false))
    setBottomCats(mkCats(true))
    const allTracked: { name: string; sales: number; category: string }[] = []
    prodSales.forEach((sales, name) => { const c = itemCat.get(name); if (c && c !== 'other' && c !== 'wine') allTracked.push({ name, sales, category: c }) })
    setOverallTop([...allTracked].sort((a, b) => b.sales - a.sales).slice(0, 3).map(i => ({ ...i, share: totalItems ? i.sales / totalItems : 0 })))

    setLoading(false)
  }

  if (loading || !role) return <div style={{ color: '#999', fontSize: 14 }}>Loading…</div>
  if (!canSeeDashboard(role)) {
    return <div style={{ padding: 32 }}>
      <h2 style={{ fontSize: 18, marginBottom: 8 }}>Operations</h2>
      <p style={{ color: 'var(--text-muted, #999)', fontSize: 14, marginBottom: 16 }}>
        Your role can enter daily sales and purchases but doesn't have access to the full P&L dashboard.
      </p>
      <Link href="/dashboard/ops/today" style={btn}>Enter Today's Sales →</Link>
    </div>
  }

  const r = pnl
  if (!r) return null
  const gp = r.revenue - r.cogs
  const ebitda = gp - r.labor - r.opex
  const net = r.net

  return (
    <div>
      <div style={{ display: 'flex', alignItems: 'baseline', justifyContent: 'space-between', marginBottom: 24 }}>
        <div>
          <h2 style={{ fontSize: 22, fontWeight: 600, color: 'var(--text, #333)' }}>Operations Dashboard</h2>
          <div style={{ fontSize: 12, color: 'var(--text-muted, #999)', marginTop: 2 }}>BigBamBoo · Live P&L</div>
        </div>
        <div style={{ display: 'flex', gap: 5, alignItems: 'center', flexWrap: 'wrap' }}>
          {(['mtd', 'last_month', 'ytd'] as const).map(p => (
            <button key={p} onClick={() => setPeriod(p)} style={{
              padding: '7px 13px', fontSize: 13, borderRadius: 6, cursor: 'pointer',
              background: period === p ? 'var(--accent, #e87830)' : 'transparent',
              color: period === p ? '#fff' : 'var(--text-muted, #999)',
              border: '1px solid var(--border, #e5e5e5)',
            }}>{p === 'mtd' ? 'This Month' : p === 'last_month' ? 'Last Month' : 'YTD'}</button>
          ))}
          {/* Any month, back to whenever the books start. Picking one selects
              it; the three presets above stay one click away. */}
          <input
            type="month"
            value={pickedMonth}
            max={today().substring(0, 7)}
            onChange={e => { setPickedMonth(e.target.value); setPeriod(e.target.value ? 'month' : 'mtd') }}
            aria-label="Pick a month"
            style={{
              padding: '6px 10px', fontSize: 13, borderRadius: 6, cursor: 'pointer',
              background: period === 'month' ? 'var(--accent, #e87830)' : 'transparent',
              color: period === 'month' ? '#fff' : 'var(--text-muted, #999)',
              border: '1px solid var(--border, #e5e5e5)',
              colorScheme: period === 'month' ? 'dark' : undefined,
              fontFamily: 'inherit',
            }}
          />
        </div>
      </div>

      {/* KPI tiles */}
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', gap: 12, marginBottom: 24 }}>
        <Kpi label="Revenue"     value={vnd(r.revenue)} accent="#1F3864" />
        <Kpi label="Gross Profit" value={vnd(gp)}        sub={rp(gp, r.revenue)} accent="#548235" />
        <Kpi label="EBITDA"      value={vnd(ebitda)}    sub={rp(ebitda, r.revenue)} accent="#C65911" />
        <Kpi label="Net Income"  value={vnd(net)}       sub={rp(net, r.revenue)} accent="#548235" />
      </div>

      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', gap: 12, marginBottom: 32 }}>
        <Kpi label="COGS %"  value={rp(r.cogs, r.revenue)}  small />
        <Kpi label="Labor %" value={rp(r.labor, r.revenue)} small />
        <Kpi label="Prime Cost %" value={rp(r.cogs + r.labor, r.revenue)} sub="COGS + labor · target ≤ 65%" small accent="#7b2d3a" />
        <Kpi label="Opex %"  value={rp(r.opex, r.revenue)}  small />
      </div>

      {/* Theoretical vs Actual COGS variance */}
      {cogsVar && (cogsVar.theoretical_cogs > 0 || cogsVar.actual_cogs > 0) && (
        <div style={{ marginBottom: 32, padding: 16, background: 'var(--bg-card, #fff)', border: '1px solid var(--border, #e5e5e5)', borderRadius: 8 }}>
          <h3 style={{ fontSize: 14, fontWeight: 600, marginBottom: 12, color: 'var(--text, #333)' }}>COGS — Theoretical vs Actual</h3>
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', gap: 10 }}>
            <div>
              <div style={{ fontSize: 10, fontWeight: 600, textTransform: 'uppercase', letterSpacing: '0.08em', color: 'var(--text-muted, #999)' }}>Theoretical</div>
              <div style={{ fontSize: 16, fontWeight: 600, marginTop: 4 }}>{vnd(cogsVar.theoretical_cogs)}</div>
              <div style={{ fontSize: 11, color: 'var(--text-muted, #999)', marginTop: 2 }}>items sold × recipe cost</div>
            </div>
            <div>
              <div style={{ fontSize: 10, fontWeight: 600, textTransform: 'uppercase', letterSpacing: '0.08em', color: 'var(--text-muted, #999)' }}>Actual</div>
              <div style={{ fontSize: 16, fontWeight: 600, marginTop: 4 }}>{vnd(cogsVar.actual_cogs)}</div>
              <div style={{ fontSize: 11, color: 'var(--text-muted, #999)', marginTop: 2 }}>purchases this period</div>
            </div>
            <div>
              <div style={{ fontSize: 10, fontWeight: 600, textTransform: 'uppercase', letterSpacing: '0.08em', color: 'var(--text-muted, #999)' }}>Variance</div>
              <div style={{ fontSize: 16, fontWeight: 600, marginTop: 4 }}>{vnd(cogsVar.variance)}</div>
              <div style={{ fontSize: 11, color: 'var(--text-muted, #999)', marginTop: 2 }}>actual − theoretical</div>
            </div>
            <div>
              <div style={{ fontSize: 10, fontWeight: 600, textTransform: 'uppercase', letterSpacing: '0.08em', color: 'var(--text-muted, #999)' }}>Variance %</div>
              <div style={{ fontSize: 20, fontWeight: 600, marginTop: 4,
                color: cogsVar.variance_pct == null ? 'var(--text-muted, #999)' :
                       cogsVar.variance_pct < 0.06 ? '#548235' :
                       cogsVar.variance_pct < 0.08 ? '#C65911' : '#C00000' }}>
                {pct(cogsVar.variance_pct)}
              </div>
              <div style={{ fontSize: 11, color: 'var(--text-muted, #999)', marginTop: 2 }}>
                {cogsVar.variance_pct == null ? '—' :
                 cogsVar.variance_pct < 0.06 ? '✓ Tight (under 6%)' :
                 cogsVar.variance_pct < 0.08 ? '⚠ Watch (6-8%)' : '⚠ Leak — investigate'}
              </div>
            </div>
          </div>
          {cogsVar.theoretical_cogs === 0 && (
            <div style={{ marginTop: 12, padding: 10, background: 'var(--bg-sidebar, #fafafa)', borderRadius: 6, fontSize: 12, color: 'var(--text-muted, #666)' }}>
              No theoretical COGS yet — add ingredients + recipes, and item-level sales (Square sync) to populate.
            </div>
          )}
        </div>
      )}

      {/* Revenue mix: Bar vs Kitchen */}
      {mix.total > 0 && (
        <div style={{ marginBottom: 32, padding: 16, background: 'var(--bg-card, #fff)', border: '1px solid var(--border, #e5e5e5)', borderRadius: 8 }}>
          <h3 style={{ fontSize: 14, fontWeight: 600, marginBottom: 4, color: 'var(--text, #333)' }}>Revenue mix — Bar vs Kitchen</h3>
          <div style={{ fontSize: 11, color: 'var(--text-muted, #999)', marginBottom: 12 }}>by item-level sales this period</div>
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: 10 }}>
            <Kpi label="Bar" value={vnd(mix.bar)} sub={rp(mix.bar, mix.total)} accent="#1F3864" small />
            <Kpi label="Kitchen" value={vnd(mix.kitchen)} sub={rp(mix.kitchen, mix.total)} accent="#C65911" small />
            <Kpi label="Other / untracked" value={vnd(mix.other)} sub={rp(mix.other, mix.total)} small />
          </div>
        </div>
      )}

      {/* Top products by revenue (overall) */}
      {overallTop.length > 0 && (
        <div style={{ marginBottom: 32 }}>
          <h3 style={{ fontSize: 14, fontWeight: 600, marginBottom: 12, color: 'var(--text, #333)' }}>Top products by revenue</h3>
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: 12 }}>
            {overallTop.map((it, i) => (
              <div key={it.name} style={{ padding: 14, background: 'var(--bg-card, #fff)', border: '1px solid var(--border, #e5e5e5)', borderRadius: 8, borderLeft: '3px solid #1F3864' }}>
                <div style={{ fontSize: 10, fontWeight: 600, textTransform: 'uppercase', letterSpacing: '0.08em', color: 'var(--text-muted, #999)' }}>#{i + 1} · {it.category.replace('_', ' ')}</div>
                <div style={{ fontSize: 15, fontWeight: 600, marginTop: 4, color: 'var(--text, #333)' }}>{it.name}</div>
                <div style={{ fontSize: 13, color: 'var(--text-secondary, #666)', marginTop: 2 }}>{vnd(it.sales)} · {pct(it.share)}</div>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Top sellers by category */}
      {topCats.length > 0 && (
        <div style={{ marginBottom: 32 }}>
          <h3 style={{ fontSize: 14, fontWeight: 600, marginBottom: 12, color: 'var(--text, #333)' }}>Top sellers by category</h3>
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(280px, 1fr))', gap: 12 }}>
            {topCats.map(c => (
              <div key={c.category} style={{ padding: 14, background: 'var(--bg-card, #fff)', border: '1px solid var(--border, #e5e5e5)', borderRadius: 8 }}>
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'baseline', marginBottom: 8 }}>
                  <div style={{ fontSize: 11, fontWeight: 600, textTransform: 'capitalize', letterSpacing: '0.04em', color: 'var(--text, #333)' }}>{c.category.replace('_', ' ')}</div>
                  <div style={{ fontSize: 11, color: 'var(--text-muted, #999)' }}>{vnd(c.total)}</div>
                </div>
                {c.items.map((it, i) => (
                  <div key={it.name} style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'baseline', padding: '4px 0', borderTop: i ? '1px solid var(--border, #f0f0f0)' : 'none' }}>
                    <div style={{ fontSize: 13, color: 'var(--text, #333)' }}>{i + 1}. {it.name}</div>
                    <div style={{ fontSize: 12, color: 'var(--text-secondary, #666)', whiteSpace: 'nowrap' }}>{vnd(it.sales)} <span style={{ color: 'var(--text-muted, #999)' }}>· {pct(it.share)}</span></div>
                  </div>
                ))}
              </div>
            ))}
          </div>
          <div style={{ fontSize: 11, color: 'var(--text-muted, #999)', marginTop: 8 }}>% is each item's share of total item sales this period.</div>
        </div>
      )}

      {/* Slowest sellers by category */}
      {bottomCats.filter(c => c.count > 3).length > 0 && (
        <div style={{ marginBottom: 32 }}>
          <h3 style={{ fontSize: 14, fontWeight: 600, marginBottom: 12, color: 'var(--text, #333)' }}>Slowest sellers by category</h3>
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(280px, 1fr))', gap: 12 }}>
            {bottomCats.filter(c => c.count > 3).map(c => (
              <div key={c.category} style={{ padding: 14, background: 'var(--bg-card, #fff)', border: '1px solid var(--border, #e5e5e5)', borderRadius: 8 }}>
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'baseline', marginBottom: 8 }}>
                  <div style={{ fontSize: 11, fontWeight: 600, textTransform: 'capitalize', letterSpacing: '0.04em', color: 'var(--text, #333)' }}>{c.category.replace('_', ' ')}</div>
                  <div style={{ fontSize: 11, color: 'var(--text-muted, #999)' }}>{c.count} items</div>
                </div>
                {c.items.map((it, i) => (
                  <div key={it.name} style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'baseline', padding: '4px 0', borderTop: i ? '1px solid var(--border, #f0f0f0)' : 'none' }}>
                    <div style={{ fontSize: 13, color: 'var(--text, #333)' }}>{it.name}</div>
                    <div style={{ fontSize: 12, color: 'var(--text-secondary, #666)', whiteSpace: 'nowrap' }}>{vnd(it.sales)} <span style={{ color: 'var(--text-muted, #999)' }}>· {pct(it.share)}</span></div>
                  </div>
                ))}
              </div>
            ))}
          </div>
          <div style={{ fontSize: 11, color: 'var(--text-muted, #999)', marginTop: 8 }}>Lowest-selling items this period — candidates to cut or rework.</div>
        </div>
      )}

      {/* Daily sales vs labor table */}
      <div style={{ marginBottom: 32 }}>
        <h3 style={{ fontSize: 14, fontWeight: 600, marginBottom: 12, color: 'var(--text, #333)' }}>Daily Sales vs Labor</h3>
        <table style={tbl}>
          <thead><tr style={{ background: 'var(--bg-sidebar, #fafafa)' }}>
            <th style={th}>Date</th><th style={{ ...th, textAlign: 'right' }}>Sales</th>
            <th style={{ ...th, textAlign: 'right' }}>Labor</th><th style={{ ...th, textAlign: 'right' }}>Labor %</th>
          </tr></thead>
          <tbody>
            {daily.map(d => {
              const lab = labor.find(l => l.occurred_on === d.occurred_on)?.total_cost || 0
              return <tr key={d.occurred_on} style={{ borderTop: '1px solid var(--border, #eee)' }}>
                <td style={td}>{d.occurred_on}</td>
                <td style={{ ...td, textAlign: 'right' }}>{vnd(d.gross)}</td>
                <td style={{ ...td, textAlign: 'right' }}>{vnd(lab)}</td>
                <td style={{ ...td, textAlign: 'right', color: d.gross > 0 && lab / d.gross > 0.20 ? '#C00000' : 'var(--text, #333)' }}>
                  {d.gross > 0 ? pct(lab / d.gross) : '—'}
                </td>
              </tr>
            })}
          </tbody>
        </table>
      </div>
    </div>
  )
}

const Kpi = ({ label, value, sub, accent = '#666', small = false }: {
  label: string; value: string; sub?: string; accent?: string; small?: boolean
}) => (
  <div style={{
    padding: 14, borderRadius: 8,
    background: 'var(--bg-card, #fff)',
    border: '1px solid var(--border, #e5e5e5)',
    borderLeft: `3px solid ${accent}`,
  }}>
    <div style={{ fontSize: 10, fontWeight: 600, textTransform: 'uppercase', letterSpacing: '0.08em', color: 'var(--text-muted, #999)' }}>
      {label}
    </div>
    <div style={{ fontSize: small ? 16 : 20, fontWeight: 600, color: 'var(--text, #333)', marginTop: 4 }}>{value}</div>
    {sub && <div style={{ fontSize: 11, color: 'var(--text-muted, #999)', marginTop: 2 }}>{sub}</div>}
  </div>
)

const tbl = { width: '100%', borderCollapse: 'collapse' as const, fontSize: 13 }
const th  = { padding: '8px 12px', textAlign: 'left' as const, fontWeight: 600, fontSize: 11, textTransform: 'uppercase' as const, color: 'var(--text-muted, #999)', letterSpacing: '0.05em' }
const td  = { padding: '8px 12px', color: 'var(--text, #333)' }
const btn = { display: 'inline-block', padding: '10px 16px', background: 'var(--accent, #e87830)', color: '#fff', borderRadius: 6, textDecoration: 'none', fontSize: 14 }

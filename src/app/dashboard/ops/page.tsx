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
  capex: number
}

type SalesRow = { occurred_on: string; gross: number; source: string }
type LaborByDay = { occurred_on: string; total_cost: number; hours: number }
type CogsVar = { theoretical_cogs: number; actual_cogs: number; variance: number; variance_pct: number | null }

export default function OpsDashboard() {
  const [role, setRole] = useState<StaffRole | null>(null)
  const [pnl, setPnl] = useState<Pnl | null>(null)
  const [daily, setDaily] = useState<SalesRow[]>([])
  const [labor, setLabor] = useState<LaborByDay[]>([])
  const [cogsVar, setCogsVar] = useState<CogsVar | null>(null)
  const [loading, setLoading] = useState(true)
  const [period, setPeriod] = useState<'mtd' | 'last_month' | 'ytd'>('mtd')

  useEffect(() => {
    (async () => {
      const { data: { session } } = await supabase.auth.getSession()

      const user = session?.user
      if (!user) return
      const { data: su } = await supabase.from('staff_users').select('role').eq('email', user.email).single()
      setRole(su?.role || 'staff')
      await load(period)
    })()
  }, [period])

  async function load(p: typeof period) {
    setLoading(true)
    // Date range
    const now = new Date()
    let start: string, end: string
    if (p === 'mtd') {
      start = `${now.getUTCFullYear()}-${String(now.getUTCMonth() + 1).padStart(2, '0')}-01`
      end = today()
    } else if (p === 'last_month') {
      const lm = new Date(now.getUTCFullYear(), now.getUTCMonth() - 1, 1)
      start = `${lm.getUTCFullYear()}-${String(lm.getUTCMonth() + 1).padStart(2, '0')}-01`
      const eom = new Date(now.getUTCFullYear(), now.getUTCMonth(), 0)
      end = `${eom.getUTCFullYear()}-${String(eom.getUTCMonth() + 1).padStart(2, '0')}-${String(eom.getUTCDate()).padStart(2, '0')}`
    } else {
      start = `${now.getUTCFullYear()}-01-01`
      end = today()
    }

    const periodMonthStart = start.substring(0, 7) + '-01'
    const [sales, purchases, shifts, variance] = await Promise.all([
      ops().from('sales_daily').select('occurred_on,gross,source').gte('occurred_on', start).lte('occurred_on', end).order('occurred_on'),
      ops().from('purchases').select('amount,category,occurred_on').gte('occurred_on', start).lte('occurred_on', end),
      ops().from('labor_shifts').select('occurred_on,hours,shift_cost').gte('occurred_on', start).lte('occurred_on', end).order('occurred_on'),
      ops().from('v_theoretical_vs_actual_cogs').select('theoretical_cogs,actual_cogs,variance,variance_pct').eq('period_month', periodMonthStart).maybeSingle(),
    ])
    setCogsVar((variance.data as CogsVar) || null)

    const cogsCats = ['food', 'mixer', 'beer', 'wine', 'liquor', 'garnish']
    const opexCats = ['utilities', 'rent', 'marketing', 'repairs', 'consumable', 'other_opex']
    const sum = (rows: any[], pred: (r: any) => boolean) =>
      rows.filter(pred).reduce((a, r) => a + Number(r.amount || 0), 0)

    const salesRows = (sales.data || []) as SalesRow[]
    const purchaseRows = purchases.data || []
    const shiftRows = (shifts.data || []) as any[]

    setPnl({
      period_month: start,
      revenue: salesRows.reduce((a, r) => a + Number(r.gross || 0), 0),
      cogs:    sum(purchaseRows, r => cogsCats.includes(r.category)),
      labor:   shiftRows.reduce((a, r) => a + Number(r.shift_cost || 0), 0),
      opex:    sum(purchaseRows, r => opexCats.includes(r.category)),
      capex:   sum(purchaseRows, r => r.category === 'capex'),
    })

    // Daily sales (manual only — POS dupes when both exist)
    setDaily(salesRows.filter(r => r.source === 'manual'))

    // Labor per day
    const byDay = new Map<string, { hours: number; cost: number }>()
    shiftRows.forEach(s => {
      const cur = byDay.get(s.occurred_on) || { hours: 0, cost: 0 }
      cur.hours += Number(s.hours || 0)
      cur.cost  += Number(s.shift_cost || 0)
      byDay.set(s.occurred_on, cur)
    })
    setLabor(Array.from(byDay.entries()).map(([d, v]) => ({ occurred_on: d, total_cost: v.cost, hours: v.hours })))
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
  const net = ebitda - r.capex

  return (
    <div>
      <div style={{ display: 'flex', alignItems: 'baseline', justifyContent: 'space-between', marginBottom: 24 }}>
        <div>
          <h2 style={{ fontSize: 22, fontWeight: 600, color: 'var(--text, #333)' }}>Operations Dashboard</h2>
          <div style={{ fontSize: 12, color: 'var(--text-muted, #999)', marginTop: 2 }}>BigBamBoo · Live P&L</div>
        </div>
        <div style={{ display: 'flex', gap: 4 }}>
          {(['mtd', 'last_month', 'ytd'] as const).map(p => (
            <button key={p} onClick={() => setPeriod(p)} style={{
              padding: '6px 12px', fontSize: 12, borderRadius: 6, cursor: 'pointer',
              background: period === p ? 'var(--accent, #e87830)' : 'transparent',
              color: period === p ? '#fff' : 'var(--text-muted, #999)',
              border: '1px solid var(--border, #e5e5e5)',
            }}>{p === 'mtd' ? 'This Month' : p === 'last_month' ? 'Last Month' : 'YTD'}</button>
          ))}
        </div>
      </div>

      {/* KPI tiles */}
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', gap: 12, marginBottom: 24 }}>
        <Kpi label="Revenue"     value={vnd(r.revenue)} accent="#1F3864" />
        <Kpi label="Gross Profit" value={vnd(gp)}        sub={pct(gp / r.revenue)} accent="#548235" />
        <Kpi label="EBITDA"      value={vnd(ebitda)}    sub={pct(ebitda / r.revenue)} accent="#C65911" />
        <Kpi label="Net Income"  value={vnd(net)}       sub={pct(net / r.revenue)} accent="#548235" />
      </div>

      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', gap: 12, marginBottom: 32 }}>
        <Kpi label="COGS %"  value={pct(r.cogs / r.revenue)}  small />
        <Kpi label="Labor %" value={pct(r.labor / r.revenue)} small />
        <Kpi label="Opex %"  value={pct(r.opex / r.revenue)}  small />
        <Kpi label="EBITDA Margin" value={pct(ebitda / r.revenue)} small />
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

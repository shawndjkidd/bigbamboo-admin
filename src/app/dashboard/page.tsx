'use client'
import { useEffect, useState } from 'react'
import Link from 'next/link'
import { supabase } from '@/lib/supabase'
import { ops, vnd, today, canSeeDashboard, type StaffRole } from '@/lib/ops/api'

type DaySale = { occurred_on: string; net: number | null; gross: number | null; source?: string }
type EventRow = { id: string; title: string; event_date: string; capacity: number | null; ticket_price: number | null; is_free: boolean | null }
type ReconRow = { occurred_on: string; opening_float: number; cash_sales: number; payouts: number; counted_cash: number }
type Pnl = { period_month: string; revenue: number; cogs: number; labor: number; opex: number; depreciation: number; prepaid_expense: number; net_income_accrual: number }

export default function Overview() {
  const [role, setRole] = useState<StaffRole | null>(null)
  const [sales, setSales] = useState<DaySale[]>([])
  const [events, setEvents] = useState<EventRow[]>([])
  const [claims, setClaims] = useState({ active: 0, total: 0, members: 0 })
  const [belowPar, setBelowPar] = useState<number | null>(null)
  const [lastRecon, setLastRecon] = useState<ReconRow | null>(null)
  const [pnl, setPnl] = useState<Pnl[]>([])
  const [pnlMonth, setPnlMonth] = useState<string>('')
  const [loading, setLoading] = useState(true)

  useEffect(() => { load() }, [])

  async function load() {
    const { data: { session } } = await supabase.auth.getSession()
    const user = session?.user
    if (!user) return
    const { data: su } = await supabase.from('staff_users').select('role').eq('email', user.email).maybeSingle()
    const r = (su?.role || 'staff') as StaffRole
    setRole(r)

    const td = today()
    const since = new Date(); since.setDate(since.getDate() - 30)
    const sinceStr = since.toISOString().split('T')[0]

    const tasks: any[] = [
      supabase.from('events').select('id, title, event_date, capacity, ticket_price, is_free').gte('event_date', td).order('event_date').limit(5),
      supabase.from('promo_claims').select('status'),
      supabase.from('loyalty_memberships').select('id', { count: 'exact', head: true }),
      ops().from('ingredients').select('on_hand_base, par_level_base'),
    ]
    const fin = canSeeDashboard(r)
    if (fin) {
      tasks.push(ops().from('sales_daily').select('occurred_on, net, gross, source').gte('occurred_on', sinceStr).order('occurred_on', { ascending: false }))
      tasks.push(ops().from('cash_recon').select('occurred_on, opening_float, cash_sales, payouts, counted_cash').order('occurred_on', { ascending: false }).limit(1))
      tasks.push(ops().from('v_pnl_accrual').select('*').order('period_month', { ascending: false }))
    }
    const [ev, cl, mem, ing, s, rec, pl] = await Promise.all(tasks)
    setEvents((ev.data as EventRow[]) || [])
    const cd = cl.data || []
    setClaims({ active: cd.filter((c: any) => c.status === 'active' || c.status === 'issued').length, total: cd.length, members: mem.count || 0 })
    const ings = (ing.data || []) as any[]
    setBelowPar(ings.filter(i => i.par_level_base != null && i.on_hand_base != null && Number(i.on_hand_base) < Number(i.par_level_base)).length)
    if (s) setSales((s.data as DaySale[]) || [])
    if (rec) setLastRecon(((rec.data as ReconRow[]) || [])[0] || null)
    if (pl) {
      const rows = (pl.data as Pnl[]) || []
      setPnl(rows)
      const cm = today().slice(0, 7) + '-01'
      setPnlMonth(rows.some(r => r.period_month === cm) ? cm : (rows[0]?.period_month || cm))
    }
    setLoading(false)
  }

  const td = today()
  const monthStr = td.slice(0, 7)
  const weekAgo = (() => { const d = new Date(); d.setDate(d.getDate() - 6); return d.toISOString().split('T')[0] })()
  const num = (n: number | null) => Number(n || 0)
  // One figure per day = SUM of every source (Square sync + any manual adjustments such as
  // offline-flush day corrections), so a day reads its true net.
  const salesByDay: DaySale[] = (() => {
    const m = new Map<string, number>()
    for (const d of sales) m.set(d.occurred_on, (m.get(d.occurred_on) || 0) + num(d.net))
    return Array.from(m.entries()).map(([occurred_on, net]) => ({ occurred_on, net, gross: net })).sort((a, b) => b.occurred_on.localeCompare(a.occurred_on))
  })()
  const todayNet = salesByDay.filter(d => d.occurred_on === td).reduce((a, d) => a + num(d.net), 0)
  const weekNet = salesByDay.filter(d => d.occurred_on >= weekAgo).reduce((a, d) => a + num(d.net), 0)
  const monthNet = salesByDay.filter(d => d.occurred_on.startsWith(monthStr)).reduce((a, d) => a + num(d.net), 0)
  const net30 = salesByDay.reduce((a, d) => a + num(d.net), 0)
  const avg30 = salesByDay.length ? net30 / salesByDay.length : 0
  const canFinance = role ? canSeeDashboard(role) : false
  const reconVar = lastRecon ? num(lastRecon.counted_cash) - (num(lastRecon.opening_float) + num(lastRecon.cash_sales) - num(lastRecon.payouts)) : null

  // --- P&L (accrual) ---
  const months = pnl.map(p => p.period_month)
  const sel = pnl.find(p => p.period_month === pnlMonth) || null
  const ytdRows = pnl.filter(p => pnlMonth && p.period_month.slice(0, 4) === pnlMonth.slice(0, 4) && p.period_month <= pnlMonth)
  const sumF = (rows: Pnl[], k: keyof Pnl) => rows.reduce((a, r) => a + Number(r[k] || 0), 0)
  const pnlLabel = (m: string) => m ? new Date(m).toLocaleDateString(undefined, { month: 'long', year: 'numeric' }) : ''
  const idx = months.indexOf(pnlMonth)
  const goOlder = () => { if (idx >= 0 && idx < months.length - 1) setPnlMonth(months[idx + 1]) }
  const goNewer = () => { if (idx > 0) setPnlMonth(months[idx - 1]) }
  const isCurrentMonth = pnlMonth === today().slice(0, 7) + '-01'
  const pnlLines: [string, number, number, boolean][] = sel ? [
    ['Revenue', Number(sel.revenue), sumF(ytdRows, 'revenue'), false],
    ['Cost of goods (COGS)', -Number(sel.cogs), -sumF(ytdRows, 'cogs'), false],
    ['Gross profit', Number(sel.revenue) - Number(sel.cogs), sumF(ytdRows, 'revenue') - sumF(ytdRows, 'cogs'), true],
    ['Labor', -Number(sel.labor), -sumF(ytdRows, 'labor'), false],
    ['Operating expenses', -Number(sel.opex), -sumF(ytdRows, 'opex'), false],
    ['Depreciation', -Number(sel.depreciation), -sumF(ytdRows, 'depreciation'), false],
    ['Net income', Number(sel.net_income_accrual), sumF(ytdRows, 'net_income_accrual'), true],
  ] : []

  const card = { background: 'var(--bg-card)', border: '1px solid var(--border-light)', borderRadius: 14, padding: '18px 20px' } as const
  const kpiLabel = { fontSize: 12, fontWeight: 600, color: 'var(--text-muted)', textTransform: 'uppercase' as const, letterSpacing: '0.05em', marginBottom: 8 }
  const kpiVal = { fontSize: 26, fontWeight: 700, color: 'var(--text)' }
  const sectionH = { fontSize: 13, fontWeight: 700, textTransform: 'uppercase' as const, letterSpacing: '0.06em', color: 'var(--text-muted)', margin: '28px 0 12px' }
  const navBtn = { width: 30, height: 30, borderRadius: 8, border: '1px solid var(--border-light)', background: 'var(--bg-card)', color: 'var(--text)', cursor: 'pointer', fontSize: 14 } as const

  return (
    <div style={{ maxWidth: 960 }}>
      <h1 style={{ fontSize: 26, fontWeight: 700, margin: '0 0 2px' }}>BigBamBoo</h1>
      <p style={{ fontSize: 14, color: 'var(--text-muted)', margin: 0 }}>Overview · {new Date().toLocaleDateString(undefined, { weekday: 'long', day: 'numeric', month: 'long' })}</p>

      {/* Profit & Loss */}
      {canFinance && (
        <>
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', margin: '24px 0 12px', flexWrap: 'wrap', gap: 8 }}>
            <div style={{ ...sectionH, margin: 0 }}>Profit &amp; Loss {isCurrentMonth && <span style={{ color: 'var(--accent)' }}>· month to date</span>}</div>
            <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
              <button onClick={goOlder} disabled={idx < 0 || idx >= months.length - 1} style={navBtn}>←</button>
              <select value={pnlMonth} onChange={e => setPnlMonth(e.target.value)} style={{ padding: '6px 10px', fontSize: 13, fontWeight: 600, borderRadius: 8, border: '1px solid var(--border-light)', background: 'var(--bg-card)', color: 'var(--text)' }}>
                {months.map(m => <option key={m} value={m}>{pnlLabel(m)}</option>)}
              </select>
              <button onClick={goNewer} disabled={idx <= 0} style={navBtn}>→</button>
            </div>
          </div>
          <div style={card}>
            {!sel ? <div style={{ color: 'var(--text-muted)', fontSize: 14 }}>No P&amp;L data for this month yet.</div> : (
              <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 14 }}>
                <thead><tr>
                  <th style={{ textAlign: 'left', padding: '4px 0', fontSize: 11, fontWeight: 600, textTransform: 'uppercase', letterSpacing: '0.05em', color: 'var(--text-muted)' }}></th>
                  <th style={{ textAlign: 'right', padding: '4px 0', fontSize: 11, fontWeight: 600, textTransform: 'uppercase', letterSpacing: '0.05em', color: 'var(--text-muted)' }}>{pnlLabel(pnlMonth)}</th>
                  <th style={{ textAlign: 'right', padding: '4px 0 4px 24px', fontSize: 11, fontWeight: 600, textTransform: 'uppercase', letterSpacing: '0.05em', color: 'var(--text-muted)' }}>{pnlMonth.slice(0, 4)} YTD</th>
                </tr></thead>
                <tbody>
                  {pnlLines.map(([label, mv, yv, bold]) => (
                    <tr key={label} style={{ borderTop: bold ? '1px solid var(--border-light)' : 'none' }}>
                      <td style={{ padding: '8px 0', fontWeight: bold ? 700 : 400, color: bold ? 'var(--text)' : 'var(--text-secondary)' }}>{label}</td>
                      <td style={{ padding: '8px 0', textAlign: 'right', fontVariantNumeric: 'tabular-nums', fontWeight: bold ? 700 : 400, color: label === 'Net income' ? (mv >= 0 ? '#548235' : 'var(--burgundy, #7b2d3a)') : mv < 0 ? 'var(--text-muted)' : 'var(--text)' }}>{vnd(mv)}</td>
                      <td style={{ padding: '8px 0 8px 24px', textAlign: 'right', fontVariantNumeric: 'tabular-nums', fontWeight: bold ? 700 : 400, color: label === 'Net income' ? (yv >= 0 ? '#548235' : 'var(--burgundy, #7b2d3a)') : yv < 0 ? 'var(--text-muted)' : 'var(--text)' }}>{vnd(yv)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            )}
          </div>
        </>
      )}

      {/* Needs attention */}
      <div style={sectionH}>At a glance</div>
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: 16 }}>
        {canFinance && (
          <div style={card}>
            <div style={kpiLabel}>Today (net sales)</div>
            <div style={kpiVal}>{loading ? '—' : vnd(todayNet)}</div>
            <div style={{ fontSize: 12, color: 'var(--text-muted)', marginTop: 4 }}>{todayNet === 0 ? 'No sales synced yet today' : ''}</div>
          </div>
        )}
        <Link href="/dashboard/ops/ingredients?dept=bar&view=stock" style={{ ...card, textDecoration: 'none', display: 'block' }}>
          <div style={kpiLabel}>Items below par</div>
          <div style={{ ...kpiVal, color: belowPar && belowPar > 0 ? 'var(--burgundy, #7b2d3a)' : 'var(--text)' }}>{belowPar == null ? '—' : belowPar}</div>
          <div style={{ fontSize: 12, color: 'var(--text-muted)', marginTop: 4 }}>{belowPar ? 'Tap to reorder' : 'All stocked'}</div>
        </Link>
        {canFinance && (
          <Link href="/dashboard/ops/today" style={{ ...card, textDecoration: 'none', display: 'block' }}>
            <div style={kpiLabel}>Last cash count</div>
            <div style={{ ...kpiVal, color: reconVar == null ? 'var(--text)' : Math.abs(reconVar) < 1 ? '#6b7280' : Math.abs(reconVar) <= 50000 ? '#C65911' : 'var(--burgundy, #7b2d3a)' }}>
              {reconVar == null ? '—' : (reconVar >= 0 ? '+' : '') + vnd(reconVar)}
            </div>
            <div style={{ fontSize: 12, color: 'var(--text-muted)', marginTop: 4 }}>{lastRecon ? new Date(lastRecon.occurred_on).toLocaleDateString(undefined, { day: 'numeric', month: 'short' }) + (Math.abs(reconVar || 0) < 1 ? ' · balanced' : reconVar! > 0 ? ' · over' : ' · short') : 'No counts yet'}</div>
          </Link>
        )}
      </div>

      {canFinance && (
        <>
          <div style={sectionH}>Sales</div>
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', gap: 16 }}>
            <div style={card}><div style={kpiLabel}>This week (net)</div><div style={kpiVal}>{loading ? '—' : vnd(weekNet)}</div></div>
            <div style={card}><div style={kpiLabel}>This month (net)</div><div style={kpiVal}>{loading ? '—' : vnd(monthNet)}</div></div>
            <div style={card}><div style={kpiLabel}>Last 30 days</div><div style={kpiVal}>{loading ? '—' : vnd(net30)}</div></div>
            <div style={card}><div style={kpiLabel}>Avg / trading day</div><div style={kpiVal}>{loading ? '—' : vnd(avg30)}</div></div>
          </div>
          {sales.length > 0 && (
            <div style={{ ...card, marginTop: 16 }}>
              <div style={{ fontSize: 13, fontWeight: 600, marginBottom: 10 }}>Recent days</div>
              {salesByDay.slice(0, 6).map(d => (
                <div key={d.occurred_on} style={{ display: 'flex', justifyContent: 'space-between', fontSize: 13, padding: '7px 0', borderTop: '1px solid var(--border-light)', color: 'var(--text-secondary)' }}>
                  <span>{new Date(d.occurred_on).toLocaleDateString(undefined, { weekday: 'short', day: 'numeric', month: 'short' })}</span>
                  <span style={{ fontVariantNumeric: 'tabular-nums', color: 'var(--text)' }}>{vnd(num(d.net))}</span>
                </div>
              ))}
            </div>
          )}
        </>
      )}

      <div style={sectionH}>Upcoming events</div>
      <div style={card}>
        {loading ? <div style={{ color: 'var(--text-muted)', fontSize: 14 }}>Loading…</div>
          : events.length === 0 ? <div style={{ color: 'var(--text-muted)', fontSize: 14 }}>No upcoming events. <Link href="/dashboard/events" style={{ color: 'var(--accent)' }}>Add one →</Link></div>
            : events.map(e => (
              <div key={e.id} style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '10px 0', borderTop: '1px solid var(--border-light)' }}>
                <div>
                  <div style={{ fontSize: 14, fontWeight: 600 }}>{e.title}</div>
                  <div style={{ fontSize: 12, color: 'var(--text-muted)' }}>{new Date(e.event_date).toLocaleDateString(undefined, { weekday: 'long', day: 'numeric', month: 'long' })}</div>
                </div>
                <div style={{ fontSize: 13, color: 'var(--text-secondary)' }}>{e.is_free ? 'Free' : (e.ticket_price ? vnd(Number(e.ticket_price)) : '')}{e.capacity ? ` · cap ${e.capacity}` : ''}</div>
              </div>
            ))}
      </div>

      <div style={sectionH}>Loyalty &amp; claims</div>
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: 16 }}>
        <div style={card}><div style={kpiLabel}>Active prize claims</div><div style={kpiVal}>{loading ? '—' : claims.active}</div></div>
        <div style={card}><div style={kpiLabel}>Total claims</div><div style={kpiVal}>{loading ? '—' : claims.total}</div></div>
        <div style={card}><div style={kpiLabel}>Loyalty members</div><div style={kpiVal}>{loading ? '—' : claims.members}</div></div>
      </div>

      <div style={sectionH}>Quick actions</div>
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(2, 1fr)', gap: 12 }}>
        {[
          { href: '/dashboard/ops/today', label: 'Daily cash count', desc: 'Reconcile cash vs sales' },
          { href: '/dashboard/ops/ingredients?dept=bar&view=vendors', label: 'Order from vendors', desc: 'Build & send supplier orders' },
          { href: '/dashboard/menu', label: 'Edit menu', desc: 'Items, prices, sections' },
          { href: '/dashboard/events', label: 'Events', desc: 'Manage events and tickets' },
        ].map(q => (
          <Link key={q.href} href={q.href} style={{ display: 'block', padding: '16px 18px', background: 'var(--bg-card)', borderRadius: 12, border: '1px solid var(--border-light)', textDecoration: 'none' }}>
            <div style={{ fontSize: 15, fontWeight: 600, color: 'var(--text)', marginBottom: 3 }}>{q.label}</div>
            <div style={{ fontSize: 13, color: 'var(--text-muted)' }}>{q.desc}</div>
          </Link>
        ))}
      </div>
    </div>
  )
}

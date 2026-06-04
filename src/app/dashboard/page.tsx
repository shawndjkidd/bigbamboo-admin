'use client'
import { useEffect, useState } from 'react'
import Link from 'next/link'
import { supabase } from '@/lib/supabase'
import { ops, vnd, today, canSeeDashboard, type StaffRole } from '@/lib/ops/api'

type DaySale = { occurred_on: string; net: number | null; gross: number | null }
type EventRow = { id: string; title: string; event_date: string; capacity: number | null; ticket_price: number | null; is_free: boolean | null }

export default function Overview() {
  const [role, setRole] = useState<StaffRole | null>(null)
  const [sales, setSales] = useState<DaySale[]>([])
  const [events, setEvents] = useState<EventRow[]>([])
  const [claims, setClaims] = useState({ active: 0, total: 0, members: 0 })
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
    ]
    if (canSeeDashboard(r)) {
      tasks.push(ops().from('sales_daily').select('occurred_on, net, gross').gte('occurred_on', sinceStr).order('occurred_on', { ascending: false }))
    }
    const [ev, cl, mem, s] = await Promise.all(tasks)
    setEvents((ev.data as EventRow[]) || [])
    const cd = cl.data || []
    setClaims({ active: cd.filter((c: any) => c.status === 'active').length, total: cd.length, members: mem.count || 0 })
    if (s) setSales((s.data as DaySale[]) || [])
    setLoading(false)
  }

  const monthStr = today().slice(0, 7)
  const num = (n: number | null) => Number(n || 0)
  const monthNet = sales.filter(d => d.occurred_on.startsWith(monthStr)).reduce((a, d) => a + num(d.net), 0)
  const net30 = sales.reduce((a, d) => a + num(d.net), 0)
  const avg30 = sales.length ? net30 / sales.length : 0
  const canFinance = role ? canSeeDashboard(role) : false

  const card = { background: 'var(--bg-card)', border: '1px solid var(--border-light)', borderRadius: 14, padding: '18px 20px' } as const
  const kpiLabel = { fontSize: 12, fontWeight: 600, color: 'var(--text-muted)', textTransform: 'uppercase' as const, letterSpacing: '0.05em', marginBottom: 8 }
  const kpiVal = { fontSize: 26, fontWeight: 700, color: 'var(--text)' }
  const sectionH = { fontSize: 13, fontWeight: 700, textTransform: 'uppercase' as const, letterSpacing: '0.06em', color: 'var(--text-muted)', margin: '28px 0 12px' }

  return (
    <div style={{ maxWidth: 960 }}>
      <h1 style={{ fontSize: 26, fontWeight: 700, margin: '0 0 2px' }}>BigBamBoo</h1>
      <p style={{ fontSize: 14, color: 'var(--text-muted)', margin: 0 }}>Overview</p>

      {canFinance && (
        <>
          <div style={sectionH}>Sales · last 30 days</div>
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: 16 }}>
            <div style={card}><div style={kpiLabel}>This month (net)</div><div style={kpiVal}>{loading ? '—' : vnd(monthNet)}</div></div>
            <div style={card}><div style={kpiLabel}>Last 30 days (net)</div><div style={kpiVal}>{loading ? '—' : vnd(net30)}</div></div>
            <div style={card}><div style={kpiLabel}>Avg / day</div><div style={kpiVal}>{loading ? '—' : vnd(avg30)}</div></div>
          </div>
          {sales.length > 0 && (
            <div style={{ ...card, marginTop: 16 }}>
              <div style={{ fontSize: 13, fontWeight: 600, marginBottom: 10 }}>Recent days</div>
              {sales.slice(0, 6).map(d => (
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
          { href: '/dashboard/menu', label: 'Edit menu', desc: 'Update items, prices, sections' },
          { href: '/dashboard/events', label: 'Events', desc: 'Manage events and tickets' },
          { href: '/dashboard/ops/today', label: 'Daily sales', desc: 'Enter today’s numbers' },
          { href: '/dashboard/ops/recipes', label: 'Recipes', desc: 'Recipes and costs' },
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

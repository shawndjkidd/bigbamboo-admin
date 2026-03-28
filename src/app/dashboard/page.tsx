'use client'
import { useEffect, useState } from 'react'
import { supabase } from '@/lib/supabase'
import Link from 'next/link'

interface Stats {
  menu: number
  events: number
  customers: number
  stamps: number
  ticketOrders: number
  pendingOrders: number
  checkedIn: number
  totalTickets: number
  recentOrders: any[]
  todayStamps: number
  rewardsRedeemed: number
}

export default function DashboardPage() {
  const [stats, setStats] = useState<Stats>({
    menu: 0, events: 0, customers: 0, stamps: 0,
    ticketOrders: 0, pendingOrders: 0, checkedIn: 0, totalTickets: 0,
    recentOrders: [], todayStamps: 0, rewardsRedeemed: 0
  })
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    async function loadStats() {
      const today = new Date().toISOString().split('T')[0]

      const [menu, events, customers, stamps, orders, todayStamps, memberships] = await Promise.all([
        supabase.from('menu_items').select('id', { count: 'exact', head: true }),
        supabase.from('events').select('id', { count: 'exact', head: true }).eq('is_published', true),
        supabase.from('customers').select('id', { count: 'exact', head: true }),
        supabase.from('loyalty_stamps').select('id', { count: 'exact', head: true }).eq('is_void', false),
        supabase.from('ticket_orders').select('*').order('created_at', { ascending: false }).limit(50),
        supabase.from('loyalty_stamps').select('id', { count: 'exact', head: true }).gte('created_at', today),
        supabase.from('loyalty_memberships').select('rewards_redeemed').gt('rewards_redeemed', 0),
      ])

      const orderData = orders.data || []
      const pendingOrders = orderData.filter(o => o.status === 'pending_payment').length
      const checkedIn = orderData.filter(o => o.checked_in).length
      const totalTickets = orderData.reduce((sum: number, o: any) => sum + (o.quantity || 1), 0)
      const rewardsRedeemed = (memberships.data || []).reduce((a: number, r: any) => a + (r.rewards_redeemed || 0), 0)

      setStats({
        menu: menu.count || 0,
        events: events.count || 0,
        customers: customers.count || 0,
        stamps: stamps.count || 0,
        ticketOrders: orderData.length,
        pendingOrders,
        checkedIn,
        totalTickets,
        recentOrders: orderData.slice(0, 8),
        todayStamps: todayStamps.count || 0,
        rewardsRedeemed,
      })
      setLoading(false)
    }
    loadStats()
  }, [])

  const kpis = [
    { label: 'Club Members', value: stats.customers, icon: '👥', href: '/dashboard/loyalty', color: 'var(--accent)' },
    { label: 'Total Tickets Sold', value: stats.totalTickets, icon: '🎟️', href: '/dashboard/tickets', color: 'var(--green)' },
    { label: 'Pending Payments', value: stats.pendingOrders, icon: '⏳', href: '/dashboard/tickets', color: 'var(--badge-orange-text)' },
    { label: 'Stamps Today', value: stats.todayStamps, icon: '✦', href: '/dashboard/loyalty', color: 'var(--blue)' },
  ]

  const overviewCards = [
    { label: 'Active Events', value: stats.events, href: '/dashboard/events' },
    { label: 'Menu Items', value: stats.menu, href: '/dashboard/menu' },
    { label: 'Lifetime Stamps', value: stats.stamps, href: '/dashboard/loyalty' },
    { label: 'Rewards Redeemed', value: stats.rewardsRedeemed, href: '/dashboard/loyalty' },
    { label: 'Checked In', value: stats.checkedIn, href: '/dashboard/tickets' },
    { label: 'Ticket Orders', value: stats.ticketOrders, href: '/dashboard/tickets' },
  ]

  const quickActions = [
    { label: 'Edit Menu', desc: 'Update items, prices & availability', href: '/dashboard/menu', icon: '🍹' },
    { label: 'Create Event', desc: 'Add a new event listing', href: '/dashboard/events', icon: '📅' },
    { label: 'Update Hours', desc: 'Change opening hours & info', href: '/dashboard/hours', icon: '🕐' },
    { label: 'Issue Stamp', desc: 'Add stamps to a member card', href: '/dashboard/loyalty', icon: '✦' },
    { label: 'Manage Tickets', desc: 'View orders, confirm payments', href: '/dashboard/tickets', icon: '🎟️' },
    { label: 'View Live Site', desc: 'bigbamboo.app', href: 'https://bigbamboo.app', icon: '🌐', external: true },
  ]

  function statusBadgeClass(status: string) {
    if (status === 'confirmed') return 'badge badge-green'
    if (status === 'pending_payment') return 'badge badge-orange'
    if (status === 'cancelled') return 'badge badge-red'
    return 'badge badge-gray'
  }

  function statusLabel(status: string) {
    if (status === 'confirmed') return 'Confirmed'
    if (status === 'pending_payment') return 'Pending'
    if (status === 'cancelled') return 'Cancelled'
    return status
  }

  if (loading) return (
    <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', minHeight: 400 }}>
      <div style={{ textAlign: 'center' }}>
        <div style={{ fontFamily: 'Bebas Neue', fontSize: 28, letterSpacing: '0.06em', color: 'var(--accent)', marginBottom: 8 }}>Loading</div>
        <div style={{ fontSize: 13, color: 'var(--text-muted)' }}>Fetching dashboard data...</div>
      </div>
    </div>
  )

  return (
    <div style={{ maxWidth: 1100 }}>
      {/* Header */}
      <div style={{ marginBottom: 32 }}>
        <div className="page-title" style={{ fontSize: 36, marginBottom: 4 }}>Dashboard</div>
        <div style={{ fontSize: 14, color: 'var(--text-muted)' }}>bigbamboo.app — An Phu, Saigon</div>
      </div>

      {/* KPI Cards */}
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', gap: 16, marginBottom: 32 }}>
        {kpis.map(kpi => (
          <Link key={kpi.label} href={kpi.href} style={{ textDecoration: 'none' }}>
            <div className="card kpi-card" style={{ transition: 'box-shadow 0.15s, border-color 0.15s', cursor: 'pointer' }}
              onMouseEnter={e => { e.currentTarget.style.boxShadow = 'var(--shadow-lg)'; e.currentTarget.style.borderColor = 'var(--accent)' }}
              onMouseLeave={e => { e.currentTarget.style.boxShadow = 'var(--shadow)'; e.currentTarget.style.borderColor = 'var(--border)' }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start' }}>
                <div>
                  <div className="kpi-label">{kpi.label}</div>
                  <div className="kpi-value" style={{ color: kpi.color }}>{kpi.value}</div>
                </div>
                <div style={{ fontSize: 28, opacity: 0.7 }}>{kpi.icon}</div>
              </div>
            </div>
          </Link>
        ))}
      </div>

      {/* Overview Grid */}
      <div style={{ marginBottom: 32 }}>
        <div className="section-title" style={{ marginBottom: 14 }}>Overview</div>
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(6, 1fr)', gap: 12 }}>
          {overviewCards.map(card => (
            <Link key={card.label} href={card.href} style={{ textDecoration: 'none' }}>
              <div className="card" style={{ padding: '16px 18px', textAlign: 'center', transition: 'border-color 0.15s', cursor: 'pointer' }}
                onMouseEnter={e => e.currentTarget.style.borderColor = 'var(--text-muted)'}
                onMouseLeave={e => e.currentTarget.style.borderColor = 'var(--border)'}>
                <div style={{ fontFamily: 'Bebas Neue', fontSize: 32, letterSpacing: '0.02em', color: 'var(--text)', lineHeight: 1 }}>{card.value}</div>
                <div style={{ fontSize: 12, color: 'var(--text-muted)', marginTop: 6 }}>{card.label}</div>
              </div>
            </Link>
          ))}
        </div>
      </div>

      {/* Two columns: Recent Orders + Quick Actions */}
      <div style={{ display: 'grid', gridTemplateColumns: '1fr 380px', gap: 20 }}>

        {/* Recent Ticket Orders */}
        <div className="card" style={{ overflow: 'hidden' }}>
          <div style={{ padding: '18px 20px', borderBottom: '1px solid var(--border)', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
            <div className="section-title">Recent Ticket Orders</div>
            <Link href="/dashboard/tickets" style={{ fontSize: 13, color: 'var(--accent)', textDecoration: 'none', fontWeight: 500 }}>View all →</Link>
          </div>
          {stats.recentOrders.length === 0 ? (
            <div style={{ padding: 32, textAlign: 'center', color: 'var(--text-muted)', fontSize: 14 }}>No ticket orders yet</div>
          ) : (
            <table className="data-table">
              <thead>
                <tr>
                  <th>Name</th>
                  <th>Event</th>
                  <th>Qty</th>
                  <th>Status</th>
                  <th>Date</th>
                </tr>
              </thead>
              <tbody>
                {stats.recentOrders.map(order => (
                  <tr key={order.id}>
                    <td style={{ fontWeight: 500 }}>{order.name}</td>
                    <td style={{ color: 'var(--text-secondary)', fontSize: 13 }}>{order.event_title || '—'}</td>
                    <td>{order.quantity || 1}</td>
                    <td><span className={statusBadgeClass(order.status)}>{statusLabel(order.status)}</span></td>
                    <td style={{ color: 'var(--text-muted)', fontSize: 13 }}>{new Date(order.created_at).toLocaleDateString('en', { day: 'numeric', month: 'short' })}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </div>

        {/* Quick Actions */}
        <div>
          <div className="section-title" style={{ marginBottom: 14 }}>Quick Actions</div>
          <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
            {quickActions.map(a => {
              const isExternal = (a as any).external
              const Tag = isExternal ? 'a' : Link
              const props: any = isExternal
                ? { href: a.href, target: '_blank', rel: 'noopener noreferrer' }
                : { href: a.href }
              return (
                <Tag key={a.label} {...props} style={{ textDecoration: 'none' }}>
                  <div className="card" style={{ padding: '14px 18px', display: 'flex', gap: 14, alignItems: 'center', transition: 'border-color 0.15s, box-shadow 0.15s', cursor: 'pointer' }}
                    onMouseEnter={e => { e.currentTarget.style.borderColor = 'var(--accent)'; e.currentTarget.style.boxShadow = 'var(--shadow-lg)' }}
                    onMouseLeave={e => { e.currentTarget.style.borderColor = 'var(--border)'; e.currentTarget.style.boxShadow = 'var(--shadow)' }}>
                    <div style={{ fontSize: 22, width: 36, textAlign: 'center', flexShrink: 0 }}>{a.icon}</div>
                    <div>
                      <div style={{ fontSize: 14, fontWeight: 600, color: 'var(--text)', marginBottom: 2 }}>{a.label}</div>
                      <div style={{ fontSize: 13, color: 'var(--text-muted)' }}>{a.desc}</div>
                    </div>
                  </div>
                </Tag>
              )
            })}
          </div>
        </div>
      </div>
    </div>
  )
}

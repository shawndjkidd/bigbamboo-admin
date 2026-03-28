'use client'
import { useEffect, useState } from 'react'
import { supabase } from '@/lib/supabase'
import Link from 'next/link'

export default function DashboardPage() {
  const [stats, setStats] = useState({ menu: 0, events: 0, customers: 0, stamps: 0 })

  useEffect(() => {
    async function loadStats() {
      const [menu, events, customers, stamps] = await Promise.all([
        supabase.from('menu_items').select('id', { count: 'exact', head: true }),
        supabase.from('events').select('id', { count: 'exact', head: true }).eq('is_published', true),
        supabase.from('customers').select('id', { count: 'exact', head: true }),
        supabase.from('loyalty_stamps').select('id', { count: 'exact', head: true }).eq('is_void', false),
      ])
      setStats({
        menu: menu.count || 0,
        events: events.count || 0,
        customers: customers.count || 0,
        stamps: stamps.count || 0,
      })
    }
    loadStats()
  }, [])

  const statCards = [
    { label: 'Menu Items', value: stats.menu, href: '/dashboard/menu' },
    { label: 'Active Events', value: stats.events, href: '/dashboard/events' },
    { label: 'Club Members', value: stats.customers, href: '/dashboard/loyalty' },
    { label: 'Stamps Issued', value: stats.stamps, href: '/dashboard/loyalty' },
  ]

  const quickActions = [
    { label: 'Edit Menu', desc: 'Update items, prices, availability', href: '/dashboard/menu' },
    { label: 'Add Event', desc: 'Create a new event listing', href: '/dashboard/events' },
    { label: 'Update Hours', desc: 'Change opening hours & location', href: '/dashboard/hours' },
    { label: 'Issue Stamp', desc: 'Add stamps to a member card', href: '/dashboard/loyalty' },
  ]

  return (
    <div>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: 28 }}>
        <div>
          <div className="page-title">Dashboard</div>
          <div style={{ fontSize: 13, color: 'var(--text-muted)', marginTop: 4 }}>bigbamboo.app</div>
        </div>
        <a href="https://bigbamboo.app" target="_blank" rel="noopener noreferrer" style={{
          fontSize: 13, color: 'var(--accent)', textDecoration: 'none', fontWeight: 500,
        }}>
          View live site \u2197
        </a>
      </div>

      {/* Stats */}
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(160px, 1fr))', gap: 14, marginBottom: 28 }}>
        {statCards.map(s => (
          <Link key={s.label} href={s.href} style={{ textDecoration: 'none' }}>
            <div className="card kpi-card">
              <div className="kpi-label">{s.label}</div>
              <div className="kpi-value" style={{ color: 'var(--accent)' }}>{s.value}</div>
            </div>
          </Link>
        ))}
      </div>

      {/* Quick Actions */}
      <div className="section-title" style={{ marginBottom: 14 }}>Quick Actions</div>
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(220px, 1fr))', gap: 10 }}>
        {quickActions.map(a => (
          <Link key={a.label} href={a.href} style={{ textDecoration: 'none' }}>
            <div className="card" style={{ padding: 16, transition: 'border-color 0.15s' }}>
              <div style={{ fontSize: 14, fontWeight: 600, color: 'var(--text)', marginBottom: 4 }}>{a.label}</div>
              <div style={{ fontSize: 12, color: 'var(--text-muted)' }}>{a.desc}</div>
            </div>
          </Link>
        ))}
      </div>
    </div>
  )
}

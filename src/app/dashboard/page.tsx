'use client'
import { useEffect, useState } from 'react'
import { supabase } from '@/lib/supabase'
import Link from 'next/link'

export default function Overview() {
  const [venueId, setVenueId] = useState('')
  const [venueName, setVenueName] = useState('')
  const [stats, setStats] = useState({ plays: 0, redeemed: 0, walletAdds: 0, customers: 0 })
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    async function init() {
      const { data: { user } } = await supabase.auth.getUser()
      if (!user) return
      const { data: staff } = await supabase.from('staff_users').select('venue_id, venue:venues(name)').eq('email', user.email).single()
      if (staff) {
        setVenueId(staff.venue_id)
        setVenueName((staff.venue as any)?.name || 'Your Venue')
      }
    }
    init()
  }, [])

  useEffect(() => {
    if (!venueId) return
    async function load() {
      const today = new Date().toISOString().split('T')[0]
      const [plays, redeemed, wallet, customers] = await Promise.all([
        supabase.from('coconut_plays').select('id', { count: 'exact', head: true }).eq('venue_id', venueId),
        supabase.from('coconut_plays').select('id', { count: 'exact', head: true }).eq('venue_id', venueId).eq('redeemed', true),
        supabase.from('coconut_plays').select('id', { count: 'exact', head: true }).eq('venue_id', venueId).eq('wallet_pass_added', true),
        supabase.from('customers').select('id', { count: 'exact', head: true }).eq('venue_id', venueId),
      ])
      setStats({
        plays: plays.count || 0,
        redeemed: redeemed.count || 0,
        walletAdds: wallet.count || 0,
        customers: customers.count || 0,
      })
      setLoading(false)
    }
    load()
  }, [venueId])

  const kpis = [
    { label: 'Total Plays', value: stats.plays, color: '#e87830' },
    { label: 'Prizes Redeemed', value: stats.redeemed, color: '#4aaa90' },
    { label: 'Wallet Saves', value: stats.walletAdds, color: '#3b82f6' },
    { label: 'Customers', value: stats.customers, color: '#a855f7' },
  ]

  const quickLinks = [
    { href: '/dashboard/giveaway/prizes', label: 'Prize Setup', desc: 'Configure prizes and win percentages' },
    { href: '/dashboard/giveaway/photos', label: 'Spin Photos', desc: 'Manage the slot-machine photo reel' },
    { href: '/dashboard/redeem', label: 'Redeem Prize', desc: 'Scan QR codes to validate prizes' },
    { href: '/dashboard/giveaway/stats', label: 'Game Stats', desc: 'View play analytics and conversion data' },
  ]

  return (
    <div style={{ maxWidth: 960, margin: '0 auto' }}>
      <h1 style={{ fontSize: 26, fontWeight: 700, margin: '0 0 4px', color: 'var(--text, #333)' }}>
        {venueName}
      </h1>
      <p style={{ fontSize: 14, color: 'var(--text-muted, #999)', margin: '0 0 28px' }}>
        Overview
      </p>

      {/* KPIs */}
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', gap: 16, marginBottom: 32 }}>
        {kpis.map(k => (
          <div key={k.label} style={{
            background: 'var(--bg-card, #fff)', borderRadius: 12,
            border: '1px solid var(--border, #e5e5e5)', padding: '20px 18px',
          }}>
            <div style={{ fontSize: 12, fontWeight: 600, color: 'var(--text-muted, #999)', textTransform: 'uppercase', letterSpacing: '0.04em', marginBottom: 8 }}>
              {k.label}
            </div>
            <div style={{ fontSize: 32, fontWeight: 700, color: k.color, fontFeatureSettings: '"tnum"' }}>
              {loading ? '—' : k.value.toLocaleString()}
            </div>
          </div>
        ))}
      </div>

      {/* Quick links */}
      <h2 style={{ fontSize: 16, fontWeight: 700, margin: '0 0 14px', color: 'var(--text, #333)' }}>Quick Actions</h2>
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(2, 1fr)', gap: 12 }}>
        {quickLinks.map(q => (
          <Link key={q.href} href={q.href} style={{
            display: 'block', padding: '18px 20px',
            background: 'var(--bg-card, #fff)', borderRadius: 12,
            border: '1px solid var(--border, #e5e5e5)',
            textDecoration: 'none', transition: 'border-color 0.12s',
          }}>
            <div style={{ fontSize: 15, fontWeight: 600, color: 'var(--text, #333)', marginBottom: 4 }}>{q.label}</div>
            <div style={{ fontSize: 13, color: 'var(--text-muted, #999)' }}>{q.desc}</div>
          </Link>
        ))}
      </div>
    </div>
  )
}

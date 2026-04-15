'use client'
import { useEffect, useState } from 'react'
import { supabase } from '@/lib/supabase'
import Link from 'next/link'

interface RecentClaim {
  id: string; claim_code: string; prize_label: string; contact_type: string;
  contact_value: string; status: string; issued_at: string;
}

export default function DashboardPage() {
  const [stats, setStats] = useState({ menu: 0, events: 0, customers: 0, stamps: 0 })
  const [gameStats, setGameStats] = useState({ claims: 0, unredeemed: 0, contacts: 0 })
  const [recentClaims, setRecentClaims] = useState<RecentClaim[]>([])

  useEffect(() => {
    async function loadStats() {
      const [menu, events, customers, stamps, claims, unredeemed, contacts, recent] = await Promise.all([
        supabase.from('menu_items').select('id', { count: 'exact', head: true }),
        supabase.from('events').select('id', { count: 'exact', head: true }).eq('is_published', true),
        supabase.from('customers').select('id', { count: 'exact', head: true }),
        supabase.from('loyalty_stamps').select('id', { count: 'exact', head: true }).eq('is_void', false),
        supabase.from('promo_claims').select('id', { count: 'exact', head: true }).eq('source_code', 'SCAN_TAP_WIN'),
        supabase.from('promo_claims').select('id', { count: 'exact', head: true }).eq('source_code', 'SCAN_TAP_WIN').eq('status', 'active'),
        supabase.from('promo_claims').select('id', { count: 'exact', head: true }).eq('source_code', 'SCAN_TAP_WIN').neq('contact_type', 'anonymous'),
        supabase.from('promo_claims').select('id, claim_code, prize_label, contact_type, contact_value, status, issued_at').eq('source_code', 'SCAN_TAP_WIN').order('issued_at', { ascending: false }).limit(5),
      ])
      setStats({
        menu: menu.count || 0,
        events: events.count || 0,
        customers: customers.count || 0,
        stamps: stamps.count || 0,
      })
      setGameStats({
        claims: claims.count || 0,
        unredeemed: unredeemed.count || 0,
        contacts: contacts.count || 0,
      })
      setRecentClaims(recent.data || [])
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
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(220px, 1fr))', gap: 10, marginBottom: 28 }}>
        {quickActions.map(a => (
          <Link key={a.label} href={a.href} style={{ textDecoration: 'none' }}>
            <div className="card" style={{ padding: 16, transition: 'border-color 0.15s' }}>
              <div style={{ fontSize: 14, fontWeight: 600, color: 'var(--text)', marginBottom: 4 }}>{a.label}</div>
              <div style={{ fontSize: 12, color: 'var(--text-muted)' }}>{a.desc}</div>
            </div>
          </Link>
        ))}
      </div>

      {/* Game Notifications */}
      {gameStats.claims > 0 && (
        <>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 14 }}>
            <div className="section-title">Scan.Tap.Win</div>
            <Link href="/dashboard/claims" style={{ fontSize: 12, color: 'var(--accent)', textDecoration: 'none', fontWeight: 500 }}>
              View all claims &rarr;
            </Link>
          </div>

          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(140px, 1fr))', gap: 14, marginBottom: 16 }}>
            <div className="card kpi-card">
              <div className="kpi-label">Game Claims</div>
              <div className="kpi-value" style={{ color: 'var(--accent)' }}>{gameStats.claims}</div>
            </div>
            <div className="card kpi-card">
              <div className="kpi-label">Unredeemed</div>
              <div className="kpi-value" style={{ color: '#e8a820' }}>{gameStats.unredeemed}</div>
            </div>
            <div className="card kpi-card">
              <div className="kpi-label">Contacts Captured</div>
              <div className="kpi-value" style={{ color: '#00b14f' }}>{gameStats.contacts}</div>
            </div>
          </div>

          {recentClaims.length > 0 && (
            <div className="card" style={{ padding: 0, overflow: 'hidden', marginBottom: 28 }}>
              <div style={{ padding: '12px 16px', borderBottom: '1px solid var(--border)', fontSize: 12, fontWeight: 600, color: 'var(--text-muted)', textTransform: 'uppercase', letterSpacing: '0.06em' }}>
                Recent Claims
              </div>
              {recentClaims.map(c => (
                <div key={c.id} style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '10px 16px', borderBottom: '1px solid var(--border)' }}>
                  <div>
                    <div style={{ fontSize: 13, fontWeight: 500, color: 'var(--text)' }}>{c.prize_label}</div>
                    <div style={{ fontSize: 11, color: 'var(--text-muted)' }}>
                      {c.contact_type === 'anonymous' ? 'Anonymous' : c.contact_value} &middot; {c.claim_code}
                    </div>
                  </div>
                  <div style={{ textAlign: 'right' }}>
                    <span style={{
                      display: 'inline-block', padding: '2px 8px', borderRadius: 100, fontSize: 10,
                      fontWeight: 600, letterSpacing: '0.04em',
                      background: c.status === 'redeemed' ? 'rgba(0,177,79,0.1)' : 'rgba(232,168,32,0.1)',
                      color: c.status === 'redeemed' ? '#00b14f' : '#e8a820',
                      border: `1px solid ${c.status === 'redeemed' ? 'rgba(0,177,79,0.25)' : 'rgba(232,168,32,0.25)'}`,
                    }}>
                      {c.status === 'redeemed' ? 'Redeemed' : 'Active'}
                    </span>
                    <div style={{ fontSize: 10, color: 'var(--text-muted)', marginTop: 2 }}>
                      {new Date(c.issued_at).toLocaleDateString('en-US', { day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit' })}
                    </div>
                  </div>
                </div>
              ))}
            </div>
          )}
        </>
      )}
    </div>
  )
}

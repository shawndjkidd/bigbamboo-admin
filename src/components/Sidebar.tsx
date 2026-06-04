'use client'
import Link from 'next/link'
import { usePathname, useRouter } from 'next/navigation'
import { supabase } from '@/lib/supabase'

interface NavItem {
  href: string
  label: string
  section?: boolean
  adminOnly?: boolean
}

const NAV: NavItem[] = [
  { href: '/dashboard', label: 'Overview' },

  { href: '#menu-events', label: 'Menu & Events', section: true },
  { href: '/dashboard/menu', label: 'Menu' },
  { href: '/dashboard/events', label: 'Events' },
  { href: '/dashboard/tickets', label: 'Tickets' },

  { href: '#kitchen-bar', label: 'Kitchen & Bar', section: true },
  { href: '/dashboard/ops/recipes', label: 'Recipes' },
  { href: '/dashboard/ops/ingredients', label: 'Ingredients' },

  { href: '#financials', label: 'Financials', section: true },
  { href: '/dashboard/ops', label: 'Dashboard' },
  { href: '/dashboard/ops/today', label: 'Daily Sales' },
  { href: '/dashboard/ops/purchase', label: 'Add Purchase' },
  { href: '/dashboard/ops/square', label: 'Square POS' },

  { href: '#jukebox', label: 'Jukebox', section: true },
  { href: '/jukebox/admin', label: 'Requests & Queue' },

  { href: '#engagement', label: 'Engagement', section: true },
  { href: '/dashboard/game', label: 'QR Game' },
  { href: '/dashboard/loyalty', label: 'Loyalty' },
  { href: '/dashboard/claims', label: 'Prize Claims' },
  { href: '/dashboard/scan', label: 'Scan / Redeem' },

  { href: '#admin', label: 'Admin', section: true },
  { href: '/dashboard/hours', label: 'Opening Hours' },
  { href: '/dashboard/profile', label: 'Profile' },
  { href: '/dashboard/staff', label: 'Staff', adminOnly: true },
  { href: '/dashboard/settings', label: 'Settings', adminOnly: true },
]

export default function Sidebar({ role, venueName }: { role: string; venueName: string }) {
  const pathname = usePathname()
  const router = useRouter()

  async function handleSignOut() {
    await supabase.auth.signOut()
    router.push('/login')
  }

  function toggleTheme() {
    const html = document.documentElement
    const current = html.getAttribute('data-theme')
    const next = current === 'dark' ? 'light' : 'dark'
    html.setAttribute('data-theme', next)
    localStorage.setItem('theme', next)
  }

  return (
    <aside style={{
      width: 220, flexShrink: 0,
      background: 'var(--bg-sidebar, #fafafa)',
      borderRight: '1px solid var(--border, #e5e5e5)',
      display: 'flex', flexDirection: 'column',
      height: '100vh', position: 'sticky', top: 0,
      transition: 'background 0.2s',
    }}>
      {/* Brand */}
      <div style={{ padding: '24px 20px 8px' }}>
        <div style={{ fontSize: 18, fontWeight: 700, letterSpacing: '0.02em', color: 'var(--accent, #e87830)' }}>
          BigBamBoo
        </div>
        <div style={{ fontSize: 12, fontWeight: 500, color: 'var(--text-muted, #999)', marginTop: 2 }}>
          {venueName}
        </div>
        <div style={{ fontSize: 11, letterSpacing: '0.04em', textTransform: 'uppercase', color: 'var(--text-muted, #999)', marginTop: 2 }}>
          {role === 'super_admin' ? 'Super Admin' : role === 'admin' ? 'Admin' : role === 'scanner' ? 'Staff' : 'Manager'}
        </div>
      </div>

      {/* Nav */}
      <nav style={{ flex: 1, overflowY: 'auto', padding: '8px 0' }}>
        {NAV.filter(item => !item.adminOnly || ['super_admin', 'admin'].includes(role)).map((item, i) => {
          const active = item.href === '/dashboard'
            ? pathname === '/dashboard'
            : !item.section && pathname.startsWith(item.href)

          if (item.section) {
            return (
              <div key={`section-${i}`} style={{
                padding: '16px 20px 4px',
                fontSize: 10, fontWeight: 700,
                letterSpacing: '0.1em', textTransform: 'uppercase',
                color: 'var(--text-muted, #999)',
                borderTop: i > 0 ? '1px solid var(--border, #e5e5e5)' : 'none',
                marginTop: i > 0 ? 6 : 0,
              }}>
                {item.label}
              </div>
            )
          }

          return (
            <Link key={item.href} href={item.href} style={{
              display: 'block', padding: '10px 20px',
              color: active ? 'var(--text, #333)' : 'var(--text-secondary, #666)',
              background: active ? 'var(--bg-active, #f0f0f0)' : 'transparent',
              fontSize: 14, fontWeight: active ? 600 : 400,
              textDecoration: 'none', transition: 'all 0.12s',
              letterSpacing: '0.01em',
            }}>
              {item.label}
            </Link>
          )
        })}
      </nav>

      {/* Footer */}
      <div style={{ padding: '14px 20px', borderTop: '1px solid var(--border, #e5e5e5)', display: 'flex', flexDirection: 'column', gap: 8 }}>
        <button onClick={toggleTheme} style={{
          color: 'var(--text-muted, #999)', fontSize: 13, fontWeight: 400,
          background: 'none', border: 'none', cursor: 'pointer', padding: 0, textAlign: 'left',
        }}>Toggle theme</button>
        <button onClick={handleSignOut} style={{
          fontSize: 13, color: 'var(--text-muted, #999)', background: 'none',
          border: 'none', cursor: 'pointer', padding: 0, textAlign: 'left', fontWeight: 400,
        }}>Sign out</button>
      </div>
    </aside>
  )
}

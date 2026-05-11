'use client'
import Link from 'next/link'
import { usePathname, useRouter } from 'next/navigation'
import { supabase } from '@/lib/supabase'

const NAV = [
  { href: '/dashboard', label: 'Dashboard' },
  { href: '/dashboard/menu', label: 'Menu' },
  { href: '/dashboard/events', label: 'Events' },
  { href: '/dashboard/tickets', label: 'Ticket Sales' },
  { href: '/dashboard/scan', label: 'Prize Scanner' },
  { href: '/door', label: 'Door Check-In' },
  { href: '/scanner', label: 'Staff Scanner' },
  { href: '/dashboard/hours', label: 'Hours & Location' },
  { href: '/dashboard/loyalty', label: 'Drinks Club' },
  { href: '/dashboard/game', label: 'Game Control' },
  { href: '/dashboard/claims', label: 'Claims & Contacts' },
  { href: '/dashboard/staff', label: 'Staff Logins', adminOnly: true },
  { href: '/jukebox', label: 'VibeQueue', section: true },
  { href: '/jukebox/admin', label: 'Requests & Queue' },
  { href: '/dashboard/settings', label: 'Settings', adminOnly: true },
]

const SCANNER_NAV = [
  { href: '/dashboard/scan', label: 'Prize Scanner' },
  { href: '/door', label: 'Door Check-In' },
  { href: '/scanner', label: 'Staff Scanner' },
]

export default function Sidebar({ role }: { role: string }) {
  const pathname = usePathname()
  const router = useRouter()
  const navItems = role === 'scanner' ? SCANNER_NAV : NAV

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
      width: 220,
      flexShrink: 0,
      background: 'var(--bg-sidebar)',
      borderRight: '1px solid var(--border)',
      display: 'flex',
      flexDirection: 'column',
      height: '100vh',
      position: 'sticky',
      top: 0,
      transition: 'background 0.2s',
    }}>
      {/* Logo */}
      <div style={{ padding: '24px 20px 20px' }}>
        <div style={{ fontFamily: 'Bebas Neue', fontSize: 22, letterSpacing: '0.06em', color: 'var(--accent)', lineHeight: 1 }}>BigBamBoo</div>
        <div style={{ fontSize: 11, letterSpacing: '0.06em', textTransform: 'uppercase', color: 'var(--bbb-yellow)', marginTop: 4 }}>
          {role === 'super_admin' ? 'Super Admin' : role === 'scanner' ? 'Door Staff' : 'Manager'}
        </div>
      </div>

      {/* Nav */}
      <nav style={{ flex: 1, overflowY: 'auto', padding: '4px 0' }}>
        {navItems.filter(item => !(item as any).adminOnly || role === 'super_admin').map(item => {
          if ((item as any).section) {
            return (
              <div key={item.href} style={{ padding: '14px 20px 3px', fontSize: 10, fontWeight: 700, letterSpacing: '0.14em', textTransform: 'uppercase', color: 'var(--bbb-yellow)', borderTop: '1px solid rgba(255,248,231,0.1)', marginTop: 6 }}>
                {item.label}
              </div>
            )
          }
          const active = item.href === '/dashboard' ? pathname === '/dashboard' : pathname.startsWith(item.href)
          return (
            <Link key={item.href} href={item.href} style={{
              display: 'block',
              padding: '10px 20px',
              color: active ? 'var(--bbb-cream-light)' : 'rgba(255,248,231,0.85)',
              background: active ? 'rgba(232,118,42,0.28)' : 'transparent',
              fontSize: 14,
              fontWeight: active ? 600 : 400,
              textDecoration: 'none',
              transition: 'all 0.12s',
              letterSpacing: '0.01em',
            }}>
              {item.label}
            </Link>
          )
        })}
      </nav>

      {/* Footer */}
      <div style={{ padding: '14px 20px', borderTop: '1px solid rgba(255,248,231,0.1)', display: 'flex', flexDirection: 'column', gap: 8 }}>
        <Link href="/dashboard/profile" style={{
          fontSize: 13, color: 'rgba(255,248,231,0.7)', textDecoration: 'none', fontWeight: 400,
        }}>
          Profile
        </Link>
        <button onClick={toggleTheme} style={{
          color: 'rgba(255,248,231,0.5)', fontSize: 13, fontWeight: 400,
          background: 'none', border: 'none', cursor: 'pointer', padding: 0,
          textAlign: 'left',
        }}>
          Toggle theme
        </button>
        <button onClick={handleSignOut} style={{
          fontSize: 13, color: 'rgba(255,248,231,0.7)', background: 'none',
          border: 'none', cursor: 'pointer', padding: 0, textAlign: 'left',
          fontWeight: 400,
        }}>
          Sign out
        </button>
      </div>
    </aside>
  )
}

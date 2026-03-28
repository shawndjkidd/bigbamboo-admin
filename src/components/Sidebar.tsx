'use client'
import Link from 'next/link'
import { usePathname, useRouter } from 'next/navigation'
import { supabase } from '@/lib/supabase'

const NAV = [
  { href: '/dashboard', label: 'Dashboard' },
  { href: '/dashboard/menu', label: 'Menu' },
  { href: '/dashboard/events', label: 'Events' },
  { href: '/dashboard/tickets', label: 'Ticket Sales' },
  { href: '/dashboard/scan', label: 'Door Scanner' },
  { href: '/dashboard/hours', label: 'Hours & Location' },
  { href: '/dashboard/loyalty', label: 'Drinks Club' },
  { href: '/dashboard/settings', label: 'Settings', adminOnly: true },
]

const SCANNER_NAV = [
  { href: '/dashboard/scan', label: 'Door Scanner' },
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
        <div style={{ fontSize: 11, letterSpacing: '0.06em', textTransform: 'uppercase', color: 'var(--text-muted)', marginTop: 4 }}>
          {role === 'super_admin' ? 'Super Admin' : role === 'scanner' ? 'Door Staff' : 'Manager'}
        </div>
      </div>

      {/* Nav */}
      <nav style={{ flex: 1, overflowY: 'auto', padding: '4px 0' }}>
        {navItems.filter(item => !(item as any).adminOnly || role === 'super_admin').map(item => {
          const active = item.href === '/dashboard' ? pathname === '/dashboard' : pathname.startsWith(item.href)
          return (
            <Link key={item.href} href={item.href} style={{
              display: 'block',
              padding: '10px 20px',
              color: active ? 'var(--text)' : 'var(--text-secondary)',
              background: active ? 'var(--bg-active)' : 'transparent',
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
      <div style={{ padding: '14px 20px', borderTop: '1px solid var(--border)', display: 'flex', flexDirection: 'column', gap: 8 }}>
        <Link href="/dashboard/profile" style={{
          fontSize: 13, color: 'var(--text-secondary)', textDecoration: 'none', fontWeight: 400,
        }}>
          Profile
        </Link>
        <button onClick={toggleTheme} style={{
          color: 'var(--text-muted)', fontSize: 13, fontWeight: 400,
          background: 'none', border: 'none', cursor: 'pointer', padding: 0,
          textAlign: 'left',
        }}>
          Toggle theme
        </button>
        <button onClick={handleSignOut} style={{
          fontSize: 13, color: 'var(--text-muted)', background: 'none',
          border: 'none', cursor: 'pointer', padding: 0, textAlign: 'left',
          fontWeight: 400,
        }}>
          Sign out
        </button>
      </div>
    </aside>
  )
}

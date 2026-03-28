'use client'
import Link from 'next/link'
import { usePathname, useRouter } from 'next/navigation'
import { supabase } from '@/lib/supabase'

const NAV = [
  { href: '/dashboard', label: 'Dashboard', icon: '📊' },
  { href: '/dashboard/menu', label: 'Menu', icon: '🍹' },
  { href: '/dashboard/events', label: 'Events', icon: '📅' },
  { href: '/dashboard/tickets', label: 'Ticket Sales', icon: '🎟️' },
  { href: '/dashboard/scan', label: 'Door Scanner', icon: '📷' },
  { href: '/dashboard/hours', label: 'Hours & Location', icon: '🕐' },
  { href: '/dashboard/loyalty', label: 'Drinks Club', icon: '✦' },
  { href: '/dashboard/settings', label: 'Settings', icon: '⚙️', adminOnly: true },
]

export default function Sidebar({ role }: { role: string }) {
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
      width: 240,
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
      <div style={{ padding: '20px 20px 16px', borderBottom: '1px solid var(--border)' }}>
        <div style={{ fontFamily: 'Bebas Neue', fontSize: 22, letterSpacing: '0.06em', color: 'var(--accent)' }}>BigBamBoo</div>
        <div style={{ fontSize: 11, letterSpacing: '0.08em', textTransform: 'uppercase', color: 'var(--text-muted)', marginTop: 3 }}>
          {role === 'super_admin' ? 'Super Admin' : 'Manager'}
        </div>
      </div>

      {/* Nav */}
      <nav style={{ padding: '10px 0', flex: 1, overflowY: 'auto' }}>
        {NAV.filter(item => !item.adminOnly || role === 'super_admin').map(item => {
          const active = item.href === '/dashboard' ? pathname === '/dashboard' : pathname.startsWith(item.href)
          return (
            <Link key={item.href} href={item.href} style={{
              display: 'flex',
              alignItems: 'center',
              gap: 12,
              padding: '11px 20px',
              color: active ? 'var(--accent)' : 'var(--text-secondary)',
              background: active ? 'var(--bg-active)' : 'transparent',
              borderLeft: active ? '3px solid var(--accent)' : '3px solid transparent',
              fontSize: 14,
              fontWeight: active ? 600 : 500,
              textDecoration: 'none',
              transition: 'all 0.15s',
            }}>
              <span style={{ fontSize: 16, width: 20, textAlign: 'center' }}>{item.icon}</span>
              {item.label}
            </Link>
          )
        })}
      </nav>

      {/* Footer */}
      <div style={{ padding: '16px 20px', borderTop: '1px solid var(--border)', display: 'flex', flexDirection: 'column', gap: 10 }}>
        <button onClick={toggleTheme} style={{
          display: 'flex', alignItems: 'center', gap: 8,
          color: 'var(--text-muted)', fontSize: 13, fontWeight: 500,
          background: 'none', border: 'none', cursor: 'pointer', padding: 0,
        }}>
          ◑ Toggle theme
        </button>
        <a href="https://bigbamboo.app" target="_blank" rel="noopener noreferrer" style={{
          display: 'flex', alignItems: 'center', gap: 8,
          color: 'var(--accent)', fontSize: 13, fontWeight: 500, textDecoration: 'none',
        }}>
          ↗ View Live Site
        </a>
        <button onClick={handleSignOut} style={{
          fontSize: 13, color: 'var(--text-muted)', background: 'none',
          border: 'none', cursor: 'pointer', padding: 0, textAlign: 'left',
        }}>
          Sign out
        </button>
      </div>
    </aside>
  )
}

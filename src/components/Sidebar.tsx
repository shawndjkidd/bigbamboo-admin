'use client'
import Link from 'next/link'
import { usePathname, useRouter } from 'next/navigation'
import { supabase } from '@/lib/supabase'

const NAV = [
  { href: '/dashboard', label: 'Dashboard', icon: '📊' },
  { href: '/dashboard/menu', label: 'Menu', icon: '🍹' },
  { href: '/dashboard/events', label: 'Events', icon: '📅' },
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

  return (
    <aside style={{width:220,flexShrink:0,background:'#141E1C',borderRight:'1px solid rgba(255,255,255,0.07)',display:'flex',flexDirection:'column',height:'100vh',position:'sticky',top:0}}>
      {/* Logo */}
      <div style={{padding:'18px 16px 14px',borderBottom:'1px solid rgba(255,255,255,0.07)'}}>
        <div style={{fontFamily:'Bebas Neue',fontSize:20,letterSpacing:'0.06em',color:'#E8A820'}}>BigBamBoo</div>
        <div style={{fontFamily:'DM Mono',fontSize:9,letterSpacing:'0.15em',textTransform:'uppercase',color:'rgba(255,255,255,0.35)',marginTop:2}}>
          {role === 'super_admin' ? '★ Super Admin' : '◆ Manager'}
        </div>
      </div>

      {/* Nav */}
      <nav style={{padding:'10px 0',flex:1}}>
        {NAV.filter(item => !item.adminOnly || role === 'super_admin').map(item => {
          const active = item.href === '/dashboard' ? pathname === '/dashboard' : pathname.startsWith(item.href)
          return (
            <Link key={item.href} href={item.href} style={{
              display:'flex',alignItems:'center',gap:10,
              padding:'10px 16px',
              color: active ? '#E8A820' : 'rgba(255,255,255,0.55)',
              background: active ? 'rgba(255,255,255,0.04)' : 'transparent',
              borderLeft: active ? '3px solid #E8A820' : '3px solid transparent',
              fontSize:13,fontWeight:500,
              textDecoration:'none',transition:'all 0.15s',
            }}>
              <span>{item.icon}</span>
              {item.label}
            </Link>
          )
        })}
      </nav>

      {/* Footer */}
      <div style={{padding:'14px 16px',borderTop:'1px solid rgba(255,255,255,0.07)'}}>
        <a href="https://bigbamboo.app" target="_blank" style={{display:'flex',alignItems:'center',gap:7,color:'#3AA8A4',fontSize:12,fontWeight:500,textDecoration:'none',marginBottom:8}}>
          ↗ View Live Site
        </a>
        <button onClick={handleSignOut} style={{fontSize:12,color:'rgba(255,255,255,0.35)',background:'none',border:'none',cursor:'pointer',padding:0}}>
          Sign out
        </button>
      </div>
    </aside>
  )
}

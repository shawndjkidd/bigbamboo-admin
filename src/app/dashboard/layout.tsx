'use client'
import { useEffect, useState } from 'react'
import { useRouter } from 'next/navigation'
import { supabase } from '@/lib/supabase'
import Sidebar from '@/components/Sidebar'

export default function DashboardLayout({ children }: { children: React.ReactNode }) {
  const router = useRouter()
  const [staff, setStaff] = useState<any>(null)
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    let mounted = true

    async function checkAuth() {
      // getSession() uses cached state — no auth lock contention.
      // getUser() acquires a lock that races with React Strict Mode's double-invoke
      // and onAuthStateChange's initial fire, producing AbortError that leaves
      // the page stuck on "Loading...".
      const { data: { session } } = await supabase.auth.getSession()
      if (!mounted) return
      if (!session?.user) { router.push('/login'); return }

      const { data: staffUser, error } = await supabase
        .from('staff_users')
        .select('*')
        .eq('email', session.user.email)
        .maybeSingle()

      if (!mounted) return
      if (error) console.error('[dashboard] staff_users lookup error:', error)
      if (!staffUser) { router.push('/login'); return }
      if (!staffUser.active) { router.push('/login'); return }
      // Single-purpose accounts are locked to their one page — they can never reach the
      // financial dashboard, even by typing a URL.
      if (staffUser.role === 'kitchen') { router.replace('/kitchen'); return }
      if (staffUser.role === 'cashier') { router.replace('/cashier'); return }

      // single-tenant: hardcoded venue name (was previously a broken join into venues)
      setStaff({ ...staffUser, venue: { name: 'BigBamBoo' } })
      setLoading(false)
    }

    checkAuth()

    // Only react to real auth state changes (not the immediate initial-fire) — and
    // only for sign-out, where we need to bounce the user. Avoids the double lock.
    const { data: { subscription } } = supabase.auth.onAuthStateChange((event) => {
      if (event === 'SIGNED_OUT') router.push('/login')
    })
    return () => { mounted = false; subscription.unsubscribe() }
  }, [])

  if (loading) {
    return (
      <div style={{
        height: '100vh', display: 'flex', alignItems: 'center', justifyContent: 'center',
        color: '#999', fontSize: 14,
      }}>
        Loading...
      </div>
    )
  }

  return (
    <div style={{ display: 'flex', minHeight: '100vh', background: 'var(--bg, #fff)' }}>
      <Sidebar role={staff?.role || 'staff'} venueName={staff?.venue?.name || 'Venue'} />
      <main style={{ flex: 1, padding: '32px 40px', overflowY: 'auto' }}>
        {children}
      </main>
    </div>
  )
}

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
    checkAuth()
    const { data: { subscription } } = supabase.auth.onAuthStateChange(() => checkAuth())
    return () => subscription.unsubscribe()
  }, [])

  async function checkAuth() {
    const { data: { user } } = await supabase.auth.getUser()
    if (!user) { router.push('/login'); return }

    const { data: staffUser, error } = await supabase
      .from('staff_users')
      .select('*')
      .eq('email', user.email)
      .maybeSingle()

    if (error) console.error('[dashboard] staff_users lookup error:', error)
    if (!staffUser) { router.push('/login'); return }
    if (!staffUser.active) { router.push('/login'); return }

    // single-tenant: hardcoded venue name (was previously a broken join into venues)
    setStaff({ ...staffUser, venue: { name: 'BigBamBoo' } })
    setLoading(false)
  }

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

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
    async function checkAuth() {
      const { data: { user } } = await supabase.auth.getUser()
      if (!user) { router.push('/login'); return }

      const { data: staffData } = await supabase
        .from('staff_users')
        .select('*')
        .eq('email', user.email)
        .eq('active', true)
        .single()

      if (!staffData) { router.push('/login'); return }
      setStaff(staffData)
      setLoading(false)
    }
    checkAuth()
  }, [router])

  if (loading) return (
    <div style={{minHeight:'100vh',display:'flex',alignItems:'center',justifyContent:'center',background:'#0A1614'}}>
      <div style={{fontFamily:'Bebas Neue',fontSize:24,letterSpacing:'0.1em',color:'#3AA8A4'}}>Loading...</div>
    </div>
  )

  return (
    <div style={{display:'flex',minHeight:'100vh'}}>
      <Sidebar role={staff.role} />
      <main style={{flex:1,overflowY:'auto',display:'flex',flexDirection:'column'}}>
        {/* Topbar */}
        <div style={{background:'#141E1C',borderBottom:'1px solid rgba(255,255,255,0.07)',padding:'0 24px',height:52,display:'flex',alignItems:'center',justifyContent:'space-between',position:'sticky',top:0,zIndex:100}}>
          <div style={{fontFamily:'DM Mono',fontSize:10,letterSpacing:'0.15em',textTransform:'uppercase',color:'rgba(255,255,255,0.3)'}}>
            BigBamBoo Admin · {staff.name}
          </div>
          <div style={{display:'flex',gap:8,alignItems:'center'}}>
            <span className={`badge ${staff.role === 'super_admin' ? 'badge-yellow' : 'badge-teal'}`}>
              {staff.role === 'super_admin' ? 'Super Admin' : 'Manager'}
            </span>
          </div>
        </div>
        <div style={{padding:28,flex:1}}>
          {children}
        </div>
      </main>
    </div>
  )
}

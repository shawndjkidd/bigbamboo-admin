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
                                                                                                          <div style={{minHeight:'100vh',display:'flex',alignItems:'center',justifyContent:'center',background:'var(--bg)'}}>
                                                                                                                  <div style={{fontFamily:'Bebas Neue',fontSize:24,letterSpacing:'0.1em',color:'var(--accent)'}}>Loading...</div>
                                                                                                                      </div>
                                                                                                                        )
                                                                                                                        
                                                                                                                          return (
                                                                                                                              <div style={{display:'flex',minHeight:'100vh',background:'var(--bg)'}}>
                                                                                                                                    <Sidebar role={staff.role} />
                                                                                                                                          <main style={{flex:1,padding:28,overflowY:'auto'}}>
                                                                                                                                                  {children}
                                                                                                                                                        </main>
                                                                                                                                                            </div>
                                                                                                                                                              )
                                                                                                                                                              }'
'use client'
import { useState } from 'react'
import { supabase } from '@/lib/supabase'
import { useRouter } from 'next/navigation'

export default function LoginPage() {
  const router = useRouter()
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [error, setError] = useState('')
  const [loading, setLoading] = useState(false)

  async function handleLogin(e: React.FormEvent) {
    e.preventDefault()
    setLoading(true)
    setError('')
    try {
      const { error: authError } = await supabase.auth.signInWithPassword({ email, password })
      if (authError) throw authError

      // Check staff record exists
      const { data: staff, error: staffError } = await supabase
        .from('staff_users')
        .select('id,role,active')
        .eq('email', email)
        .eq('active', true)
        .single()

      if (staffError || !staff) throw new Error('No active staff account for this email.')
      router.push('/dashboard')
    } catch (err: any) {
      setError(err.message || 'Login failed')
    } finally {
      setLoading(false)
    }
  }

  return (
    <div className="min-h-screen flex items-center justify-center p-4" style={{background: 'linear-gradient(135deg, #0A1614 0%, #0E2220 100%)'}}>
      <div className="w-full max-w-sm">
        {/* Logo */}
        <div className="text-center mb-8">
          <div style={{fontFamily:'Bebas Neue',fontSize:40,letterSpacing:'0.06em',color:'#E8A820',lineHeight:1}}>BigBamBoo</div>
          <div style={{fontFamily:'DM Mono',fontSize:11,letterSpacing:'0.2em',textTransform:'uppercase',color:'rgba(255,255,255,0.35)',marginTop:6}}>Staff Dashboard</div>
        </div>

        <div className="card p-6">
          <form onSubmit={handleLogin} className="flex flex-col gap-4">
            <div>
              <label className="label">Email</label>
              <input className="input" type="email" value={email} onChange={e=>setEmail(e.target.value)} placeholder="you@bigbamboo.app" required />
            </div>
            <div>
              <label className="label">Password</label>
              <input className="input" type="password" value={password} onChange={e=>setPassword(e.target.value)} placeholder="••••••••" required />
            </div>
            {error && <div style={{background:'rgba(192,48,32,0.12)',border:'1px solid rgba(192,48,32,0.3)',borderRadius:6,padding:'10px 14px',fontSize:13,color:'#E06060'}}>{error}</div>}
            <button className="btn-yellow w-full" type="submit" disabled={loading} style={{fontFamily:'Bebas Neue',fontSize:18,letterSpacing:'0.1em',padding:'13px'}}>
              {loading ? 'Signing in...' : 'Sign In'}
            </button>
          </form>
        </div>

        <div style={{textAlign:'center',marginTop:20,fontFamily:'DM Mono',fontSize:10,letterSpacing:'0.12em',textTransform:'uppercase',color:'rgba(255,255,255,0.2)'}}>
          bigbamboo.app · An Phú, Saigon
        </div>
      </div>
    </div>
  )
}

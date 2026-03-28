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
    <div style={{ minHeight: '100vh', display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 24, background: 'var(--bg)' }}>
      <div style={{ width: '100%', maxWidth: 400 }}>
        {/* Logo */}
        <div style={{ textAlign: 'center', marginBottom: 40 }}>
          <div style={{ fontFamily: 'Bebas Neue', fontSize: 48, letterSpacing: '0.06em', color: 'var(--accent)', lineHeight: 1 }}>BigBamBoo</div>
          <div style={{ fontSize: 13, letterSpacing: '0.12em', textTransform: 'uppercase' as const, color: 'var(--text-muted)', marginTop: 8 }}>Staff Dashboard</div>
        </div>

        <div className="card" style={{ padding: 32 }}>
          <div style={{ fontFamily: 'Bebas Neue', fontSize: 24, letterSpacing: '0.04em', color: 'var(--text)', marginBottom: 24 }}>Sign In</div>

          <form onSubmit={handleLogin} style={{ display: 'flex', flexDirection: 'column', gap: 18 }}>
            <div>
              <label className="label">Email</label>
              <input
                className="input"
                type="email"
                value={email}
                onChange={e => setEmail(e.target.value)}
                placeholder="you@bigbamboo.app"
                required
                style={{ fontSize: 15, padding: '12px 16px' }}
              />
            </div>
            <div>
              <label className="label">Password</label>
              <input
                className="input"
                type="password"
                value={password}
                onChange={e => setPassword(e.target.value)}
                placeholder="Enter your password"
                required
                style={{ fontSize: 15, padding: '12px 16px' }}
              />
            </div>

            {error && (
              <div style={{
                background: 'var(--badge-red-bg)',
                border: '1px solid var(--badge-red-border)',
                borderRadius: 8,
                padding: '12px 16px',
                fontSize: 14,
                color: 'var(--badge-red-text)'
              }}>{error}</div>
            )}

            <button
              className="btn-accent"
              type="submit"
              disabled={loading}
              style={{ fontFamily: 'Bebas Neue', fontSize: 20, letterSpacing: '0.08em', padding: '14px', width: '100%', marginTop: 4 }}
            >
              {loading ? 'Signing in...' : 'Sign In'}
            </button>
          </form>
        </div>

        <div style={{ textAlign: 'center', marginTop: 24, fontSize: 12, color: 'var(--text-muted)' }}>
          bigbamboo.app — An Phu, Saigon
        </div>
      </div>
    </div>
  )
}

'use client'
import { useState } from 'react'
import { useRouter } from 'next/navigation'
import { supabase } from '@/lib/supabase'

export default function Login() {
  const router = useRouter()
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [error, setError] = useState('')
  const [loading, setLoading] = useState(false)

  async function handleLogin(e: React.FormEvent) {
    e.preventDefault()
    setError('')
    setLoading(true)

    const { error: authError } = await supabase.auth.signInWithPassword({ email, password })

    if (authError) {
      setError(authError.message)
      setLoading(false)
      return
    }

    // Verify they're a staff user
    const { data: staff } = await supabase
      .from('staff_users')
      .select('id, role')
      .eq('email', email)
      .single()

    if (!staff) {
      setError('No staff account found for this email.')
      await supabase.auth.signOut()
      setLoading(false)
      return
    }

    router.push('/dashboard')
  }

  const input: React.CSSProperties = {
    width: '100%', padding: '12px 14px', borderRadius: 10, fontSize: 15,
    border: '1px solid #ddd', background: '#fafafa', color: '#333',
    outline: 'none', boxSizing: 'border-box',
  }

  return (
    <div style={{
      minHeight: '100vh', display: 'flex', alignItems: 'center', justifyContent: 'center',
      background: '#f5f5f5', padding: 20,
    }}>
      <div style={{
        background: '#fff', borderRadius: 20, padding: '40px 36px',
        maxWidth: 400, width: '100%', boxShadow: '0 4px 24px rgba(0,0,0,0.06)',
        border: '1px solid #e5e5e5',
      }}>
        <div style={{ textAlign: 'center', marginBottom: 28 }}>
          <div style={{ fontSize: 22, fontWeight: 700, color: '#e87830', marginBottom: 6 }}>
            BigBamBoo
          </div>
          <h1 style={{ fontSize: 16, fontWeight: 500, margin: 0, color: '#666' }}>Sign in</h1>
        </div>

        <form onSubmit={handleLogin}>
          <div style={{ marginBottom: 12 }}>
            <input
              type="email" placeholder="Email" value={email}
              onChange={e => setEmail(e.target.value)}
              style={input} required
            />
          </div>
          <div style={{ marginBottom: 16 }}>
            <input
              type="password" placeholder="Password" value={password}
              onChange={e => setPassword(e.target.value)}
              style={input} required
            />
          </div>

          {error && (
            <div style={{
              padding: '10px 14px', borderRadius: 8, marginBottom: 14,
              background: '#fee2e2', color: '#991b1b', fontSize: 13,
            }}>
              {error}
            </div>
          )}

          <button type="submit" disabled={loading} style={{
            width: '100%', padding: '14px', borderRadius: 12, fontSize: 15,
            fontWeight: 700, border: 'none', cursor: 'pointer',
            background: '#e87830', color: '#fff',
            opacity: loading ? 0.7 : 1, transition: 'opacity 0.12s',
          }}>
            {loading ? 'Signing in...' : 'Sign in'}
          </button>
        </form>
      </div>
    </div>
  )
}

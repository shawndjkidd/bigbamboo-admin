'use client'
import { useEffect, useState } from 'react'
import { supabase } from '@/lib/supabase'

export default function ProfilePage() {
  const [staff, setStaff] = useState<any>(null)
  const [loading, setLoading] = useState(true)
  const [toast, setToast] = useState('')
  const [theme, setTheme] = useState('system')

  useEffect(() => {
    async function load() {
      const { data: { user } } = await supabase.auth.getUser()
      if (user) {
        const { data } = await supabase.from('staff_users').select('*').eq('email', user.email).single()
        setStaff(data)
      }
      // Load saved theme preference
      const saved = localStorage.getItem('theme')
      if (saved === 'dark' || saved === 'light') {
        setTheme(saved)
      } else {
        setTheme('system')
      }
      setLoading(false)
    }
    load()
  }, [])

  function changeTheme(value: string) {
    setTheme(value)
    const html = document.documentElement
    if (value === 'system') {
      localStorage.removeItem('theme')
      const prefersDark = window.matchMedia('(prefers-color-scheme: dark)').matches
      html.setAttribute('data-theme', prefersDark ? 'dark' : 'light')
    } else {
      localStorage.setItem('theme', value)
      html.setAttribute('data-theme', value)
    }
    showToast('Theme updated')
  }

  async function updateName(name: string) {
    if (!staff || !name.trim()) return
    await supabase.from('staff_users').update({ name }).eq('id', staff.id)
    setStaff((prev: any) => ({ ...prev, name }))
    showToast('Name updated')
  }

  function showToast(msg: string) { setToast(msg); setTimeout(() => setToast(''), 2500) }

  function roleLabel(role: string) {
    if (role === 'super_admin') return 'Super Admin'
    if (role === 'scanner') return 'Door Staff'
    return 'Manager'
  }

  if (loading) return <div style={{ padding: 40, textAlign: 'center', color: 'var(--text-muted)' }}>Loading...</div>

  return (
    <div style={{ maxWidth: 560 }}>
      <div className="page-title" style={{ marginBottom: 28 }}>Profile</div>

      {/* Account Info */}
      <div className="card" style={{ padding: 24, marginBottom: 20 }}>
        <div className="section-title" style={{ marginBottom: 18 }}>Account</div>
        <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
          <div>
            <label className="label">Name</label>
            <input
              className="input"
              defaultValue={staff?.name || ''}
              onBlur={e => e.target.value !== staff?.name && updateName(e.target.value)}
              style={{ fontSize: 15 }}
            />
          </div>
          <div>
            <label className="label">Email</label>
            <div style={{ padding: '10px 14px', background: 'var(--bg-subtle)', borderRadius: 8, border: '1px solid var(--border)', fontSize: 14, color: 'var(--text-secondary)' }}>
              {staff?.email}
            </div>
          </div>
          <div>
            <label className="label">Role</label>
            <div style={{ padding: '10px 14px', background: 'var(--bg-subtle)', borderRadius: 8, border: '1px solid var(--border)', fontSize: 14, color: 'var(--text-secondary)' }}>
              {roleLabel(staff?.role)}
            </div>
          </div>
        </div>
      </div>

      {/* Theme Preference */}
      <div className="card" style={{ padding: 24 }}>
        <div className="section-title" style={{ marginBottom: 18 }}>Appearance</div>
        <label className="label">Default Theme</label>
        <div style={{ display: 'flex', gap: 10, marginTop: 4 }}>
          {[
            { value: 'light', label: 'Light' },
            { value: 'dark', label: 'Dark' },
            { value: 'system', label: 'System' },
          ].map(opt => (
            <button
              key={opt.value}
              onClick={() => changeTheme(opt.value)}
              style={{
                flex: 1,
                padding: '14px 16px',
                borderRadius: 10,
                border: `1px solid ${theme === opt.value ? 'var(--accent)' : 'var(--border)'}`,
                background: theme === opt.value ? 'var(--bg-active)' : 'var(--bg-card)',
                color: theme === opt.value ? 'var(--accent)' : 'var(--text-secondary)',
                fontSize: 14,
                fontWeight: theme === opt.value ? 600 : 400,
                cursor: 'pointer',
                transition: 'all 0.15s',
              }}
            >
              {opt.label}
            </button>
          ))}
        </div>
        <div style={{ fontSize: 13, color: 'var(--text-muted)', marginTop: 10 }}>
          {theme === 'system' ? 'Follows your device settings' : theme === 'dark' ? 'Always use dark mode' : 'Always use light mode'}
        </div>
      </div>

      {toast && <div className="toast">{toast}</div>}
    </div>
  )
}

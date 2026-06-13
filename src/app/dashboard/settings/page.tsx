'use client'
import { useEffect, useState } from 'react'
import Link from 'next/link'
import { supabase } from '@/lib/supabase'

export default function SettingsPage() {
  const [currentUser, setCurrentUser] = useState<any>(null)
  const [loaded, setLoaded] = useState(false)

  useEffect(() => {
    (async () => {
      const { data: { user } } = await supabase.auth.getUser()
      const { data: me } = await supabase.from('staff_users').select('role').eq('email', user?.email).maybeSingle()
      setCurrentUser(me); setLoaded(true)
    })()
  }, [])

  if (loaded && currentUser?.role !== 'super_admin') {
    return (
      <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', minHeight: 400 }}>
        <div className="page-title" style={{ fontSize: 28 }}>Super Admin Only</div>
        <div style={{ fontSize: 15, color: 'var(--text-muted)', marginTop: 8 }}>You need Super Admin access to view settings.</div>
      </div>
    )
  }

  return (
    <div style={{ maxWidth: 720 }}>
      <div className="page-title" style={{ marginBottom: 28 }}>Settings</div>

      <Link href="/dashboard/staff" style={{ textDecoration: 'none' }}>
        <div className="card" style={{ padding: 20, marginBottom: 20, display: 'flex', justifyContent: 'space-between', alignItems: 'center', cursor: 'pointer' }}>
          <div>
            <div className="section-title" style={{ marginBottom: 2 }}>Staff &amp; logins</div>
            <div style={{ fontSize: 13, color: 'var(--text-muted)' }}>Add accounts, set roles, device login links and scanner PINs — now on the Staff page.</div>
          </div>
          <span style={{ color: 'var(--accent, #e87830)', fontWeight: 600, fontSize: 14, whiteSpace: 'nowrap' }}>Go to Staff →</span>
        </div>
      </Link>

      <div className="card" style={{ padding: 24 }}>
        <div className="section-title" style={{ marginBottom: 20 }}>Loyalty Program</div>
        <LoyaltySetting />
      </div>
    </div>
  )
}

function LoyaltySetting() {
  const [goal, setGoal] = useState('10')
  const [saved, setSaved] = useState(false)
  useEffect(() => {
    supabase.from('site_settings').select('value').eq('key', 'loyalty_stamp_goal').single().then(({ data }: any) => { if (data) setGoal(data.value) })
  }, [])
  async function save() {
    await supabase.from('site_settings').upsert({ key: 'loyalty_stamp_goal', value: goal, updated_at: new Date().toISOString() }, { onConflict: 'key' })
    setSaved(true); setTimeout(() => setSaved(false), 2000)
  }
  return (
    <div style={{ display: 'flex', alignItems: 'flex-end', gap: 16 }}>
      <div style={{ flex: 1 }}>
        <label className="label">Stamps required for free drink</label>
        <input className="input" type="number" min={1} max={50} value={goal} onChange={e => setGoal(e.target.value)} style={{ width: 120, fontFamily: 'DM Mono, monospace', fontSize: 18, textAlign: 'center' }} />
      </div>
      <button className="btn-accent" onClick={save} style={{ fontSize: 14 }}>{saved ? 'Saved!' : 'Save'}</button>
      <div style={{ fontSize: 14, color: 'var(--text-muted)', paddingBottom: 4 }}>Buy {goal}, get 1 free</div>
    </div>
  )
}

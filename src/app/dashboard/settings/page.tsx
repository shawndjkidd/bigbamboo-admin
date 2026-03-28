'use client'
import { useEffect, useState } from 'react'
import { supabase } from '@/lib/supabase'

export default function SettingsPage() {
  const [staff, setStaff] = useState<any[]>([])
  const [currentUser, setCurrentUser] = useState<any>(null)
  const [toast, setToast] = useState('')
  const [showAdd, setShowAdd] = useState(false)
  const [newStaff, setNewStaff] = useState({ name: '', email: '', role: 'manager', password: '' })

  useEffect(() => { loadData() }, [])

  async function loadData() {
    const { data: { user } } = await supabase.auth.getUser()
    const { data: me } = await supabase.from('staff_users').select('*').eq('email', user?.email).single()
    setCurrentUser(me)
    if (me?.role !== 'super_admin') return
    const { data } = await supabase.from('staff_users').select('*').order('created_at')
    setStaff(data || [])
  }

  async function addStaff() {
    if (!newStaff.name || !newStaff.email || !newStaff.password) return
    const { error: authError } = await supabase.auth.signUp({ email: newStaff.email, password: newStaff.password })
    if (authError) { showToast('Error: ' + authError.message); return }
    await supabase.from('staff_users').insert({ name: newStaff.name, email: newStaff.email, role: newStaff.role })
    setNewStaff({ name: '', email: '', role: 'manager', password: '' })
    setShowAdd(false)
    showToast('Staff member added')
    loadData()
  }

  async function toggleActive(id: string, active: boolean) {
    await supabase.from('staff_users').update({ active: !active }).eq('id', id)
    setStaff(prev => prev.map(s => s.id === id ? { ...s, active: !active } : s))
    showToast(active ? 'Account deactivated' : 'Account activated')
  }

  async function updateRole(id: string, role: string) {
    await supabase.from('staff_users').update({ role }).eq('id', id)
    setStaff(prev => prev.map(s => s.id === id ? { ...s, role } : s))
    showToast('Role updated')
  }

  function showToast(msg: string) { setToast(msg); setTimeout(() => setToast(''), 3000) }

  function roleLabel(role: string) {
    if (role === 'super_admin') return 'Super Admin'
    if (role === 'scanner') return 'Door Staff'
    return 'Manager'
  }

  function roleBadge(role: string) {
    if (role === 'super_admin') return 'badge-orange'
    if (role === 'scanner') return 'badge-blue'
    return 'badge-gray'
  }

  if (currentUser?.role !== 'super_admin') {
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

      {/* Staff Management */}
      <div className="card" style={{ padding: 24, marginBottom: 20 }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 20 }}>
          <div className="section-title">Staff Accounts</div>
          <button className="btn-accent" onClick={() => setShowAdd(!showAdd)} style={{ fontSize: 13, padding: '8px 16px' }}>+ Add Staff</button>
        </div>

        {showAdd && (
          <div style={{ background: 'var(--bg-subtle)', border: '1px dashed var(--accent)', borderRadius: 10, padding: 20, marginBottom: 20 }}>
            <div className="section-title" style={{ color: 'var(--accent)', marginBottom: 16 }}>New Staff Member</div>
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 14, marginBottom: 14 }}>
              <div><label className="label">Full Name</label><input className="input" value={newStaff.name} onChange={e => setNewStaff(p => ({ ...p, name: e.target.value }))} placeholder="John Smith" /></div>
              <div><label className="label">Email</label><input className="input" type="email" value={newStaff.email} onChange={e => setNewStaff(p => ({ ...p, email: e.target.value }))} placeholder="staff@bigbamboo.app" /></div>
            </div>
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 14, marginBottom: 16 }}>
              <div>
                <label className="label">Role</label>
                <select className="input" value={newStaff.role} onChange={e => setNewStaff(p => ({ ...p, role: e.target.value }))}>
                  <option value="manager">Manager</option>
                  <option value="scanner">Door Staff (Scanner Only)</option>
                  <option value="super_admin">Super Admin</option>
                </select>
              </div>
              <div><label className="label">Temporary Password</label><input className="input" type="password" value={newStaff.password} onChange={e => setNewStaff(p => ({ ...p, password: e.target.value }))} placeholder="They can change later" /></div>
            </div>
            <div style={{ display: 'flex', gap: 10 }}>
              <button className="btn-accent" onClick={addStaff}>Create Account</button>
              <button className="btn-outline" onClick={() => setShowAdd(false)}>Cancel</button>
            </div>
          </div>
        )}

        {/* Staff list */}
        <div className="card" style={{ overflow: 'hidden' }}>
          <table className="data-table">
            <thead>
              <tr><th>Name</th><th>Email</th><th>Role</th><th>Status</th><th style={{ textAlign: 'right' }}>Actions</th></tr>
            </thead>
            <tbody>
              {staff.map(s => (
                <tr key={s.id} style={{ opacity: s.active ? 1 : 0.5 }}>
                  <td style={{ fontWeight: 600 }}>{s.name}</td>
                  <td style={{ color: 'var(--text-secondary)', fontSize: 13 }}>{s.email}</td>
                  <td>
                    {s.id === currentUser.id ? (
                      <span className={`badge ${roleBadge(s.role)}`}>{roleLabel(s.role)}</span>
                    ) : (
                      <select className="input" value={s.role} onChange={e => updateRole(s.id, e.target.value)} style={{ width: 140, padding: '4px 8px', fontSize: 12 }}>
                        <option value="manager">Manager</option>
                        <option value="scanner">Door Staff</option>
                        <option value="super_admin">Super Admin</option>
                      </select>
                    )}
                  </td>
                  <td><span className={`badge ${s.active ? 'badge-green' : 'badge-red'}`}>{s.active ? 'Active' : 'Inactive'}</span></td>
                  <td style={{ textAlign: 'right' }}>
                    {s.id !== currentUser.id && (
                      <button onClick={() => toggleActive(s.id, s.active)}
                        className={s.active ? 'btn-red' : 'btn-green'}
                        style={{ padding: '5px 12px', fontSize: 12 }}>
                        {s.active ? 'Deactivate' : 'Activate'}
                      </button>
                    )}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>

      {/* Loyalty Config */}
      <div className="card" style={{ padding: 24 }}>
        <div className="section-title" style={{ marginBottom: 20 }}>Loyalty Program</div>
        <LoyaltySetting />
      </div>

      {toast && <div className="toast">{toast}</div>}
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

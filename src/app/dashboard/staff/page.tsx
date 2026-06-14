'use client'
import { useEffect, useState } from 'react'
import { supabase } from '@/lib/supabase'

// The Staff page now holds BOTH the dashboard/app accounts (email + password, top) and the
// legacy scanner-app PIN logins (bottom). Email accounts moved here from Settings.

export default function StaffPage() {
  return (
    <div>
      <div className="page-title" style={{ marginBottom: 24 }}>Staff</div>
      <StaffAccounts />
      <ScannerPins />
    </div>
  )
}

// ───────────────────────── Dashboard / app accounts ─────────────────────────
function StaffAccounts() {
  const [staff, setStaff] = useState<any[]>([])
  const [currentUser, setCurrentUser] = useState<any>(null)
  const [toast, setToast] = useState('')
  const [showAdd, setShowAdd] = useState(false)
  const [busy, setBusy] = useState(false)
  const [newStaff, setNewStaff] = useState({ name: '', email: '', role: 'manager', password: '', department: '' })

  useEffect(() => { loadData() }, [])
  async function loadData() {
    const { data: { user } } = await supabase.auth.getUser()
    const { data: me } = await supabase.from('staff_users').select('*').eq('email', user?.email).single()
    setCurrentUser(me)
    if (me?.role !== 'super_admin') return
    const { data } = await supabase.from('staff_users').select('*').order('created_at')
    setStaff(data || [])
  }
  function showToast(msg: string) { setToast(msg); setTimeout(() => setToast(''), 3000) }

  async function addStaff() {
    if (!newStaff.name || !newStaff.email || !newStaff.password) { showToast('Name, email and password are required'); return }
    setBusy(true)
    const { data: { session } } = await supabase.auth.getSession()
    const res = await fetch('/api/admin/staff', {
      method: 'POST', headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${session?.access_token || ''}` },
      body: JSON.stringify(newStaff),
    })
    const j = await res.json().catch(() => ({}))
    setBusy(false)
    if (!res.ok) { showToast('Error: ' + (j.error || 'failed')); return }
    setNewStaff({ name: '', email: '', role: 'manager', password: '', department: '' })
    setShowAdd(false); showToast('Account created — they can sign in right away.'); loadData()
  }
  async function deleteStaff(email: string, name: string) {
    if (email === currentUser?.email) { showToast("You can't delete your own account."); return }
    if (!confirm(`Delete ${name} (${email})? This removes their login and cannot be undone.`)) return
    const { data: { session } } = await supabase.auth.getSession()
    const res = await fetch('/api/admin/staff?email=' + encodeURIComponent(email), { method: 'DELETE', headers: { Authorization: `Bearer ${session?.access_token || ''}` } })
    const j = await res.json().catch(() => ({}))
    if (!res.ok) { showToast('Error: ' + (j.error || 'failed')); return }
    setStaff(prev => prev.filter(s => s.email !== email)); showToast('Account deleted')
  }
  async function resetPassword(email: string, name: string) {
    const pw = window.prompt(`New password for ${name} (${email}) — at least 6 characters.\nThis also signs them out of any current device.`)
    if (pw == null) return
    if (pw.length < 6) { showToast('Password must be at least 6 characters'); return }
    const { data: { session } } = await supabase.auth.getSession()
    const res = await fetch('/api/admin/staff', { method: 'PATCH', headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${session?.access_token || ''}` }, body: JSON.stringify({ email, password: pw }) })
    const j = await res.json().catch(() => ({}))
    if (!res.ok) { showToast('Error: ' + (j.error || 'failed')); return }
    showToast('Password changed & signed out everywhere')
  }
  async function forceLogout(email: string, name: string) {
    if (!confirm(`Sign ${name} out of all devices now?`)) return
    const { data: { session } } = await supabase.auth.getSession()
    const res = await fetch('/api/admin/staff', { method: 'PATCH', headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${session?.access_token || ''}` }, body: JSON.stringify({ email, logout: true }) })
    const j = await res.json().catch(() => ({}))
    if (!res.ok) { showToast('Error: ' + (j.error || 'failed')); return }
    showToast('Signed out of all devices')
  }
  async function toggleActive(id: string, active: boolean) {
    await supabase.from('staff_users').update({ active: !active }).eq('id', id)
    setStaff(prev => prev.map(s => s.id === id ? { ...s, active: !active } : s)); showToast(active ? 'Account deactivated' : 'Account activated')
  }
  async function updateRole(id: string, role: string) {
    await supabase.from('staff_users').update({ role }).eq('id', id)
    setStaff(prev => prev.map(s => s.id === id ? { ...s, role } : s)); showToast('Role updated')
  }
  async function updateDepartment(id: string, department: string) {
    await supabase.from('staff_users').update({ department: department || null }).eq('id', id)
    setStaff(prev => prev.map(s => s.id === id ? { ...s, department: department || null } : s)); showToast('Department updated')
  }
  function roleLabel(role: string) {
    return ({ super_admin: 'Super Admin', admin: 'Admin', manager: 'Manager', staff: 'Staff (view)', kitchen: 'Display', cashier: 'Cashier', scanner: 'Door Staff' } as any)[role] || role
  }
  function roleBadge(role: string) { return role === 'super_admin' ? 'badge-orange' : role === 'scanner' ? 'badge-blue' : 'badge-gray' }

  if (currentUser && currentUser.role !== 'super_admin') {
    return <div className="card" style={{ padding: 20, marginBottom: 20, color: 'var(--text-muted)', fontSize: 14 }}>Dashboard accounts are managed by a Super Admin.</div>
  }

  return (
    <div className="card" style={{ padding: 24, marginBottom: 20 }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 20 }}>
        <div className="section-title">Dashboard &amp; App Accounts</div>
        <button className="btn-accent" onClick={() => setShowAdd(!showAdd)} style={{ fontSize: 13, padding: '8px 16px' }}>+ Add Staff</button>
      </div>

      {showAdd && (
        <div style={{ background: 'var(--bg-subtle)', border: '1px dashed var(--accent)', borderRadius: 10, padding: 20, marginBottom: 20 }}>
          <div className="section-title" style={{ color: 'var(--accent)', marginBottom: 16 }}>New Account</div>
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 14, marginBottom: 14 }}>
            <div><label className="label">Full Name</label><input className="input" value={newStaff.name} onChange={e => setNewStaff(p => ({ ...p, name: e.target.value }))} placeholder="John Smith" /></div>
            <div><label className="label">Email</label><input className="input" type="email" value={newStaff.email} onChange={e => setNewStaff(p => ({ ...p, email: e.target.value }))} placeholder="staff@bigbamboo.app" /></div>
          </div>
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 14, marginBottom: 16 }}>
            <div>
              <label className="label">Role</label>
              <select className="input" value={newStaff.role} onChange={e => setNewStaff(p => ({ ...p, role: e.target.value }))}>
                <option value="manager">Manager</option>
                <option value="staff">Staff — view only (Kitchen/Bar)</option>
                <option value="kitchen">Display — recipes &amp; SOPs only (set Dept = Kitchen or Bar)</option>
                <option value="cashier">Cashier — cash in/out sheet only</option>
                <option value="scanner">Door Staff (Scanner Only)</option>
                <option value="super_admin">Super Admin</option>
              </select>
            </div>
            <div><label className="label">Temporary Password</label><input className="input" type="password" value={newStaff.password} onChange={e => setNewStaff(p => ({ ...p, password: e.target.value }))} placeholder="At least 6 characters" /></div>
          </div>
          <div style={{ marginBottom: 16 }}>
            <label className="label">Department (Kitchen / Bar for a Display device)</label>
            <select className="input" value={newStaff.department} onChange={e => setNewStaff(p => ({ ...p, department: e.target.value }))} style={{ maxWidth: 260 }}>
              <option value="">— None / all (managers)</option>
              <option value="kitchen">Kitchen</option>
              <option value="bar">Bar</option>
              <option value="floor">Floor</option>
            </select>
          </div>
          <div style={{ display: 'flex', gap: 10 }}>
            <button className="btn-accent" onClick={addStaff} disabled={busy}>{busy ? 'Creating…' : 'Create Account'}</button>
            <button className="btn-outline" onClick={() => setShowAdd(false)}>Cancel</button>
          </div>
        </div>
      )}

      <table className="data-table" style={{ width: '100%', tableLayout: 'fixed' }}>
        <thead>
          <tr><th style={{ width: '12%' }}>Name</th><th style={{ width: '16%' }}>Email</th><th style={{ width: '16%' }}>Role</th><th style={{ width: '13%' }}>Department</th><th style={{ width: '10%' }}>Status</th><th style={{ width: '33%', textAlign: 'right' }}>Actions</th></tr>
        </thead>
        <tbody>
          {staff.map(s => (
            <tr key={s.id} style={{ opacity: s.active ? 1 : 0.5 }}>
              <td style={{ fontWeight: 600 }}>{s.name}</td>
              <td style={{ color: 'var(--text-secondary)', fontSize: 13, wordBreak: 'break-all' }}>{s.email}</td>
              <td>
                {s.id === currentUser?.id
                  ? <span className={`badge ${roleBadge(s.role)}`}>{roleLabel(s.role)}</span>
                  : (
                    <select className="input" value={s.role} onChange={e => updateRole(s.id, e.target.value)} style={{ width: '100%', padding: '4px 8px', fontSize: 12 }}>
                      <option value="manager">Manager</option>
                      <option value="staff">Staff (view)</option>
                      <option value="kitchen">Display (Kitchen/Bar)</option>
                      <option value="cashier">Cashier</option>
                      <option value="scanner">Door Staff</option>
                      <option value="super_admin">Super Admin</option>
                    </select>
                  )}
              </td>
              <td>
                <select className="input" value={s.department || ''} onChange={e => updateDepartment(s.id, e.target.value)} style={{ width: '100%', padding: '4px 8px', fontSize: 12 }}>
                  <option value="">—</option><option value="kitchen">Kitchen</option><option value="bar">Bar</option><option value="floor">Floor</option>
                </select>
              </td>
              <td><span className={`badge ${s.active ? 'badge-green' : 'badge-red'}`}>{s.active ? 'Active' : 'Inactive'}</span></td>
              <td style={{ textAlign: 'right' }}>
                {s.id !== currentUser?.id && (
                  <div style={{ display: 'flex', gap: 6, justifyContent: 'flex-end', flexWrap: 'wrap' }}>
                    <button onClick={() => resetPassword(s.email, s.name)} className="btn-outline" style={{ padding: '5px 10px', fontSize: 12, whiteSpace: 'nowrap' }}>Password</button>
                    <button onClick={() => forceLogout(s.email, s.name)} className="btn-outline" style={{ padding: '5px 10px', fontSize: 12, whiteSpace: 'nowrap' }}>Log out</button>
                    <button onClick={() => toggleActive(s.id, s.active)} className={s.active ? 'btn-red' : 'btn-green'} style={{ padding: '5px 10px', fontSize: 12, whiteSpace: 'nowrap' }}>{s.active ? 'Deactivate' : 'Activate'}</button>
                    <button onClick={() => deleteStaff(s.email, s.name)} className="btn-red" style={{ padding: '5px 10px', fontSize: 12, whiteSpace: 'nowrap' }}>Delete</button>
                  </div>
                )}
              </td>
            </tr>
          ))}
        </tbody>
      </table>

      <DeviceLinks />
      {toast && <div className="toast">{toast}</div>}
    </div>
  )
}

function DeviceLinks() {
  const [origin, setOrigin] = useState('')
  const [copied, setCopied] = useState('')
  useEffect(() => { setOrigin(window.location.origin) }, [])
  const rows = [
    { label: 'Kitchen display', path: '/kitchen', hint: 'Recipes, add-ons, batches & SOPs — kitchen only' },
    { label: 'Bar display', path: '/bar', hint: 'Recipes, add-ons, batches & SOPs — bar only' },
    { label: 'Cashier sheet', path: '/cashier', hint: 'Cash in/out + payouts — cashier only' },
  ]
  async function copy(url: string) { try { await navigator.clipboard.writeText(url); setCopied(url); setTimeout(() => setCopied(''), 1600) } catch {} }
  return (
    <div style={{ marginTop: 22, borderTop: '1px solid var(--border, #eee)', paddingTop: 18 }}>
      <div className="section-title" style={{ marginBottom: 6, fontSize: 14 }}>Device login links</div>
      <div style={{ fontSize: 13, color: 'var(--text-muted, #999)', marginBottom: 14 }}>Open on a phone or tablet, sign in once with the matching role, then Add to Home Screen.</div>
      <div style={{ display: 'grid', gap: 10 }}>
        {rows.map(r => {
          const url = origin + r.path
          return (
            <div key={r.path} style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 12, flexWrap: 'wrap', border: '1px solid var(--border, #e5e5e5)', borderRadius: 10, padding: '12px 14px' }}>
              <div style={{ minWidth: 0 }}>
                <div style={{ fontWeight: 600, fontSize: 14 }}>{r.label}</div>
                <div style={{ fontSize: 12, color: 'var(--text-muted, #999)' }}>{r.hint}</div>
                <div style={{ fontSize: 13, color: 'var(--accent, #e87830)', marginTop: 4, wordBreak: 'break-all' }}>{url}</div>
              </div>
              <div style={{ display: 'flex', gap: 8 }}>
                <button className="btn-outline" style={{ padding: '7px 14px', fontSize: 13 }} onClick={() => copy(url)}>{copied === url ? 'Copied!' : 'Copy link'}</button>
                <a className="btn-outline" style={{ padding: '7px 14px', fontSize: 13, textDecoration: 'none' }} href={r.path} target="_blank" rel="noreferrer">Open</a>
              </div>
            </div>
          )
        })}
      </div>
    </div>
  )
}

// ───────────────────────── Scanner-app PIN logins (legacy) ─────────────────────────
interface StaffLogin { id: string; name: string; pin: string; role: 'door_staff' | 'bar_staff' | 'manager'; is_active: boolean; created_at: string }
const EMPTY_FORM: { name: string; pin: string; role: 'door_staff' | 'bar_staff' | 'manager'; is_active: boolean } = { name: '', pin: '', role: 'door_staff', is_active: true }

function ScannerPins() {
  const [staff, setStaff] = useState<StaffLogin[]>([])
  const [loading, setLoading] = useState(true)
  const [toast, setToast] = useState('')
  const [showAdd, setShowAdd] = useState(false)
  const [form, setForm] = useState(EMPTY_FORM)
  const [editingId, setEditingId] = useState<string | null>(null)
  const [revealedPins, setRevealedPins] = useState<Set<string>>(new Set())

  useEffect(() => { loadStaff() }, [])
  async function loadStaff() {
    setLoading(true)
    const { data, error } = await supabase.from('staff_logins').select('*').order('created_at', { ascending: true })
    if (error) showToast('Error loading: ' + error.message); else setStaff(data || [])
    setLoading(false)
  }
  function showToast(msg: string) { setToast(msg); setTimeout(() => setToast(''), 3000) }
  function togglePinReveal(id: string) { setRevealedPins(prev => { const n = new Set(prev); n.has(id) ? n.delete(id) : n.add(id); return n }) }
  function roleLabel(role: string) { return role === 'door_staff' ? 'Door Staff' : role === 'bar_staff' ? 'Bar Staff' : 'Manager' }
  function roleBadgeClass(role: string) { return role === 'door_staff' ? 'badge-orange' : role === 'bar_staff' ? 'badge-green' : '' }
  function startEdit(s: StaffLogin) { setEditingId(s.id); setForm({ name: s.name, pin: s.pin, role: s.role, is_active: s.is_active }); setShowAdd(false) }
  function cancelForm() { setShowAdd(false); setEditingId(null); setForm(EMPTY_FORM) }
  async function handleSave() {
    if (!form.name.trim()) { showToast('Name is required'); return }
    if (!/^\d{4}$/.test(form.pin)) { showToast('PIN must be exactly 4 digits'); return }
    if (editingId) {
      const { error } = await supabase.from('staff_logins').update({ name: form.name, pin: form.pin, role: form.role, is_active: form.is_active, updated_at: new Date().toISOString() }).eq('id', editingId)
      if (error) { showToast('Error updating: ' + error.message); return }
      showToast('PIN login updated')
    } else {
      const { error } = await supabase.from('staff_logins').insert({ name: form.name, pin: form.pin, role: form.role, is_active: form.is_active })
      if (error) { showToast('Error adding: ' + error.message); return }
      showToast('PIN login added')
    }
    cancelForm(); loadStaff()
  }
  async function handleDelete(id: string, name: string) {
    if (!confirm(`Delete PIN login for "${name}"?`)) return
    const { error } = await supabase.from('staff_logins').delete().eq('id', id)
    if (error) { showToast('Error deleting: ' + error.message); return }
    showToast('PIN login deleted'); loadStaff()
  }
  async function toggleActive(id: string, cur: boolean) {
    const { error } = await supabase.from('staff_logins').update({ is_active: !cur, updated_at: new Date().toISOString() }).eq('id', id)
    if (error) { showToast('Error: ' + error.message); return }
    setStaff(prev => prev.map(s => s.id === id ? { ...s, is_active: !cur } : s))
  }

  return (
    <div className="card" style={{ padding: 24, marginBottom: 20 }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 6 }}>
        <div className="section-title">Scanner App PINs</div>
        {!showAdd && !editingId && <button className="btn-accent" onClick={() => { setShowAdd(true); setForm(EMPTY_FORM) }} style={{ fontSize: 13, padding: '8px 16px' }}>+ Add PIN</button>}
      </div>
      <p style={{ fontSize: 13, color: 'var(--text-muted)', marginBottom: 18 }}>4-digit logins for the door/bar scanner app — separate from the dashboard accounts above.</p>

      {(showAdd || editingId) && (
        <div style={{ background: 'var(--bg-subtle)', border: '1px dashed var(--accent)', borderRadius: 10, padding: 20, marginBottom: 20 }}>
          <div className="section-title" style={{ color: 'var(--accent)', marginBottom: 16 }}>{editingId ? 'Edit PIN Login' : 'New PIN Login'}</div>
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 14, marginBottom: 14 }}>
            <div><label className="label">Name</label><input className="input" value={form.name} onChange={e => setForm(p => ({ ...p, name: e.target.value }))} placeholder="Staff name" /></div>
            <div><label className="label">PIN (4 digits)</label><input className="input" value={form.pin} onChange={e => setForm(p => ({ ...p, pin: e.target.value.replace(/\D/g, '').slice(0, 4) }))} placeholder="1234" maxLength={4} inputMode="numeric" style={{ fontFamily: 'DM Mono, monospace', letterSpacing: '0.2em' }} /></div>
          </div>
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 14, marginBottom: 16 }}>
            <div><label className="label">Role</label><select className="input" value={form.role} onChange={e => setForm(p => ({ ...p, role: e.target.value as any }))}><option value="door_staff">Door Staff</option><option value="bar_staff">Bar Staff</option><option value="manager">Manager</option></select></div>
            <div><label className="label">Active</label><div style={{ marginTop: 8 }}><label style={{ display: 'flex', alignItems: 'center', gap: 8, fontSize: 13, cursor: 'pointer' }}><input type="checkbox" checked={form.is_active} onChange={e => setForm(p => ({ ...p, is_active: e.target.checked }))} /> {form.is_active ? 'Active' : 'Inactive'}</label></div></div>
          </div>
          <div style={{ display: 'flex', gap: 10 }}><button className="btn-accent" onClick={handleSave}>{editingId ? 'Update' : 'Create'}</button><button className="btn-outline" onClick={cancelForm}>Cancel</button></div>
        </div>
      )}

      {loading ? <div style={{ padding: 24, color: 'var(--text-muted)' }}>Loading…</div>
        : staff.length === 0 ? <div style={{ padding: 24, color: 'var(--text-muted)' }}>No PIN logins yet.</div>
        : (
        <table className="data-table" style={{ width: '100%', tableLayout: 'fixed' }}>
          <thead><tr><th style={{ width: '22%' }}>Name</th><th style={{ width: '16%' }}>Role</th><th style={{ width: '16%' }}>PIN</th><th style={{ width: '13%' }}>Status</th><th style={{ width: '33%', textAlign: 'right' }}>Actions</th></tr></thead>
          <tbody>
            {staff.map(s => (
              <tr key={s.id} style={{ opacity: s.is_active ? 1 : 0.5 }}>
                <td style={{ fontWeight: 600 }}>{s.name}</td>
                <td><span className={`badge ${roleBadgeClass(s.role)}`} style={s.role === 'manager' ? { background: 'var(--accent)', color: '#fff' } : undefined}>{roleLabel(s.role)}</span></td>
                <td><span style={{ fontFamily: 'DM Mono, monospace', fontSize: 13, letterSpacing: '0.15em' }}>{revealedPins.has(s.id) ? s.pin : '••••'}</span><button onClick={() => togglePinReveal(s.id)} style={{ marginLeft: 8, background: 'none', border: 'none', cursor: 'pointer', color: 'var(--text-muted)', fontSize: 12 }}>{revealedPins.has(s.id) ? 'Hide' : 'Show'}</button></td>
                <td><span className={`badge ${s.is_active ? 'badge-green' : 'badge-red'}`}>{s.is_active ? 'Active' : 'Inactive'}</span></td>
                <td style={{ textAlign: 'right' }}>
                  <div style={{ display: 'flex', gap: 6, justifyContent: 'flex-end', flexWrap: 'nowrap' }}>
                    <button className="btn-outline" onClick={() => startEdit(s)} style={{ padding: '5px 10px', fontSize: 12 }}>Edit</button>
                    <button className={s.is_active ? 'btn-red' : 'btn-green'} onClick={() => toggleActive(s.id, s.is_active)} style={{ padding: '5px 10px', fontSize: 12, whiteSpace: 'nowrap' }}>{s.is_active ? 'Deactivate' : 'Activate'}</button>
                    <button className="btn-red" onClick={() => handleDelete(s.id, s.name)} style={{ padding: '5px 10px', fontSize: 12 }}>Delete</button>
                  </div>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      )}
      {toast && <div className="toast">{toast}</div>}
    </div>
  )
}

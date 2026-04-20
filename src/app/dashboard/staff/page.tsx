'use client'
import { useEffect, useState } from 'react'
import { supabase } from '@/lib/supabase'

interface StaffLogin {
  id: string
  name: string
  pin: string
  role: 'door_staff' | 'bar_staff' | 'manager'
  is_active: boolean
  created_at: string
  updated_at: string
}

const EMPTY_FORM: { name: string; pin: string; role: 'door_staff' | 'bar_staff' | 'manager'; is_active: boolean } = { name: '', pin: '', role: 'door_staff', is_active: true }

export default function StaffLoginsPage() {
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
    const { data, error } = await supabase
      .from('staff_logins')
      .select('*')
      .order('created_at', { ascending: true })
    if (error) {
      showToast('Error loading staff: ' + error.message)
    } else {
      setStaff(data || [])
    }
    setLoading(false)
  }

  function showToast(msg: string) {
    setToast(msg)
    setTimeout(() => setToast(''), 3000)
  }

  function togglePinReveal(id: string) {
    setRevealedPins(prev => {
      const next = new Set(prev)
      if (next.has(id)) next.delete(id)
      else next.add(id)
      return next
    })
  }

  function roleLabel(role: string) {
    if (role === 'door_staff') return 'Door Staff'
    if (role === 'bar_staff') return 'Bar Staff'
    return 'Manager'
  }

  function roleBadgeClass(role: string) {
    if (role === 'door_staff') return 'badge-orange'
    if (role === 'bar_staff') return 'badge-green'
    return ''
  }

  function startEdit(s: StaffLogin) {
    setEditingId(s.id)
    setForm({ name: s.name, pin: s.pin, role: s.role, is_active: s.is_active })
    setShowAdd(false)
  }

  function cancelForm() {
    setShowAdd(false)
    setEditingId(null)
    setForm(EMPTY_FORM)
  }

  async function handleSave() {
    if (!form.name.trim()) { showToast('Name is required'); return }
    if (!form.pin || !/^\d{4}$/.test(form.pin)) { showToast('PIN must be exactly 4 digits'); return }

    if (editingId) {
      const { error } = await supabase
        .from('staff_logins')
        .update({ name: form.name, pin: form.pin, role: form.role, is_active: form.is_active, updated_at: new Date().toISOString() })
        .eq('id', editingId)
      if (error) { showToast('Error updating: ' + error.message); return }
      showToast('Staff login updated')
    } else {
      const { error } = await supabase
        .from('staff_logins')
        .insert({ name: form.name, pin: form.pin, role: form.role, is_active: form.is_active })
      if (error) { showToast('Error adding: ' + error.message); return }
      showToast('Staff login added')
    }

    cancelForm()
    loadStaff()
  }

  async function handleDelete(id: string, name: string) {
    if (!confirm(`Delete staff login for "${name}"? This cannot be undone.`)) return
    const { error } = await supabase.from('staff_logins').delete().eq('id', id)
    if (error) { showToast('Error deleting: ' + error.message); return }
    showToast('Staff login deleted')
    loadStaff()
  }

  async function toggleActive(id: string, currentActive: boolean) {
    const { error } = await supabase
      .from('staff_logins')
      .update({ is_active: !currentActive, updated_at: new Date().toISOString() })
      .eq('id', id)
    if (error) { showToast('Error: ' + error.message); return }
    setStaff(prev => prev.map(s => s.id === id ? { ...s, is_active: !currentActive } : s))
    showToast(currentActive ? 'Staff login deactivated' : 'Staff login activated')
  }

  return (
    <div style={{ maxWidth: 820 }}>
      <div className="page-title" style={{ marginBottom: 8 }}>Staff Logins</div>
      <p style={{ fontSize: 14, color: 'var(--text-muted)', marginBottom: 28, lineHeight: 1.5 }}>
        Manage staff logins for the scanner app. Door staff can check in guests, bar staff can redeem prizes, and managers have full scanner access.
      </p>

      <div className="card" style={{ padding: 24 }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 20 }}>
          <div className="section-title">All Staff</div>
          {!showAdd && !editingId && (
            <button className="btn-accent" onClick={() => { setShowAdd(true); setForm(EMPTY_FORM) }} style={{ fontSize: 13, padding: '8px 16px' }}>
              + Add Staff
            </button>
          )}
        </div>

        {/* Add / Edit form */}
        {(showAdd || editingId) && (
          <div style={{ background: 'var(--bg-subtle)', border: '1px dashed var(--accent)', borderRadius: 10, padding: 20, marginBottom: 20 }}>
            <div className="section-title" style={{ color: 'var(--accent)', marginBottom: 16 }}>
              {editingId ? 'Edit Staff Login' : 'New Staff Login'}
            </div>
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 14, marginBottom: 14 }}>
              <div>
                <label className="label">Name</label>
                <input
                  className="input"
                  value={form.name}
                  onChange={e => setForm(p => ({ ...p, name: e.target.value }))}
                  placeholder="Staff name"
                />
              </div>
              <div>
                <label className="label">PIN (4 digits)</label>
                <input
                  className="input"
                  value={form.pin}
                  onChange={e => {
                    const v = e.target.value.replace(/\D/g, '').slice(0, 4)
                    setForm(p => ({ ...p, pin: v }))
                  }}
                  placeholder="1234"
                  maxLength={4}
                  inputMode="numeric"
                  style={{ fontFamily: 'DM Mono, monospace', letterSpacing: '0.2em' }}
                />
              </div>
            </div>
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 14, marginBottom: 16 }}>
              <div>
                <label className="label">Role</label>
                <select
                  className="input"
                  value={form.role}
                  onChange={e => setForm(p => ({ ...p, role: e.target.value as any }))}
                >
                  <option value="door_staff">Door Staff</option>
                  <option value="bar_staff">Bar Staff</option>
                  <option value="manager">Manager</option>
                </select>
              </div>
              <div>
                <label className="label">Status</label>
                <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginTop: 6 }}>
                  <button
                    onClick={() => setForm(p => ({ ...p, is_active: !p.is_active }))}
                    style={{
                      width: 44,
                      height: 24,
                      borderRadius: 12,
                      border: 'none',
                      cursor: 'pointer',
                      background: form.is_active ? 'var(--green)' : 'var(--border)',
                      position: 'relative',
                      transition: 'background 0.2s',
                    }}
                  >
                    <div style={{
                      width: 18,
                      height: 18,
                      borderRadius: '50%',
                      background: '#fff',
                      position: 'absolute',
                      top: 3,
                      left: form.is_active ? 23 : 3,
                      transition: 'left 0.2s',
                    }} />
                  </button>
                  <span style={{ fontSize: 13, color: 'var(--text-secondary)' }}>
                    {form.is_active ? 'Active' : 'Inactive'}
                  </span>
                </div>
              </div>
            </div>
            <div style={{ display: 'flex', gap: 10 }}>
              <button className="btn-accent" onClick={handleSave}>
                {editingId ? 'Update' : 'Create'}
              </button>
              <button className="btn-outline" onClick={cancelForm}>Cancel</button>
            </div>
          </div>
        )}

        {/* Staff table */}
        {loading ? (
          <div style={{ textAlign: 'center', padding: 40, color: 'var(--text-muted)' }}>Loading...</div>
        ) : staff.length === 0 ? (
          <div style={{ textAlign: 'center', padding: 40, color: 'var(--text-muted)' }}>
            No staff logins yet. Click &quot;+ Add Staff&quot; to create one.
          </div>
        ) : (
          <div className="card" style={{ overflow: 'hidden' }}>
            <table className="data-table">
              <thead>
                <tr>
                  <th>Name</th>
                  <th>Role</th>
                  <th>PIN</th>
                  <th>Status</th>
                  <th>Created</th>
                  <th style={{ textAlign: 'right' }}>Actions</th>
                </tr>
              </thead>
              <tbody>
                {staff.map(s => (
                  <tr key={s.id} style={{ opacity: s.is_active ? 1 : 0.5 }}>
                    <td style={{ fontWeight: 600 }}>{s.name}</td>
                    <td>
                      <span
                        className={`badge ${roleBadgeClass(s.role)}`}
                        style={s.role === 'manager' ? { background: 'var(--accent)', color: '#fff' } : undefined}
                      >
                        {roleLabel(s.role)}
                      </span>
                    </td>
                    <td>
                      <span style={{ fontFamily: 'DM Mono, monospace', fontSize: 13, letterSpacing: '0.15em' }}>
                        {revealedPins.has(s.id) ? s.pin : '\u2022\u2022\u2022\u2022'}
                      </span>
                      <button
                        onClick={() => togglePinReveal(s.id)}
                        style={{
                          marginLeft: 8,
                          background: 'none',
                          border: 'none',
                          cursor: 'pointer',
                          color: 'var(--text-muted)',
                          fontSize: 12,
                          padding: '2px 6px',
                        }}
                      >
                        {revealedPins.has(s.id) ? 'Hide' : 'Show'}
                      </button>
                    </td>
                    <td>
                      <span className={`badge ${s.is_active ? 'badge-green' : 'badge-red'}`}>
                        {s.is_active ? 'Active' : 'Inactive'}
                      </span>
                    </td>
                    <td style={{ color: 'var(--text-secondary)', fontSize: 13 }}>
                      {new Date(s.created_at).toLocaleDateString()}
                    </td>
                    <td style={{ textAlign: 'right' }}>
                      <div style={{ display: 'flex', gap: 6, justifyContent: 'flex-end' }}>
                        <button
                          className="btn-outline"
                          onClick={() => startEdit(s)}
                          style={{ padding: '5px 12px', fontSize: 12 }}
                        >
                          Edit
                        </button>
                        <button
                          className={s.is_active ? 'btn-red' : 'btn-green'}
                          onClick={() => toggleActive(s.id, s.is_active)}
                          style={{ padding: '5px 12px', fontSize: 12 }}
                        >
                          {s.is_active ? 'Deactivate' : 'Activate'}
                        </button>
                        <button
                          className="btn-red"
                          onClick={() => handleDelete(s.id, s.name)}
                          style={{ padding: '5px 12px', fontSize: 12 }}
                        >
                          Delete
                        </button>
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>

      {toast && <div className="toast">{toast}</div>}
    </div>
  )
}

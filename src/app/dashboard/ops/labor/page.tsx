'use client'
import { useEffect, useMemo, useState } from 'react'
import { ops, vnd, today, canManageRecipes, type StaffRole } from '@/lib/ops/api'
import { supabase } from '@/lib/supabase'

type Emp = { id: string; name: string; role_title: string | null; base_rate: number | null; active: boolean }
type Shift = { id: string; employee_id: string; occurred_on: string; hours: number; hourly_rate: number; shift_cost: number | null; notes: string | null; start_time: string | null; end_time: string | null }

// Hours between a start and finish HH:MM, rolling past midnight (e.g. 17:00 → 01:00 = 8h).
function hoursBetween(start: string, end: string): number {
  if (!start || !end) return 0
  const [sh, sm] = start.split(':').map(Number)
  const [eh, em] = end.split(':').map(Number)
  let mins = (eh * 60 + em) - (sh * 60 + sm)
  if (mins < 0) mins += 24 * 60
  return Math.round((mins / 60) * 100) / 100
}
const hhmm = (t: string | null) => t ? t.slice(0, 5) : ''

export default function LaborPage() {
  const [role, setRole] = useState<StaffRole | null>(null)
  const [venueId, setVenueId] = useState<string | null>(null)
  const [emps, setEmps] = useState<Emp[]>([])
  const [shifts, setShifts] = useState<Shift[]>([])
  const [loading, setLoading] = useState(true)
  const [msg, setMsg] = useState<string | null>(null)

  // add-employee form
  const [eName, setEName] = useState('')
  const [eRole, setERole] = useState('')
  const [eRate, setERate] = useState('')

  // edit-employee inline
  const [editId, setEditId] = useState<string | null>(null)
  const [edName, setEdName] = useState('')
  const [edRole, setEdRole] = useState('')
  const [edRate, setEdRate] = useState('')

  // log-shift form
  const [sEmp, setSEmp] = useState('')
  const [sDate, setSDate] = useState(today())
  const [sStart, setSStart] = useState('')
  const [sEnd, setSEnd] = useState('')
  const [sRate, setSRate] = useState('')
  const [sNotes, setSNotes] = useState('')

  // edit-shift inline
  const [shEditId, setShEditId] = useState<string | null>(null)
  const [shHours, setShHours] = useState('')
  const [shRate, setShRate] = useState('')

  useEffect(() => { init() }, [])
  async function init() {
    const { data: { session } } = await supabase.auth.getSession()
    const user = session?.user; if (!user) return
    const { data: su } = await supabase.from('staff_users').select('role').eq('email', user.email).maybeSingle()
    setRole((su?.role || 'staff') as StaffRole)
    const { data: venue } = await supabase.from('venues').select('id').eq('slug', 'bigbamboo').single()
    setVenueId(venue?.id || null)
    await load(venue?.id || null)
  }
  async function load(vid: string | null) {
    if (!vid) { setLoading(false); return }
    const monthStart = today().slice(0, 8) + '01'
    const [{ data: e }, { data: s }] = await Promise.all([
      ops().from('employees').select('id, name, role_title, base_rate, active').eq('venue_id', vid).order('name'),
      ops().from('labor_shifts').select('id, employee_id, occurred_on, hours, hourly_rate, shift_cost, notes, start_time, end_time').eq('venue_id', vid).gte('occurred_on', monthStart).order('occurred_on', { ascending: false }),
    ])
    setEmps((e as Emp[]) || [])
    setShifts((s as Shift[]) || [])
    setLoading(false)
  }

  const empName = (id: string) => emps.find(e => e.id === id)?.name || '—'
  const monthTotal = useMemo(() => shifts.reduce((t, s) => t + (Number(s.shift_cost) || 0), 0), [shifts])
  const monthHours = useMemo(() => shifts.reduce((t, s) => t + (Number(s.hours) || 0), 0), [shifts])
  const previewCost = hoursBetween(sStart, sEnd) * (Number(sRate.replace(/[^\d.]/g, '')) || 0)

  async function addEmployee() {
    if (!venueId || !eName.trim()) { setMsg('Employee needs a name'); return }
    setMsg(null)
    const { error } = await ops().from('employees').insert({
      venue_id: venueId, name: eName.trim(), role_title: eRole.trim() || null,
      base_rate: eRate ? Number(eRate.replace(/[^\d.]/g, '')) : null,
    })
    if (error) { setMsg(error.message); return }
    setEName(''); setERole(''); setERate('')
    await load(venueId)
  }
  async function toggleEmp(e: Emp) {
    await ops().from('employees').update({ active: !e.active }).eq('id', e.id)
    await load(venueId)
  }
  function startEdit(e: Emp) {
    setEditId(e.id); setEdName(e.name); setEdRole(e.role_title || ''); setEdRate(e.base_rate != null ? String(e.base_rate) : ''); setMsg(null)
  }
  async function saveEdit(id: string) {
    if (!edName.trim()) { setMsg('Name required'); return }
    const { error } = await ops().from('employees').update({
      name: edName.trim(), role_title: edRole.trim() || null,
      base_rate: edRate ? Number(edRate.replace(/[^\d.]/g, '')) : null,
    }).eq('id', id)
    if (error) { setMsg(error.message); return }
    setEditId(null)
    await load(venueId)
  }
  async function deleteEmp(e: Emp) {
    setMsg(null)
    const { count } = await ops().from('labor_shifts').select('id', { count: 'exact', head: true }).eq('employee_id', e.id)
    if ((count || 0) > 0) {
      setMsg(`${e.name} has ${count} logged shift${count === 1 ? '' : 's'} — deleting would remove that pay history. Use “Deactivate” instead to hide them.`)
      return
    }
    if (!confirm(`Delete ${e.name}? They have no shifts on record.`)) return
    const { error } = await ops().from('employees').delete().eq('id', e.id)
    if (error) { setMsg(error.message); return }
    await load(venueId)
  }
  function pickEmp(id: string) {
    setSEmp(id)
    const e = emps.find(x => x.id === id)
    // Always load the picked employee's default rate (was only filling when the field was empty,
    // so switching employees never updated it). Leave the current value if they have no default rate.
    if (e?.base_rate != null) setSRate(String(e.base_rate))
  }
  async function logShift() {
    if (!venueId) return
    if (!sEmp) { setMsg('Pick an employee'); return }
    if (!sStart || !sEnd) { setMsg('Enter a start and finish time'); return }
    const hours = hoursBetween(sStart, sEnd); const rate = Number(sRate.replace(/[^\d.]/g, ''))
    if (!hours || hours <= 0) { setMsg('Finish time must be after start time'); return }
    if (!rate || rate <= 0) { setMsg('Enter an hourly rate'); return }
    setMsg(null)
    const { error } = await ops().from('labor_shifts').insert({
      venue_id: venueId, employee_id: sEmp, occurred_on: sDate,
      hours, hourly_rate: rate, start_time: sStart, end_time: sEnd,
      source: 'manual', notes: sNotes.trim() || null,
    })
    if (error) { setMsg(error.message); return }
    setSStart(''); setSEnd(''); setSNotes('')
    await load(venueId)
  }
  async function delShift(id: string) {
    if (!confirm('Delete this shift?')) return
    await ops().from('labor_shifts').delete().eq('id', id)
    await load(venueId)
  }
  function startEditShift(s: Shift) {
    setShEditId(s.id); setShHours(String(Number(s.hours))); setShRate(String(Number(s.hourly_rate))); setMsg(null)
  }
  async function saveShift(id: string) {
    const hours = Number(shHours); const rate = Number(shRate.replace(/[^\d.]/g, ''))
    if (!hours || hours <= 0) { setMsg('Enter hours worked'); return }
    if (!rate || rate <= 0) { setMsg('Enter an hourly rate'); return }
    const { error } = await ops().from('labor_shifts').update({ hours, hourly_rate: rate }).eq('id', id)
    if (error) { setMsg(error.message); return }
    setShEditId(null); await load(venueId)
  }

  if (loading) return <div style={{ color: 'var(--text-muted, #999)', fontSize: 14 }}>Loading…</div>
  if (!(role && canManageRecipes(role))) return <div style={{ color: 'var(--text-muted, #999)', fontSize: 14 }}>Labor is managed by managers.</div>
  const activeEmps = emps.filter(e => e.active)

  return (
    <div style={{ maxWidth: 760 }}>
      <h2 style={{ fontSize: 22, fontWeight: 600 }}>Labor</h2>
      <div style={{ fontSize: 13, color: 'var(--text-muted, #999)', marginTop: 2, marginBottom: 20 }}>
        Log shifts here and they feed the Labor line on your P&amp;L.
      </div>

      <div style={{ display: 'flex', gap: 16, marginBottom: 24, flexWrap: 'wrap' }}>
        <Stat label="This month — labor" value={vnd(monthTotal)} />
        <Stat label="This month — hours" value={`${monthHours.toFixed(1)} h`} />
        <Stat label="Shifts logged" value={String(shifts.length)} />
      </div>

      {/* Log a shift */}
      <div className="card" style={{ padding: 16, marginBottom: 20 }}>
        <div style={hdr}>Log a shift</div>
        {activeEmps.length === 0 ? (
          <div style={{ fontSize: 13, color: 'var(--text-muted, #999)' }}>Add an employee below first.</div>
        ) : (
          <div style={{ display: 'flex', gap: 10, alignItems: 'flex-end', flexWrap: 'wrap' }}>
            <div style={{ minWidth: 180 }}><label className="label">Employee</label>
              <select value={sEmp} onChange={e => pickEmp(e.target.value)} style={inp}>
                <option value="">Pick…</option>
                {activeEmps.map(e => <option key={e.id} value={e.id}>{e.name}{e.role_title ? ` — ${e.role_title}` : ''}</option>)}
              </select>
            </div>
            <div style={{ width: 140 }}><label className="label">Date</label><input type="date" value={sDate} onChange={e => setSDate(e.target.value)} style={inp} /></div>
            <div style={{ width: 110 }}><label className="label">Start</label><input type="time" value={sStart} onChange={e => setSStart(e.target.value)} style={inp} /></div>
            <div style={{ width: 110 }}><label className="label">Finish</label><input type="time" value={sEnd} onChange={e => setSEnd(e.target.value)} style={inp} /></div>
            <div style={{ width: 70 }}><label className="label">Hours</label><div style={{ ...inp, display: 'flex', alignItems: 'center', color: 'var(--text-muted, #999)' }}>{hoursBetween(sStart, sEnd) ? hoursBetween(sStart, sEnd).toFixed(1) : '—'}</div></div>
            <div style={{ width: 130 }}><label className="label">Rate (VND/h)</label><input type="text" inputMode="numeric" value={sRate} onChange={e => setSRate(e.target.value)} placeholder="40,000" style={inp} /></div>
            <div style={{ minWidth: 140, flex: 1 }}><label className="label">Notes</label><input type="text" value={sNotes} onChange={e => setSNotes(e.target.value)} placeholder="optional" style={inp} /></div>
            <button onClick={logShift} style={btnPrimary}>Add{previewCost > 0 ? ` · ${vnd(previewCost)}` : ''}</button>
          </div>
        )}
        {msg && <div style={{ fontSize: 12, color: 'var(--burgundy, #7b2d3a)', marginTop: 8 }}>{msg}</div>}
      </div>

      {/* Recent shifts */}
      <div style={hdr}>This month&apos;s shifts</div>
      <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 14, marginBottom: 28 }}>
        <thead><tr style={{ background: 'var(--bg-sidebar, #fafafa)' }}>
          <th style={th}>Date</th><th style={th}>Employee</th><th style={{ ...th, textAlign: 'right' }}>Hours</th><th style={{ ...th, textAlign: 'right' }}>Rate</th><th style={{ ...th, textAlign: 'right' }}>Cost</th><th style={th}></th>
        </tr></thead>
        <tbody>
          {shifts.length === 0 && <tr><td colSpan={6} style={{ padding: 12, color: 'var(--text-muted, #999)' }}>No shifts logged this month.</td></tr>}
          {shifts.map(s => (
            shEditId === s.id ? (
              <tr key={s.id} style={{ borderTop: '1px solid var(--border, #eee)', background: 'var(--bg-sidebar, #fafafa)' }}>
                <td style={td}>{s.occurred_on}</td>
                <td style={td}>{empName(s.employee_id)}</td>
                <td style={{ ...td, textAlign: 'right' }}>
                  <input inputMode="decimal" value={shHours} onChange={e => setShHours(e.target.value)} style={{ ...inp, padding: '6px 8px', textAlign: 'right', width: 70 }} />
                </td>
                <td style={{ ...td, textAlign: 'right' }}>
                  <input inputMode="numeric" value={shRate} onChange={e => setShRate(e.target.value)} style={{ ...inp, padding: '6px 8px', textAlign: 'right', width: 90 }} />
                </td>
                <td style={{ ...td, textAlign: 'right', fontWeight: 600 }}>{vnd((Number(shHours) || 0) * (Number(shRate.replace(/[^\d.]/g, '')) || 0))}</td>
                <td style={{ ...td, textAlign: 'right', whiteSpace: 'nowrap' }}>
                  <button onClick={() => saveShift(s.id)} style={{ ...btnLink, color: 'var(--accent, #e87830)', fontWeight: 600 }}>Save</button>
                  <button onClick={() => setShEditId(null)} style={{ ...btnLink, marginLeft: 10 }}>Cancel</button>
                </td>
              </tr>
            ) : (
              <tr key={s.id} style={{ borderTop: '1px solid var(--border, #eee)' }}>
                <td style={td}>{s.occurred_on}</td>
                <td style={td}>{empName(s.employee_id)}</td>
                <td style={{ ...td, textAlign: 'right' }}>{Number(s.hours).toFixed(1)}{s.start_time && s.end_time && <div style={{ fontSize: 11, color: 'var(--text-muted, #999)' }}>{hhmm(s.start_time)}–{hhmm(s.end_time)}</div>}</td>
                <td style={{ ...td, textAlign: 'right' }}>{vnd(s.hourly_rate)}</td>
                <td style={{ ...td, textAlign: 'right', fontWeight: 600 }}>{vnd(s.shift_cost)}</td>
                <td style={{ ...td, textAlign: 'right', whiteSpace: 'nowrap' }}>
                  <button onClick={() => startEditShift(s)} style={btnLink}>Edit</button>
                  <button onClick={() => delShift(s.id)} style={{ ...btnLink, color: 'var(--burgundy, #7b2d3a)', marginLeft: 10 }}>Delete</button>
                </td>
              </tr>
            )
          ))}
        </tbody>
      </table>

      {/* Employees */}
      <div className="card" style={{ padding: 16, marginBottom: 16 }}>
        <div style={hdr}>Add an employee</div>
        <div style={{ display: 'flex', gap: 10, alignItems: 'flex-end', flexWrap: 'wrap' }}>
          <div style={{ flex: 1, minWidth: 160 }}><label className="label">Name</label><input value={eName} onChange={e => setEName(e.target.value)} style={inp} placeholder="e.g. Linh" /></div>
          <div style={{ minWidth: 140 }}><label className="label">Role</label><input value={eRole} onChange={e => setERole(e.target.value)} style={inp} placeholder="Bartender" /></div>
          <div style={{ width: 140 }}><label className="label">Default rate /h</label><input type="text" inputMode="numeric" value={eRate} onChange={e => setERate(e.target.value)} style={inp} placeholder="40,000" /></div>
          <button onClick={addEmployee} style={btnPrimary}>Add</button>
        </div>
      </div>

      <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 14 }}>
        <thead><tr style={{ background: 'var(--bg-sidebar, #fafafa)' }}>
          <th style={th}>Employee</th><th style={th}>Role</th><th style={{ ...th, textAlign: 'right' }}>Default rate</th><th style={th}>Status</th><th style={th}></th>
        </tr></thead>
        <tbody>
          {emps.length === 0 && <tr><td colSpan={5} style={{ padding: 12, color: 'var(--text-muted, #999)' }}>No employees yet.</td></tr>}
          {emps.map(e => editId === e.id ? (
            <tr key={e.id} style={{ borderTop: '1px solid var(--border, #eee)', background: 'var(--bg-sidebar, #fafafa)' }}>
              <td style={td}><input value={edName} onChange={ev => setEdName(ev.target.value)} style={{ ...inp, padding: '6px 8px' }} /></td>
              <td style={td}><input value={edRole} onChange={ev => setEdRole(ev.target.value)} style={{ ...inp, padding: '6px 8px' }} placeholder="Role" /></td>
              <td style={td}><input inputMode="numeric" value={edRate} onChange={ev => setEdRate(ev.target.value)} style={{ ...inp, padding: '6px 8px', textAlign: 'right' }} placeholder="rate/h" /></td>
              <td style={td}>{e.active ? 'Active' : 'Inactive'}</td>
              <td style={{ ...td, textAlign: 'right', whiteSpace: 'nowrap' }}>
                <button onClick={() => saveEdit(e.id)} style={btnLink}>Save</button>
                <button onClick={() => setEditId(null)} style={{ ...btnLink, color: 'var(--text-muted, #999)' }}>Cancel</button>
              </td>
            </tr>
          ) : (
            <tr key={e.id} style={{ borderTop: '1px solid var(--border, #eee)', opacity: e.active ? 1 : 0.5 }}>
              <td style={{ ...td, fontWeight: 600 }}>{e.name}</td>
              <td style={td}>{e.role_title || '—'}</td>
              <td style={{ ...td, textAlign: 'right' }}>{e.base_rate != null ? vnd(e.base_rate) : '—'}</td>
              <td style={td}>{e.active ? 'Active' : 'Inactive'}</td>
              <td style={{ ...td, textAlign: 'right', whiteSpace: 'nowrap' }}>
                <button onClick={() => startEdit(e)} style={btnLink}>Edit</button>
                <button onClick={() => toggleEmp(e)} style={btnLink}>{e.active ? 'Deactivate' : 'Reactivate'}</button>
                <button onClick={() => deleteEmp(e)} style={{ ...btnLink, color: 'var(--burgundy, #7b2d3a)' }}>Delete</button>
              </td>
            </tr>
          ))}
        </tbody>
      </table>
      {msg && <div style={{ fontSize: 12, color: msg.startsWith('✓') ? '#548235' : 'var(--burgundy, #7b2d3a)', marginTop: 10 }}>{msg}</div>}
    </div>
  )
}

const Stat = ({ label, value }: { label: string; value: string }) => (
  <div className="card" style={{ padding: '12px 16px', minWidth: 150 }}>
    <div style={{ fontSize: 11, fontWeight: 600, textTransform: 'uppercase', letterSpacing: '0.06em', color: 'var(--text-muted, #999)' }}>{label}</div>
    <div style={{ fontSize: 20, fontWeight: 700, marginTop: 4 }}>{value}</div>
  </div>
)

const hdr = { fontSize: 12, fontWeight: 700, textTransform: 'uppercase' as const, letterSpacing: '0.06em', color: 'var(--text-muted, #999)', marginBottom: 10 }
const inp = { width: '100%', padding: '10px 12px', fontSize: 14, border: '1px solid var(--border, #e5e5e5)', borderRadius: 8, background: 'var(--bg-input, #fff)', color: 'var(--text, #333)', boxSizing: 'border-box' as const }
const th = { padding: '8px 12px', textAlign: 'left' as const, fontWeight: 600, fontSize: 11, textTransform: 'uppercase' as const, color: 'var(--text-muted, #999)', letterSpacing: '0.05em' }
const td = { padding: '10px 12px', color: 'var(--text, #333)' }
const btnPrimary = { padding: '10px 16px', background: 'var(--accent, #e87830)', color: '#fff', border: 'none', borderRadius: 8, fontSize: 14, fontWeight: 600, cursor: 'pointer', whiteSpace: 'nowrap' as const }
const btnLink = { padding: '4px 8px', background: 'transparent', color: 'var(--burgundy, #7b2d3a)', border: 'none', cursor: 'pointer', fontSize: 13 }

'use client'
import { useEffect, useMemo, useState } from 'react'
import { ops, vnd, today, canManageRecipes, type StaffRole } from '@/lib/ops/api'
import { supabase } from '@/lib/supabase'

type Emp = { id: string; name: string; role_title: string | null; base_rate: number | null; active: boolean }
type Shift = { id: string; employee_id: string; occurred_on: string; hours: number; hourly_rate: number; shift_cost: number | null; notes: string | null; start_time: string | null; end_time: string | null }
type Payout = { id: string; employee_id: string; amount: number; paid_on: string; method: string; note: string | null; cash_movement_id: string | null }
type Account = { account_id: string; name: string; kind: string }

// "2026-06" → "Jun 2026". Used to label the per-employee monthly breakdown.
function monthLabel(ym: string): string {
  const [y, m] = ym.split('-').map(Number)
  return new Date(y, m - 1, 1).toLocaleString('en-US', { month: 'short', year: 'numeric' })
}
const ymOf = (d: string) => d.slice(0, 7)
// step a "YYYY-MM" string forward/back by n months
function shiftMonth(ym: string, n: number): string {
  const [y, m] = ym.split('-').map(Number)
  const d = new Date(y, m - 1 + n, 1)
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`
}

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

// Parse loose time entry into 24h "HH:MM". Bar-smart defaults: a bare hour 1–11 means PM
// (5 → 17:00, 11 → 23:00); add "a" for AM (1a → 01:00, 12a → 00:00); "530" → 17:30; "17:30" literal.
function parseTime(input: string): string | null {
  let s = input.trim().toLowerCase().replace(/[.\s]/g, '')
  if (!s) return null
  let ap: 'a' | 'p' | null = null
  if (/a m?$/.test(s) || s.endsWith('a')) { ap = 'a'; s = s.replace(/am?$/, '') }
  else if (s.endsWith('pm') || s.endsWith('p')) { ap = 'p'; s = s.replace(/pm?$/, '') }
  s = s.replace(':', '')
  if (!/^\d{1,4}$/.test(s)) return null
  let h: number, m: number
  if (s.length <= 2) { h = parseInt(s, 10); m = 0 } else { m = parseInt(s.slice(-2), 10); h = parseInt(s.slice(0, -2), 10) }
  if (h > 23 || m > 59) return null
  if (ap === 'a') { if (h === 12) h = 0 }
  else if (ap === 'p') { if (h < 12) h += 12 }
  else if (h >= 1 && h <= 11) h += 12   // bar default: bare 1–11 → PM
  return `${String(h).padStart(2, '0')}:${String(m).padStart(2, '0')}`
}
const pad2 = (n: number) => String(n).padStart(2, '0')
function fmt12(hhmm: string): string {
  const [h, m] = hhmm.split(':').map(Number)
  const ap = h >= 12 ? 'PM' : 'AM'; let hh = h % 12; if (hh === 0) hh = 12
  return `${hh}:${String(m).padStart(2, '0')} ${ap}`
}
// All half-hour slots, ordered like a bar day (opens ~late morning → after midnight),
// filtered by what the user has typed so far. Typing "3" shows 3:00 PM, 3:30 PM, 3:00 AM, 3:30 AM.
function timeOptions(text: string): { value: string; label: string }[] {
  let raw = (text || '').trim().toLowerCase().replace(/[.\s]/g, '')
  let ap: 'a' | 'p' | null = null
  if (/am?$/.test(raw)) { ap = 'a'; raw = raw.replace(/am?$/, '') }
  else if (/pm?$/.test(raw)) { ap = 'p'; raw = raw.replace(/pm?$/, '') }
  const digits = raw.replace(':', '')
  const all: { value: string; label: string; key: string; mer: 'a' | 'p'; ord: number }[] = []
  for (let h = 0; h < 24; h++) {
    for (const m of [0, 30]) {
      const value = `${pad2(h)}:${pad2(m)}`
      const h12 = (h % 12) || 12
      all.push({ value, label: fmt12(value), key: `${h12}${pad2(m)}`, mer: h < 12 ? 'a' : 'p', ord: h < 5 ? h + 24 : h })
    }
  }
  let opts = all
  if (ap) opts = opts.filter(o => o.mer === ap)
  if (digits) opts = opts.filter(o => o.key.startsWith(digits))
  opts.sort((a, b) => a.ord - b.ord)
  return opts.map(o => ({ value: o.value, label: o.label }))
}
function SmartTime({ value, onChange, placeholder, style }: { value: string; onChange: (v: string) => void; placeholder?: string; style?: React.CSSProperties }) {
  const [text, setText] = useState(''); const [open, setOpen] = useState(false)
  const [hi, setHi] = useState(0)   // keyboard-highlighted option index
  const opts = open ? timeOptions(text).slice(0, 8) : []
  const pick = (v: string) => { onChange(v); setOpen(false); setText('') }
  // keep the highlight in range whenever the option list changes
  useEffect(() => { setHi(h => Math.min(Math.max(h, 0), Math.max(opts.length - 1, 0))) }, [opts.length])
  return (
    <div style={{ position: 'relative' }}>
      <input value={open ? text : (value ? fmt12(value) : '')} placeholder={placeholder} style={style}
        onFocus={() => { setOpen(true); setText(''); setHi(0) }}
        onChange={e => { setText(e.target.value); setHi(0) }}
        onBlur={() => { setTimeout(() => { setOpen(false); if (text.trim()) { const p = parseTime(text); if (p) onChange(p) } }, 150) }}
        onKeyDown={e => {
          if (!open) return
          if (e.key === 'ArrowDown') { e.preventDefault(); setHi(h => Math.min(h + 1, opts.length - 1)) }
          else if (e.key === 'ArrowUp') { e.preventDefault(); setHi(h => Math.max(h - 1, 0)) }
          else if (e.key === 'Enter' && opts.length) { e.preventDefault(); pick(opts[Math.min(hi, opts.length - 1)].value) }
          else if (e.key === 'Escape') { setOpen(false) }
        }} />
      {open && opts.length > 0 && (
        <div style={{ position: 'absolute', top: '100%', left: 0, right: 0, marginTop: 4, zIndex: 30, maxHeight: 224, overflowY: 'auto', WebkitOverflowScrolling: 'touch', background: 'var(--bg-card, #1f1f1f)', border: '1px solid var(--border, #3a3a3a)', borderRadius: 8, boxShadow: '0 8px 24px rgba(0,0,0,0.4)' }}>
          {opts.map((o, i) => (
            <button key={o.value} type="button" onMouseDown={e => { e.preventDefault(); pick(o.value) }}
              ref={el => { if (el && i === hi && open) el.scrollIntoView({ block: 'nearest' }) }}
              style={{ display: 'block', width: '100%', textAlign: 'left', padding: '8px 12px', fontSize: 14, border: 'none', background: i === hi ? 'var(--bg-sidebar, #2a2a2a)' : 'transparent', color: 'var(--text, #eee)', cursor: 'pointer' }}
              onMouseEnter={() => setHi(i)}>{o.label}</button>
          ))}
        </div>
      )}
    </div>
  )
}

export default function LaborPage() {
  const [role, setRole] = useState<StaffRole | null>(null)
  const [venueId, setVenueId] = useState<string | null>(null)
  const [emps, setEmps] = useState<Emp[]>([])
  const [shifts, setShifts] = useState<Shift[]>([])
  const [loading, setLoading] = useState(true)
  const [msg, setMsg] = useState<string | null>(null)
  // which month the page is showing (YYYY-MM); defaults to the current month
  const [selMonth, setSelMonth] = useState(today().slice(0, 7))

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
  const [shHours, setShHours] = useState('')   // fallback for legacy shifts with no start/finish on record
  const [shRate, setShRate] = useState('')
  const [shStart, setShStart] = useState('')
  const [shEnd, setShEnd] = useState('')

  // per-employee detail drawer (hours breakdown + pay-out)
  const [accounts, setAccounts] = useState<Account[]>([])
  const [drawerEmp, setDrawerEmp] = useState<Emp | null>(null)
  const [drawerShifts, setDrawerShifts] = useState<Shift[]>([])
  const [drawerPayouts, setDrawerPayouts] = useState<Payout[]>([])
  const [drawerBusy, setDrawerBusy] = useState(false)
  const [drawerMsg, setDrawerMsg] = useState<string | null>(null)
  // pay-out form (inside drawer)
  const [poAmt, setPoAmt] = useState('')
  const [poDate, setPoDate] = useState(today())
  const [poMethod, setPoMethod] = useState<'cash' | 'transfer'>('cash')
  const [poAccount, setPoAccount] = useState('')
  const [poNote, setPoNote] = useState('')

  useEffect(() => { init() }, [])
  // reload shifts when the user pages to a different month (skips the first mount,
  // where init() already does the initial load)
  const didMount = useMemo(() => ({ v: false }), [])
  useEffect(() => {
    if (!didMount.v) { didMount.v = true; return }
    if (venueId) load(venueId)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [selMonth])
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
    // shifts for the currently-selected month [monthStart, nextMonthStart)
    const monthStart = selMonth + '-01'
    const [my, mm] = selMonth.split('-').map(Number)
    const nextMonthStart = mm === 12 ? `${my + 1}-01-01` : `${my}-${pad2(mm + 1)}-01`
    const [{ data: e }, { data: s }, { data: acc }] = await Promise.all([
      ops().from('employees').select('id, name, role_title, base_rate, active').eq('venue_id', vid).order('name'),
      ops().from('labor_shifts').select('id, employee_id, occurred_on, hours, hourly_rate, shift_cost, notes, start_time, end_time').eq('venue_id', vid).gte('occurred_on', monthStart).lt('occurred_on', nextMonthStart).order('occurred_on', { ascending: false }),
      ops().from('v_cash_balances').select('account_id, name, kind').eq('venue_id', vid),
    ])
    setEmps((e as Emp[]) || [])
    setShifts((s as Shift[]) || [])
    const accs = (acc as Account[]) || []
    setAccounts(accs)
    // default the pay-out source to the Safe (wages usually come out of the safe)
    if (!poAccount) setPoAccount(accs.find(a => a.kind === 'safe')?.account_id || accs[0]?.account_id || '')
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
    setShEditId(s.id)
    setShStart(s.start_time ? hhmm(s.start_time) : '')
    setShEnd(s.end_time ? hhmm(s.end_time) : '')
    setShHours(String(Number(s.hours)))   // fallback if the shift was logged without times
    setShRate(String(Number(s.hourly_rate))); setMsg(null)
  }
  async function saveShift(id: string) {
    const rate = Number(shRate.replace(/[^\d.]/g, ''))
    if (!rate || rate <= 0) { setMsg('Enter an hourly rate'); return }
    // Prefer start/finish times (recompute hours from them). Fall back to the
    // raw hours only when this shift has no times entered (legacy/imported rows).
    let hours: number, startVal: string | null, endVal: string | null
    if (shStart && shEnd) {
      hours = hoursBetween(shStart, shEnd); startVal = shStart; endVal = shEnd
      if (!hours || hours <= 0) { setMsg('Finish time must be after start time'); return }
    } else {
      hours = Number(shHours); startVal = null; endVal = null
      if (!hours || hours <= 0) { setMsg('Enter a start and finish time'); return }
    }
    const { error } = await ops().from('labor_shifts').update({ hours, hourly_rate: rate, start_time: startVal, end_time: endVal }).eq('id', id)
    if (error) { setMsg(error.message); return }
    setShEditId(null); await load(venueId)
  }

  // ───────────────────────── employee detail drawer ─────────────────────────
  async function openDrawer(e: Emp) {
    setDrawerEmp(e); setDrawerMsg(null); setDrawerBusy(true)
    setDrawerShifts([]); setDrawerPayouts([])
    setPoAmt(''); setPoDate(today()); setPoMethod('cash'); setPoNote('')
    const [{ data: s }, { data: p }] = await Promise.all([
      ops().from('labor_shifts').select('id, employee_id, occurred_on, hours, hourly_rate, shift_cost, notes, start_time, end_time').eq('employee_id', e.id).order('occurred_on', { ascending: false }),
      ops().from('labor_payouts').select('id, employee_id, amount, paid_on, method, note, cash_movement_id').eq('employee_id', e.id).order('paid_on', { ascending: false }),
    ])
    setDrawerShifts((s as Shift[]) || [])
    setDrawerPayouts((p as Payout[]) || [])
    setDrawerBusy(false)
  }
  function closeDrawer() { setDrawerEmp(null); setDrawerShifts([]); setDrawerPayouts([]); setDrawerMsg(null) }

  async function recordPayout() {
    if (!venueId || !drawerEmp) return
    const amt = Number(poAmt.replace(/[^\d.]/g, ''))
    if (!amt || amt <= 0) { setDrawerMsg('Enter an amount to pay out'); return }
    if (poMethod === 'cash' && !poAccount) { setDrawerMsg('Pick which cash account it comes out of'); return }
    setDrawerBusy(true); setDrawerMsg(null)
    let cashMovementId: string | null = null
    // Cash pay-outs also leave the cash drawer: write a negative cash_movements row.
    // Bank transfers don't touch the physical cash, so they skip this.
    if (poMethod === 'cash') {
      const { data: mv, error: mErr } = await ops().from('cash_movements').insert({
        venue_id: venueId, account_id: poAccount, amount: -Math.abs(amt), type: 'payout',
        person: drawerEmp.name, note: poNote.trim() || `Wage payout — ${drawerEmp.name}`,
        occurred_at: new Date(poDate + 'T12:00:00').toISOString(),
      }).select('id').single()
      if (mErr) { setDrawerMsg(mErr.message); setDrawerBusy(false); return }
      cashMovementId = mv?.id || null
    }
    const { error } = await ops().from('labor_payouts').insert({
      venue_id: venueId, employee_id: drawerEmp.id, amount: Math.abs(amt), paid_on: poDate,
      method: poMethod, cash_movement_id: cashMovementId, note: poNote.trim() || null, created_by: role,
    })
    if (error) {
      // roll back the cash movement so we don't leave an orphaned deduction
      if (cashMovementId) await ops().from('cash_movements').delete().eq('id', cashMovementId)
      setDrawerMsg(error.message); setDrawerBusy(false); return
    }
    setPoAmt(''); setPoNote('')
    setDrawerMsg(`✓ Paid ${vnd(amt)} to ${drawerEmp.name}${poMethod === 'cash' ? ' — taken from cash' : ''}.`)
    await openDrawer(drawerEmp)  // reload drawer totals
  }

  async function deletePayout(p: Payout) {
    if (!drawerEmp || !isSuper) return
    if (!confirm(`Delete this ${vnd(p.amount)} payout? ${p.cash_movement_id ? 'The matching cash deduction will also be removed.' : ''}`)) return
    setDrawerBusy(true)
    if (p.cash_movement_id) await ops().from('cash_movements').delete().eq('id', p.cash_movement_id)
    await ops().from('labor_payouts').delete().eq('id', p.id)
    await openDrawer(drawerEmp)
  }

  if (loading) return <div style={{ color: 'var(--text-muted, #999)', fontSize: 14 }}>Loading…</div>
  if (!(role && canManageRecipes(role))) return <div style={{ color: 'var(--text-muted, #999)', fontSize: 14 }}>Labor is managed by managers.</div>
  const activeEmps = emps.filter(e => e.active)
  const isSuper = role === 'super_admin'

  // Drawer derived figures: hours + cost grouped by calendar month, and the
  // earned / paid / outstanding settlement for the selected employee.
  const nowYm = today().slice(0, 7)
  const prevYm = (() => { const [y, m] = nowYm.split('-').map(Number); const d = new Date(y, m - 2, 1); return `${d.getFullYear()}-${pad2(d.getMonth() + 1)}` })()
  const byMonth: { ym: string; hours: number; cost: number }[] = (() => {
    const map = new Map<string, { hours: number; cost: number }>()
    for (const s of drawerShifts) {
      const k = ymOf(s.occurred_on)
      const cur = map.get(k) || { hours: 0, cost: 0 }
      cur.hours += Number(s.hours) || 0
      cur.cost += Number(s.shift_cost) || 0
      map.set(k, cur)
    }
    return Array.from(map.entries()).map(([ym, v]) => ({ ym, ...v })).sort((a, b) => b.ym.localeCompare(a.ym))
  })()
  const totalEarned = drawerShifts.reduce((t, s) => t + (Number(s.shift_cost) || 0), 0)
  const totalHours = drawerShifts.reduce((t, s) => t + (Number(s.hours) || 0), 0)
  const totalPaid = drawerPayouts.reduce((t, p) => t + (Number(p.amount) || 0), 0)
  const outstanding = Math.max(totalEarned - totalPaid, 0)
  const thisMonth = byMonth.find(m => m.ym === nowYm)
  const lastMonth = byMonth.find(m => m.ym === prevYm)

  return (
    <div style={{ maxWidth: 1180 }}>
      <h2 style={{ fontSize: 22, fontWeight: 600 }}>Labor</h2>
      <div style={{ fontSize: 13, color: 'var(--text-muted, #999)', marginTop: 2, marginBottom: 20 }}>
        Log shifts here and they feed the Labor line on your P&amp;L.
      </div>

      {/* month navigator */}
      <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 16 }}>
        <button onClick={() => setSelMonth(shiftMonth(selMonth, -1))} style={navBtn} title="Previous month">‹</button>
        <div style={{ minWidth: 130, textAlign: 'center', fontWeight: 600, fontSize: 15 }}>{monthLabel(selMonth)}</div>
        <button onClick={() => setSelMonth(shiftMonth(selMonth, 1))} disabled={selMonth >= nowYm} style={{ ...navBtn, opacity: selMonth >= nowYm ? 0.35 : 1, cursor: selMonth >= nowYm ? 'default' : 'pointer' }} title="Next month">›</button>
        {selMonth !== nowYm && <button onClick={() => setSelMonth(nowYm)} style={{ ...btnLink, color: 'var(--accent, #e87830)' }}>Jump to this month</button>}
      </div>

      <div style={{ display: 'flex', gap: 16, marginBottom: 24, flexWrap: 'wrap' }}>
        <Stat label={`${monthLabel(selMonth)} — labor`} value={vnd(monthTotal)} />
        <Stat label={`${monthLabel(selMonth)} — hours`} value={`${monthHours.toFixed(1)} h`} />
        <Stat label="Shifts logged" value={String(shifts.length)} />
      </div>

      {/* two columns on wide screens (shifts | staff), single column when narrow */}
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(380px, 1fr))', gap: 24, alignItems: 'start' }}>

      {/* ── left column: log a shift + this month's shifts ── */}
      <div>
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
            <div style={{ width: 120 }}><label className="label">Start</label><SmartTime value={sStart} onChange={setSStart} placeholder="5pm" style={inp} /></div>
            <div style={{ width: 120 }}><label className="label">Finish</label><SmartTime value={sEnd} onChange={setSEnd} placeholder="11pm" style={inp} /></div>
            <div style={{ width: 70 }}><label className="label">Hours</label><div style={{ ...inp, display: 'flex', alignItems: 'center', color: 'var(--text-muted, #999)' }}>{hoursBetween(sStart, sEnd) ? hoursBetween(sStart, sEnd).toFixed(1) : '—'}</div></div>
            <div style={{ width: 130 }}><label className="label">Rate (VND/h)</label><input type="text" inputMode="numeric" value={sRate} onChange={e => setSRate(e.target.value)} placeholder="40,000" style={inp} /></div>
            <div style={{ minWidth: 140, flex: 1 }}><label className="label">Notes</label><input type="text" value={sNotes} onChange={e => setSNotes(e.target.value)} placeholder="optional" style={inp} /></div>
            <button onClick={logShift} style={btnPrimary}>Add{previewCost > 0 ? ` · ${vnd(previewCost)}` : ''}</button>
          </div>
        )}
        {msg && <div style={{ fontSize: 12, color: 'var(--burgundy, #7b2d3a)', marginTop: 8 }}>{msg}</div>}
      </div>

      {/* Recent shifts */}
      <div style={hdr}>{monthLabel(selMonth)} shifts</div>
      <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 14, marginBottom: 28 }}>
        <thead><tr style={{ background: 'var(--bg-sidebar, #fafafa)' }}>
          <th style={th}>Date</th><th style={th}>Employee</th><th style={{ ...th, textAlign: 'right' }}>Hours</th><th style={{ ...th, textAlign: 'right' }}>Rate</th><th style={{ ...th, textAlign: 'right' }}>Cost</th><th style={th}></th>
        </tr></thead>
        <tbody>
          {shifts.length === 0 && <tr><td colSpan={6} style={{ padding: 12, color: 'var(--text-muted, #999)' }}>No shifts logged in {monthLabel(selMonth)}.</td></tr>}
          {shifts.map(s => (
            shEditId === s.id ? (
              (() => {
                const editHours = (shStart && shEnd) ? hoursBetween(shStart, shEnd) : (Number(shHours) || 0)
                return (
                <tr key={s.id} style={{ borderTop: '1px solid var(--border, #eee)', background: 'var(--bg-sidebar, #fafafa)' }}>
                  <td style={td}>{s.occurred_on}</td>
                  <td style={td}>{empName(s.employee_id)}</td>
                  <td style={{ ...td, textAlign: 'right' }}>
                    <div style={{ display: 'flex', gap: 6, alignItems: 'center', justifyContent: 'flex-end' }}>
                      <div style={{ width: 92 }}><div style={{ ...miniLabel }}>Start</div><SmartTime value={shStart} onChange={setShStart} placeholder="5pm" style={{ ...inp, padding: '6px 8px' }} /></div>
                      <div style={{ width: 92 }}><div style={{ ...miniLabel }}>Finish</div><SmartTime value={shEnd} onChange={setShEnd} placeholder="11pm" style={{ ...inp, padding: '6px 8px' }} /></div>
                      <div style={{ minWidth: 38, textAlign: 'right', color: 'var(--text-muted, #999)', fontWeight: 600 }}>{editHours ? `${editHours.toFixed(1)}h` : '—'}</div>
                    </div>
                  </td>
                  <td style={{ ...td, textAlign: 'right' }}>
                    <input inputMode="numeric" value={shRate} onChange={e => setShRate(e.target.value)} style={{ ...inp, padding: '6px 8px', textAlign: 'right', width: 90 }} />
                  </td>
                  <td style={{ ...td, textAlign: 'right', fontWeight: 600 }}>{vnd(editHours * (Number(shRate.replace(/[^\d.]/g, '')) || 0))}</td>
                  <td style={{ ...td, textAlign: 'right', whiteSpace: 'nowrap' }}>
                    <button onClick={() => saveShift(s.id)} style={{ ...btnLink, color: 'var(--accent, #e87830)', fontWeight: 600 }}>Save</button>
                    <button onClick={() => setShEditId(null)} style={{ ...btnLink, marginLeft: 10 }}>Cancel</button>
                  </td>
                </tr>
                )
              })()
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
      </div>{/* ── end left column ── */}

      {/* ── right column: staff roster ── */}
      <div>
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
              <td style={{ ...td, fontWeight: 600 }}>
                <button onClick={() => openDrawer(e)} title="View hours & pay out"
                  style={{ background: 'none', border: 'none', padding: 0, font: 'inherit', fontWeight: 600, color: 'var(--accent, #e87830)', cursor: 'pointer', textAlign: 'left' }}>
                  {e.name}
                </button>
              </td>
              <td style={td}>{e.role_title || '—'}</td>
              <td style={{ ...td, textAlign: 'right' }}>{e.base_rate != null ? vnd(e.base_rate) : '—'}</td>
              <td style={td}>{e.active ? 'Active' : 'Inactive'}</td>
              <td style={{ ...td, textAlign: 'right', whiteSpace: 'nowrap' }}>
                <button onClick={() => openDrawer(e)} style={btnLink}>Hours</button>
                <button onClick={() => startEdit(e)} style={btnLink}>Edit</button>
                <button onClick={() => toggleEmp(e)} style={btnLink}>{e.active ? 'Deactivate' : 'Reactivate'}</button>
                <button onClick={() => deleteEmp(e)} style={{ ...btnLink, color: 'var(--burgundy, #7b2d3a)' }}>Delete</button>
              </td>
            </tr>
          ))}
        </tbody>
      </table>
      {msg && <div style={{ fontSize: 12, color: msg.startsWith('✓') ? '#548235' : 'var(--burgundy, #7b2d3a)', marginTop: 10 }}>{msg}</div>}
      </div>{/* ── end right column ── */}

      </div>{/* ── end two-column grid ── */}

      {/* ───────────── Employee detail drawer: hours breakdown + pay out ───────────── */}
      {drawerEmp && (
        <>
          <div onClick={closeDrawer} style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.4)', zIndex: 40 }} />
          <div style={{ position: 'fixed', top: 0, right: 0, bottom: 0, width: 'min(460px, 100%)', background: 'var(--bg-card, #fff)', borderLeft: '1px solid var(--border, #e5e5e5)', boxShadow: '-8px 0 24px rgba(0,0,0,0.2)', zIndex: 41, overflowY: 'auto', padding: 24 }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: 4 }}>
              <div>
                <div style={{ fontSize: 20, fontWeight: 700 }}>{drawerEmp.name}</div>
                <div style={{ fontSize: 13, color: 'var(--text-muted, #999)' }}>{drawerEmp.role_title || 'Staff'}{drawerEmp.base_rate != null ? ` · ${vnd(drawerEmp.base_rate)}/h` : ''}</div>
              </div>
              <button onClick={closeDrawer} style={{ ...btnLink, fontSize: 20, color: 'var(--text-muted, #999)' }}>✕</button>
            </div>

            {drawerBusy && drawerShifts.length === 0 ? (
              <div style={{ color: 'var(--text-muted, #999)', fontSize: 14, marginTop: 16 }}>Loading…</div>
            ) : (
              <>
                {/* quick this-month / last-month hours */}
                <div style={{ display: 'flex', gap: 12, marginTop: 16, marginBottom: 20, flexWrap: 'wrap' }}>
                  <Stat label="This month" value={`${(thisMonth?.hours || 0).toFixed(1)} h`} />
                  <Stat label="Last month" value={`${(lastMonth?.hours || 0).toFixed(1)} h`} />
                  <Stat label="All-time hours" value={`${totalHours.toFixed(1)} h`} />
                </div>

                {/* month-by-month breakdown */}
                <div style={hdr}>Hours by month</div>
                <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 14, marginBottom: 24 }}>
                  <thead><tr style={{ background: 'var(--bg-sidebar, #fafafa)' }}>
                    <th style={th}>Month</th><th style={{ ...th, textAlign: 'right' }}>Hours</th><th style={{ ...th, textAlign: 'right' }}>Labor cost</th>
                  </tr></thead>
                  <tbody>
                    {byMonth.length === 0 && <tr><td colSpan={3} style={{ padding: 12, color: 'var(--text-muted, #999)' }}>No shifts logged.</td></tr>}
                    {byMonth.map(m => (
                      <tr key={m.ym} style={{ borderTop: '1px solid var(--border, #eee)' }}>
                        <td style={td}>{monthLabel(m.ym)}</td>
                        <td style={{ ...td, textAlign: 'right' }}>{m.hours.toFixed(1)}</td>
                        <td style={{ ...td, textAlign: 'right' }}>{vnd(m.cost)}</td>
                      </tr>
                    ))}
                    {byMonth.length > 0 && (
                      <tr style={{ borderTop: '2px solid var(--border, #ddd)', fontWeight: 700 }}>
                        <td style={td}>Total</td>
                        <td style={{ ...td, textAlign: 'right' }}>{totalHours.toFixed(1)}</td>
                        <td style={{ ...td, textAlign: 'right' }}>{vnd(totalEarned)}</td>
                      </tr>
                    )}
                  </tbody>
                </table>

                {/* settlement: earned vs paid — only Outstanding fills the payout amount on click */}
                <div style={hdr}>Pay</div>
                <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', gap: 10, marginBottom: 6 }}>
                  <Stat label="Earned" value={vnd(totalEarned)} fill />
                  <Stat label="Paid out" value={vnd(totalPaid)} fill />
                  <Stat label="Outstanding" value={vnd(outstanding)} fill emphasize onClick={outstanding > 0 ? () => setPoAmt(String(Math.round(outstanding))) : undefined} />
                </div>
                <div style={{ fontSize: 11, color: 'var(--text-muted, #999)', marginBottom: 16 }}>Tap the orange Outstanding box to drop the amount you still owe into the payout below.</div>

                {/* record a pay out */}
                <div className="card" style={{ padding: 16, marginBottom: 16 }}>
                  <div style={hdr}>Pay {drawerEmp.name.split(' ')[0]} out</div>
                  <div style={{ display: 'flex', gap: 10, flexWrap: 'wrap', alignItems: 'flex-end' }}>
                    <div style={{ width: 150 }}>
                      <label className="label">Amount (VND)</label>
                      <input type="text" inputMode="numeric" value={poAmt} onChange={e => setPoAmt(e.target.value)} placeholder={outstanding > 0 ? Math.round(outstanding).toLocaleString('en-US') : '0'} style={inp} />
                    </div>
                    <div style={{ width: 140 }}>
                      <label className="label">Date</label>
                      <input type="date" value={poDate} onChange={e => setPoDate(e.target.value)} style={inp} />
                    </div>
                    <div style={{ width: 130 }}>
                      <label className="label">Method</label>
                      <select value={poMethod} onChange={e => setPoMethod(e.target.value as 'cash' | 'transfer')} style={inp}>
                        <option value="cash">Cash</option>
                        <option value="transfer">Bank transfer</option>
                      </select>
                    </div>
                    {poMethod === 'cash' && (
                      <div style={{ width: 130 }}>
                        <label className="label">From</label>
                        <select value={poAccount} onChange={e => setPoAccount(e.target.value)} style={inp}>
                          {accounts.map(a => <option key={a.account_id} value={a.account_id}>{a.name}</option>)}
                        </select>
                      </div>
                    )}
                    <div style={{ flex: 1, minWidth: 140 }}>
                      <label className="label">Note</label>
                      <input type="text" value={poNote} onChange={e => setPoNote(e.target.value)} placeholder="optional" style={inp} />
                    </div>
                  </div>
                  <div style={{ display: 'flex', gap: 10, alignItems: 'center', marginTop: 12 }}>
                    {outstanding > 0 && (
                      <button onClick={() => setPoAmt(String(Math.round(outstanding)))} style={{ ...btnLink, color: 'var(--accent, #e87830)' }}>
                        Fill outstanding ({vnd(outstanding)})
                      </button>
                    )}
                    <button onClick={recordPayout} disabled={drawerBusy} style={{ ...btnPrimary, opacity: drawerBusy ? 0.6 : 1 }}>Record payout</button>
                  </div>
                  <div style={{ fontSize: 11, color: 'var(--text-muted, #999)', marginTop: 8 }}>
                    {poMethod === 'cash' ? 'Cash payouts are deducted from the selected cash account.' : 'Bank transfers are logged only — they don’t touch the cash drawer.'}
                  </div>
                  {drawerMsg && <div style={{ fontSize: 12, color: drawerMsg.startsWith('✓') ? '#548235' : 'var(--burgundy, #7b2d3a)', marginTop: 8 }}>{drawerMsg}</div>}
                </div>

                {/* payout history */}
                <div style={hdr}>Payout history</div>
                <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 14 }}>
                  <thead><tr style={{ background: 'var(--bg-sidebar, #fafafa)' }}>
                    <th style={th}>Date</th><th style={th}>Method</th><th style={{ ...th, textAlign: 'right' }}>Amount</th><th style={th}></th>
                  </tr></thead>
                  <tbody>
                    {drawerPayouts.length === 0 && <tr><td colSpan={4} style={{ padding: 12, color: 'var(--text-muted, #999)' }}>No payouts yet.</td></tr>}
                    {drawerPayouts.map(p => (
                      <tr key={p.id} style={{ borderTop: '1px solid var(--border, #eee)' }}>
                        <td style={td}>{p.paid_on}{p.note && <div style={{ fontSize: 11, color: 'var(--text-muted, #999)' }}>{p.note}</div>}</td>
                        <td style={td}>{p.method === 'cash' ? 'Cash' : 'Transfer'}</td>
                        <td style={{ ...td, textAlign: 'right', fontWeight: 600 }}>{vnd(p.amount)}</td>
                        <td style={{ ...td, textAlign: 'right' }}>
                          {isSuper && <button onClick={() => deletePayout(p)} style={{ ...btnLink, color: 'var(--burgundy, #7b2d3a)' }}>Delete</button>}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </>
            )}
          </div>
        </>
      )}
    </div>
  )
}

const Stat = ({ label, value, onClick, fill, emphasize }: { label: string; value: string; onClick?: () => void; fill?: boolean; emphasize?: boolean }) => (
  <div className="card" onClick={onClick}
    title={onClick ? 'Click to use this amount' : undefined}
    style={{
      padding: '12px 16px', minWidth: fill ? 0 : 150, width: fill ? '100%' : undefined, boxSizing: 'border-box',
      cursor: onClick ? 'pointer' : 'default',
      border: emphasize ? '2px solid var(--accent, #e87830)' : (onClick ? '1px solid var(--accent, #e87830)' : undefined),
      background: emphasize ? 'rgba(232,120,48,0.12)' : undefined,
    }}>
    <div style={{ fontSize: 11, fontWeight: 600, textTransform: 'uppercase', letterSpacing: '0.06em', color: emphasize ? 'var(--accent, #e87830)' : 'var(--text-muted, #999)' }}>{label}</div>
    <div style={{ fontSize: 19, fontWeight: 700, marginTop: 4, whiteSpace: 'nowrap', color: emphasize ? 'var(--accent, #e87830)' : undefined }}>{value}</div>
  </div>
)

const hdr = { fontSize: 12, fontWeight: 700, textTransform: 'uppercase' as const, letterSpacing: '0.06em', color: 'var(--text-muted, #999)', marginBottom: 10 }
const inp = { width: '100%', padding: '10px 12px', fontSize: 14, border: '1px solid var(--border, #e5e5e5)', borderRadius: 8, background: 'var(--bg-input, #fff)', color: 'var(--text, #333)', boxSizing: 'border-box' as const }
const th = { padding: '8px 12px', textAlign: 'left' as const, fontWeight: 600, fontSize: 11, textTransform: 'uppercase' as const, color: 'var(--text-muted, #999)', letterSpacing: '0.05em' }
const td = { padding: '10px 12px', color: 'var(--text, #333)' }
const btnPrimary = { padding: '10px 16px', background: 'var(--accent, #e87830)', color: '#fff', border: 'none', borderRadius: 8, fontSize: 14, fontWeight: 600, cursor: 'pointer', whiteSpace: 'nowrap' as const }
const navBtn = { width: 34, height: 34, display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 18, lineHeight: 1, border: '1px solid var(--border, #e5e5e5)', borderRadius: 8, background: 'var(--bg-input, #fff)', color: 'var(--text, #333)', cursor: 'pointer' }
const miniLabel = { fontSize: 9, fontWeight: 600, textTransform: 'uppercase' as const, letterSpacing: '0.04em', color: 'var(--text-muted, #999)', marginBottom: 2, textAlign: 'left' as const }
const btnLink = { padding: '4px 8px', background: 'transparent', color: 'var(--burgundy, #7b2d3a)', border: 'none', cursor: 'pointer', fontSize: 13 }

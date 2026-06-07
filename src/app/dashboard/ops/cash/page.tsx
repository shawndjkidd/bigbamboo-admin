'use client'
import { useEffect, useMemo, useState } from 'react'
import { ops, vnd, today, canManageRecipes, type StaffRole } from '@/lib/ops/api'
import { supabase } from '@/lib/supabase'

type Acct = { account_id: string; name: string; kind: string; balance: number }
type Float = { id: string; person: string | null; amount_issued: number; status: string; sales: number; payouts: number; over_short: number | null; issued_at: string }
type Mv = { id: string; occurred_at: string; account_id: string; amount: number; type: string; group_id: string | null; person: string | null; note: string | null }

const TYPE_LABEL: Record<string, string> = {
  drop: 'Cash drop (Till → Safe)', deposit: 'Bank deposit', expense: 'Cash expense', adjust: 'Adjustment',
  float_issue: 'Float issued', float_return: 'Float returned', cash_sale: 'Cash sale',
  day_open: 'Day open — float to till', day_close: 'Day close — swept to safe',
}
const WD = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat']
const weekdayOf = (d: string) => new Date(d + 'T12:00:00').getDay()

export default function CashPage() {
  const [role, setRole] = useState<StaffRole | null>(null)
  const [venueId, setVenueId] = useState<string | null>(null)
  const [loading, setLoading] = useState(true)
  const [msg, setMsg] = useState<string | null>(null)
  const [accts, setAccts] = useState<Acct[]>([])
  const [floats, setFloats] = useState<Float[]>([])
  const [moves, setMoves] = useState<Mv[]>([])
  const [events, setEvents] = useState<{ id: string; title: string }[]>([])
  const [tab, setTab] = useState<string>('') // account_id to view

  // record-a-movement form
  const [mvType, setMvType] = useState('drop')
  const [mvAcct, setMvAcct] = useState('')
  const [mvAmt, setMvAmt] = useState('')
  const [mvNote, setMvNote] = useState('')

  // float forms
  const [flAmt, setFlAmt] = useState(''); const [flPerson, setFlPerson] = useState(''); const [flEvent, setFlEvent] = useState('')
  const [retId, setRetId] = useState<string | null>(null)
  const [retCounted, setRetCounted] = useState(''); const [retSales, setRetSales] = useState(''); const [retPayouts, setRetPayouts] = useState('')

  // edit a movement
  const [editId, setEditId] = useState<string | null>(null); const [eAmt, setEAmt] = useState(''); const [eNote, setENote] = useState('')

  // daily routine + template
  const [template, setTemplate] = useState<{ weekday: number; amount: number }[]>([])
  const [week, setWeek] = useState<any[]>([])
  const [showTpl, setShowTpl] = useState(false)
  const [dayInputs, setDayInputs] = useState<Record<string, { counted: string; sales: string }>>({})
  const [setBal, setSetBal] = useState('')

  useEffect(() => { init() }, [])
  async function init() {
    const { data: { session } } = await supabase.auth.getSession()
    const user = session?.user; if (!user) return
    const { data: su } = await supabase.from('staff_users').select('role').eq('email', user.email).maybeSingle()
    setRole((su?.role || 'staff') as StaffRole)
    const { data: venue } = await supabase.from('venues').select('id').eq('slug', 'bigbamboo').single()
    setVenueId(venue?.id || null)
    const { data: evs } = await supabase.from('events').select('id, title').order('event_date', { ascending: false }).limit(50)
    setEvents(evs || [])
    await load(venue?.id || null)
    setLoading(false)
  }
  async function load(vid: string | null) {
    if (!vid) return
    const [{ data: a }, { data: f }, { data: m }] = await Promise.all([
      ops().from('v_cash_balances').select('*').eq('venue_id', vid),
      ops().from('cash_floats').select('*').eq('venue_id', vid).order('issued_at', { ascending: false }).limit(30),
      ops().from('cash_movements').select('id, occurred_at, account_id, amount, type, group_id, person, note').eq('venue_id', vid).order('occurred_at', { ascending: true }).limit(500),
    ])
    const accts2 = (a as Acct[]) || []
    setAccts(accts2); setFloats((f as Float[]) || []); setMoves((m as Mv[]) || [])
    if (!tab && accts2.length) setTab(accts2.find(x => x.kind === 'safe')?.account_id || accts2[0].account_id)
    const [{ data: tpl }, { data: days }] = await Promise.all([
      ops().from('float_template').select('weekday, amount').eq('venue_id', vid).order('weekday'),
      ops().from('cash_days').select('*').eq('venue_id', vid).order('business_date', { ascending: false }).limit(14),
    ])
    setTemplate((tpl as any[]) || [])
    setWeek((days as any[]) || [])
  }

  async function setBalance() {
    if (!venueId || !tab) return
    const target = num(setBal)
    const cur = accts.find(a => a.account_id === tab)?.balance || 0
    const delta = target - cur
    if (delta === 0) { setMsg('Already at that amount.'); return }
    const { error } = await ops().from('cash_movements').insert({ venue_id: venueId, account_id: tab, amount: delta, type: 'adjust', note: 'Set balance (count)' })
    if (error) { setMsg(error.message); return }
    setSetBal(''); setMsg(`✓ ${acctName(tab)} set to ${vnd(target)}.`); await load(venueId)
  }
  async function saveTemplate(weekday: number, amount: number) {
    await ops().from('float_template').upsert({ venue_id: venueId, weekday, amount }, { onConflict: 'venue_id,weekday' })
    await load(venueId)
  }
  function di(date: string) { return dayInputs[date] || { counted: '', sales: '' } }
  function setDi(date: string, patch: any) { setDayInputs(p => ({ ...p, [date]: { ...di(date), ...patch } })) }

  async function openDay(date: string) {
    if (!venueId || !safe || !till) return
    const wd = weekdayOf(date)
    const amt = Number((template.find(t => t.weekday === wd) || { amount: 0 }).amount)
    if (!amt) { setMsg(`Set a float for ${WD[wd]} in the template first.`); return }
    const { error } = await ops().from('cash_days').insert({ venue_id: venueId, business_date: date, weekday: wd, float_amount: amt })
    if (error) { setMsg(error.message); return }
    const g = crypto.randomUUID()
    await ops().from('cash_movements').insert([
      { venue_id: venueId, account_id: safe.account_id, amount: -amt, type: 'day_open', group_id: g, note: `Float to till (${WD[wd]} ${date})` },
      { venue_id: venueId, account_id: till.account_id, amount: amt, type: 'day_open', group_id: g, note: `Float from safe (${WD[wd]} ${date})` },
    ])
    setMsg(null); await load(venueId)
  }
  async function closeDay(row: any) {
    if (!venueId || !safe || !till) return
    const inp = di(row.business_date)
    const counted = num(inp.counted); const posSales = num(inp.sales)
    if (!counted) { setMsg('Enter the counted till total for ' + row.business_date); return }
    const float = Number(row.float_amount)
    const cashIn = counted - float
    const over = posSales ? cashIn - posSales : 0
    if (cashIn !== 0) await ops().from('cash_movements').insert({ venue_id: venueId, account_id: till.account_id, amount: cashIn, type: 'cash_sale', note: `Cash sales ${row.business_date}` })
    const g = crypto.randomUUID()
    await ops().from('cash_movements').insert([
      { venue_id: venueId, account_id: till.account_id, amount: -counted, type: 'day_close', group_id: g, note: `Swept to safe ${row.business_date}` },
      { venue_id: venueId, account_id: safe.account_id, amount: counted, type: 'day_close', group_id: g, note: `Swept from till ${row.business_date}` },
    ])
    await ops().from('cash_days').update({ counted, cash_sales: cashIn, over_short: over, status: 'closed', closed_at: new Date().toISOString() }).eq('id', row.id)
    setMsg(over === 0 ? `✓ ${row.business_date} closed and swept to safe.` : `${row.business_date} closed — ${over > 0 ? 'over' : 'short'} ${vnd(Math.abs(over))} vs POS.`); await load(venueId)
  }

  const num = (s: string) => Number((s || '').replace(/[^\d-]/g, '')) || 0
  const safe = accts.find(a => a.kind === 'safe')
  const till = accts.find(a => a.kind === 'till')
  const acctName = (id: string) => accts.find(a => a.account_id === id)?.name || '—'
  const openFloats = floats.filter(f => f.status === 'open')
  const floatsOut = openFloats.reduce((s, f) => s + Number(f.amount_issued), 0)
  const totalOnHand = (safe?.balance || 0) + (till?.balance || 0) + floatsOut

  // statement (running balance) for the selected account, newest first
  const statement = useMemo(() => {
    const rows = moves.filter(m => m.account_id === tab)
    let bal = 0
    const withBal = rows.map(m => { bal += Number(m.amount); return { ...m, balance: bal } })
    return withBal.reverse()
  }, [moves, tab])

  const fmt = (d: Date) => `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`
  const weekDates = useMemo(() => {
    const t = new Date(today() + 'T12:00:00')
    const off = (t.getDay() + 6) % 7 // 0 = Monday
    const mon = new Date(t); mon.setDate(t.getDate() - off)
    return Array.from({ length: 7 }, (_, i) => { const d = new Date(mon); d.setDate(mon.getDate() + i); return fmt(d) })
  }, [])
  const dayRow = (date: string) => week.find(d => d.business_date === date)
  const tplAmt = (date: string) => Number((template.find(t => t.weekday === weekdayOf(date)) || { amount: 0 }).amount)

  async function record() {
    if (!venueId || !safe) return
    const a = num(mvAmt); if (!a) { setMsg('Enter an amount'); return }
    let rows: any[] = []
    if (mvType === 'drop') { if (!till) return; const g = crypto.randomUUID(); rows = [{ account_id: till.account_id, amount: -Math.abs(a), type: 'drop', group_id: g, note: mvNote.trim() || 'Till → Safe' }, { account_id: safe.account_id, amount: Math.abs(a), type: 'drop', group_id: g, note: mvNote.trim() || 'Till → Safe' }] }
    else if (mvType === 'deposit') { rows = [{ account_id: safe.account_id, amount: -Math.abs(a), type: 'deposit', note: mvNote.trim() || 'Bank deposit' }] }
    else if (mvType === 'expense') { if (!mvAcct) { setMsg('Pick which account it came out of'); return } rows = [{ account_id: mvAcct, amount: -Math.abs(a), type: 'expense', note: mvNote.trim() || 'Cash expense' }] }
    else if (mvType === 'adjust') { if (!mvAcct) { setMsg('Pick which account'); return } rows = [{ account_id: mvAcct, amount: a, type: 'adjust', note: mvNote.trim() || 'Adjustment' }] }
    const { error } = await ops().from('cash_movements').insert(rows.map(r => ({ venue_id: venueId, ...r })))
    if (error) { setMsg(error.message); return }
    setMvAmt(''); setMvNote(''); setMsg(null); await load(venueId)
  }

  async function issueFloat() {
    const a = num(flAmt); if (!a || !safe) { setMsg('Enter float amount'); return }
    if (!flPerson.trim()) { setMsg('Who is taking the float?'); return }
    const { data: fl, error } = await ops().from('cash_floats').insert({ venue_id: venueId, person: flPerson.trim(), event_id: flEvent || null, amount_issued: a }).select('id').single()
    if (error) { setMsg(error.message); return }
    await ops().from('cash_movements').insert({ venue_id: venueId, account_id: safe.account_id, amount: -a, type: 'float_issue', float_id: fl!.id, event_id: flEvent || null, person: flPerson.trim(), note: 'Float issued' })
    setFlAmt(''); setFlPerson(''); setFlEvent(''); setMsg(null); await load(venueId)
  }
  async function returnFloat(f: Float) {
    if (!safe) return
    const counted = num(retCounted), sales = num(retSales), payouts = num(retPayouts)
    const over = counted - (Number(f.amount_issued) + sales - payouts)
    const { error } = await ops().from('cash_floats').update({ status: 'closed', sales, payouts, counted_returned: counted, over_short: over, closed_at: new Date().toISOString() }).eq('id', f.id)
    if (error) { setMsg(error.message); return }
    await ops().from('cash_movements').insert({ venue_id: venueId, account_id: safe.account_id, amount: counted, type: 'float_return', float_id: f.id, person: f.person, note: `Float returned (over/short ${over})` })
    setRetId(null); setMsg(over === 0 ? '✓ Float balanced exactly.' : `Float closed — ${over > 0 ? 'over' : 'short'} ${vnd(Math.abs(over))}.`); await load(venueId)
  }

  function startEdit(m: Mv) { setEditId(m.id); setEAmt(String(Math.abs(Number(m.amount)))); setENote(m.note || ''); setMsg(null) }
  async function saveEdit(m: Mv) {
    const A = num(eAmt); if (!A) { setMsg('Enter an amount'); return }
    const signed = (Number(m.amount) < 0 ? -1 : 1) * Math.abs(A)
    await ops().from('cash_movements').update({ amount: signed, note: eNote.trim() || null }).eq('id', m.id)
    if (m.group_id) { // update the paired side with opposite sign
      await ops().from('cash_movements').update({ amount: -signed, note: eNote.trim() || null }).eq('group_id', m.group_id).neq('id', m.id)
    }
    setEditId(null); await load(venueId)
  }
  async function delMove(m: Mv) {
    if (!confirm('Delete this movement?')) return
    if (m.group_id) await ops().from('cash_movements').delete().eq('group_id', m.group_id)
    else await ops().from('cash_movements').delete().eq('id', m.id)
    await load(venueId)
  }

  if (loading) return <div style={{ color: 'var(--text-muted, #999)', fontSize: 14 }}>Loading…</div>
  if (!(role && canManageRecipes(role))) return <div style={{ color: 'var(--text-muted, #999)', fontSize: 14 }}>Cash management is for managers.</div>
  const locked = (t: string) => t === 'float_issue' || t === 'float_return'

  return (
    <div style={{ maxWidth: 820 }}>
      <h2 style={{ fontSize: 22, fontWeight: 600 }}>Cash management</h2>
      <div style={{ fontSize: 13, color: 'var(--text-muted, #999)', marginTop: 2, marginBottom: 18 }}>
        Each box of cash is an account. Tap a card to see everything that went in and out of it, with a running balance — and edit or fix any line.
      </div>

      {/* balance cards (click to view statement) */}
      <div style={{ display: 'flex', gap: 12, flexWrap: 'wrap', marginBottom: 22 }}>
        {accts.map(a => (
          <button key={a.account_id} onClick={() => setTab(a.account_id)} style={{
            textAlign: 'left', cursor: 'pointer', minWidth: 150, padding: '12px 16px', borderRadius: 12,
            background: 'var(--bg-card,#fff)', border: '1px solid var(--border,#e5e5e5)',
            outline: tab === a.account_id ? '2px solid var(--accent,#e87830)' : 'none',
          }}>
            <div style={{ fontSize: 11, fontWeight: 600, textTransform: 'uppercase', letterSpacing: '0.06em', color: 'var(--text-muted,#999)' }}>{a.name}</div>
            <div style={{ fontSize: 19, fontWeight: 700, marginTop: 4 }}>{vnd(a.balance)}</div>
          </button>
        ))}
        <div className="card" style={{ padding: '12px 16px', minWidth: 130 }}>
          <div style={{ fontSize: 11, fontWeight: 600, textTransform: 'uppercase', letterSpacing: '0.06em', color: 'var(--text-muted,#999)' }}>Out in floats</div>
          <div style={{ fontSize: 19, fontWeight: 700, marginTop: 4 }}>{vnd(floatsOut)}</div>
        </div>
        <div className="card" style={{ padding: '12px 16px', minWidth: 150, border: '1px solid var(--accent,#e87830)' }}>
          <div style={{ fontSize: 11, fontWeight: 600, textTransform: 'uppercase', letterSpacing: '0.06em', color: 'var(--text-muted,#999)' }}>Total on hand</div>
          <div style={{ fontSize: 19, fontWeight: 700, marginTop: 4 }}>{vnd(totalOnHand)}</div>
        </div>
      </div>

      {/* week board */}
      <div className="card" style={{ padding: 14, marginBottom: 12 }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: 8 }}>
          <div style={hdr}>This week — daily float</div>
          <button onClick={() => setShowTpl(s => !s)} style={{ ...btnLink, fontWeight: 600, color: 'var(--accent,#e87830)' }}>{showTpl ? 'Hide' : 'Edit'} weekly float amounts</button>
        </div>
        {showTpl && (
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(86px, 1fr))', gap: 8, margin: '6px 0 14px' }}>
            {WD.map((w, i) => {
              const t = template.find(x => x.weekday === i)
              return <div key={i}><div style={{ fontSize: 11, color: 'var(--text-muted,#999)', marginBottom: 3 }}>{w}</div>
                <input defaultValue={t ? String(t.amount) : '0'} onBlur={e => saveTemplate(i, num(e.target.value))} style={{ ...inp, width: '100%' }} /></div>
            })}
          </div>
        )}
        <div style={{ display: 'grid', gap: 8 }}>
          {weekDates.map(date => {
            const r = dayRow(date); const isToday = date === today()
            return (
              <div key={date} style={{ border: '1px solid var(--border,#eee)', borderRadius: 8, padding: '10px 12px', background: isToday ? 'var(--bg-sidebar,#fafafa)' : 'transparent' }}>
                <div style={{ display: 'flex', alignItems: 'center', flexWrap: 'wrap', gap: 10 }}>
                  <div style={{ width: 92 }}><b>{WD[weekdayOf(date)]}</b> <span style={{ fontSize: 11, color: 'var(--text-muted,#999)' }}>{date.slice(5)}</span></div>
                  {!r && (
                    <>
                      <span style={{ fontSize: 13, color: 'var(--text-muted,#777)' }}>float {vnd(tplAmt(date))}</span>
                      <button onClick={() => openDay(date)} disabled={!tplAmt(date)} style={{ ...btn, opacity: tplAmt(date) ? 1 : 0.5 }}>→ Till</button>
                    </>
                  )}
                  {r && r.status === 'open' && (
                    <>
                      <span style={{ fontSize: 13 }}>in till: <b>{vnd(r.float_amount)}</b></span>
                      <input inputMode="numeric" value={di(date).sales} onChange={e => setDi(date, { sales: e.target.value })} style={{ ...inp, width: 110 }} placeholder="POS sales (opt)" />
                      <input inputMode="numeric" value={di(date).counted} onChange={e => setDi(date, { counted: e.target.value })} style={{ ...inp, width: 120 }} placeholder="total counted" />
                      <button onClick={() => closeDay(r)} style={btn}>→ Safe</button>
                    </>
                  )}
                  {r && r.status === 'closed' && (
                    <span style={{ fontSize: 13, color: 'var(--text-secondary,#555)' }}>
                      total <b>{vnd(r.counted)}</b> · sales {vnd(r.cash_sales)} · <span style={{ color: !r.over_short ? '#548235' : 'var(--burgundy,#7b2d3a)' }}>{!r.over_short ? 'balanced' : `${r.over_short > 0 ? 'over' : 'short'} ${vnd(Math.abs(r.over_short))}`}</span>
                    </span>
                  )}
                </div>
              </div>
            )
          })}
        </div>
        <div style={{ fontSize: 11, color: 'var(--text-muted,#999)', marginTop: 8 }}>“→ Till” sends that day’s float from the Safe. At close, enter the counted total and “→ Safe” sweeps it back (float + the day’s cash sales).</div>
      </div>

      {/* record a movement */}
      <div className="card" style={{ padding: 14, marginBottom: 12 }}>
        <div style={hdr}>Record a movement</div>
        <div style={row}>
          <select value={mvType} onChange={e => setMvType(e.target.value)} style={{ ...inp, width: 200 }}>
            <option value="drop">Cash drop (Till → Safe)</option>
            <option value="deposit">Bank deposit (out of Safe)</option>
            <option value="expense">Cash expense (out)</option>
            <option value="adjust">Adjust / set balance (+/−)</option>
          </select>
          {(mvType === 'expense' || mvType === 'adjust') && (
            <select value={mvAcct} onChange={e => setMvAcct(e.target.value)} style={{ ...inp, width: 110 }}>
              <option value="">account…</option>{accts.map(a => <option key={a.account_id} value={a.account_id}>{a.name}</option>)}
            </select>
          )}
          <input value={mvNote} onChange={e => setMvNote(e.target.value)} style={{ ...inp, flex: 1, minWidth: 90 }} placeholder="note (what / who)" />
          <input inputMode="numeric" value={mvAmt} onChange={e => setMvAmt(e.target.value)} style={{ ...inp, width: 130 }} placeholder={mvType === 'adjust' ? 'amount (+/−)' : 'amount'} />
          <button onClick={record} style={btn}>Record</button>
        </div>
        <div style={{ fontSize: 11, color: 'var(--text-muted,#999)', marginTop: 8 }}>
          {mvType === 'drop' && 'Moves cash from the Till into the Safe — total on hand unchanged.'}
          {mvType === 'deposit' && 'Cash leaves the Safe to the bank — lowers cash on hand.'}
          {mvType === 'expense' && 'Cash paid out of an account. (Note: this tracks cash only — log P&L expenses in Add Purchase.)'}
          {mvType === 'adjust' && 'Correct a balance or set an opening amount. Use a minus sign to reduce.'}
        </div>
      </div>

      {/* floats */}
      <div className="card" style={{ padding: 14, marginBottom: 16 }}>
        <div style={hdr}>Issue a float (Safe → person)</div>
        <div style={row}>
          <input value={flPerson} onChange={e => setFlPerson(e.target.value)} style={{ ...inp, width: 130 }} placeholder="who" />
          <select value={flEvent} onChange={e => setFlEvent(e.target.value)} style={{ ...inp, flex: 1, minWidth: 110 }}><option value="">(no event)</option>{events.map(e => <option key={e.id} value={e.id}>{e.title}</option>)}</select>
          <input inputMode="numeric" value={flAmt} onChange={e => setFlAmt(e.target.value)} style={{ ...inp, width: 110 }} placeholder="amount" />
          <button onClick={issueFloat} style={btn}>Issue</button>
        </div>
        {openFloats.length > 0 && <div style={{ marginTop: 12 }}>
          {openFloats.map(f => (
            <div key={f.id} style={{ borderTop: '1px solid var(--border,#eee)', padding: '10px 0' }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: 8 }}>
                <div style={{ fontSize: 14 }}><b>{f.person || '—'}</b> · float {vnd(f.amount_issued)} out</div>
                {retId !== f.id && <button onClick={() => { setRetId(f.id); setRetCounted(''); setRetSales(''); setRetPayouts('') }} style={btn}>Return / count</button>}
              </div>
              {retId === f.id && <div style={{ marginTop: 8 }}>
                <div style={{ ...row, marginBottom: 6 }}>
                  <input inputMode="numeric" value={retSales} onChange={e => setRetSales(e.target.value)} style={{ ...inp, width: 110 }} placeholder="ticket cash" />
                  <input inputMode="numeric" value={retPayouts} onChange={e => setRetPayouts(e.target.value)} style={{ ...inp, width: 110 }} placeholder="paid out" />
                  <input inputMode="numeric" value={retCounted} onChange={e => setRetCounted(e.target.value)} style={{ ...inp, width: 110 }} placeholder="counted" />
                  <button onClick={() => returnFloat(f)} style={btn}>Close</button>
                  <button onClick={() => setRetId(null)} style={{ ...btn, background: 'transparent', color: 'var(--text-muted,#999)' }}>Cancel</button>
                </div>
                <div style={{ fontSize: 12, color: 'var(--text-muted,#777)' }}>Expected back {vnd(Number(f.amount_issued) + num(retSales) - num(retPayouts))}{retCounted !== '' && <> · over/short <b>{vnd(num(retCounted) - (Number(f.amount_issued) + num(retSales) - num(retPayouts)))}</b></>}</div>
              </div>}
            </div>
          ))}
        </div>}
      </div>

      {msg && <div style={{ fontSize: 13, marginBottom: 12, color: msg.startsWith('✓') ? '#548235' : 'var(--burgundy, #7b2d3a)' }}>{msg}</div>}

      {/* statement */}
      <div style={{ display: 'flex', gap: 6, marginBottom: 8, flexWrap: 'wrap' }}>
        {accts.map(a => (
          <button key={a.account_id} onClick={() => { setTab(a.account_id); setSetBal('') }} style={{ ...tabBtn, ...(tab === a.account_id ? tabActive : {}) }}>{a.name} statement</button>
        ))}
      </div>
      <div style={{ ...row, marginBottom: 10, padding: '10px 12px', background: 'var(--bg-sidebar,#fafafa)', borderRadius: 8 }}>
        <span style={{ fontSize: 13 }}>{acctName(tab)} now: <b>{vnd(accts.find(a => a.account_id === tab)?.balance || 0)}</b></span>
        <span style={{ fontSize: 12, color: 'var(--text-muted,#999)' }}>— count it and correct it:</span>
        <input inputMode="numeric" value={setBal} onChange={e => setSetBal(e.target.value)} style={{ ...inp, width: 150 }} placeholder="actual amount in there" />
        <button onClick={setBalance} style={btn}>Set balance</button>
      </div>
      <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 13 }}>
        <thead><tr style={{ background: 'var(--bg-sidebar,#fafafa)' }}>
          <th style={th}>When</th><th style={th}>Description</th><th style={{ ...th, textAlign: 'right' }}>In</th><th style={{ ...th, textAlign: 'right' }}>Out</th><th style={{ ...th, textAlign: 'right' }}>Balance</th><th style={th}></th>
        </tr></thead>
        <tbody>
          {statement.length === 0 && <tr><td colSpan={6} style={{ padding: 12, color: 'var(--text-muted,#999)' }}>No movements yet for {acctName(tab)}.</td></tr>}
          {statement.map(m => editId === m.id ? (
            <tr key={m.id} style={{ borderTop: '1px solid var(--border,#eee)', background: 'var(--bg-sidebar,#fafafa)' }}>
              <td style={td}>{new Date(m.occurred_at).toLocaleDateString()}</td>
              <td style={td}><input value={eNote} onChange={e => setENote(e.target.value)} style={{ ...inp, width: '92%' }} /></td>
              <td colSpan={2} style={{ ...td, textAlign: 'right' }}><input inputMode="numeric" value={eAmt} onChange={e => setEAmt(e.target.value)} style={{ ...inp, width: 120, textAlign: 'right' }} /></td>
              <td style={td}></td>
              <td style={{ ...td, textAlign: 'right', whiteSpace: 'nowrap' }}><button onClick={() => saveEdit(m)} style={btnLink}>Save</button><button onClick={() => setEditId(null)} style={btnLink}>Cancel</button></td>
            </tr>
          ) : (
            <tr key={m.id} style={{ borderTop: '1px solid var(--border,#eee)' }}>
              <td style={td}>{new Date(m.occurred_at).toLocaleDateString()}</td>
              <td style={td}>{TYPE_LABEL[m.type] || m.type}{m.note ? ` · ${m.note}` : ''}</td>
              <td style={{ ...td, textAlign: 'right', color: '#548235' }}>{Number(m.amount) > 0 ? vnd(m.amount) : ''}</td>
              <td style={{ ...td, textAlign: 'right', color: 'var(--burgundy,#7b2d3a)' }}>{Number(m.amount) < 0 ? vnd(Math.abs(Number(m.amount))) : ''}</td>
              <td style={{ ...td, textAlign: 'right', fontWeight: 600 }}>{vnd((m as any).balance)}</td>
              <td style={{ ...td, textAlign: 'right', whiteSpace: 'nowrap' }}>
                {locked(m.type) ? <span style={{ fontSize: 11, color: 'var(--text-muted,#bbb)' }}>float</span> : <>
                  <button onClick={() => startEdit(m)} style={btnLink}>Edit</button>
                  <button onClick={() => delMove(m)} style={btnLink}>×</button>
                </>}
              </td>
            </tr>
          ))}
        </tbody>
      </table>

      {week.length > 0 && (
        <div style={{ marginTop: 24 }}>
          <div style={hdr}>Recent days</div>
          <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 13 }}>
            <thead><tr style={{ background: 'var(--bg-sidebar,#fafafa)' }}>
              <th style={th}>Date</th><th style={th}>Day</th><th style={{ ...th, textAlign: 'right' }}>Float</th><th style={{ ...th, textAlign: 'right' }}>Cash sales</th><th style={{ ...th, textAlign: 'right' }}>Over/short</th><th style={th}>Status</th>
            </tr></thead>
            <tbody>
              {week.map(d => (
                <tr key={d.id} style={{ borderTop: '1px solid var(--border,#eee)' }}>
                  <td style={td}>{d.business_date}</td>
                  <td style={td}>{WD[d.weekday]}</td>
                  <td style={{ ...td, textAlign: 'right' }}>{vnd(d.float_amount)}</td>
                  <td style={{ ...td, textAlign: 'right' }}>{d.cash_sales != null ? vnd(d.cash_sales) : '—'}</td>
                  <td style={{ ...td, textAlign: 'right', color: !d.over_short ? 'var(--text-muted,#999)' : 'var(--burgundy,#7b2d3a)' }}>{d.over_short != null ? vnd(d.over_short) : '—'}</td>
                  <td style={{ ...td, color: d.status === 'closed' ? '#548235' : 'var(--accent,#e87830)' }}>{d.status}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  )
}

const hdr = { fontSize: 12, fontWeight: 700, textTransform: 'uppercase' as const, letterSpacing: '0.06em', color: 'var(--text-muted, #999)', marginBottom: 10 }
const row = { display: 'flex', gap: 8, alignItems: 'center', flexWrap: 'wrap' as const }
const inp = { padding: '9px 11px', fontSize: 14, border: '1px solid var(--border, #e5e5e5)', borderRadius: 8, background: 'var(--bg-input, #fff)', color: 'var(--text, #333)', boxSizing: 'border-box' as const }
const th = { padding: '8px 12px', textAlign: 'left' as const, fontWeight: 600, fontSize: 11, textTransform: 'uppercase' as const, color: 'var(--text-muted, #999)', letterSpacing: '0.05em' }
const td = { padding: '9px 12px', color: 'var(--text, #333)' }
const btn = { padding: '9px 14px', background: 'var(--accent, #e87830)', color: '#fff', border: 'none', borderRadius: 8, fontSize: 14, fontWeight: 600, cursor: 'pointer', whiteSpace: 'nowrap' as const }
const btnLink = { padding: '2px 6px', background: 'transparent', color: 'var(--text-muted, #999)', border: 'none', cursor: 'pointer', fontSize: 14 }
const tabBtn = { padding: '6px 12px', borderRadius: 8, fontSize: 13, fontWeight: 600, cursor: 'pointer', background: 'transparent', border: '1px solid var(--border,#e5e5e5)', color: 'var(--text-secondary,#666)' }
const tabActive = { background: 'var(--accent,#e87830)', color: '#fff', borderColor: 'var(--accent,#e87830)' }

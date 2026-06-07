'use client'
import { useEffect, useState } from 'react'
import { ops, vnd, canManageRecipes, type StaffRole } from '@/lib/ops/api'
import { supabase } from '@/lib/supabase'

type Acct = { account_id: string; name: string; kind: string; balance: number }
type Float = { id: string; person: string | null; event_id: string | null; amount_issued: number; status: string; sales: number; payouts: number; counted_returned: number | null; over_short: number | null; issued_at: string }
type Mv = { id: string; occurred_at: string; account_id: string; amount: number; type: string; person: string | null; note: string | null }

export default function CashPage() {
  const [role, setRole] = useState<StaffRole | null>(null)
  const [venueId, setVenueId] = useState<string | null>(null)
  const [loading, setLoading] = useState(true)
  const [msg, setMsg] = useState<string | null>(null)
  const [accts, setAccts] = useState<Acct[]>([])
  const [floats, setFloats] = useState<Float[]>([])
  const [moves, setMoves] = useState<Mv[]>([])
  const [events, setEvents] = useState<{ id: string; title: string }[]>([])

  // forms
  const [dropAmt, setDropAmt] = useState('')
  const [depAmt, setDepAmt] = useState('')
  const [exAcct, setExAcct] = useState(''); const [exAmt, setExAmt] = useState(''); const [exNote, setExNote] = useState('')
  const [adjAcct, setAdjAcct] = useState(''); const [adjAmt, setAdjAmt] = useState(''); const [adjNote, setAdjNote] = useState('')
  const [flAmt, setFlAmt] = useState(''); const [flPerson, setFlPerson] = useState(''); const [flEvent, setFlEvent] = useState('')
  // return-float form per float id
  const [retId, setRetId] = useState<string | null>(null)
  const [retCounted, setRetCounted] = useState(''); const [retSales, setRetSales] = useState(''); const [retPayouts, setRetPayouts] = useState('')

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
      ops().from('cash_floats').select('*').eq('venue_id', vid).order('issued_at', { ascending: false }).limit(20),
      ops().from('cash_movements').select('id, occurred_at, account_id, amount, type, person, note').eq('venue_id', vid).order('occurred_at', { ascending: false }).limit(15),
    ])
    setAccts((a as Acct[]) || [])
    setFloats((f as Float[]) || [])
    setMoves((m as Mv[]) || [])
  }

  const num = (s: string) => Number((s || '').replace(/[^\d-]/g, '')) || 0
  const safe = accts.find(a => a.kind === 'safe')
  const till = accts.find(a => a.kind === 'till')
  const acctName = (id: string) => accts.find(a => a.account_id === id)?.name || '—'
  const openFloats = floats.filter(f => f.status === 'open')
  const floatsOut = openFloats.reduce((s, f) => s + Number(f.amount_issued), 0)
  const totalOnHand = (safe?.balance || 0) + (till?.balance || 0) + floatsOut

  async function move(rows: any[]) {
    const { error } = await ops().from('cash_movements').insert(rows.map(r => ({ venue_id: venueId, ...r })))
    if (error) { setMsg(error.message); return false }
    return true
  }
  async function drop() {
    const a = num(dropAmt); if (!a || !safe || !till) { setMsg('Enter amount'); return }
    const g = crypto.randomUUID()
    if (await move([{ account_id: till.account_id, amount: -a, type: 'drop', group_id: g, note: 'Till → Safe' }, { account_id: safe.account_id, amount: a, type: 'drop', group_id: g, note: 'Till → Safe' }])) { setDropAmt(''); setMsg(null); await load(venueId) }
  }
  async function deposit() {
    const a = num(depAmt); if (!a || !safe) { setMsg('Enter amount'); return }
    if (await move([{ account_id: safe.account_id, amount: -a, type: 'deposit', note: 'Bank deposit' }])) { setDepAmt(''); setMsg(null); await load(venueId) }
  }
  async function expense() {
    const a = num(exAmt); if (!a || !exAcct) { setMsg('Pick account + amount'); return }
    if (await move([{ account_id: exAcct, amount: -a, type: 'expense', note: exNote.trim() || 'Cash expense' }])) { setExAmt(''); setExNote(''); setMsg(null); await load(venueId) }
  }
  async function adjust() {
    const a = num(adjAmt); if (!a || !adjAcct) { setMsg('Pick account + amount'); return }
    if (await move([{ account_id: adjAcct, amount: a, type: 'adjust', note: adjNote.trim() || 'Adjustment' }])) { setAdjAmt(''); setAdjNote(''); setMsg(null); await load(venueId) }
  }
  async function issueFloat() {
    const a = num(flAmt); if (!a || !safe) { setMsg('Enter float amount'); return }
    if (!flPerson.trim()) { setMsg('Who is taking the float?'); return }
    const { data: fl, error } = await ops().from('cash_floats').insert({ venue_id: venueId, person: flPerson.trim(), event_id: flEvent || null, amount_issued: a }).select('id').single()
    if (error) { setMsg(error.message); return }
    await move([{ account_id: safe.account_id, amount: -a, type: 'float_issue', float_id: fl!.id, event_id: flEvent || null, person: flPerson.trim(), note: 'Float issued' }])
    setFlAmt(''); setFlPerson(''); setFlEvent(''); setMsg(null); await load(venueId)
  }
  function startReturn(f: Float) { setRetId(f.id); setRetCounted(''); setRetSales(''); setRetPayouts(''); setMsg(null) }
  async function returnFloat(f: Float) {
    if (!safe) return
    const counted = num(retCounted), sales = num(retSales), payouts = num(retPayouts)
    const expected = Number(f.amount_issued) + sales - payouts
    const over = counted - expected
    const { error } = await ops().from('cash_floats').update({ status: 'closed', sales, payouts, counted_returned: counted, over_short: over, closed_at: new Date().toISOString() }).eq('id', f.id)
    if (error) { setMsg(error.message); return }
    await move([{ account_id: safe.account_id, amount: counted, type: 'float_return', float_id: f.id, event_id: f.event_id, person: f.person, note: `Float returned (over/short ${over})` }])
    setRetId(null); setMsg(over === 0 ? '✓ Float balanced exactly.' : `Float returned — ${over > 0 ? 'over' : 'short'} ${vnd(Math.abs(over))}.`); await load(venueId)
  }

  if (loading) return <div style={{ color: 'var(--text-muted, #999)', fontSize: 14 }}>Loading…</div>
  if (!(role && canManageRecipes(role))) return <div style={{ color: 'var(--text-muted, #999)', fontSize: 14 }}>Cash management is for managers.</div>

  return (
    <div style={{ maxWidth: 760 }}>
      <h2 style={{ fontSize: 22, fontWeight: 600 }}>Cash management</h2>
      <div style={{ fontSize: 13, color: 'var(--text-muted, #999)', marginTop: 2, marginBottom: 18 }}>
        Track where your cash physically sits. Floats are issued from the Safe and returned to it — the float itself nets to zero; only takings and any over/short change your balances.
      </div>

      <div style={{ display: 'flex', gap: 12, flexWrap: 'wrap', marginBottom: 22 }}>
        <Stat label="Safe" value={vnd(safe?.balance || 0)} />
        <Stat label="Till" value={vnd(till?.balance || 0)} />
        <Stat label="Out in floats" value={vnd(floatsOut)} />
        <Stat label="Total on hand" value={vnd(totalOnHand)} strong />
      </div>

      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(240px, 1fr))', gap: 12, marginBottom: 22 }}>
        <Card title="Cash drop (Till → Safe)"><div style={row}><input inputMode="numeric" value={dropAmt} onChange={e => setDropAmt(e.target.value)} style={inp} placeholder="amount" /><button onClick={drop} style={btn}>Drop</button></div></Card>
        <Card title="Bank deposit (out of Safe)"><div style={row}><input inputMode="numeric" value={depAmt} onChange={e => setDepAmt(e.target.value)} style={inp} placeholder="amount" /><button onClick={deposit} style={btn}>Deposit</button></div></Card>
        <Card title="Cash expense (out)"><div style={row}><select value={exAcct} onChange={e => setExAcct(e.target.value)} style={{ ...inp, width: 90 }}><option value="">acct</option>{accts.map(a => <option key={a.account_id} value={a.account_id}>{a.name}</option>)}</select><input value={exNote} onChange={e => setExNote(e.target.value)} style={{ ...inp, flex: 1, minWidth: 60 }} placeholder="what" /><input inputMode="numeric" value={exAmt} onChange={e => setExAmt(e.target.value)} style={{ ...inp, width: 90 }} placeholder="amt" /><button onClick={expense} style={btn}>−</button></div></Card>
        <Card title="Adjust / set balance (+/−)"><div style={row}><select value={adjAcct} onChange={e => setAdjAcct(e.target.value)} style={{ ...inp, width: 90 }}><option value="">acct</option>{accts.map(a => <option key={a.account_id} value={a.account_id}>{a.name}</option>)}</select><input value={adjNote} onChange={e => setAdjNote(e.target.value)} style={{ ...inp, flex: 1, minWidth: 60 }} placeholder="reason" /><input inputMode="numeric" value={adjAmt} onChange={e => setAdjAmt(e.target.value)} style={{ ...inp, width: 90 }} placeholder="+/−" /><button onClick={adjust} style={btn}>Set</button></div></Card>
      </div>

      {/* Issue float */}
      <Card title="Issue a float (Safe → person)">
        <div style={row}>
          <input value={flPerson} onChange={e => setFlPerson(e.target.value)} style={{ ...inp, width: 130 }} placeholder="who" />
          <select value={flEvent} onChange={e => setFlEvent(e.target.value)} style={{ ...inp, flex: 1, minWidth: 120 }}><option value="">(no event)</option>{events.map(e => <option key={e.id} value={e.id}>{e.title}</option>)}</select>
          <input inputMode="numeric" value={flAmt} onChange={e => setFlAmt(e.target.value)} style={{ ...inp, width: 110 }} placeholder="float amount" />
          <button onClick={issueFloat} style={btn}>Issue</button>
        </div>
      </Card>

      {/* Open floats */}
      <div style={{ marginTop: 20 }}>
        <div style={hdr}>Floats out ({openFloats.length})</div>
        {openFloats.length === 0 && <div style={{ fontSize: 13, color: 'var(--text-muted,#999)' }}>None out right now.</div>}
        {openFloats.map(f => (
          <div key={f.id} style={{ border: '1px solid var(--border,#eee)', borderRadius: 8, padding: 12, marginBottom: 8 }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: 8 }}>
              <div style={{ fontSize: 14 }}><b>{f.person || '—'}</b> · float {vnd(f.amount_issued)} <span style={{ color: 'var(--text-muted,#999)', fontSize: 12 }}>· {new Date(f.issued_at).toLocaleDateString()}</span></div>
              {retId !== f.id && <button onClick={() => startReturn(f)} style={btn}>Return / count</button>}
            </div>
            {retId === f.id && (
              <div style={{ marginTop: 10 }}>
                <div style={{ ...row, marginBottom: 6 }}>
                  <Lbl t="Ticket cash sales"><input inputMode="numeric" value={retSales} onChange={e => setRetSales(e.target.value)} style={{ ...inp, width: 120 }} placeholder="0" /></Lbl>
                  <Lbl t="Cash paid out"><input inputMode="numeric" value={retPayouts} onChange={e => setRetPayouts(e.target.value)} style={{ ...inp, width: 120 }} placeholder="0" /></Lbl>
                  <Lbl t="Counted in box"><input inputMode="numeric" value={retCounted} onChange={e => setRetCounted(e.target.value)} style={{ ...inp, width: 120 }} placeholder="count" /></Lbl>
                </div>
                <div style={{ fontSize: 12, color: 'var(--text-muted,#777)', marginBottom: 8 }}>
                  Expected back: {vnd(Number(f.amount_issued) + num(retSales) - num(retPayouts))} (float {vnd(f.amount_issued)} + sales − payouts).
                  {retCounted !== '' && <> Over/short: <b style={{ color: (num(retCounted) - (Number(f.amount_issued) + num(retSales) - num(retPayouts))) === 0 ? '#548235' : 'var(--burgundy,#7b2d3a)' }}>{vnd(num(retCounted) - (Number(f.amount_issued) + num(retSales) - num(retPayouts)))}</b></>}
                </div>
                <button onClick={() => returnFloat(f)} style={btn}>Close float</button>
                <button onClick={() => setRetId(null)} style={{ ...btn, background: 'transparent', color: 'var(--text-muted,#999)' }}>Cancel</button>
              </div>
            )}
          </div>
        ))}
      </div>

      {msg && <div style={{ fontSize: 13, marginTop: 10, color: msg.startsWith('✓') ? '#548235' : 'var(--burgundy, #7b2d3a)' }}>{msg}</div>}

      {/* recent closed floats */}
      {floats.some(f => f.status === 'closed') && (
        <div style={{ marginTop: 24 }}>
          <div style={hdr}>Recent closed floats</div>
          <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 13 }}>
            <thead><tr style={{ background: 'var(--bg-sidebar,#fafafa)' }}><th style={th}>Who</th><th style={{ ...th, textAlign: 'right' }}>Float</th><th style={{ ...th, textAlign: 'right' }}>Sales</th><th style={{ ...th, textAlign: 'right' }}>Over/short</th></tr></thead>
            <tbody>
              {floats.filter(f => f.status === 'closed').map(f => (
                <tr key={f.id} style={{ borderTop: '1px solid var(--border,#eee)' }}>
                  <td style={td}>{f.person || '—'}</td><td style={{ ...td, textAlign: 'right' }}>{vnd(f.amount_issued)}</td>
                  <td style={{ ...td, textAlign: 'right' }}>{vnd(f.sales)}</td>
                  <td style={{ ...td, textAlign: 'right', color: Number(f.over_short) === 0 ? '#548235' : 'var(--burgundy,#7b2d3a)' }}>{vnd(f.over_short || 0)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      {/* movement history */}
      <div style={{ marginTop: 24 }}>
        <div style={hdr}>Recent cash movements</div>
        <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 13 }}>
          <thead><tr style={{ background: 'var(--bg-sidebar,#fafafa)' }}><th style={th}>When</th><th style={th}>Account</th><th style={th}>Type</th><th style={{ ...th, textAlign: 'right' }}>Amount</th></tr></thead>
          <tbody>
            {moves.map(m => (
              <tr key={m.id} style={{ borderTop: '1px solid var(--border,#eee)' }}>
                <td style={td}>{new Date(m.occurred_at).toLocaleDateString()}</td>
                <td style={td}>{acctName(m.account_id)}</td>
                <td style={{ ...td, color: 'var(--text-muted,#999)' }}>{m.type}{m.note ? ` · ${m.note}` : ''}</td>
                <td style={{ ...td, textAlign: 'right', color: Number(m.amount) < 0 ? 'var(--burgundy,#7b2d3a)' : '#548235' }}>{Number(m.amount) < 0 ? '−' : '+'}{vnd(Math.abs(Number(m.amount)))}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  )
}

const Stat = ({ label, value, strong }: { label: string; value: string; strong?: boolean }) => (
  <div className="card" style={{ padding: '12px 16px', minWidth: 130, border: strong ? '1px solid var(--accent,#e87830)' : undefined }}>
    <div style={{ fontSize: 11, fontWeight: 600, textTransform: 'uppercase', letterSpacing: '0.06em', color: 'var(--text-muted, #999)' }}>{label}</div>
    <div style={{ fontSize: 19, fontWeight: 700, marginTop: 4 }}>{value}</div>
  </div>
)
const Card = ({ title, children }: { title: string; children: React.ReactNode }) => (
  <div className="card" style={{ padding: 14, marginBottom: 0 }}><div style={hdr}>{title}</div>{children}</div>
)
const Lbl = ({ t, children }: { t: string; children: React.ReactNode }) => (
  <label style={{ display: 'block' }}><div style={{ fontSize: 10, fontWeight: 600, textTransform: 'uppercase', letterSpacing: '0.05em', color: 'var(--text-muted,#999)', marginBottom: 3 }}>{t}</div>{children}</label>
)
const hdr = { fontSize: 12, fontWeight: 700, textTransform: 'uppercase' as const, letterSpacing: '0.06em', color: 'var(--text-muted, #999)', marginBottom: 10 }
const row = { display: 'flex', gap: 8, alignItems: 'center', flexWrap: 'wrap' as const }
const inp = { padding: '9px 11px', fontSize: 14, border: '1px solid var(--border, #e5e5e5)', borderRadius: 8, background: 'var(--bg-input, #fff)', color: 'var(--text, #333)', boxSizing: 'border-box' as const }
const th = { padding: '8px 12px', textAlign: 'left' as const, fontWeight: 600, fontSize: 11, textTransform: 'uppercase' as const, color: 'var(--text-muted, #999)', letterSpacing: '0.05em' }
const td = { padding: '9px 12px', color: 'var(--text, #333)' }
const btn = { padding: '9px 14px', background: 'var(--accent, #e87830)', color: '#fff', border: 'none', borderRadius: 8, fontSize: 14, fontWeight: 600, cursor: 'pointer', whiteSpace: 'nowrap' as const }

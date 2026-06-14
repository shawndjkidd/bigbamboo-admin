'use client'
import { useEffect, useState } from 'react'
import { ops, vnd, today, canManageRecipes, type StaffRole } from '@/lib/ops/api'
import { supabase } from '@/lib/supabase'

type ReconRow = {
  occurred_on: string
  opening_float: number; cash_sales: number; card_sales: number; other_sales: number
  payouts: number; counted_cash: number; notes: string | null
}
type PosCash = {
  pos_opening_cash: number | null; pos_cash_sales: number | null; pos_cash_paid_in: number | null; pos_cash_paid_out: number | null
  pos_expected_cash: number | null; pos_closed_cash: number | null; pos_synced_at: string | null
}

const num = (s: string) => Number((s || '').replace(/[^\d.-]/g, '')) || 0
// Friendly labels for Square tender types.
function methodLabel(m: string) {
  const u = (m || '').toUpperCase()
  if (u.includes('CASH')) return 'cash'
  if (u.includes('CARD')) return 'card'
  if (!u) return '—'
  return 'bank transfer' // OTHER / external tender = VietQR bank transfer
}

export default function CashReconPage() {
  const [role, setRole] = useState<StaffRole | null>(null)
  const [venueId, setVenueId] = useState<string | null>(null)
  const [date, setDate] = useState(today())
  const [loading, setLoading] = useState(true)
  const [saving, setSaving] = useState(false)
  const [msg, setMsg] = useState<string | null>(null)
  const [hasPos, setHasPos] = useState(false)
  const [recent, setRecent] = useState<ReconRow[]>([])

  // editable fields
  const [openingFloat, setOpeningFloat] = useState('')
  const [cashSales, setCashSales] = useState('')
  const [cardSales, setCardSales] = useState('')
  const [otherSales, setOtherSales] = useState('')
  const [payouts, setPayouts] = useState('')
  const [countedCash, setCountedCash] = useState('')
  const [notes, setNotes] = useState('')
  const [pos, setPos] = useState<PosCash | null>(null)
  const [recentSales, setRecentSales] = useState<{ occurred_on: string; net: number | null; source?: string }[]>([])
  const [dayItems, setDayItems] = useState<{ name: string; qty: number; unit: number; time: string; method: string }[]>([])

  useEffect(() => { init() }, [])
  useEffect(() => { if (venueId) loadDate(venueId, date) }, [date]) // eslint-disable-line

  async function init() {
    const { data: { session } } = await supabase.auth.getSession()
    const user = session?.user; if (!user) return
    const { data: su } = await supabase.from('staff_users').select('role').eq('email', user.email).maybeSingle()
    setRole((su?.role || 'staff') as StaffRole)
    const { data: venue } = await supabase.from('venues').select('id').eq('slug', 'bigbamboo').single()
    const vid = venue?.id || null
    setVenueId(vid)
    if (vid) { await loadDate(vid, date); await loadRecent(vid) }
    setLoading(false)
  }

  async function loadDate(vid: string, d: string) {
    // 1) Existing reconciliation for the day (if already saved)
    const { data: rec } = await ops().from('cash_recon').select('*').eq('venue_id', vid).eq('occurred_on', d).maybeSingle()
    // 2) Square line items for the day → cash / card / other split
    const { data: items } = await ops().from('sales_items').select('menu_item_name, qty, unit_price, payment_method, occurred_at').eq('venue_id', vid).eq('occurred_on', d).order('occurred_at')
    let posCash = 0, posCard = 0, posOther = 0
    for (const it of (items || []) as any[]) {
      const g = Number(it.qty || 0) * Number(it.unit_price || 0)
      const m = (it.payment_method || '').toUpperCase()
      if (m.includes('CASH')) posCash += g
      else if (m.includes('CARD')) posCard += g
      else posOther += g
    }
    setHasPos((items || []).length > 0)
    setDayItems(((items || []) as any[]).map(it => ({
      name: it.menu_item_name || '—',
      qty: Number(it.qty || 0),
      unit: Number(it.unit_price || 0),
      method: it.payment_method || '',
      time: it.occurred_at ? new Date(it.occurred_at).toLocaleTimeString('en-GB', { hour: '2-digit', minute: '2-digit', timeZone: 'Asia/Ho_Chi_Minh' }) : '',
    })))

    setPos(rec ? {
      pos_opening_cash: rec.pos_opening_cash, pos_cash_sales: rec.pos_cash_sales, pos_cash_paid_in: rec.pos_cash_paid_in, pos_cash_paid_out: rec.pos_cash_paid_out,
      pos_expected_cash: rec.pos_expected_cash, pos_closed_cash: rec.pos_closed_cash, pos_synced_at: rec.pos_synced_at,
    } : null)
    // Prefer the manager's saved value; fall back to the POS drawer figure when the saved one is empty/zero
    setOpeningFloat(rec ? String((Number(rec.opening_float) || rec.pos_opening_cash) ?? '') : '')
    setPayouts(rec ? String((Number(rec.payouts) || rec.pos_cash_paid_out) ?? '') : '')
    setCountedCash(rec ? String(rec.counted_cash ?? '') : '')
    setNotes(rec?.notes || '')
    // Prefer saved sales if a recon exists, else use the Square split
    setCashSales(String(rec ? rec.cash_sales : Math.round(posCash)))
    setCardSales(String(rec ? rec.card_sales : Math.round(posCard)))
    setOtherSales(String(rec ? rec.other_sales : Math.round(posOther)))
  }

  async function loadRecent(vid: string) {
    const [{ data: rc }, { data: sd }] = await Promise.all([
      ops().from('cash_recon').select('occurred_on, opening_float, cash_sales, card_sales, other_sales, payouts, counted_cash, notes').eq('venue_id', vid).order('occurred_on', { ascending: false }).limit(60),
      ops().from('sales_daily').select('occurred_on, net, source').eq('venue_id', vid).order('occurred_on', { ascending: false }).limit(120),
    ])
    setRecent((rc as ReconRow[]) || [])
    // Sum every source per day (Square + any manual adjustments, e.g. offline-flush corrections)
    const m = new Map<string, number>()
    for (const d of ((sd as any[]) || [])) m.set(d.occurred_on, (m.get(d.occurred_on) || 0) + Number(d.net || 0))
    setRecentSales(Array.from(m.entries()).map(([occurred_on, net]) => ({ occurred_on, net })))
  }

  const oFloat = num(openingFloat), cSales = num(cashSales), kSales = num(cardSales), oSales = num(otherSales)
  const pay = num(payouts), counted = num(countedCash)
  const totalSales = cSales + kSales + oSales
  const expectedCash = oFloat + cSales - pay
  const variance = counted - expectedCash
  // POS-first: when the Square drawer has data, the headline figures come straight from it
  const posExpected = pos?.pos_expected_cash != null ? Number(pos.pos_expected_cash) : null
  const posCounted = pos?.pos_closed_cash != null ? Number(pos.pos_closed_cash) : null
  const posVar = (posExpected != null && posCounted != null) ? posCounted - posExpected : null
  const fromPos = posExpected != null || posCounted != null
  const expShown = posExpected != null ? posExpected : expectedCash
  const cntShown = posCounted != null ? posCounted : counted
  const varShown = posVar != null ? posVar : (counted ? variance : null)
  const canManage = role && canManageRecipes(role)

  // Every sales day (deduped), with the cash count layered on where it exists
  const mergedDays = (() => {
    const m = new Map<string, { sales: number; counted: number | null; variance: number | null }>()
    for (const s of recentSales) m.set(s.occurred_on, { sales: Number(s.net || 0), counted: null, variance: null })
    for (const r of recent) {
      const reconSales = Number(r.cash_sales) + Number(r.card_sales) + Number(r.other_sales)
      const exp = Number(r.opening_float) + Number(r.cash_sales) - Number(r.payouts)
      const c = m.get(r.occurred_on) || { sales: 0, counted: null, variance: null }
      if (!c.sales) c.sales = reconSales
      c.counted = Number(r.counted_cash) || null
      c.variance = Number(r.counted_cash) ? Number(r.counted_cash) - exp : null
      m.set(r.occurred_on, c)
    }
    return Array.from(m.entries()).map(([occurred_on, v]) => ({ occurred_on, ...v })).sort((a, b) => b.occurred_on.localeCompare(a.occurred_on)).slice(0, 21)
  })()

  async function save() {
    if (!venueId) return
    setSaving(true); setMsg(null)
    const { error } = await ops().from('cash_recon').upsert({
      venue_id: venueId, occurred_on: date,
      opening_float: oFloat, cash_sales: cSales, card_sales: kSales, other_sales: oSales,
      payouts: pay, counted_cash: counted, notes: notes || null,
    }, { onConflict: 'venue_id,occurred_on' })
    setSaving(false)
    if (error) { setMsg(error.message); return }
    setMsg('Saved.')
    await loadRecent(venueId)
  }

  if (loading) return <div style={{ color: 'var(--text-muted, #999)', fontSize: 14 }}>Loading…</div>
  if (!canManage) return <div style={{ color: 'var(--text-muted, #999)', fontSize: 14 }}>Daily cash reconciliation is available to managers.</div>

  return (
    <div style={{ maxWidth: 760 }}>
      <div style={{ display: 'flex', alignItems: 'baseline', justifyContent: 'space-between', flexWrap: 'wrap', gap: 8, marginBottom: 4 }}>
        <h2 style={{ fontSize: 22, fontWeight: 600 }}>Daily cash reconciliation</h2>
        <label style={{ fontSize: 13, color: 'var(--text-muted, #999)', display: 'flex', alignItems: 'center', gap: 6 }}>
          Date <input type="date" value={date} onChange={e => setDate(e.target.value)} style={{ ...inp, width: 'auto' }} />
        </label>
      </div>
      <div style={{ fontSize: 13, color: 'var(--text-muted, #999)', marginBottom: 20 }}>
        {fromPos ? 'Cash drawer figures are pulled from your POS (below). The manual boxes are only a fallback / override.' : 'No POS cash-drawer shift for this day yet — open & close the drawer in the POS and sync, and it fills in automatically. Until then you can enter figures manually below.'}
      </div>

      {/* Summary */}
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', gap: 10, marginBottom: 24 }}>
        <Stat label="Total sales" value={vnd(totalSales)} />
        <Stat label="Expected cash" value={vnd(expShown)} sub={fromPos ? 'from POS drawer' : 'float + cash − payouts'} />
        <Stat label="Counted cash" value={cntShown ? vnd(cntShown) : '—'} sub={fromPos && posCounted != null ? 'counted on POS' : undefined} />
        <Stat label="Over / short" value={varShown == null ? '—' : (varShown >= 0 ? '+' : '') + vnd(varShown)}
          accent={varShown == null ? '#999' : Math.abs(varShown) < 1 ? '#6b7280' : Math.abs(varShown) <= 50000 ? '#C65911' : 'var(--burgundy, #7b2d3a)'} />
      </div>

      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 16 }}>
        {/* Sales side */}
        <div className="card" style={{ padding: 18 }}>
          <div style={{ fontSize: 12, fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.06em', color: 'var(--text-muted, #999)', marginBottom: 12 }}>Sales {hasPos && <span style={{ color: 'var(--accent, #e87830)' }}>· from Square</span>}</div>
          <Field label="Cash sales (₫)"><input inputMode="numeric" value={cashSales} onChange={e => setCashSales(e.target.value)} style={inp} /></Field>
          <Field label="Card sales (₫)"><input inputMode="numeric" value={cardSales} onChange={e => setCardSales(e.target.value)} style={inp} /></Field>
          <Field label="Bank transfer (₫)"><input inputMode="numeric" value={otherSales} onChange={e => setOtherSales(e.target.value)} style={inp} /></Field>
        </div>
        {/* Cash drawer side */}
        <div className="card" style={{ padding: 18 }}>
          <div style={{ fontSize: 12, fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.06em', color: 'var(--text-muted, #999)', marginBottom: 12 }}>Cash drawer</div>
          <Field label="Opening float (₫)"><input inputMode="numeric" value={openingFloat} onChange={e => setOpeningFloat(e.target.value)} style={inp} /></Field>
          <Field label="Payouts / cash out (₫)"><input inputMode="numeric" value={payouts} onChange={e => setPayouts(e.target.value)} style={inp} /></Field>
          <Field label="Counted cash at close (₫)"><input inputMode="numeric" value={countedCash} onChange={e => setCountedCash(e.target.value)} style={{ ...inp, fontWeight: 600 }} /></Field>
        </div>
      </div>

      {pos && (pos.pos_expected_cash != null || pos.pos_opening_cash != null || pos.pos_closed_cash != null) && (
        <div className="card" style={{ padding: 18, marginTop: 16 }}>
          <div style={{ fontSize: 12, fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.06em', color: 'var(--text-muted, #999)', marginBottom: 12 }}>From Square cash drawer</div>
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(6, 1fr)', gap: 12 }}>
            {([['Opening', pos.pos_opening_cash], ['Cash sales', pos.pos_cash_sales], ['Paid in', pos.pos_cash_paid_in], ['Paid out', pos.pos_cash_paid_out], ['Expected', pos.pos_expected_cash], ['Closed', pos.pos_closed_cash]] as [string, number | null][]).map(([l, v]) => (
              <div key={l}>
                <div style={{ fontSize: 10, fontWeight: 600, textTransform: 'uppercase', letterSpacing: '0.06em', color: 'var(--text-muted, #999)' }}>{l}</div>
                <div style={{ fontSize: 15, fontWeight: 600, fontVariantNumeric: 'tabular-nums' }}>{v == null ? '—' : vnd(Number(v))}</div>
              </div>
            ))}
          </div>
          {pos.pos_expected_cash != null && pos.pos_closed_cash != null && (() => { const v = Number(pos.pos_closed_cash) - Number(pos.pos_expected_cash); return (
            <div style={{ marginTop: 12, fontSize: 13 }}>Square's own till variance: <strong style={{ color: Math.abs(v) < 1 ? '#6b7280' : Math.abs(v) <= 50000 ? '#C65911' : 'var(--burgundy, #7b2d3a)' }}>{(v >= 0 ? '+' : '') + vnd(v)}</strong></div>
          ) })()}
          <div style={{ fontSize: 11, color: 'var(--text-muted, #bbb)', marginTop: 8 }}>{pos.pos_synced_at ? 'Synced ' + new Date(pos.pos_synced_at).toLocaleString() : 'Awaiting Square sync'}</div>
        </div>
      )}

      <div style={{ marginTop: 16 }}>
        <Field label="Notes"><input value={notes} onChange={e => setNotes(e.target.value)} style={inp} placeholder="e.g. 200k short — staff meal paid from till, receipt in drawer" /></Field>
      </div>

      <div style={{ display: 'flex', alignItems: 'center', gap: 12, marginTop: 16 }}>
        <button onClick={save} disabled={saving} style={btnPrimary}>{saving ? 'Saving…' : 'Save reconciliation'}</button>
        {counted > 0 && (
          <span style={{ fontSize: 14, fontWeight: 600, color: Math.abs(variance) < 1 ? '#6b7280' : Math.abs(variance) <= 50000 ? '#C65911' : 'var(--burgundy, #7b2d3a)' }}>
            {Math.abs(variance) < 1 ? 'Balances ✓' : variance > 0 ? `${vnd(variance)} over` : `${vnd(Math.abs(variance))} short`}
          </span>
        )}
        {msg && <span style={{ fontSize: 13, color: msg === 'Saved.' ? '#548235' : 'var(--burgundy, #7b2d3a)' }}>{msg}</span>}
      </div>

      {/* History */}
      <div style={{ marginTop: 40 }}>
        <h3 style={{ fontSize: 13, fontWeight: 600, textTransform: 'uppercase', letterSpacing: '0.05em', color: 'var(--text-muted, #999)', marginBottom: 8 }}>Recent days</h3>
        <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 13 }}>
          <thead><tr style={{ background: 'var(--bg-sidebar, #fafafa)' }}>
            <th style={th}>Date</th>
            <th style={{ ...th, textAlign: 'right' }}>Sales</th>
            <th style={{ ...th, textAlign: 'right' }}>Counted</th>
            <th style={{ ...th, textAlign: 'right' }}>Variance</th>
          </tr></thead>
          <tbody>
            {mergedDays.length === 0 && <tr><td colSpan={4} style={{ padding: 12, color: 'var(--text-muted, #999)' }}>No sales yet.</td></tr>}
            {mergedDays.map(d => (
              <tr key={d.occurred_on} style={{ borderTop: '1px solid var(--border, #eee)', cursor: 'pointer' }} onClick={() => setDate(d.occurred_on)}>
                <td style={td}>{new Date(d.occurred_on).toLocaleDateString(undefined, { weekday: 'short', day: 'numeric', month: 'short' })}</td>
                <td style={{ ...td, textAlign: 'right' }}>{vnd(d.sales)}</td>
                <td style={{ ...td, textAlign: 'right' }}>{d.counted == null ? '—' : vnd(d.counted)}</td>
                <td style={{ ...td, textAlign: 'right', color: d.variance == null ? 'var(--text-muted, #bbb)' : Math.abs(d.variance) < 1 ? '#6b7280' : Math.abs(d.variance) <= 50000 ? '#C65911' : 'var(--burgundy, #7b2d3a)' }}>{d.variance == null ? '—' : (d.variance >= 0 ? '+' : '') + vnd(d.variance)}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      {/* Items sold on the selected day */}
      <div style={{ marginTop: 40 }}>
        <h3 style={{ fontSize: 13, fontWeight: 600, textTransform: 'uppercase', letterSpacing: '0.05em', color: 'var(--text-muted, #999)', marginBottom: 8 }}>
          Items sold · {new Date(date).toLocaleDateString(undefined, { weekday: 'short', day: 'numeric', month: 'short' })}
          {dayItems.length > 0 && <span style={{ fontWeight: 400 }}> · {dayItems.length} lines · {vnd(dayItems.reduce((s, i) => s + i.qty * i.unit, 0))}</span>}
        </h3>
        {dayItems.length === 0 ? (
          <div style={{ padding: 12, fontSize: 13, color: 'var(--text-muted, #999)' }}>No items recorded for this day.</div>
        ) : (
          <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 13 }}>
            <thead><tr style={{ background: 'var(--bg-sidebar, #fafafa)' }}>
              <th style={th}>Time</th><th style={th}>Item</th>
              <th style={{ ...th, textAlign: 'right' }}>Qty</th>
              <th style={{ ...th, textAlign: 'right' }}>Price</th>
              <th style={{ ...th, textAlign: 'right' }}>Total</th>
              <th style={th}>Paid</th>
            </tr></thead>
            <tbody>
              {dayItems.map((it, i) => (
                <tr key={i} style={{ borderTop: '1px solid var(--border, #eee)' }}>
                  <td style={{ ...td, color: 'var(--text-muted, #999)', whiteSpace: 'nowrap' }}>{it.time}</td>
                  <td style={td}>{it.name}</td>
                  <td style={{ ...td, textAlign: 'right' }}>{it.qty}</td>
                  <td style={{ ...td, textAlign: 'right' }}>{vnd(it.unit)}</td>
                  <td style={{ ...td, textAlign: 'right', fontWeight: 600 }}>{vnd(it.qty * it.unit)}</td>
                  <td style={{ ...td, fontSize: 11, color: 'var(--text-muted, #999)' }}>{methodLabel(it.method)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </div>
    </div>
  )
}

const Stat = ({ label, value, accent, sub }: { label: string; value: string; accent?: string; sub?: string }) => (
  <div style={{ padding: 12, background: 'var(--bg-card, #fff)', border: '1px solid var(--border, #e5e5e5)', borderRadius: 8, borderLeft: `3px solid ${accent || 'var(--accent, #e87830)'}` }}>
    <div style={{ fontSize: 10, fontWeight: 600, textTransform: 'uppercase', letterSpacing: '0.08em', color: 'var(--text-muted, #999)' }}>{label}</div>
    <div style={{ fontSize: 16, fontWeight: 600, color: 'var(--text, #333)', marginTop: 4 }}>{value}</div>
    {sub && <div style={{ fontSize: 10, color: 'var(--text-muted, #bbb)', marginTop: 2 }}>{sub}</div>}
  </div>
)

const Field = ({ label, children }: { label: string; children: React.ReactNode }) => (
  <label style={{ display: 'block', marginBottom: 10 }}>
    <div style={{ fontSize: 11, fontWeight: 600, textTransform: 'uppercase', letterSpacing: '0.06em', color: 'var(--text-muted, #999)', marginBottom: 4 }}>{label}</div>
    {children}
  </label>
)

const inp = { width: '100%', padding: '10px 12px', fontSize: 14, border: '1px solid var(--border, #e5e5e5)', borderRadius: 6, background: 'var(--bg-input, #fff)', color: 'var(--text, #333)', boxSizing: 'border-box' as const }
const th  = { padding: '8px 12px', textAlign: 'left' as const, fontWeight: 600, fontSize: 11, textTransform: 'uppercase' as const, color: 'var(--text-muted, #999)', letterSpacing: '0.05em' }
const td  = { padding: '8px 12px', color: 'var(--text, #333)' }
const btnPrimary = { padding: '10px 18px', background: 'var(--accent, #e87830)', color: '#fff', border: 'none', borderRadius: 6, fontSize: 14, fontWeight: 600, cursor: 'pointer' }

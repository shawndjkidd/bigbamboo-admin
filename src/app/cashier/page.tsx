'use client'
// Cashier shift sheet — a locked, single-purpose page for the cashier: count the till at
// the start of shift (cash-in), log any cash paid out during the shift (each books a cost),
// and count the till at the end (cash-out). Over/short is computed server-side against
// cash sales + payouts. Read-only beyond these actions; no access to the rest of the app.
import { useEffect, useState } from 'react'
import { useRouter } from 'next/navigation'
import { supabase } from '@/lib/supabase'
import { ops, vnd, canManageRecipes, type StaffRole } from '@/lib/ops/api'

const NOTES = [500000, 200000, 100000, 50000, 20000, 10000, 5000, 2000, 1000]
const PAYOUT_CATS: [string, string][] = [
  ['food', 'Food / produce'], ['marketing', 'Marketing / photographer'],
  ['consumable', 'Supplies'], ['repairs', 'Repairs'], ['other_opex', 'Other'],
]
type Denoms = Record<string, number>
const denomTotal = (d: Denoms) => NOTES.reduce((s, n) => s + n * (Number(d[n]) || 0), 0)
const clean = (d: Denoms) => { const o: Denoms = {}; NOTES.forEach(n => { if (Number(d[n]) > 0) o[n] = Number(d[n]) }); return o }

type Shift = {
  id: string; business_date: string; cashier_name: string | null; status: string
  opening_total: number; closing_total: number | null; cash_sales: number | null
  payouts: number | null; expected: number | null; over_short: number | null; open_tabs: number | null; tips: number | null
}
type Payout = { id: string; amount: number; description: string | null; category: string | null }
type Tab = { id: string; person_name: string | null; amount: number; claimed?: boolean; shift_id?: string | null; paid_method?: string | null; contact?: string | null }

export default function CashierPage() {
  const router = useRouter()
  const [loading, setLoading] = useState(true)
  const [email, setEmail] = useState('')
  const [shift, setShift] = useState<Shift | null>(null)
  const [payouts, setPayouts] = useState<Payout[]>([])
  const [tabs, setTabs] = useState<Tab[]>([])
  const [outstanding, setOutstanding] = useState<Tab[]>([])
  const [tabName, setTabName] = useState(''); const [tabAmt, setTabAmt] = useState(''); const [tabContact, setTabContact] = useState('')
  const [otName, setOtName] = useState(''); const [otAmt, setOtAmt] = useState(''); const [otContact, setOtContact] = useState('')
  const [busy, setBusy] = useState(false)
  const [msg, setMsg] = useState('')

  // counters
  const [openD, setOpenD] = useState<Denoms>({})
  const [closeD, setCloseD] = useState<Denoms>({})
  // payout form
  const [poAmt, setPoAmt] = useState('')
  const [poDesc, setPoDesc] = useState('')
  const [poCat, setPoCat] = useState('food')
  // cash sales typed off the Square register at close
  const [cashSales, setCashSales] = useState('')
  const [tips, setTips] = useState('')

  useEffect(() => {
    (async () => {
      const { data: { session } } = await supabase.auth.getSession()
      if (!session?.user) { router.push('/login'); return }
      const { data: su } = await supabase.from('staff_users').select('active, role').eq('email', session.user.email).maybeSingle()
      if (!su || su.active === false) { router.push('/login'); return }
      const role = (su.role || 'staff') as StaffRole
      if (role !== 'cashier' && !canManageRecipes(role)) { router.push('/login'); return }
      setEmail(session.user.email || '')
      await loadShift(session.user.email || '')
      setLoading(false)
    })()
  }, [])

  async function loadShift(em: string) {
    const { data } = await ops().from('cash_shifts').select('*').eq('cashier_email', em).eq('status', 'open').order('opened_at', { ascending: false }).limit(1)
    const s = (data && data[0]) as Shift | undefined
    setShift(s || null)
    if (s) {
      const { data: p } = await ops().from('cash_payouts').select('id, amount, description, category').eq('shift_id', s.id).order('occurred_at'); setPayouts((p as Payout[]) || [])
      const { data: t } = await ops().from('cash_tabs').select('id, person_name, amount, contact').eq('shift_id', s.id).order('created_at'); setTabs((t as Tab[]) || [])
    } else { setPayouts([]); setTabs([]) }
    const { data: ot } = await ops().from('cash_tabs').select('id, person_name, amount, claimed, shift_id, paid_method, contact').eq('settled', false).order('created_at')
    setOutstanding((ot as Tab[]) || [])
  }

  async function addOutstandingTab() {
    const amt = Number(otAmt.replace(/[^\d.]/g, ''))
    if (!amt) { setMsg('Enter the tab amount'); return }
    setBusy(true); setMsg('')
    const { error } = await ops().rpc('add_cash_tab', { p_shift: shift?.id ?? null, p_person: otName, p_amount: amt, p_contact: otContact })
    setBusy(false)
    if (error) { setMsg(error.message); return }
    setOtName(''); setOtAmt(''); setOtContact(''); await loadShift(email)
  }
  async function claimTab(id: string, claimed: boolean, method?: string) {
    const { error } = await ops().rpc('claim_cash_tab', { p_tab: id, p_claimed: claimed, p_method: method ?? null })
    if (error) { setMsg(error.message); return }
    await loadShift(email)
  }

  async function addTab() {
    const amt = Number(tabAmt.replace(/[^\d.]/g, ''))
    if (!amt) { setMsg('Enter the tab amount'); return }
    if (!shift) return
    setBusy(true); setMsg('')
    const { error } = await ops().rpc('add_cash_tab', { p_shift: shift.id, p_person: tabName, p_amount: amt, p_contact: tabContact })
    setBusy(false)
    if (error) { setMsg(error.message); return }
    setTabName(''); setTabAmt(''); setTabContact(''); await loadShift(email)
  }

  async function startShift() {
    setBusy(true); setMsg('')
    const { data, error } = await ops().rpc('open_cash_shift', { p_denoms: clean(openD) })
    setBusy(false)
    if (error) { setMsg(error.message); return }
    setOpenD({}); setShift(data as Shift); setPayouts([]); setTabs([])
  }

  async function addPayout() {
    const amt = Number(poAmt.replace(/[^\d.]/g, ''))
    if (!amt) { setMsg('Enter a payout amount'); return }
    if (!shift) return
    setBusy(true); setMsg('')
    const { error } = await ops().rpc('add_cash_payout', { p_shift: shift.id, p_amount: amt, p_desc: poDesc, p_category: poCat })
    setBusy(false)
    if (error) { setMsg(error.message); return }
    setPoAmt(''); setPoDesc('')
    await loadShift(email)
  }

  async function closeShift() {
    if (!shift) return
    if (!confirm('Close this shift? This records your end-of-shift count and the over/short.')) return
    setBusy(true); setMsg('')
    const cs = cashSales.trim() === '' ? null : Number(cashSales.replace(/[^\d.]/g, ''))
    const tp = tips.trim() === '' ? 0 : Number(tips.replace(/[^\d.]/g, ''))
    const { data, error } = await ops().rpc('close_cash_shift', { p_shift: shift.id, p_denoms: clean(closeD), p_cash_sales: cs, p_tips: tp })
    setBusy(false)
    if (error) { setMsg(error.message); return }
    setCloseD({}); setCashSales(''); setTips(''); setShift(data as Shift) // now status='closed' → shows summary
  }

  const payoutTotal = payouts.reduce((t, p) => t + Number(p.amount), 0)

  if (loading) return <div style={{ height: '100vh', display: 'flex', alignItems: 'center', justifyContent: 'center', color: '#999' }}>Loading…</div>

  const closed = shift && shift.status === 'closed'

  return (
    <div style={{ minHeight: '100vh', background: 'var(--bg, #fff)', color: 'var(--text, #1a1a1a)' }}>
      <div style={{ position: 'sticky', top: 0, zIndex: 5, background: 'var(--bg-sidebar, #fafafa)', borderBottom: '1px solid var(--border, #e5e5e5)', padding: '16px 20px' }}>
        <span style={{ fontSize: 20, fontWeight: 700, color: 'var(--accent, #e87830)' }}>BigBamBoo · Cashier</span>
      </div>

      <div style={{ maxWidth: 560, margin: '0 auto', padding: 20 }}>
        {msg && <div style={{ background: '#fdecec', color: '#a32d2d', borderRadius: 8, padding: '10px 14px', fontSize: 14, marginBottom: 14 }}>{msg}</div>}

        {/* No open shift → start */}
        {!shift && (
          <Section title="Start of shift — count the till">
            <Counter d={openD} setD={setOpenD} />
            <Total label="Opening float" value={denomTotal(openD)} />
            <Big onClick={startShift} disabled={busy || denomTotal(openD) === 0}>{busy ? 'Saving…' : 'Start shift'}</Big>
          </Section>
        )}

        {/* Open shift → payouts + close */}
        {shift && !closed && (
          <>
            <div style={{ background: 'var(--bg-card, #fff)', border: '1px solid var(--border, #e5e5e5)', borderRadius: 12, padding: 16, marginBottom: 18 }}>
              <div style={{ fontSize: 13, color: '#999' }}>Shift open · {shift.business_date}</div>
              <div style={{ fontSize: 22, fontWeight: 700, marginTop: 2 }}>Opening float {vnd(shift.opening_total)}</div>
            </div>

            <Section title="Cash paid out this shift">
              <div style={{ fontSize: 13, color: '#999', marginBottom: 10 }}>Photographer, a quick lime run, anything paid from the till. Each one is recorded as a cost.</div>
              {payouts.map(p => (
                <div key={p.id} style={{ display: 'flex', justifyContent: 'space-between', padding: '6px 0', borderBottom: '1px solid var(--border, #eee)', fontSize: 14 }}>
                  <span>{p.description || PAYOUT_CATS.find(c => c[0] === p.category)?.[1] || p.category}</span>
                  <span style={{ fontWeight: 600 }}>{vnd(p.amount)}</span>
                </div>
              ))}
              {payouts.length > 0 && <div style={{ display: 'flex', justifyContent: 'space-between', padding: '8px 0', fontWeight: 700 }}><span>Total paid out</span><span>{vnd(payoutTotal)}</span></div>}
              <div style={{ display: 'grid', gap: 8, marginTop: 10 }}>
                <input value={poAmt} onChange={e => setPoAmt(e.target.value)} inputMode="numeric" placeholder="Amount (₫)" style={inp} />
                <input value={poDesc} onChange={e => setPoDesc(e.target.value)} placeholder="What for? e.g. Limes, Photographer" style={inp} />
                <select value={poCat} onChange={e => setPoCat(e.target.value)} style={inp}>{PAYOUT_CATS.map(([v, l]) => <option key={v} value={v}>{l}</option>)}</select>
                <button onClick={addPayout} disabled={busy} style={{ ...inp, background: 'var(--bg-sidebar,#f3f3f3)', cursor: 'pointer', fontWeight: 600 }}>+ Add payout</button>
              </div>
            </Section>

            <Section title="Tabs — ordered but not paid">
              <div style={{ fontSize: 13, color: '#999', marginBottom: 10 }}>Someone who left without paying / said they'll pay later. The till will look short by this amount, so log it here with their name.</div>
              {tabs.map(t => (
                <div key={t.id} style={{ display: 'flex', justifyContent: 'space-between', padding: '6px 0', borderBottom: '1px solid var(--border, #eee)', fontSize: 14 }}>
                  <span>{t.person_name || 'Unnamed tab'}{t.contact && <span style={{ marginLeft: 8, fontSize: 12, color: '#999' }}>· {t.contact}</span>}</span>
                  <span style={{ fontWeight: 600 }}>{vnd(t.amount)}</span>
                </div>
              ))}
              {tabs.length > 0 && <div style={{ display: 'flex', justifyContent: 'space-between', padding: '8px 0', fontWeight: 700 }}><span>Total unpaid</span><span>{vnd(tabs.reduce((s, t) => s + Number(t.amount), 0))}</span></div>}
              <div style={{ display: 'grid', gridTemplateColumns: '1fr 120px', gap: 8, marginTop: 10 }}>
                <input value={tabName} onChange={e => setTabName(e.target.value)} placeholder="Full name" style={inp} />
                <input value={tabAmt} onChange={e => setTabAmt(e.target.value.replace(/[^\d.]/g, ''))} inputMode="numeric" placeholder="Amount (₫)" style={{ ...inp, textAlign: 'right' }} />
              </div>
              <input value={tabContact} onChange={e => setTabContact(e.target.value)} placeholder="Phone / contact (optional)" style={{ ...inp, width: '100%', marginTop: 8 }} />
              <button onClick={addTab} disabled={busy} style={{ ...inp, width: '100%', marginTop: 8, background: 'var(--bg-sidebar,#f3f3f3)', cursor: 'pointer', fontWeight: 600 }}>+ Add unpaid tab</button>
            </Section>

            <Section title="Cash sales this shift">
              <div style={{ fontSize: 13, color: '#999', marginBottom: 8 }}>Read the cash sales total off the Square register and type it here. Leave blank only if you don't have it.</div>
              <input value={cashSales} onChange={e => setCashSales(e.target.value.replace(/[^\d.]/g, ''))} inputMode="numeric" placeholder="Cash sales (₫)" style={{ ...inp, fontSize: 18, fontWeight: 600 }} />
            </Section>

            <Section title="Cash tips this shift">
              <div style={{ fontSize: 13, color: '#999', marginBottom: 8 }}>Tips paid in cash that are still in the drawer. This is why the till is a bit over — logging it keeps the count balanced.</div>
              <input value={tips} onChange={e => setTips(e.target.value.replace(/[^\d.]/g, ''))} inputMode="numeric" placeholder="Cash tips (₫)" style={{ ...inp, fontSize: 18, fontWeight: 600 }} />
            </Section>

            <Section title="End of shift — count the till">
              <Counter d={closeD} setD={setCloseD} />
              <Total label="Counted in till" value={denomTotal(closeD)} />
              <Big onClick={closeShift} disabled={busy || denomTotal(closeD) === 0}>{busy ? 'Closing…' : 'Close shift'}</Big>
            </Section>
          </>
        )}

        {/* Just closed → summary. Only a shortage is shown; a balanced/over till just reads
            "Balanced" so nobody treats an overage as a tip. The true over/short is still
            recorded for the manager's review. */}
        {closed && (
          <Section title="Shift closed">
            <Row label="Opening float" value={vnd(shift!.opening_total)} />
            <Row label="Cash sales" value={vnd(shift!.cash_sales)} />
            {Number(shift!.tips) > 0 && <Row label="Cash tips" value={'+ ' + vnd(shift!.tips)} />}
            <Row label="Paid out" value={'– ' + vnd(shift!.payouts)} />
            {Number(shift!.open_tabs) > 0 && <Row label="Unpaid tabs" value={'– ' + vnd(shift!.open_tabs)} />}
            <Row label="Counted in till" value={vnd(shift!.closing_total)} bold />
            {Number(shift!.over_short) < 0 ? (
              <div style={{ marginTop: 10, padding: '14px', borderRadius: 10, textAlign: 'center', background: '#fdecec', color: '#a32d2d' }}>
                <div style={{ fontSize: 13 }}>Short — please recount</div>
                <div style={{ fontSize: 26, fontWeight: 700 }}>{vnd(Math.abs(Number(shift!.over_short)))}</div>
              </div>
            ) : (
              <div style={{ marginTop: 10, padding: '14px', borderRadius: 10, textAlign: 'center', background: '#e7f5ec', color: '#1d7a46', fontSize: 18, fontWeight: 700 }}>Balanced</div>
            )}
            <Big onClick={() => { setShift(null); setMsg('') }} disabled={false}>Start a new shift</Big>
          </Section>
        )}

        {/* Always-visible running list of unpaid tabs the cashier can manage */}
        <Section title="Outstanding tabs — money still owed">
          <div style={{ fontSize: 13, color: '#999', marginBottom: 10 }}>Everyone who hasn't paid yet. When they pay you, tap how they paid — <b>Cash</b> adds it to today's drawer, <b>QR</b> goes to the bank. A manager then confirms it.</div>
          {outstanding.length === 0 && <div style={{ fontSize: 14, color: '#999', padding: '4px 0' }}>No outstanding tabs.</div>}
          {outstanding.map(t => (
            <div key={t.id} style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '8px 0', borderBottom: '1px solid var(--border, #eee)', fontSize: 14 }}>
              <span>{t.person_name || 'Unnamed tab'}{t.contact && <span style={{ marginLeft: 8, fontSize: 12, color: '#999' }}>· {t.contact}</span>}{t.claimed && <span style={{ marginLeft: 8, fontSize: 11, color: '#b8631c', background: '#fdecdc', padding: '1px 8px', borderRadius: 100 }}>paid · {t.paid_method === 'cash' ? 'cash' : 'QR'} · awaiting confirm</span>}</span>
              <span style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                <span style={{ fontWeight: 600 }}>{vnd(t.amount)}</span>
                {t.claimed ? (
                  <button onClick={() => claimTab(t.id, false)} style={{ fontSize: 12, padding: '5px 12px', borderRadius: 8, border: '1px solid #e5e5e5', background: 'transparent', color: '#999', cursor: 'pointer', fontWeight: 600 }}>Undo</button>
                ) : (
                  <>
                    <button onClick={() => claimTab(t.id, true, 'cash')} style={{ fontSize: 12, padding: '5px 12px', borderRadius: 8, border: '1px solid var(--accent, #e87830)', background: 'var(--accent, #e87830)', color: '#fff', cursor: 'pointer', fontWeight: 600 }}>Cash</button>
                    <button onClick={() => claimTab(t.id, true, 'transfer')} style={{ fontSize: 12, padding: '5px 12px', borderRadius: 8, border: '1px solid var(--accent, #e87830)', background: 'transparent', color: 'var(--accent, #e87830)', cursor: 'pointer', fontWeight: 600 }}>QR</button>
                  </>
                )}
              </span>
            </div>
          ))}
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 120px', gap: 8, marginTop: 12 }}>
            <input value={otName} onChange={e => setOtName(e.target.value)} placeholder="Full name" style={inp} />
            <input value={otAmt} onChange={e => setOtAmt(e.target.value.replace(/[^\d.]/g, ''))} inputMode="numeric" placeholder="Amount (₫)" style={{ ...inp, textAlign: 'right' }} />
          </div>
          <input value={otContact} onChange={e => setOtContact(e.target.value)} placeholder="Phone / contact (optional)" style={{ ...inp, width: '100%', marginTop: 8 }} />
          <button onClick={addOutstandingTab} disabled={busy} style={{ ...inp, width: '100%', marginTop: 8, background: 'var(--bg-sidebar,#f3f3f3)', cursor: 'pointer', fontWeight: 600 }}>+ Add unpaid tab</button>
        </Section>
      </div>
    </div>
  )
}

function Counter({ d, setD }: { d: Denoms; setD: (d: Denoms) => void }) {
  return (
    <div style={{ display: 'grid', gap: 6 }}>
      {NOTES.map(n => (
        <div key={n} style={{ display: 'grid', gridTemplateColumns: '1fr 90px 1fr', alignItems: 'center', gap: 10 }}>
          <span style={{ fontSize: 15, color: 'var(--text-secondary,#555)' }}>{n.toLocaleString('vi-VN')} ₫</span>
          <input inputMode="numeric" value={d[n] || ''} onChange={e => setD({ ...d, [n]: Number(e.target.value.replace(/[^\d]/g, '')) })}
            placeholder="0" style={{ ...inp, textAlign: 'center', padding: '10px' }} />
          <span style={{ fontSize: 14, color: '#999', textAlign: 'right' }}>{vnd(n * (Number(d[n]) || 0))}</span>
        </div>
      ))}
    </div>
  )
}
function Section({ title, children }: { title: string; children: React.ReactNode }) {
  return <div style={{ marginBottom: 22 }}><div style={{ fontSize: 12, fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.06em', color: '#999', marginBottom: 10 }}>{title}</div>{children}</div>
}
function Total({ label, value }: { label: string; value: number }) {
  return <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'baseline', marginTop: 12, paddingTop: 12, borderTop: '2px solid var(--border,#e5e5e5)' }}>
    <span style={{ fontSize: 14, color: '#999' }}>{label}</span><span style={{ fontSize: 22, fontWeight: 700 }}>{vnd(value)}</span></div>
}
function Row({ label, value, bold }: { label: string; value: string; bold?: boolean }) {
  return <div style={{ display: 'flex', justifyContent: 'space-between', padding: '6px 0', fontSize: 15, fontWeight: bold ? 700 : 400 }}><span style={{ color: bold ? 'inherit' : '#777' }}>{label}</span><span>{value}</span></div>
}
function Big({ onClick, disabled, children }: { onClick: () => void; disabled: boolean; children: React.ReactNode }) {
  return <button onClick={onClick} disabled={disabled} style={{ width: '100%', marginTop: 16, padding: '15px', fontSize: 16, fontWeight: 700, color: '#fff', background: 'var(--accent, #e87830)', border: 'none', borderRadius: 12, cursor: disabled ? 'default' : 'pointer', opacity: disabled ? 0.5 : 1 }}>{children}</button>
}

const inp: React.CSSProperties = { width: '100%', padding: '12px 14px', fontSize: 15, border: '1px solid var(--border, #e5e5e5)', borderRadius: 10, background: 'var(--bg-card, #fff)', color: 'var(--text, #333)', boxSizing: 'border-box' }

'use client'
// Manager review of cashier shift cash-outs: opening float, cash sales, payouts, counted
// till and over/short, with the itemized payouts for each shift.
import { useEffect, useState } from 'react'
import { ops, vnd, canManageRecipes, type StaffRole } from '@/lib/ops/api'
import { supabase } from '@/lib/supabase'

export default function CashOutsPage() {
  const [role, setRole] = useState<StaffRole | null>(null)
  const [shifts, setShifts] = useState<any[]>([])
  const [payouts, setPayouts] = useState<Record<string, any[]>>({})
  const [shiftMix, setShiftMix] = useState<Record<string, { cash: number; transfer: number; card: number; total: number }>>({})
  const [shiftCash, setShiftCash] = useState<Record<string, number>>({})
  const [tabsByShift, setTabsByShift] = useState<Record<string, any[]>>({})
  const [tabName, setTabName] = useState(''); const [tabAmt, setTabAmt] = useState('')
  const [loading, setLoading] = useState(true)
  const [open, setOpen] = useState<string | null>(null)

  useEffect(() => { init() }, [])
  async function init() {
    const { data: { user } } = await supabase.auth.getUser()
    const { data: su } = await supabase.from('staff_users').select('role').eq('email', user?.email).maybeSingle()
    setRole((su?.role || 'staff') as StaffRole)
    const { data: cs } = await ops().from('cash_shifts').select('*').order('opened_at', { ascending: false }).limit(60)
    setShifts(cs || [])
    const ids = (cs || []).map((c: any) => c.id)
    if (ids.length) {
      const { data: ps } = await ops().from('cash_payouts').select('*').in('shift_id', ids)
      const byS: Record<string, any[]> = {}; (ps || []).forEach((p: any) => { (byS[p.shift_id] = byS[p.shift_id] || []).push(p) })
      setPayouts(byS)
      const { data: ts } = await ops().from('cash_tabs').select('*').in('shift_id', ids).order('created_at')
      const byT: Record<string, any[]> = {}; (ts || []).forEach((t: any) => { (byT[t.shift_id] = byT[t.shift_id] || []).push(t) })
      setTabsByShift(byT)
      // Square sales for each shift's day, split by tender so cash can be reconciled to the till.
      const dates = Array.from(new Set((cs || []).map((c: any) => c.business_date)))
      const { data: si } = await ops().from('sales_items').select('occurred_on, occurred_at, payment_method, gross').in('occurred_on', dates)
      // Everything is scoped to each shift's own open→close window, so a batch that uploaded
      // outside the shift (e.g. an offline flush) never inflates the cash-out.
      const sm: Record<string, { cash: number; transfer: number; card: number; total: number }> = {}
      const sc: Record<string, number> = {}
      ;(cs || []).forEach((sh: any) => {
        const open = new Date(sh.opened_at).getTime()
        const close = sh.closed_at ? new Date(sh.closed_at).getTime() : Date.now()
        const b = { cash: 0, transfer: 0, card: 0, total: 0 }
        ;(si || []).forEach((r: any) => {
          if (r.occurred_on !== sh.business_date) return
          const t = new Date(r.occurred_at).getTime()
          if (t < open || t > close) return
          const g = Number(r.gross || 0); const pm = (r.payment_method || '').toUpperCase()
          if (pm.includes('CASH')) b.cash += g; else if (pm.includes('CARD')) b.card += g; else b.transfer += g
          b.total += g
        })
        sm[sh.id] = { cash: Math.round(b.cash), transfer: Math.round(b.transfer), card: Math.round(b.card), total: Math.round(b.total) }
        sc[sh.id] = Math.round(b.cash)
      })
      setShiftMix(sm); setShiftCash(sc)
      // Smart drawer: auto-fill cash sales from the shift's own window for any closed shift
      // that doesn't have a figure yet, so the over/short is right without anyone tapping.
      const toApply = (cs || []).filter((sh: any) => sh.status === 'closed' && Number(sh.cash_sales || 0) === 0 && (sc[sh.id] || 0) > 0)
      if (toApply.length) {
        for (const sh of toApply) await ops().rpc('set_shift_cash_sales', { p_shift: sh.id, p_cash_sales: sc[sh.id] })
        const { data: cs2 } = await ops().from('cash_shifts').select('*').order('opened_at', { ascending: false }).limit(60)
        if (cs2) setShifts(cs2)
      }
    }
    setLoading(false)
  }

  async function saveBankReceived(id: string, value: string) {
    const v = value.trim() === '' ? null : Number(value.replace(/[^\d.]/g, ''))
    const { error } = await ops().rpc('set_shift_bank_received', { p_shift: id, p_amount: v })
    if (error) return
    await init()
  }
  async function toggleTab(id: string, settled: boolean) {
    const { error } = await ops().rpc('set_tab_settled', { p_tab: id, p_settled: settled })
    if (error) return
    await init()
  }
  async function addTab(shiftId: string) {
    const amt = Number(tabAmt.replace(/[^\d.]/g, ''))
    if (!amt) return
    const { error } = await ops().rpc('add_cash_tab', { p_shift: shiftId, p_person: tabName, p_amount: amt })
    if (error) return
    setTabName(''); setTabAmt(''); await init()
  }
  async function delTab(id: string) {
    if (!confirm('Remove this tab?')) return
    const { error } = await ops().rpc('delete_cash_tab', { p_tab: id })
    if (error) return
    await init()
  }
  async function saveCashSales(id: string, value: string) {
    const v = value.trim() === '' ? 0 : Number(value.replace(/[^\d.]/g, ''))
    const { error } = await ops().rpc('set_shift_cash_sales', { p_shift: id, p_cash_sales: v })
    if (error) return
    await init()
  }
  async function saveTips(id: string, value: string) {
    const v = value.trim() === '' ? 0 : Number(value.replace(/[^\d.]/g, ''))
    const { error } = await ops().rpc('set_shift_tips', { p_shift: id, p_tips: v })
    if (error) return
    await init()
  }

  if (loading) return <div style={{ color: 'var(--text-muted, #999)', fontSize: 14 }}>Loading…</div>
  if (!(role && canManageRecipes(role))) return <div style={{ color: 'var(--text-muted, #999)', fontSize: 14 }}>Managers only.</div>

  const isSuper = !!role && ['super_admin', 'admin'].includes(role)
  // Every still-unpaid tab across all shifts — the running "who owes us money" list.
  const outstanding: { tab: any; date: string }[] = []
  shifts.forEach(s => (tabsByShift[s.id] || []).forEach((t: any) => { if (!t.settled) outstanding.push({ tab: t, date: s.business_date }) }))
  const outstandingTotal = outstanding.reduce((sum, o) => sum + Number(o.tab.amount), 0)

  return (
    <div style={{ maxWidth: 720 }}>
      <h2 style={{ fontSize: 22, fontWeight: 600 }}>Cash-outs</h2>
      <div style={{ fontSize: 13, color: 'var(--text-muted, #999)', marginTop: 2, marginBottom: 18 }}>Cashier shift open/close counts, payouts and over/short. Cash sales come from Square card/cash data — if Square is behind, that figure may read low.</div>

      {outstanding.length > 0 && (
        <div className="card" style={{ padding: 18, marginBottom: 18, borderLeft: '3px solid var(--accent, #e87830)' }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'baseline', marginBottom: 10 }}>
            <div style={{ fontSize: 13, fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.05em', color: 'var(--accent, #e87830)' }}>Outstanding tabs — not yet paid</div>
            <div style={{ fontSize: 16, fontWeight: 700 }}>{vnd(outstandingTotal)}</div>
          </div>
          {outstanding.map(o => (
            <div key={o.tab.id} style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', fontSize: 14, padding: '6px 0', borderTop: '1px solid var(--border, #eee)' }}>
              <span>{o.tab.person_name || 'Unnamed tab'} <span style={{ color: 'var(--text-muted, #999)', fontSize: 12 }}>· {o.date}</span></span>
              <span style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
                {o.tab.claimed && <span style={{ fontSize: 11, color: '#b8631c', background: 'var(--badge-orange-bg, #fdecdc)', padding: '1px 8px', borderRadius: 100 }}>paid · awaiting confirm</span>}
                <span style={{ fontWeight: 600 }}>{vnd(o.tab.amount)}</span>
                {isSuper && <button onClick={() => toggleTab(o.tab.id, true)} style={{ fontSize: 12, padding: '4px 12px', border: 'none', borderRadius: 6, background: 'var(--accent, #e87830)', color: '#fff', cursor: 'pointer' }}>Confirm paid</button>}
                <button onClick={() => delTab(o.tab.id)} title="Remove" style={{ fontSize: 16, padding: '0 4px', border: 'none', background: 'transparent', cursor: 'pointer', color: '#a32d2d' }}>×</button>
              </span>
            </div>
          ))}
        </div>
      )}

      {shifts.length === 0 && <div style={{ color: 'var(--text-muted, #999)', fontSize: 14 }}>No cash-outs yet.</div>}

      <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
        {shifts.map(s => {
          const isOpen = open === s.id
          const ps = payouts[s.id] || []
          const os = Number(s.over_short)
          const closed = s.status === 'closed'
          return (
            <div key={s.id} className="card" style={{ padding: isOpen ? 18 : '12px 16px' }}>
              <div onClick={() => setOpen(isOpen ? null : s.id)} style={{ display: 'flex', alignItems: 'center', gap: 12, cursor: 'pointer' }}>
                <span style={{ color: 'var(--text-muted, #999)', fontSize: 13, width: 14 }}>{isOpen ? '▾' : '▸'}</span>
                <span style={{ fontWeight: 600, fontSize: 15, flex: 1 }}>{s.business_date}</span>
                <span style={{ fontSize: 12, color: 'var(--text-muted, #999)' }}>{s.cashier_name || s.cashier_email}</span>
                {!closed
                  ? <span style={{ fontSize: 10, padding: '2px 8px', borderRadius: 100, background: 'var(--badge-orange-bg, #fdecdc)', color: '#b8631c' }}>open</span>
                  : (() => { const v = verdict(os); return <span style={{ fontSize: 13, fontWeight: 700, color: v.color }}>{Math.abs(os) < 1000 ? 'Balanced' : `${v.label} ${vnd(Math.abs(os))}`}</span> })()}
              </div>
              {isOpen && (
                <div style={{ marginTop: 14 }}>
                  {closed && (() => { const v = verdict(os); return (
                    <div style={{ background: v.bg, color: v.color, borderRadius: 10, padding: '12px 14px', textAlign: 'center', marginBottom: 16 }}>
                      <div style={{ fontSize: 12, textTransform: 'uppercase', letterSpacing: '0.06em', fontWeight: 600 }}>{v.headline}</div>
                      <div style={{ fontSize: 26, fontWeight: 700, marginTop: 2 }}>{Math.abs(os) < 1000 ? vnd(0) : (os < 0 ? '– ' : '+ ') + vnd(Math.abs(os))}</div>
                    </div>
                  ) })()}
                  <Row label="Opening float" value={vnd(s.opening_total)} />
                  <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '5px 0', fontSize: 14, gap: 8, flexWrap: 'wrap' }}>
                    <span style={{ color: 'var(--text-muted, #777)', display: 'flex', alignItems: 'center', gap: 8 }}>+ Cash sales
                      {shiftCash[s.id] > 0 && Number(s.cash_sales || 0) !== shiftCash[s.id] && (
                        <button onClick={() => saveCashSales(s.id, String(shiftCash[s.id]))} title="Cash rung up while this drawer was open" style={{ fontSize: 11, padding: '3px 8px', border: '1px solid var(--accent, #e87830)', color: 'var(--accent, #e87830)', background: 'transparent', borderRadius: 6, cursor: 'pointer' }}>Use shift cash: {vnd(shiftCash[s.id])}</button>
                      )}
                    </span>
                    <span style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                      <input key={'cs' + s.id + s.cash_sales} defaultValue={s.cash_sales ?? ''} onBlur={e => e.target.value !== String(s.cash_sales ?? '') && saveCashSales(s.id, e.target.value)} inputMode="numeric" placeholder="0" style={{ width: 120, padding: '5px 8px', fontSize: 14, textAlign: 'right', border: '1px solid var(--border, #e5e5e5)', borderRadius: 6, background: 'var(--bg-card, #fff)', color: 'var(--text, #333)' }} />
                      <span style={{ color: 'var(--text-muted, #999)' }}>₫</span>
                    </span>
                  </div>
                  <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '5px 0', fontSize: 14, gap: 8 }}>
                    <span style={{ color: 'var(--text-muted, #777)' }}>+ Cash tips</span>
                    <span style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                      <input key={'tp' + s.id + s.tips} defaultValue={s.tips ?? ''} onBlur={e => e.target.value !== String(s.tips ?? '') && saveTips(s.id, e.target.value)} inputMode="numeric" placeholder="0" style={{ width: 120, padding: '5px 8px', fontSize: 14, textAlign: 'right', border: '1px solid var(--border, #e5e5e5)', borderRadius: 6, background: 'var(--bg-card, #fff)', color: 'var(--text, #333)' }} />
                      <span style={{ color: 'var(--text-muted, #999)' }}>₫</span>
                    </span>
                  </div>
                  <Row label="− Paid out" value={vnd(s.payouts)} />
                  {Number(s.open_tabs) > 0 && <Row label="− Unpaid tabs" value={vnd(s.open_tabs)} />}
                  <div style={{ borderTop: '1px solid var(--border, #e5e5e5)', marginTop: 4 }} />
                  <Row label="= Should be in till" value={vnd(s.expected)} bold />
                  <Row label="Actually counted" value={vnd(s.closing_total)} bold />
                  {shiftMix[s.id] && (
                    <div style={{ marginTop: 12, borderTop: '1px solid var(--border, #eee)', paddingTop: 10 }}>
                      <div style={{ fontSize: 11, fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.05em', color: 'var(--text-muted, #888)', marginBottom: 6 }}>Sales this shift by method (Square)</div>
                      <Row label="Cash → till" value={vnd(shiftMix[s.id].cash)} />
                      <Row label="Bank transfer → bank" value={vnd(shiftMix[s.id].transfer)} />
                      {shiftMix[s.id].card > 0 && <Row label="Card (external) → bank" value={vnd(shiftMix[s.id].card)} />}
                      <Row label="Total sales" value={vnd(shiftMix[s.id].total)} bold />
                    </div>
                  )}
                  {shiftMix[s.id] && shiftMix[s.id].transfer > 0 && (() => {
                    const sqTransfer = shiftMix[s.id].transfer
                    const bank = s.bank_received == null ? null : Number(s.bank_received)
                    const diff = bank == null ? null : bank - sqTransfer
                    return (
                      <div style={{ marginTop: 12, borderTop: '1px solid var(--border, #eee)', paddingTop: 10 }}>
                        <div style={{ fontSize: 11, fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.05em', color: 'var(--text-muted, #888)', marginBottom: 6 }}>Transfer / QR reconciliation</div>
                        <Row label="Square transfer sales" value={vnd(sqTransfer)} />
                        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '5px 0', fontSize: 14, gap: 8 }}>
                          <span style={{ color: 'var(--text-muted, #777)' }}>Actually received in bank</span>
                          <span style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                            <input key={'bk' + s.id + s.bank_received} defaultValue={s.bank_received ?? ''} onBlur={e => e.target.value !== String(s.bank_received ?? '') && saveBankReceived(s.id, e.target.value)} inputMode="numeric" placeholder="from bank app" style={{ width: 130, padding: '5px 8px', fontSize: 14, textAlign: 'right', border: '1px solid var(--border, #e5e5e5)', borderRadius: 6, background: 'var(--bg-card, #fff)', color: 'var(--text, #333)' }} />
                            <span style={{ color: 'var(--text-muted, #999)' }}>₫</span>
                          </span>
                        </div>
                        {diff != null && (
                          <div style={{ marginTop: 8, padding: '10px 12px', borderRadius: 8, background: Math.abs(diff) < 1000 ? '#e7f5ec' : diff > 0 ? '#fdecdc' : '#fdecec', color: Math.abs(diff) < 1000 ? '#1d7a46' : diff > 0 ? '#b8631c' : '#a32d2d', fontSize: 13 }}>
                            {Math.abs(diff) < 1000 ? 'Transfers match ✓'
                              : diff > 0 ? <>Bank received <b>{vnd(diff)}</b> more than rung up — likely <b>QR tips</b>.</>
                              : <>Bank is <b>{vnd(Math.abs(diff))}</b> short of transfer sales — a transfer didn't land or was mis-tagged.</>}
                          </div>
                        )}
                      </div>
                    )
                  })()}
                  <div style={{ marginTop: 12, borderTop: '1px solid var(--border, #eee)', paddingTop: 10 }}>
                    <div style={{ fontSize: 11, fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.05em', color: 'var(--text-muted, #888)', marginBottom: 6 }}>Unpaid tabs</div>
                    {(tabsByShift[s.id] || []).map(t => (
                      <div key={t.id} style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', fontSize: 13, padding: '3px 0' }}>
                        <span style={{ textDecoration: t.settled ? 'line-through' : 'none', color: t.settled ? 'var(--text-muted, #999)' : 'inherit' }}>{t.person_name || 'Unnamed tab'}</span>
                        <span style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                          {t.claimed && !t.settled && <span style={{ fontSize: 10, color: '#b8631c', background: 'var(--badge-orange-bg, #fdecdc)', padding: '1px 6px', borderRadius: 100 }}>awaiting confirm</span>}
                          <span style={{ color: 'var(--text-muted, #666)' }}>{vnd(t.amount)}</span>
                          {(isSuper || t.settled) && <button onClick={() => toggleTab(t.id, !t.settled)} style={{ fontSize: 11, padding: '2px 8px', border: '1px solid var(--border, #e5e5e5)', borderRadius: 6, background: 'transparent', cursor: 'pointer', color: t.settled ? '#1d7a46' : 'var(--text-secondary, #666)' }}>{t.settled ? 'Confirmed ✓' : 'Confirm paid'}</button>}
                          <button onClick={() => delTab(t.id)} title="Remove" style={{ fontSize: 14, padding: '0 4px', border: 'none', background: 'transparent', cursor: 'pointer', color: '#a32d2d' }}>×</button>
                        </span>
                      </div>
                    ))}
                    <div style={{ display: 'flex', gap: 6, marginTop: 8 }}>
                      <input value={tabName} onChange={e => setTabName(e.target.value)} placeholder="Name / table" style={{ flex: 1, padding: '6px 8px', fontSize: 13, border: '1px solid var(--border, #e5e5e5)', borderRadius: 6, background: 'var(--bg-card, #fff)', color: 'var(--text, #333)' }} />
                      <input value={tabAmt} onChange={e => setTabAmt(e.target.value.replace(/[^\d.]/g, ''))} inputMode="numeric" placeholder="Amount" style={{ width: 90, padding: '6px 8px', fontSize: 13, textAlign: 'right', border: '1px solid var(--border, #e5e5e5)', borderRadius: 6, background: 'var(--bg-card, #fff)', color: 'var(--text, #333)' }} />
                      <button onClick={() => addTab(s.id)} style={{ fontSize: 13, padding: '6px 12px', border: '1px solid var(--border, #e5e5e5)', borderRadius: 6, background: 'var(--bg-sidebar, #f3f3f3)', cursor: 'pointer', fontWeight: 600 }}>+ Tab</button>
                    </div>
                  </div>
                  {ps.length > 0 && (
                    <div style={{ marginTop: 12, borderTop: '1px solid var(--border, #eee)', paddingTop: 10 }}>
                      <div style={{ fontSize: 11, fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.05em', color: 'var(--text-muted, #888)', marginBottom: 6 }}>Payouts (booked as costs)</div>
                      {ps.map(p => (
                        <div key={p.id} style={{ display: 'flex', justifyContent: 'space-between', fontSize: 13, padding: '3px 0' }}>
                          <span>{p.description || p.category}</span><span style={{ color: 'var(--text-muted, #666)' }}>{vnd(p.amount)}</span>
                        </div>
                      ))}
                    </div>
                  )}
                </div>
              )}
            </div>
          )
        })}
      </div>
    </div>
  )
}

// Plain-language verdict for a shift's over/short. Over and short both need attention
// (amber / red); only a near-zero difference is "balanced" green.
function verdict(os: number) {
  if (Math.abs(os) < 1000) return { label: 'Balanced', headline: 'Till balances', color: '#1d7a46', bg: '#e7f5ec' }
  if (os < 0) return { label: 'Short', headline: 'Drawer is short', color: '#a32d2d', bg: '#fdecec' }
  return { label: 'Over', headline: 'Drawer is over — check cash sales', color: '#b8631c', bg: '#fdecdc' }
}

function Row({ label, value, bold, color }: { label: string; value: string; bold?: boolean; color?: string }) {
  return <div style={{ display: 'flex', justifyContent: 'space-between', padding: '5px 0', fontSize: 14, fontWeight: bold ? 700 : 400 }}>
    <span style={{ color: bold ? 'inherit' : 'var(--text-muted, #777)' }}>{label}</span><span style={{ color: color || 'inherit' }}>{value}</span>
  </div>
}

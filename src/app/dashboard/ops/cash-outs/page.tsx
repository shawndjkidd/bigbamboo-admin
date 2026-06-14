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
    }
    setLoading(false)
  }

  async function saveCashSales(id: string, value: string) {
    const v = value.trim() === '' ? 0 : Number(value.replace(/[^\d.]/g, ''))
    const { error } = await ops().rpc('set_shift_cash_sales', { p_shift: id, p_cash_sales: v })
    if (error) return
    await init()
  }

  if (loading) return <div style={{ color: 'var(--text-muted, #999)', fontSize: 14 }}>Loading…</div>
  if (!(role && canManageRecipes(role))) return <div style={{ color: 'var(--text-muted, #999)', fontSize: 14 }}>Managers only.</div>

  return (
    <div style={{ maxWidth: 720 }}>
      <h2 style={{ fontSize: 22, fontWeight: 600 }}>Cash-outs</h2>
      <div style={{ fontSize: 13, color: 'var(--text-muted, #999)', marginTop: 2, marginBottom: 18 }}>Cashier shift open/close counts, payouts and over/short. Cash sales come from Square card/cash data — if Square is behind, that figure may read low.</div>
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
                  : <span style={{ fontSize: 13, fontWeight: 700, color: os < 0 ? '#a32d2d' : '#1d7a46' }}>{os < 0 ? 'Short ' : os > 0 ? 'Over ' : ''}{vnd(Math.abs(os))}</span>}
              </div>
              {isOpen && (
                <div style={{ marginTop: 14 }}>
                  <Row label="Opening float" value={vnd(s.opening_total)} />
                  <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '5px 0', fontSize: 14 }}>
                    <span style={{ color: 'var(--text-muted, #777)' }}>Cash sales</span>
                    <span style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                      <input key={'cs' + s.id + s.cash_sales} defaultValue={s.cash_sales ?? ''} onBlur={e => e.target.value !== String(s.cash_sales ?? '') && saveCashSales(s.id, e.target.value)} inputMode="numeric" placeholder="0" style={{ width: 120, padding: '5px 8px', fontSize: 14, textAlign: 'right', border: '1px solid var(--border, #e5e5e5)', borderRadius: 6, background: 'var(--bg-card, #fff)', color: 'var(--text, #333)' }} />
                      <span style={{ color: 'var(--text-muted, #999)' }}>₫</span>
                    </span>
                  </div>
                  <Row label="Paid out" value={'– ' + vnd(s.payouts)} />
                  <Row label="Expected in till" value={vnd(s.expected)} bold />
                  <Row label="Counted in till" value={vnd(s.closing_total)} bold />
                  {closed && <Row label={os < 0 ? 'Short' : 'Over'} value={vnd(Math.abs(os))} color={os < 0 ? '#a32d2d' : '#1d7a46'} bold />}
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

function Row({ label, value, bold, color }: { label: string; value: string; bold?: boolean; color?: string }) {
  return <div style={{ display: 'flex', justifyContent: 'space-between', padding: '5px 0', fontSize: 14, fontWeight: bold ? 700 : 400 }}>
    <span style={{ color: bold ? 'inherit' : 'var(--text-muted, #777)' }}>{label}</span><span style={{ color: color || 'inherit' }}>{value}</span>
  </div>
}

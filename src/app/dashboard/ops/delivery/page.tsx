'use client'
import { useEffect, useState } from 'react'
import { ops, vnd, today, canManageRecipes, type StaffRole } from '@/lib/ops/api'
import { supabase } from '@/lib/supabase'

type Scan = {
  platform: string | null; period_start: string | null; period_end: string | null
  currency: string; gross_sales: number; commission: number; other_fees: number; net_payout: number
}

export default function DeliveryPage() {
  const [role, setRole] = useState<StaffRole | null>(null)
  const [venueId, setVenueId] = useState<string | null>(null)
  const [loading, setLoading] = useState(true)

  const [platform, setPlatform] = useState<'grab' | 'capichi'>('grab')
  const [scanning, setScanning] = useState(false)
  const [saving, setSaving] = useState(false)
  const [msg, setMsg] = useState<string | null>(null)

  // editable extracted fields
  const [gross, setGross] = useState('')
  const [commission, setCommission] = useState('')
  const [fees, setFees] = useState('')
  const [net, setNet] = useState('')
  const [bookDate, setBookDate] = useState('')
  const [recent, setRecent] = useState<any[]>([])

  useEffect(() => { init() }, [])
  async function init() {
    const { data: { session } } = await supabase.auth.getSession()
    const user = session?.user; if (!user) return
    const { data: su } = await supabase.from('staff_users').select('role').eq('email', user.email).maybeSingle()
    setRole((su?.role || 'staff') as StaffRole)
    const { data: venue } = await supabase.from('venues').select('id').eq('slug', 'bigbamboo').single()
    setVenueId(venue?.id || null)
    await loadRecent(venue?.id || null)
    setLoading(false)
  }
  async function loadRecent(vid: string | null) {
    if (!vid) return
    const { data } = await ops().from('sales_daily')
      .select('occurred_on, gross, source')
      .eq('venue_id', vid).in('source', ['grab', 'capichi'])
      .order('occurred_on', { ascending: false }).limit(12)
    setRecent(data || [])
  }

  const num = (s: string) => Number((s || '').replace(/[^\d]/g, '')) || 0

  async function onFile(e: React.ChangeEvent<HTMLInputElement>) {
    const f = e.target.files?.[0]; if (!f) return
    setMsg(null); setScanning(true)
    try {
      const dataUrl: string = await new Promise((res, rej) => {
        const r = new FileReader(); r.onload = () => res(String(r.result)); r.onerror = rej; r.readAsDataURL(f)
      })
      const resp = await fetch('/api/admin/ops/delivery-scan', {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ imageBase64: dataUrl, mimeType: f.type || 'image/jpeg', platform }),
      })
      const j = await resp.json()
      if (!resp.ok || !j.ok) { setMsg(j.error || 'Scan failed'); setScanning(false); return }
      const s = j as Scan
      setGross(String(s.gross_sales || ''))
      setCommission(String(s.commission || ''))
      setFees(String(s.other_fees || ''))
      setNet(String(s.net_payout || ''))
      setBookDate(s.period_end || lastMonthEnd())
      setMsg('Review the numbers below, then Save.')
    } catch (err: any) { setMsg('Could not read file: ' + (err?.message || err)) }
    setScanning(false)
  }

  async function save() {
    if (!venueId) return
    const g = num(gross), c = num(commission), fe = num(fees)
    if (!g) { setMsg('Enter gross sales'); return }
    if (!bookDate) { setMsg('Pick the statement date'); return }
    setSaving(true); setMsg(null)
    // Revenue → sales_daily (gross), one row per platform per date
    const { error: e1 } = await ops().from('sales_daily').upsert({
      venue_id: venueId, occurred_on: bookDate, gross: g, source: platform,
      notes: `${platform} delivery import`,
    }, { onConflict: 'venue_id,occurred_on,source' })
    if (e1) { setMsg('Revenue save failed: ' + e1.message); setSaving(false); return }
    // Commission + fees → purchases (delivery_commission)
    const totalFee = c + fe
    if (totalFee > 0) {
      const { error: e2 } = await ops().from('purchases').insert({
        venue_id: venueId, occurred_on: bookDate, category: 'delivery_commission', amount: totalFee,
        vendor: platform === 'grab' ? 'Grab' : 'Capichi',
        notes: `${platform} commission${fe ? ' + fees' : ''}`,
      })
      if (e2) { setMsg('Commission save failed: ' + e2.message); setSaving(false); return }
    }
    setSaving(false)
    setMsg(`✓ Booked ${vnd(g)} ${platform} revenue and ${vnd(totalFee)} commission for ${bookDate}.`)
    setGross(''); setCommission(''); setFees(''); setNet('')
    await loadRecent(venueId)
  }

  if (loading) return <div style={{ color: 'var(--text-muted, #999)', fontSize: 14 }}>Loading…</div>
  if (!(role && canManageRecipes(role))) return <div style={{ color: 'var(--text-muted, #999)', fontSize: 14 }}>Delivery import is managed by managers.</div>

  const g = num(gross), c = num(commission), fe = num(fees)
  const impliedNet = g - c - fe

  return (
    <div style={{ maxWidth: 560 }}>
      <h2 style={{ fontSize: 22, fontWeight: 600 }}>Delivery import (Grab / Capichi)</h2>
      <div style={{ fontSize: 13, color: 'var(--text-muted, #999)', marginTop: 2, marginBottom: 20 }}>
        Upload a monthly payout/sales statement. Delivery sales go into revenue; the platform commission books as an expense, so your P&amp;L shows both the top line and your real take-home.
      </div>

      <div style={{ display: 'flex', gap: 8, marginBottom: 16 }}>
        {(['grab', 'capichi'] as const).map(p => (
          <button key={p} onClick={() => setPlatform(p)} style={{
            padding: '8px 16px', borderRadius: 8, fontSize: 14, fontWeight: 600, cursor: 'pointer',
            border: '1px solid ' + (platform === p ? 'var(--accent, #e87830)' : 'var(--border, #e5e5e5)'),
            background: platform === p ? 'var(--accent, #e87830)' : 'transparent',
            color: platform === p ? '#fff' : 'var(--text, #333)',
          }}>{p === 'grab' ? 'Grab' : 'Capichi'}</button>
        ))}
      </div>

      <label style={{ display: 'block', marginBottom: 16 }}>
        <div style={lbl}>Upload {platform === 'grab' ? 'Grab' : 'Capichi'} statement (photo, screenshot or PDF page)</div>
        <input type="file" accept="image/*,application/pdf" capture="environment" onChange={onFile} disabled={scanning} style={{ ...inp, padding: 8 }} />
      </label>
      {scanning && <div style={{ fontSize: 13, color: 'var(--accent, #e87830)' }}>Reading the statement…</div>}

      <div style={{ display: 'grid', gap: 12, marginTop: 8 }}>
        <Field label="Gross delivery sales (VND)"><input inputMode="numeric" value={gross} onChange={e => setGross(e.target.value)} style={inp} placeholder="customer order value before commission" /></Field>
        <Field label="Platform commission (VND)"><input inputMode="numeric" value={commission} onChange={e => setCommission(e.target.value)} style={inp} /></Field>
        <Field label="Other fees (VND)"><input inputMode="numeric" value={fees} onChange={e => setFees(e.target.value)} style={inp} placeholder="ads, payment fees… (0 if none)" /></Field>
        <Field label="Statement date (books into this month)"><input type="date" value={bookDate} onChange={e => setBookDate(e.target.value)} style={inp} /></Field>
      </div>

      {(g > 0) && (
        <div style={{ fontSize: 13, color: 'var(--text-muted, #777)', marginTop: 12, padding: 10, border: '1px solid var(--border, #eee)', borderRadius: 8 }}>
          Revenue booked: <b>{vnd(g)}</b> · Commission expense: <b>{vnd(c + fe)}</b> · Implied net payout: <b>{vnd(impliedNet)}</b>
          {net && Math.abs(impliedNet - num(net)) > 1000 && <div style={{ color: 'var(--burgundy, #7b2d3a)', marginTop: 4 }}>⚠ Statement says net {vnd(num(net))} — figures don&apos;t fully reconcile, double-check.</div>}
        </div>
      )}

      <button onClick={save} disabled={saving || !g} style={{
        marginTop: 16, padding: '12px 18px', background: 'var(--accent, #e87830)', color: '#fff', border: 'none',
        borderRadius: 8, fontSize: 15, fontWeight: 600, cursor: saving ? 'wait' : 'pointer', opacity: (saving || !g) ? 0.6 : 1,
      }}>{saving ? 'Saving…' : 'Save to P&L'}</button>
      {msg && <div style={{ fontSize: 13, marginTop: 10, color: msg.startsWith('✓') ? '#548235' : 'var(--burgundy, #7b2d3a)' }}>{msg}</div>}

      {recent.length > 0 && (
        <div style={{ marginTop: 32 }}>
          <div style={lbl}>Recent delivery imports</div>
          <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 13 }}>
            <thead><tr style={{ background: 'var(--bg-sidebar, #fafafa)' }}>
              <th style={th}>Date</th><th style={th}>Platform</th><th style={{ ...th, textAlign: 'right' }}>Gross</th>
            </tr></thead>
            <tbody>
              {recent.map((r, i) => (
                <tr key={i} style={{ borderTop: '1px solid var(--border, #eee)' }}>
                  <td style={td}>{r.occurred_on}</td><td style={{ ...td, textTransform: 'capitalize' }}>{r.source}</td>
                  <td style={{ ...td, textAlign: 'right' }}>{vnd(r.gross)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  )
}

function lastMonthEnd() {
  const d = new Date(); d.setDate(0) // last day of previous month
  const tz = new Intl.DateTimeFormat('en-CA', { timeZone: 'Asia/Ho_Chi_Minh', year: 'numeric', month: '2-digit', day: '2-digit' })
  return tz.format(d)
}

const Field = ({ label, children }: { label: string; children: React.ReactNode }) => (
  <label style={{ display: 'block' }}><div style={lbl}>{label}</div>{children}</label>
)
const lbl = { fontSize: 11, fontWeight: 600, textTransform: 'uppercase' as const, letterSpacing: '0.06em', color: 'var(--text-muted, #999)', marginBottom: 4 }
const inp = { width: '100%', padding: '10px 12px', fontSize: 14, border: '1px solid var(--border, #e5e5e5)', borderRadius: 8, background: 'var(--bg-input, #fff)', color: 'var(--text, #333)', boxSizing: 'border-box' as const }
const th = { padding: '8px 12px', textAlign: 'left' as const, fontWeight: 600, fontSize: 11, textTransform: 'uppercase' as const, color: 'var(--text-muted, #999)', letterSpacing: '0.05em' }
const td = { padding: '8px 12px', color: 'var(--text, #333)' }

'use client'
import { useEffect, useState } from 'react'
import { ops, vnd, today } from '@/lib/ops/api'
import { supabase } from '@/lib/supabase'

type Row = { id: string; occurred_on: string; gross: number; tips: number | null; notes: string | null; source: string; created_at: string }

export default function DailySalesPage() {
  const [venueId, setVenueId] = useState<string | null>(null)
  const [recent, setRecent] = useState<Row[]>([])
  const [date, setDate]     = useState(today())
  const [gross, setGross]   = useState('')
  const [tips, setTips]     = useState('')
  const [notes, setNotes]   = useState('')
  const [saving, setSaving] = useState(false)
  const [msg, setMsg]       = useState<string | null>(null)

  useEffect(() => { init() }, [])

  async function init() {
    const { data: { user } } = await supabase.auth.getUser()
    if (!user) return
    const { data: su } = await supabase
      .from('staff_users')
      .select('venue_id, venue:venues(slug)')
      .eq('email', user.email)
      .single()
    setVenueId(su?.venue_id || null)
    await loadRecent(su?.venue_id)
  }

  async function loadRecent(vid: string | null | undefined) {
    if (!vid) return
    const { data } = await ops()
      .from('sales_daily')
      .select('id, occurred_on, gross, tips, notes, source, created_at')
      .eq('venue_id', vid)
      .eq('source', 'manual')
      .order('occurred_on', { ascending: false })
      .limit(10)
    setRecent((data as Row[]) || [])
  }

  async function save(e: React.FormEvent) {
    e.preventDefault()
    if (!venueId) return
    const g = Number(gross.replace(/[^\d]/g, ''))
    if (!g) { setMsg('Enter a sales amount'); return }
    setSaving(true)
    setMsg(null)
    const { error } = await ops().from('sales_daily').upsert({
      venue_id: venueId,
      occurred_on: date,
      gross: g,
      tips: tips ? Number(tips.replace(/[^\d]/g, '')) : 0,
      notes: notes || null,
      source: 'manual',
    }, { onConflict: 'venue_id,occurred_on,source' })
    setSaving(false)
    if (error) { setMsg(error.message); return }
    setMsg(`Saved ${vnd(g)} for ${date}`)
    setGross(''); setTips(''); setNotes('')
    await loadRecent(venueId)
  }

  return (
    <div style={{ maxWidth: 520 }}>
      <h2 style={{ fontSize: 22, fontWeight: 600, marginBottom: 4 }}>Daily Sales</h2>
      <div style={{ fontSize: 12, color: 'var(--text-muted, #999)', marginBottom: 24 }}>
        Enter the day's gross sales total. Updates today by default — change the date to log a different day.
      </div>

      <form onSubmit={save} style={{ display: 'grid', gap: 14 }}>
        <Field label="Date">
          <input type="date" value={date} onChange={e => setDate(e.target.value)} required style={inp} />
        </Field>
        <Field label="Gross sales (VND)">
          <input
            type="text" inputMode="numeric" placeholder="e.g. 7,500,000"
            value={gross} onChange={e => setGross(e.target.value)} required
            style={{ ...inp, fontSize: 18, fontWeight: 600 }}
          />
        </Field>
        <Field label="Tips (optional)">
          <input
            type="text" inputMode="numeric" placeholder="0"
            value={tips} onChange={e => setTips(e.target.value)} style={inp}
          />
        </Field>
        <Field label="Notes (optional)">
          <input
            type="text" placeholder="e.g. BIS deposit included; private event"
            value={notes} onChange={e => setNotes(e.target.value)} style={inp}
          />
        </Field>
        <button type="submit" disabled={saving} style={{
          padding: '12px 18px', background: 'var(--accent, #e87830)', color: '#fff',
          border: 'none', borderRadius: 6, fontSize: 15, fontWeight: 600, cursor: saving ? 'wait' : 'pointer',
          opacity: saving ? 0.6 : 1,
        }}>{saving ? 'Saving…' : 'Save sales'}</button>
        {msg && <div style={{ fontSize: 13, color: msg.startsWith('Saved') ? '#548235' : '#C00000' }}>{msg}</div>}
      </form>

      <div style={{ marginTop: 40 }}>
        <h3 style={{ fontSize: 13, fontWeight: 600, textTransform: 'uppercase', letterSpacing: '0.05em', color: 'var(--text-muted, #999)', marginBottom: 8 }}>
          Last 10 days
        </h3>
        <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 13 }}>
          <thead><tr style={{ background: 'var(--bg-sidebar, #fafafa)' }}>
            <th style={th}>Date</th><th style={{ ...th, textAlign: 'right' }}>Gross</th><th style={{ ...th, textAlign: 'right' }}>Tips</th>
          </tr></thead>
          <tbody>
            {recent.length === 0 && <tr><td colSpan={3} style={{ padding: 12, color: 'var(--text-muted, #999)' }}>No entries yet.</td></tr>}
            {recent.map(r => (
              <tr key={r.id} style={{ borderTop: '1px solid var(--border, #eee)' }}>
                <td style={td}>{r.occurred_on}</td>
                <td style={{ ...td, textAlign: 'right' }}>{vnd(r.gross)}</td>
                <td style={{ ...td, textAlign: 'right', color: 'var(--text-muted, #999)' }}>{vnd(r.tips || 0)}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  )
}

const Field = ({ label, children }: { label: string; children: React.ReactNode }) => (
  <label style={{ display: 'block' }}>
    <div style={{ fontSize: 11, fontWeight: 600, textTransform: 'uppercase', letterSpacing: '0.06em', color: 'var(--text-muted, #999)', marginBottom: 4 }}>{label}</div>
    {children}
  </label>
)

const inp = { width: '100%', padding: '10px 12px', fontSize: 14, border: '1px solid var(--border, #e5e5e5)', borderRadius: 6, background: 'var(--bg-card, #fff)', color: 'var(--text, #333)' }
const th  = { padding: '8px 12px', textAlign: 'left' as const, fontWeight: 600, fontSize: 11, textTransform: 'uppercase' as const, color: 'var(--text-muted, #999)', letterSpacing: '0.05em' }
const td  = { padding: '8px 12px', color: 'var(--text, #333)' }

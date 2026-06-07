'use client'
import { useEffect, useState } from 'react'
import { ops, vnd, today } from '@/lib/ops/api'
import { supabase } from '@/lib/supabase'

const CATEGORIES = [
  { v: 'food', label: 'Food' },
  { v: 'mixer', label: 'Non-Alcoholic / Mixer' },
  { v: 'beer', label: 'Beer' },
  { v: 'wine', label: 'Wine' },
  { v: 'liquor', label: 'Liquor' },
  { v: 'garnish', label: 'Garnish' },
  { v: 'consumable', label: 'Consumables (napkins, cleaning, etc.)' },
  { v: 'utilities', label: 'Utilities (power, water, internet)' },
  { v: 'rent', label: 'Rent' },
  { v: 'marketing', label: 'Marketing' },
  { v: 'repairs', label: 'Repairs / Maintenance' },
  { v: 'capex', label: 'CapEx / Equipment (depreciated)' },
  { v: 'other_opex', label: 'Other Operating' },
]

type Row = {
  id: string; occurred_on: string; vendor: string | null; category: string; amount: number;
  notes: string | null; receipt_url: string | null; created_at: string
}

export default function PurchasePage() {
  const [venueId, setVenueId] = useState<string | null>(null)
  const [recent, setRecent]   = useState<Row[]>([])
  const [vendors, setVendors] = useState<string[]>([])
  const [cats, setCats] = useState<{ key: string; label: string }[]>([])
  const [date, setDate]       = useState(today())
  const [vendor, setVendor]   = useState('')
  const [category, setCategory] = useState('food')
  const [amount, setAmount]   = useState('')
  const [notes, setNotes]     = useState('')
  const [receipt, setReceipt] = useState<File | null>(null)
  const [saving, setSaving]   = useState(false)
  const [msg, setMsg]         = useState<string | null>(null)

  useEffect(() => { init() }, [])

  async function init() {
    const { data: { session } } = await supabase.auth.getSession()

    const user = session?.user
    if (!user) return
    const { data: venue } = await supabase.from('venues').select('id').eq('slug', 'bigbamboo').single()
    const vid = venue?.id || null
    setVenueId(vid)
    await loadRecent(vid)
    // Vendor pick-list: existing vendor records + suppliers already on ingredients
    const [{ data: vrows }, { data: irows }] = await Promise.all([
      ops().from('vendors').select('name'),
      ops().from('ingredients').select('supplier'),
    ])
    const names = new Set<string>()
    ;(vrows || []).forEach((v: any) => v.name && names.add(String(v.name).trim()))
    ;(irows || []).forEach((i: any) => i.supplier && names.add(String(i.supplier).trim()))
    setVendors(Array.from(names).sort((a, b) => a.localeCompare(b)))
    const { data: cs } = await ops().from('expense_categories').select('key,label').eq('active', true).order('sort_order')
    if (cs && cs.length) setCats(cs as any)
  }

  async function loadRecent(vid: string | null | undefined) {
    if (!vid) return
    const { data } = await ops()
      .from('purchases')
      .select('id, occurred_on, vendor, category, amount, notes, receipt_url, created_at')
      .eq('venue_id', vid)
      .order('created_at', { ascending: false })
      .limit(10)
    setRecent((data as Row[]) || [])
  }

  async function uploadReceipt(file: File, venueId: string): Promise<string | null> {
    const ext = file.name.split('.').pop()?.toLowerCase() || 'jpg'
    const path = `${venueId}/${today()}/${crypto.randomUUID()}.${ext}`
    const { error } = await supabase.storage.from('ops-receipts').upload(path, file, {
      contentType: file.type, upsert: false,
    })
    if (error) { setMsg('Receipt upload failed: ' + error.message); return null }
    const { data } = supabase.storage.from('ops-receipts').getPublicUrl(path)
    return data.publicUrl
  }

  async function save(e: React.FormEvent) {
    e.preventDefault()
    if (!venueId) return
    const amt = Number(amount.replace(/[^\d]/g, ''))
    if (!amt) { setMsg('Enter an amount'); return }
    setSaving(true)
    setMsg(null)

    let receiptUrl: string | null = null
    if (receipt) {
      receiptUrl = await uploadReceipt(receipt, venueId)
      if (!receiptUrl) { setSaving(false); return }
    }

    const { error } = await ops().from('purchases').insert({
      venue_id: venueId,
      occurred_on: date,
      vendor: vendor || null,
      category,
      amount: amt,
      notes: notes || null,
      receipt_url: receiptUrl,
    })
    setSaving(false)
    if (error) { setMsg(error.message); return }
    setMsg(`Saved ${vnd(amt)} — ${category}`)
    setVendor(''); setAmount(''); setNotes(''); setReceipt(null)
    await loadRecent(venueId)
  }

  return (
    <div style={{ maxWidth: 520 }}>
      <h2 style={{ fontSize: 22, fontWeight: 600, marginBottom: 4 }}>Add Purchase</h2>
      <div style={{ fontSize: 12, color: 'var(--text-muted, #999)', marginBottom: 24 }}>
        Log money out — groceries, alcohol, utilities, equipment. Snap the receipt if you have it.
      </div>
      <div style={{ marginBottom: 20 }}>
        <a href="/dashboard/ops/invoice" style={{ fontSize: 13, color: 'var(--accent, #e87830)', textDecoration: 'none' }}>📷 Scan an invoice instead — auto-update ingredient costs →</a>
      </div>

      <form onSubmit={save} style={{ display: 'grid', gap: 14 }}>
        <Field label="Date">
          <input type="date" value={date} onChange={e => setDate(e.target.value)} required style={inp} />
        </Field>
        <Field label="Vendor">
          <input type="text" list="vendor-list" value={vendor} onChange={e => setVendor(e.target.value)} placeholder="Pick or type a vendor…" style={inp} />
          <datalist id="vendor-list">
            {vendors.map(v => <option key={v} value={v} />)}
          </datalist>
          <div style={{ fontSize: 11, marginTop: 4 }}>
            <a href="/dashboard/ops/ingredients?view=vendors" style={{ color: 'var(--accent, #e87830)', textDecoration: 'none' }}>+ Add / manage vendors</a>
          </div>
        </Field>
        <Field label="Category">
          <select value={category} onChange={e => setCategory(e.target.value)} style={inp}>
            {(cats.length ? cats : CATEGORIES.map(c => ({ key: c.v, label: c.label }))).map(c => <option key={c.key} value={c.key}>{c.label}</option>)}
          </select>
        </Field>
        <Field label="Amount (VND)">
          <input
            type="text" inputMode="numeric" placeholder="e.g. 1,500,000"
            value={amount} onChange={e => setAmount(e.target.value)} required
            style={{ ...inp, fontSize: 18, fontWeight: 600 }}
          />
        </Field>
        <Field label="Notes (optional)">
          <input type="text" placeholder="What was it? Brand, qty, etc." value={notes} onChange={e => setNotes(e.target.value)} style={inp} />
        </Field>
        <Field label="Receipt photo (optional)">
          <input
            type="file" accept="image/*" capture="environment"
            onChange={e => setReceipt(e.target.files?.[0] || null)}
            style={{ ...inp, padding: 8 }}
          />
        </Field>
        <button type="submit" disabled={saving} style={{
          padding: '12px 18px', background: 'var(--accent, #e87830)', color: '#fff',
          border: 'none', borderRadius: 6, fontSize: 15, fontWeight: 600, cursor: saving ? 'wait' : 'pointer',
          opacity: saving ? 0.6 : 1,
        }}>{saving ? 'Saving…' : 'Save purchase'}</button>
        {msg && <div style={{ fontSize: 13, color: msg.startsWith('Saved') ? '#548235' : '#C00000' }}>{msg}</div>}
      </form>

      <div style={{ marginTop: 40 }}>
        <h3 style={{ fontSize: 13, fontWeight: 600, textTransform: 'uppercase', letterSpacing: '0.05em', color: 'var(--text-muted, #999)', marginBottom: 8 }}>
          Last 10 purchases
        </h3>
        <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 13 }}>
          <thead><tr style={{ background: 'var(--bg-sidebar, #fafafa)' }}>
            <th style={th}>Date</th><th style={th}>Vendor</th><th style={th}>Cat</th><th style={{ ...th, textAlign: 'right' }}>Amount</th>
          </tr></thead>
          <tbody>
            {recent.length === 0 && <tr><td colSpan={4} style={{ padding: 12, color: 'var(--text-muted, #999)' }}>No entries yet.</td></tr>}
            {recent.map(r => (
              <tr key={r.id} style={{ borderTop: '1px solid var(--border, #eee)' }}>
                <td style={td}>{r.occurred_on}</td>
                <td style={{ ...td, color: 'var(--text-muted, #666)' }}>{r.vendor || '—'}</td>
                <td style={{ ...td, fontSize: 11, color: 'var(--text-muted, #999)' }}>{r.category}</td>
                <td style={{ ...td, textAlign: 'right' }}>{vnd(r.amount)}</td>
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

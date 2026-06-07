'use client'
import { useEffect, useState } from 'react'
import { ops, canManageRecipes, type StaffRole } from '@/lib/ops/api'
import { supabase } from '@/lib/supabase'

const BUCKETS = [
  { v: 'cogs', label: 'Cost of goods' },
  { v: 'opex', label: 'Operating expense' },
  { v: 'capex', label: 'Equipment (CapEx)' },
]
const bucketLabel = (b: string) => BUCKETS.find(x => x.v === b)?.label || b
const slug = (s: string) => s.toLowerCase().replace(/[^a-z0-9]+/g, '_').replace(/^_|_$/g, '')

type Cat = { id: string; key: string; label: string; bucket: string; active: boolean; sort_order: number }

export default function CategoriesPage() {
  const [role, setRole] = useState<StaffRole | null>(null)
  const [venueId, setVenueId] = useState<string | null>(null)
  const [cats, setCats] = useState<Cat[]>([])
  const [loading, setLoading] = useState(true)
  const [newLabel, setNewLabel] = useState('')
  const [newBucket, setNewBucket] = useState('cogs')
  const [msg, setMsg] = useState<string | null>(null)

  useEffect(() => { init() }, [])
  async function init() {
    const { data: { session } } = await supabase.auth.getSession()
    const user = session?.user; if (!user) return
    const { data: su } = await supabase.from('staff_users').select('role').eq('email', user.email).maybeSingle()
    setRole((su?.role || 'staff') as StaffRole)
    const { data: venue } = await supabase.from('venues').select('id').eq('slug', 'bigbamboo').single()
    setVenueId(venue?.id || null)
    await load()
  }
  async function load() {
    setLoading(true)
    const { data } = await ops().from('expense_categories').select('*').order('sort_order')
    setCats((data as Cat[]) || []); setLoading(false)
  }

  async function add() {
    if (!venueId || !newLabel.trim()) return
    setMsg(null)
    const key = slug(newLabel)
    if (!key) { setMsg('Give it a proper name'); return }
    if (cats.some(c => c.key === key)) { setMsg('That category already exists'); return }
    const { error } = await ops().from('expense_categories').insert({
      venue_id: venueId, key, label: newLabel.trim(), bucket: newBucket, sort_order: (cats.reduce((m, c) => Math.max(m, c.sort_order), 0) + 1),
    })
    if (error) { setMsg(error.message); return }
    setNewLabel('')
    await load()
  }
  async function toggleActive(c: Cat) {
    await ops().from('expense_categories').update({ active: !c.active }).eq('id', c.id)
    await load()
  }
  async function setBucket(c: Cat, bucket: string) {
    await ops().from('expense_categories').update({ bucket }).eq('id', c.id)
    await load()
  }

  if (loading) return <div style={{ color: 'var(--text-muted, #999)', fontSize: 14 }}>Loading…</div>
  const canManage = role && canManageRecipes(role)
  if (!canManage) return <div style={{ color: 'var(--text-muted, #999)', fontSize: 14 }}>Categories are managed by managers.</div>

  return (
    <div style={{ maxWidth: 680 }}>
      <h2 style={{ fontSize: 22, fontWeight: 600 }}>Purchase categories</h2>
      <div style={{ fontSize: 13, color: 'var(--text-muted, #999)', marginTop: 2, marginBottom: 20 }}>
        These power the dropdowns on Add Purchase &amp; Scan Invoice, and tell the P&amp;L how to bucket each spend.
      </div>

      <div className="card" style={{ padding: 16, marginBottom: 20 }}>
        <div style={{ fontSize: 12, fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.06em', color: 'var(--text-muted, #999)', marginBottom: 10 }}>Add a category</div>
        <div style={{ display: 'flex', gap: 10, alignItems: 'flex-end', flexWrap: 'wrap' }}>
          <div style={{ flex: 1, minWidth: 180 }}><label className="label">Name</label><input value={newLabel} onChange={e => setNewLabel(e.target.value)} style={inp} placeholder="e.g. Ice, Cleaning, Entertainment" /></div>
          <div><label className="label">Bucket</label><select value={newBucket} onChange={e => setNewBucket(e.target.value)} style={inp}>{BUCKETS.map(b => <option key={b.v} value={b.v}>{b.label}</option>)}</select></div>
          <button onClick={add} style={btnPrimary}>Add</button>
        </div>
        {msg && <div style={{ fontSize: 12, color: 'var(--burgundy, #7b2d3a)', marginTop: 8 }}>{msg}</div>}
      </div>

      <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 14 }}>
        <thead><tr style={{ background: 'var(--bg-sidebar, #fafafa)' }}>
          <th style={th}>Category</th><th style={th}>Bucket</th><th style={th}>Status</th><th style={th}></th>
        </tr></thead>
        <tbody>
          {cats.map(c => (
            <tr key={c.id} style={{ borderTop: '1px solid var(--border, #eee)', opacity: c.active ? 1 : 0.5 }}>
              <td style={{ ...td, fontWeight: 600 }}>{c.label}</td>
              <td style={td}>
                <select value={c.bucket} onChange={e => setBucket(c, e.target.value)} style={{ ...inp, width: 'auto', padding: '4px 8px' }}>{BUCKETS.map(b => <option key={b.v} value={b.v}>{b.label}</option>)}</select>
              </td>
              <td style={{ ...td, color: c.active ? '#6b7280' : 'var(--text-muted, #999)' }}>{c.active ? 'Active' : 'Hidden'}</td>
              <td style={{ ...td, textAlign: 'right' }}>
                <button onClick={() => toggleActive(c)} style={btnLink}>{c.active ? 'Hide' : 'Show'}</button>
              </td>
            </tr>
          ))}
        </tbody>
      </table>
      <div style={{ fontSize: 12, color: 'var(--text-muted, #999)', marginTop: 10 }}>Hiding a category removes it from the dropdowns but keeps it on past purchases, so your old P&amp;L months stay correct.</div>
    </div>
  )
}

const inp = { width: '100%', padding: '10px 12px', fontSize: 14, border: '1px solid var(--border, #e5e5e5)', borderRadius: 8, background: 'var(--bg-input, #fff)', color: 'var(--text, #333)', boxSizing: 'border-box' as const }
const th = { padding: '8px 12px', textAlign: 'left' as const, fontWeight: 600, fontSize: 11, textTransform: 'uppercase' as const, color: 'var(--text-muted, #999)', letterSpacing: '0.05em' }
const td = { padding: '10px 12px', color: 'var(--text, #333)' }
const btnPrimary = { padding: '10px 16px', background: 'var(--accent, #e87830)', color: '#fff', border: 'none', borderRadius: 8, fontSize: 14, fontWeight: 600, cursor: 'pointer' }
const btnLink = { padding: '4px 8px', background: 'transparent', color: 'var(--burgundy, #7b2d3a)', border: 'none', cursor: 'pointer', fontSize: 13 }

'use client'
import { useEffect, useState } from 'react'
import { useRouter } from 'next/navigation'
import { ops } from '@/lib/ops/api'
import { supabase } from '@/lib/supabase'

const RECIPE_TYPES = [
  { v: 'menu_item', label: 'Menu item (something you sell)' },
  { v: 'batch', label: 'Batch / Keg (something you build, then serve)' },
  { v: 'sub_recipe', label: 'Sub-recipe (used inside other recipes — e.g. syrup)' },
]
const CATEGORIES = ['cocktail', 'beer', 'wine', 'na_drink', 'food', 'snack', 'syrup', 'garnish', 'other']
const BASE_UNITS = ['ml', 'g', 'each']

export default function NewRecipePage() {
  const router = useRouter()
  const [venueId, setVenueId] = useState<string | null>(null)
  const [name, setName] = useState('')
  const [type, setType] = useState('menu_item')
  const [category, setCategory] = useState('cocktail')
  const [yieldQty, setYieldQty] = useState('1')
  const [yieldUnit, setYieldUnit] = useState('each')
  const [salePrice, setSalePrice] = useState('')
  const [isKegged, setIsKegged] = useState(false)
  const [kegSize, setKegSize] = useState('5000')
  const [pourSize, setPourSize] = useState('100')
  const [description, setDescription] = useState('')
  const [saving, setSaving] = useState(false)
  const [msg, setMsg] = useState<string | null>(null)

  useEffect(() => {
    (async () => {
      const { data: venue } = await supabase.from('venues').select('id').eq('slug', 'bigbamboo').single()
      setVenueId(venue?.id || null)
    })()
  }, [])

  async function save(e: React.FormEvent) {
    e.preventDefault()
    if (!venueId || !name) return
    setSaving(true); setMsg(null)
    const { data, error } = await ops().from('recipes').insert({
      venue_id: venueId, name, type, category,
      yield_qty: Number(yieldQty), yield_unit: yieldUnit,
      sale_price: type === 'menu_item' && salePrice ? Number(salePrice.replace(/[^\d]/g, '')) : null,
      is_kegged: isKegged,
      keg_size_ml: isKegged ? Number(kegSize) : null,
      pour_size_ml: isKegged ? Number(pourSize) : null,
      description: description || null,
    }).select('id').single()
    setSaving(false)
    if (error) { setMsg(error.message); return }
    router.push(`/dashboard/ops/recipes/${data.id}`)
  }

  return (
    <div style={{ maxWidth: 560 }}>
      <h2 style={{ fontSize: 22, fontWeight: 600, marginBottom: 4 }}>New Recipe</h2>
      <div style={{ fontSize: 12, color: 'var(--text-muted, #999)', marginBottom: 24 }}>
        Start by naming the recipe and setting the basics. You'll add ingredients on the next screen.
      </div>

      <form onSubmit={save} style={{ display: 'grid', gap: 14 }}>
        <Field label="Name">
          <input type="text" required value={name} onChange={e => setName(e.target.value)} placeholder="e.g. Mojito, House Simple Syrup, Mojito Keg" style={inp} />
        </Field>

        <Field label="Type">
          <select value={type} onChange={e => setType(e.target.value)} style={inp}>
            {RECIPE_TYPES.map(t => <option key={t.v} value={t.v}>{t.label}</option>)}
          </select>
        </Field>

        <Field label="Category">
          <select value={category} onChange={e => setCategory(e.target.value)} style={inp}>
            {CATEGORIES.map(c => <option key={c} value={c}>{c}</option>)}
          </select>
        </Field>

        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 8 }}>
          <Field label="Yield qty">
            <input type="number" step="0.0001" required value={yieldQty} onChange={e => setYieldQty(e.target.value)} style={inp} />
          </Field>
          <Field label="Yield unit">
            <select value={yieldUnit} onChange={e => setYieldUnit(e.target.value)} style={inp}>
              {BASE_UNITS.map(u => <option key={u} value={u}>{u}</option>)}
            </select>
          </Field>
        </div>
        <div style={{ fontSize: 11, color: 'var(--text-muted, #999)', marginTop: -8 }}>
          How much one execution produces. Menu item: usually 1 each. Keg: e.g. 5000 ml. Syrup batch: e.g. 500 ml.
        </div>

        {type === 'menu_item' && (
          <Field label="Sale price (VND)">
            <input type="text" inputMode="numeric" value={salePrice} onChange={e => setSalePrice(e.target.value)} placeholder="120,000" style={inp} />
          </Field>
        )}

        <label style={{ display: 'flex', alignItems: 'center', gap: 8, fontSize: 13, color: 'var(--text, #333)' }}>
          <input type="checkbox" checked={isKegged} onChange={e => setIsKegged(e.target.checked)} />
          This recipe is kegged / batched (you build a batch, then pour from it)
        </label>

        {isKegged && (
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 8 }}>
            <Field label="Keg size (ml)">
              <input type="number" value={kegSize} onChange={e => setKegSize(e.target.value)} style={inp} />
            </Field>
            <Field label="Pour size (ml)">
              <input type="number" value={pourSize} onChange={e => setPourSize(e.target.value)} style={inp} />
            </Field>
          </div>
        )}

        <Field label="Description (optional)">
          <textarea value={description} onChange={e => setDescription(e.target.value)} rows={2} style={{ ...inp, resize: 'vertical', fontFamily: 'inherit' }} />
        </Field>

        <div style={{ display: 'flex', gap: 8, justifyContent: 'flex-end', marginTop: 8 }}>
          <button type="button" onClick={() => router.push('/dashboard/ops/recipes')} style={btnSecondary}>Cancel</button>
          <button type="submit" disabled={saving || !venueId} style={btnPrimary}>{saving ? 'Saving…' : 'Create & add ingredients →'}</button>
        </div>
        {msg && <div style={{ fontSize: 13, color: '#C00000' }}>{msg}</div>}
      </form>
    </div>
  )
}

const Field = ({ label, children }: { label: string; children: React.ReactNode }) => (
  <label style={{ display: 'block' }}>
    <div style={{ fontSize: 11, fontWeight: 600, textTransform: 'uppercase', letterSpacing: '0.06em', color: 'var(--text-muted, #999)', marginBottom: 4 }}>{label}</div>
    {children}
  </label>
)

const inp = { width: '100%', padding: '10px 12px', fontSize: 14, border: '1px solid var(--border, #e5e5e5)', borderRadius: 6, background: 'var(--bg-card, #fff)', color: 'var(--text, #333)', boxSizing: 'border-box' as const }
const btnPrimary = { padding: '10px 16px', background: 'var(--accent, #e87830)', color: '#fff', border: 'none', borderRadius: 6, fontSize: 14, fontWeight: 600, cursor: 'pointer' }
const btnSecondary = { padding: '10px 16px', background: 'transparent', color: 'var(--text-muted, #666)', border: '1px solid var(--border, #e5e5e5)', borderRadius: 6, fontSize: 14, cursor: 'pointer' }

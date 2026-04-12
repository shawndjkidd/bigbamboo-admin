'use client'
import { useEffect, useState } from 'react'
import { supabase, MenuItem } from '@/lib/supabase'

const SECTIONS = [
  { key: 'cocktails', label: 'Cocktails' },
  { key: 'beer', label: 'Beer' },
  { key: 'na', label: 'Non-Alcoholic' },
  { key: 'bites', label: 'Bar Bites' },
  { key: 'special_events', label: 'Special Events' },
]

const TAG_PRESETS: Record<string, { label: string, color: string }[]> = {
  cocktails: [{ label: 'Bestseller', color: 'orange' }, { label: 'New', color: 'blue' }, { label: 'Craft', color: 'blue' }, { label: 'Drink Wisely', color: 'red' }, { label: 'Limited', color: 'orange' }],
  beer: [{ label: 'Bestseller', color: 'orange' }, { label: 'Local', color: 'orange' }, { label: 'Limited', color: 'orange' }, { label: 'New', color: 'blue' }],
  na: [{ label: 'Bestseller', color: 'orange' }, { label: 'No Alcohol', color: 'blue' }, { label: 'New', color: 'blue' }],
  bites: [{ label: "Chef's Pick", color: 'orange' }, { label: 'Crowd Pleaser', color: 'orange' }, { label: 'Bestseller', color: 'orange' }, { label: 'New', color: 'blue' }, { label: 'Vegan', color: 'green' }, { label: 'Spicy', color: 'red' }],
  special_events: [{ label: 'Featured', color: 'orange' }, { label: 'Limited', color: 'orange' }, { label: 'New', color: 'blue' }, { label: 'Seasonal', color: 'green' }, { label: 'Premium', color: 'red' }],
}

function tagStyle(color: string, on: boolean) {
  if (!on) return { background: 'var(--bg-hover)', color: 'var(--text-muted)', border: '1px solid var(--border)' }
  const map: any = {
    orange: { background: 'var(--badge-orange-bg)', color: 'var(--badge-orange-text)', border: '1px solid var(--badge-orange-border)' },
    blue: { background: 'var(--badge-blue-bg)', color: 'var(--badge-blue-text)', border: '1px solid var(--badge-blue-border)' },
    green: { background: 'var(--badge-green-bg)', color: 'var(--badge-green-text)', border: '1px solid var(--badge-green-border)' },
    red: { background: 'var(--badge-red-bg)', color: 'var(--badge-red-text)', border: '1px solid var(--badge-red-border)' },
  }
  return map[color] || map.orange
}

function parseSizes(priceStr: string): { size: string, price: string }[] {
  if (!priceStr || !priceStr.includes('/')) return [{ size: '', price: priceStr || '' }]
  return priceStr.split('/').map(p => {
    const colon = p.indexOf(':')
    if (colon > -1) return { size: p.slice(0, colon).trim(), price: p.slice(colon + 1).trim() }
    return { size: '', price: p.trim() }
  })
}

function formatSizes(sizes: { size: string, price: string }[]): string {
  const filled = sizes.filter(s => s.price.trim())
  if (filled.length === 0) return ''
  if (filled.length === 1 && !filled[0].size) return filled[0].price
  return filled.map(s => s.size ? `${s.size}: ${s.price}` : s.price).join(' / ')
}

function BeerPriceEditor({ value, onChange }: { value: string, onChange: (v: string) => void }) {
  const [sizes, setSizes] = useState<{ size: string, price: string }[]>(() => parseSizes(value))
  function update(newSizes: { size: string, price: string }[]) { setSizes(newSizes); onChange(formatSizes(newSizes)) }
  function addRow() { update([...sizes, { size: '', price: '' }]) }
  function removeRow(i: number) { update(sizes.filter((_, idx) => idx !== i)) }
  function setRow(i: number, field: 'size' | 'price', val: string) { update(sizes.map((s, idx) => idx === i ? { ...s, [field]: val } : s)) }

  return (
    <div>
      <label className="label">Sizes & Prices</label>
      <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
        {sizes.map((s, i) => (
          <div key={i} style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
            <input className="input" value={s.size} onChange={e => setRow(i, 'size', e.target.value)} placeholder="e.g. Small, 330ml" style={{ width: 140, flexShrink: 0 }} />
            <input className="input" value={s.price} onChange={e => setRow(i, 'price', e.target.value)} placeholder="45,000" style={{ flex: 1, fontFamily: 'DM Mono, monospace' }} />
            {sizes.length > 1 && (
              <button onClick={() => removeRow(i)} className="btn-red" style={{ width: 32, height: 32, padding: 0, display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0, fontSize: 14 }}>x</button>
            )}
          </div>
        ))}
        <button onClick={addRow} className="btn-outline" style={{ fontSize: 12, padding: '6px 12px' }}>+ Add Size</button>
      </div>
      {sizes.length > 0 && formatSizes(sizes) && (
        <div style={{ fontSize: 12, color: 'var(--text-muted)', marginTop: 6, fontFamily: 'DM Mono, monospace' }}>Preview: {formatSizes(sizes)}</div>
      )}
    </div>
  )
}

export default function MenuPage() {
  const [section, setSection] = useState('cocktails')
  const [items, setItems] = useState<MenuItem[]>([])
  const [loading, setLoading] = useState(true)
  const [saving, setSaving] = useState<string | null>(null)
  const [toast, setToast] = useState('')
  const [showAdd, setShowAdd] = useState(false)
  const [newItem, setNewItem] = useState({ name: '', subtitle: '', description: '', price: 'TBA', abv: '', tags: [] as string[], is_draft: false })

  useEffect(() => { loadItems() }, [section])

  async function loadItems() {
    setLoading(true)
    const { data } = await supabase.from('menu_items').select('*').eq('section', section).order('sort_order')
    setItems(data || [])
    setLoading(false)
  }

  async function updateItem(id: string, changes: Partial<MenuItem>) {
    setSaving(id)
    await supabase.from('menu_items').update({ ...changes, updated_at: new Date().toISOString() }).eq('id', id)
    setItems(prev => prev.map(i => i.id === id ? { ...i, ...changes } : i))
    setSaving(null)
    showToast('Saved')
  }

  async function addItem() {
    if (!newItem.name) return
    const { data } = await supabase.from('menu_items').insert({ ...newItem, section, sort_order: items.length + 1 }).select().single()
    if (data) { setItems(prev => [...prev, data]); setNewItem({ name: '', subtitle: '', description: '', price: 'TBA', abv: '', tags: [], is_draft: false }); setShowAdd(false); showToast('Item added') }
  }

  async function deleteItem(id: string) {
    if (!confirm('Remove this item?')) return
    await supabase.from('menu_items').delete().eq('id', id)
    setItems(prev => prev.filter(i => i.id !== id))
    showToast('Removed')
  }

  function showToast(msg: string) { setToast(msg); setTimeout(() => setToast(''), 2500) }
  function toggleTag(item: MenuItem, tag: string) {
    const tags = item.tags.includes(tag) ? item.tags.filter(t => t !== tag) : [...item.tags, tag]
    updateItem(item.id, { tags })
  }

  return (
    <div style={{ maxWidth: 900 }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 28 }}>
        <div>
          <div className="page-title">Menu</div>
          <div style={{ fontSize: 14, color: 'var(--text-muted)', marginTop: 4 }}>{items.length} items in {SECTIONS.find(s => s.key === section)?.label}</div>
        </div>
        <button className="btn-accent" onClick={() => setShowAdd(!showAdd)} style={{ fontSize: 14 }}>+ Add Item</button>
      </div>

      {/* Section tabs */}
      <div style={{ display: 'flex', gap: 8, marginBottom: 24 }}>
        {SECTIONS.map(s => (
          <button key={s.key} onClick={() => setSection(s.key)} style={{
            padding: '10px 20px', borderRadius: 100, fontSize: 14, fontWeight: 500, cursor: 'pointer', transition: 'all 0.15s',
            background: section === s.key ? 'var(--accent)' : 'transparent',
            color: section === s.key ? '#fff' : 'var(--text-secondary)',
            border: `1px solid ${section === s.key ? 'var(--accent)' : 'var(--border)'}`,
          }}>
            {s.label}
          </button>
        ))}
      </div>

      {/* Add item form */}
      {showAdd && (
        <div className="card" style={{ padding: 24, marginBottom: 24, borderColor: 'var(--accent)', borderStyle: 'dashed' }}>
          <div className="section-title" style={{ color: 'var(--accent)', marginBottom: 18 }}>New Item</div>
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 14, marginBottom: 14 }}>
            <div><label className="label">Name</label><input className="input" value={newItem.name} onChange={e => setNewItem(p => ({ ...p, name: e.target.value }))} placeholder="Item name" /></div>
            <div><label className="label">Subtitle</label><input className="input" value={newItem.subtitle} onChange={e => setNewItem(p => ({ ...p, subtitle: e.target.value }))} placeholder="e.g. Pulled Pork Slamwich" /></div>
          </div>
          {section === 'beer' ? (
            <div style={{ marginBottom: 14 }}><BeerPriceEditor value={newItem.price === 'TBA' ? '' : newItem.price} onChange={v => setNewItem(p => ({ ...p, price: v || 'TBA' }))} /></div>
          ) : (
            <div style={{ display: 'grid', gridTemplateColumns: '140px 1fr 80px', gap: 14, marginBottom: 14 }}>
              <div><label className="label">Price</label><input className="input" value={newItem.price} onChange={e => setNewItem(p => ({ ...p, price: e.target.value }))} placeholder="TBA" /></div>
              <div><label className="label">Description</label><input className="input" value={newItem.description} onChange={e => setNewItem(p => ({ ...p, description: e.target.value }))} placeholder="Short punchy description" /></div>
              {section !== 'bites' && section !== 'special_events' && <div><label className="label">ABV</label><input className="input" value={newItem.abv} onChange={e => setNewItem(p => ({ ...p, abv: e.target.value }))} placeholder="~8%" /></div>}
            </div>
          )}
          <div style={{ display: 'flex', gap: 12, alignItems: 'center' }}>
            {section !== 'bites' && section !== 'special_events' && (
              <label style={{ display: 'flex', alignItems: 'center', gap: 8, fontSize: 14, color: 'var(--text-secondary)', cursor: 'pointer' }}>
                <input type="checkbox" checked={newItem.is_draft} onChange={e => setNewItem(p => ({ ...p, is_draft: e.target.checked }))} style={{ accentColor: 'var(--accent)' }} /> On Tap
              </label>
            )}
            <button className="btn-accent" onClick={addItem}>Add Item</button>
            <button className="btn-outline" onClick={() => setShowAdd(false)}>Cancel</button>
          </div>
        </div>
      )}

      {/* Items list */}
      {loading ? (
        <div style={{ padding: 40, textAlign: 'center', color: 'var(--text-muted)' }}>Loading...</div>
      ) : (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
          {items.map(item => {
            const presets = TAG_PRESETS[section] || []
            return (
              <div key={item.id} className="card" style={{ padding: 20 }}>
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: 14 }}>
                  <div style={{ flex: 1, marginRight: 16 }}>
                    <div style={{ marginBottom: 10 }}>
                      <label className="label">Name</label>
                      <input className="input" defaultValue={item.name} onBlur={e => e.target.value !== item.name && updateItem(item.id, { name: e.target.value })} style={{ fontWeight: 600, fontSize: 15 }} />
                    </div>

                    {section === 'beer' ? (
                      <BeerPriceEditor value={item.price || ''} onChange={v => updateItem(item.id, { price: v || 'TBA' })} />
                    ) : (
                      <div style={{ display: 'grid', gridTemplateColumns: '120px 80px', gap: 10 }}>
                        <div><label className="label">Price</label><input className="input" defaultValue={item.price} onBlur={e => e.target.value !== item.price && updateItem(item.id, { price: e.target.value })} style={{ fontFamily: 'DM Mono, monospace' }} /></div>
                        {section !== 'bites' && section !== 'special_events' && <div><label className="label">ABV</label><input className="input" defaultValue={item.abv || ''} onBlur={e => updateItem(item.id, { abv: e.target.value })} style={{ fontFamily: 'DM Mono, monospace' }} /></div>}
                      </div>
                    )}
                  </div>

                  <div style={{ display: 'flex', flexDirection: 'column', gap: 8, alignItems: 'flex-end', flexShrink: 0 }}>
                    {section !== 'bites' && section !== 'special_events' && (
                      <label style={{ display: 'flex', alignItems: 'center', gap: 6, fontSize: 13, color: 'var(--text-secondary)', cursor: 'pointer' }}>
                        <input type="checkbox" checked={item.is_draft} onChange={e => updateItem(item.id, { is_draft: e.target.checked })} style={{ accentColor: 'var(--accent)' }} /> On Tap
                      </label>
                    )}
                    <label style={{ display: 'flex', alignItems: 'center', gap: 6, fontSize: 13, color: 'var(--text-secondary)', cursor: 'pointer' }}>
                      <input type="checkbox" checked={item.is_available} onChange={e => updateItem(item.id, { is_available: e.target.checked })} style={{ accentColor: 'var(--green)' }} /> Available
                    </label>
                    {saving === item.id && <span style={{ fontSize: 12, color: 'var(--accent)' }}>Saving...</span>}
                    <button className="btn-red" onClick={() => deleteItem(item.id)} style={{ fontSize: 12, padding: '5px 10px' }}>Remove</button>
                  </div>
                </div>

                {section === 'beer' && (
                  <div style={{ display: 'grid', gridTemplateColumns: '1fr 80px', gap: 10, marginBottom: 10 }}>
                    <div><label className="label">Description</label><input className="input" defaultValue={item.description || ''} onBlur={e => updateItem(item.id, { description: e.target.value })} /></div>
                    <div><label className="label">ABV</label><input className="input" defaultValue={item.abv || ''} onBlur={e => updateItem(item.id, { abv: e.target.value })} style={{ fontFamily: 'DM Mono, monospace' }} /></div>
                  </div>
                )}

                {section !== 'beer' && (
                  <div style={{ marginBottom: 10 }}><label className="label">Description</label><input className="input" defaultValue={item.description || ''} onBlur={e => updateItem(item.id, { description: e.target.value })} /></div>
                )}

                {(section === 'bites' || section === 'special_events') && (
                  <div style={{ marginBottom: 10 }}><label className="label">Subtitle</label><input className="input" defaultValue={item.subtitle || ''} onBlur={e => updateItem(item.id, { subtitle: e.target.value })} /></div>
                )}

                {/* Tags */}
                <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
                  {presets.map(p => {
                    const on = item.tags?.includes(p.label)
                    return (
                      <span key={p.label} onClick={() => toggleTag(item, p.label)} style={{
                        ...tagStyle(p.color, on),
                        padding: '4px 12px', borderRadius: 100, fontSize: 12, fontWeight: 500,
                        cursor: 'pointer', userSelect: 'none', transition: 'all 0.15s',
                      }}>
                        {p.label}
                      </span>
                    )
                  })}
                </div>
              </div>
            )
          })}
        </div>
      )}

      {toast && <div className="toast">{toast}</div>}
    </div>
  )
}

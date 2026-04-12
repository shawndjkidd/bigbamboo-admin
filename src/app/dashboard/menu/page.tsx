'use client'
import { useEffect, useState, useRef } from 'react'
import { supabase, MenuItem } from '@/lib/supabase'

const DEFAULT_SECTIONS = [
  { key: 'cocktails',     label: 'Cocktails' },
  { key: 'beer',          label: 'Beer' },
  { key: 'na',            label: 'Non-Alcoholic' },
  { key: 'bites',         label: 'Bar Bites' },
  { key: 'special_events', label: 'Special Events' },
]
const DEFAULT_SECTION_KEYS = new Set(DEFAULT_SECTIONS.map(s => s.key))

const TAG_PRESETS: Record<string, { label: string, color: string }[]> = {
  cocktails:     [{ label: 'Bestseller', color: 'orange' }, { label: 'New', color: 'blue' }, { label: 'Craft', color: 'blue' }, { label: 'Drink Wisely', color: 'red' }, { label: 'Limited', color: 'orange' }],
  beer:          [{ label: 'Bestseller', color: 'orange' }, { label: 'Local', color: 'orange' }, { label: 'Limited', color: 'orange' }, { label: 'New', color: 'blue' }],
  na:            [{ label: 'Bestseller', color: 'orange' }, { label: 'No Alcohol', color: 'blue' }, { label: 'New', color: 'blue' }],
  bites:         [{ label: "Chef's Pick", color: 'orange' }, { label: 'Crowd Pleaser', color: 'orange' }, { label: 'Bestseller', color: 'orange' }, { label: 'New', color: 'blue' }, { label: 'Vegan', color: 'green' }, { label: 'Spicy', color: 'red' }],
  special_events:[{ label: 'Featured', color: 'orange' }, { label: 'Limited', color: 'orange' }, { label: 'New', color: 'blue' }, { label: 'Seasonal', color: 'green' }, { label: 'Premium', color: 'red' }],
}
const CUSTOM_TAG_PRESETS = [
  { label: 'Bestseller', color: 'orange' },
  { label: 'New',        color: 'blue' },
  { label: 'Special',    color: 'green' },
]

// Helpers for per-section field visibility
function isCustom(key: string)    { return !DEFAULT_SECTION_KEYS.has(key) }
function showAbv(key: string)     { return !['bites', 'special_events'].includes(key) && !isCustom(key) }
function showOnTap(key: string)   { return !['bites', 'special_events'].includes(key) && !isCustom(key) }
function showSubtitle(key: string){ return key === 'bites' || key === 'special_events' || isCustom(key) }

function toLabel(key: string) {
  return key.replace(/_/g, ' ').replace(/\b\w/g, c => c.toUpperCase())
}
function toKey(label: string) {
  return label.trim().toLowerCase().replace(/[^a-z0-9]+/g, '_').replace(/^_+|_+$/g, '')
}

function tagStyle(color: string, on: boolean) {
  if (!on) return { background: 'var(--bg-hover)', color: 'var(--text-muted)', border: '1px solid var(--border)' }
  const map: any = {
    orange: { background: 'var(--badge-orange-bg)', color: 'var(--badge-orange-text)', border: '1px solid var(--badge-orange-border)' },
    blue:   { background: 'var(--badge-blue-bg)',   color: 'var(--badge-blue-text)',   border: '1px solid var(--badge-blue-border)' },
    green:  { background: 'var(--badge-green-bg)',  color: 'var(--badge-green-text)',  border: '1px solid var(--badge-green-border)' },
    red:    { background: 'var(--badge-red-bg)',    color: 'var(--badge-red-text)',    border: '1px solid var(--badge-red-border)' },
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
  const [sections, setSections] = useState(DEFAULT_SECTIONS)
  const [section, setSection] = useState('cocktails')
  const [items, setItems] = useState<MenuItem[]>([])
  const [loading, setLoading] = useState(true)
  const [saving, setSaving] = useState<string | null>(null)
  const [toast, setToast] = useState('')
  const [showAdd, setShowAdd] = useState(false)
  const [newItem, setNewItem] = useState({ name: '', subtitle: '', description: '', price: 'TBA', abv: '', tags: [] as string[], is_draft: false })
  const [showAddSection, setShowAddSection] = useState(false)
  const [newSectionLabel, setNewSectionLabel] = useState('')
  const addSectionInputRef = useRef<HTMLInputElement>(null)

  useEffect(() => { loadSections() }, [])
  useEffect(() => { loadItems() }, [section])

  async function loadSections() {
    const [{ data: itemData }, { data: orderData }] = await Promise.all([
      supabase.from('menu_items').select('section'),
      supabase.from('site_settings').select('value').eq('key', 'menu_section_order').single(),
    ])

    // Build full list: defaults + any custom sections found in DB
    const all = [...DEFAULT_SECTIONS]
    if (itemData) {
      const dbKeys = Array.from(new Set(itemData.map((r: any) => r.section as string)))
      dbKeys.filter(k => k && !DEFAULT_SECTION_KEYS.has(k))
            .forEach(k => all.push({ key: k, label: toLabel(k) }))
    }

    // Apply stored order if available — preserve empty custom sections
    if (orderData?.value) {
      try {
        const order: string[] = JSON.parse(orderData.value)
        const byKey = Object.fromEntries(all.map(s => [s.key, s]))
        // For keys in the saved order that aren't in DB yet (empty custom sections), create entries
        const ordered = order.map(k => byKey[k] || { key: k, label: toLabel(k) })
        const orderedKeys = new Set(order)
        all.filter(s => !orderedKeys.has(s.key)).forEach(s => ordered.push(s))
        setSections(ordered)
        return
      } catch { /* fall through to default */ }
    }
    setSections(all)
  }

  async function saveSectionOrder(ordered: { key: string, label: string }[]) {
    const value = JSON.stringify(ordered.map(s => s.key))
    await supabase.from('site_settings').upsert(
      { key: 'menu_section_order', value, updated_at: new Date().toISOString() },
      { onConflict: 'key' }
    )
  }

  function moveSection(idx: number, dir: -1 | 1) {
    const next = [...sections]
    const swap = idx + dir
    if (swap < 0 || swap >= next.length) return
    ;[next[idx], next[swap]] = [next[swap], next[idx]]
    setSections(next)
    saveSectionOrder(next)
  }

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
    const { data, error } = await supabase.from('menu_items').insert({ ...newItem, section, sort_order: items.length + 1, is_available: true }).select().single()
    if (error) {
      console.error('addItem error:', error)
      showToast('Failed: ' + (error.message || error.code || 'unknown error'))
      return
    }
    if (data) {
      setItems(prev => [...prev, data])
      setNewItem({ name: '', subtitle: '', description: '', price: 'TBA', abv: '', tags: [], is_draft: false })
      setShowAdd(false)
      showToast('Item added')
    }
  }

  async function deleteItem(id: string) {
    if (!confirm('Remove this item?')) return
    await supabase.from('menu_items').delete().eq('id', id)
    setItems(prev => prev.filter(i => i.id !== id))
    showToast('Removed')
  }

  function handleAddSection() {
    if (!newSectionLabel.trim()) return
    const key = toKey(newSectionLabel)
    if (!key) return
    if (sections.some(s => s.key === key)) { showToast('Section already exists'); return }
    const updated = [...sections, { key, label: newSectionLabel.trim() }]
    setSections(updated)
    saveSectionOrder(updated)
    setSection(key)
    setNewSectionLabel('')
    setShowAddSection(false)
  }

  async function removeSection(key: string) {
    if (DEFAULT_SECTION_KEYS.has(key)) return
    const { count } = await supabase.from('menu_items').select('id', { count: 'exact', head: true }).eq('section', key)
    if (count && count > 0) {
      showToast(`Remove all ${count} item${count !== 1 ? 's' : ''} first`)
      return
    }
    const updated = sections.filter(s => s.key !== key)
    setSections(updated)
    saveSectionOrder(updated)
    setSection('cocktails')
  }

  function showToast(msg: string) { setToast(msg); setTimeout(() => setToast(''), 2500) }

  function toggleTag(item: MenuItem, tag: string) {
    const tags = item.tags.includes(tag) ? item.tags.filter(t => t !== tag) : [...item.tags, tag]
    updateItem(item.id, { tags })
  }

  const currentSection = sections.find(s => s.key === section)
  const tagPresets = TAG_PRESETS[section] ?? CUSTOM_TAG_PRESETS

  return (
    <div style={{ maxWidth: 900 }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 28 }}>
        <div>
          <div className="page-title">Menu</div>
          <div style={{ fontSize: 14, color: 'var(--text-muted)', marginTop: 4 }}>
            {items.length} items in {currentSection?.label}
          </div>
        </div>
        <div style={{ display: 'flex', gap: 8 }}>
          {isCustom(section) && (
            <button className="btn-outline" onClick={() => removeSection(section)} style={{ fontSize: 13, color: 'var(--badge-red-text)' }}>
              Remove Section
            </button>
          )}
          <button className="btn-accent" onClick={() => setShowAdd(!showAdd)} style={{ fontSize: 14 }}>+ Add Item</button>
        </div>
      </div>

      {/* Section tabs */}
      <div style={{ display: 'flex', gap: 6, marginBottom: 24, flexWrap: 'wrap', alignItems: 'center' }}>
        {sections.map((s, idx) => (
          <div key={s.key} style={{ display: 'flex', alignItems: 'center', gap: 2 }}>
            <button
              onClick={() => moveSection(idx, -1)}
              title="Move left"
              style={{
                visibility: idx === 0 ? 'hidden' : 'visible',
                padding: '6px 5px', fontSize: 10, lineHeight: 1, cursor: 'pointer',
                background: 'transparent', color: 'var(--text-muted)', border: 'none', borderRadius: 4,
              }}
            >◀</button>
            <button onClick={() => { setSection(s.key); setShowAddSection(false) }} style={{
              padding: '10px 18px', borderRadius: 100, fontSize: 14, fontWeight: 500, cursor: 'pointer', transition: 'all 0.15s',
              background: section === s.key ? 'var(--accent)' : 'transparent',
              color: section === s.key ? '#fff' : 'var(--text-secondary)',
              border: `1px solid ${section === s.key ? 'var(--accent)' : 'var(--border)'}`,
            }}>
              {s.label}
            </button>
            <button
              onClick={() => moveSection(idx, 1)}
              title="Move right"
              style={{
                visibility: idx === sections.length - 1 ? 'hidden' : 'visible',
                padding: '6px 5px', fontSize: 10, lineHeight: 1, cursor: 'pointer',
                background: 'transparent', color: 'var(--text-muted)', border: 'none', borderRadius: 4,
              }}
            >▶</button>
          </div>
        ))}

        {/* Add section */}
        {showAddSection ? (
          <div style={{ display: 'flex', gap: 6, alignItems: 'center' }}>
            <input
              ref={addSectionInputRef}
              className="input"
              value={newSectionLabel}
              onChange={e => setNewSectionLabel(e.target.value)}
              onKeyDown={e => { if (e.key === 'Enter') handleAddSection(); if (e.key === 'Escape') { setShowAddSection(false); setNewSectionLabel('') } }}
              placeholder="Section name…"
              style={{ width: 180, fontSize: 14 }}
              autoFocus
            />
            <button className="btn-accent" onClick={handleAddSection} style={{ fontSize: 13, padding: '9px 16px' }}>Add</button>
            <button className="btn-outline" onClick={() => { setShowAddSection(false); setNewSectionLabel('') }} style={{ fontSize: 13 }}>Cancel</button>
          </div>
        ) : (
          <button onClick={() => setShowAddSection(true)} style={{
            padding: '10px 16px', borderRadius: 100, fontSize: 13, fontWeight: 500, cursor: 'pointer',
            background: 'transparent', color: 'var(--text-muted)', border: '1px dashed var(--border)',
            transition: 'all 0.15s',
          }}>
            + Add Section
          </button>
        )}
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
            <div style={{ display: 'grid', gridTemplateColumns: showAbv(section) ? '140px 1fr 80px' : '140px 1fr', gap: 14, marginBottom: 14 }}>
              <div><label className="label">Price</label><input className="input" value={newItem.price} onChange={e => setNewItem(p => ({ ...p, price: e.target.value }))} placeholder="TBA" /></div>
              <div><label className="label">Description</label><input className="input" value={newItem.description} onChange={e => setNewItem(p => ({ ...p, description: e.target.value }))} placeholder="Short punchy description" /></div>
              {showAbv(section) && <div><label className="label">ABV</label><input className="input" value={newItem.abv} onChange={e => setNewItem(p => ({ ...p, abv: e.target.value }))} placeholder="~8%" /></div>}
            </div>
          )}
          <div style={{ display: 'flex', gap: 12, alignItems: 'center' }}>
            {showOnTap(section) && (
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
      ) : items.length === 0 ? (
        <div className="card" style={{ padding: 40, textAlign: 'center', color: 'var(--text-muted)', fontSize: 14 }}>
          No items yet — click &ldquo;+ Add Item&rdquo; to get started
        </div>
      ) : (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
          {items.map(item => (
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
                    <div style={{ display: 'grid', gridTemplateColumns: showAbv(section) ? '120px 80px' : '120px', gap: 10 }}>
                      <div><label className="label">Price</label><input className="input" defaultValue={item.price} onBlur={e => e.target.value !== item.price && updateItem(item.id, { price: e.target.value })} style={{ fontFamily: 'DM Mono, monospace' }} /></div>
                      {showAbv(section) && <div><label className="label">ABV</label><input className="input" defaultValue={item.abv || ''} onBlur={e => updateItem(item.id, { abv: e.target.value })} style={{ fontFamily: 'DM Mono, monospace' }} /></div>}
                    </div>
                  )}
                </div>

                <div style={{ display: 'flex', flexDirection: 'column', gap: 8, alignItems: 'flex-end', flexShrink: 0 }}>
                  {showOnTap(section) && (
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

              {showSubtitle(section) && (
                <div style={{ marginBottom: 10 }}><label className="label">Subtitle</label><input className="input" defaultValue={item.subtitle || ''} onBlur={e => updateItem(item.id, { subtitle: e.target.value })} /></div>
              )}

              {/* Tags */}
              <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
                {tagPresets.map(p => {
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
          ))}
        </div>
      )}

      {toast && <div className="toast">{toast}</div>}
    </div>
  )
}

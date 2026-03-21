'use client'
import { useEffect, useState } from 'react'
import { supabase, MenuItem } from '@/lib/supabase'

const SECTIONS = [
  { key: 'cocktails', label: '🍹 Cocktails' },
  { key: 'beer', label: '🍺 Beer' },
  { key: 'na', label: '🥤 Non-Alcoholic' },
  { key: 'bites', label: '🍟 Bar Bites' },
]

const TAG_PRESETS: Record<string, {label:string,color:string}[]> = {
  cocktails: [{label:'Bestseller',color:'yellow'},{label:'New',color:'teal'},{label:'Craft',color:'teal'},{label:'Drink Wisely',color:'red'},{label:'Limited',color:'orange'}],
  beer: [{label:'Bestseller',color:'yellow'},{label:'Local',color:'yellow'},{label:'Limited',color:'orange'},{label:'New',color:'teal'}],
  na: [{label:'Bestseller',color:'yellow'},{label:'No Alcohol',color:'teal'},{label:'New',color:'teal'}],
  bites: [{label:"Chef's Pick",color:'yellow'},{label:'Crowd Pleaser',color:'yellow'},{label:'Bestseller',color:'yellow'},{label:'New',color:'teal'},{label:'Vegan',color:'green'},{label:'Spicy',color:'red'}],
}

function tagStyle(color: string) {
  const bg: any = {yellow:'rgba(232,168,32,0.15)',teal:'rgba(58,168,164,0.15)',green:'rgba(0,177,79,0.15)',red:'rgba(192,48,32,0.15)',orange:'rgba(212,88,32,0.15)'}
  const text: any = {yellow:'#E8A820',teal:'#3AA8A4',green:'#00C858',red:'#E06060',orange:'#D45820'}
  const border: any = {yellow:'rgba(232,168,32,0.3)',teal:'rgba(58,168,164,0.3)',green:'rgba(0,177,79,0.3)',red:'rgba(192,48,32,0.3)',orange:'rgba(212,88,32,0.3)'}
  return { background: bg[color]||bg.yellow, color: text[color]||text.yellow, border: `1px solid ${border[color]||border.yellow}` }
}

function parseSizes(priceStr: string): {size:string, price:string}[] {
  if (!priceStr || !priceStr.includes('/')) {
    return [{size:'', price: priceStr || ''}]
  }
  return priceStr.split('/').map(p => {
    const colon = p.indexOf(':')
    if (colon > -1) return { size: p.slice(0, colon).trim(), price: p.slice(colon+1).trim() }
    return { size: '', price: p.trim() }
  })
}

function formatSizes(sizes: {size:string, price:string}[]): string {
  const filled = sizes.filter(s => s.price.trim())
  if (filled.length === 0) return ''
  if (filled.length === 1 && !filled[0].size) return filled[0].price
  return filled.map(s => s.size ? `${s.size}: ${s.price}` : s.price).join(' / ')
}

function BeerPriceEditor({ value, onChange }: { value: string, onChange: (v: string) => void }) {
  const [sizes, setSizes] = useState<{size:string, price:string}[]>(() => parseSizes(value))

  function update(newSizes: {size:string, price:string}[]) {
    setSizes(newSizes)
    onChange(formatSizes(newSizes))
  }

  function addRow() { update([...sizes, {size:'', price:''}]) }
  function removeRow(i: number) { update(sizes.filter((_, idx) => idx !== i)) }
  function setRow(i: number, field: 'size'|'price', val: string) {
    const next = sizes.map((s, idx) => idx === i ? {...s, [field]: val} : s)
    update(next)
  }

  return (
    <div>
      <label className="label">Sizes & Prices</label>
      <div style={{display:'flex',flexDirection:'column',gap:6}}>
        {sizes.map((s, i) => (
          <div key={i} style={{display:'flex',gap:6,alignItems:'center'}}>
            <input className="input" value={s.size} onChange={e => setRow(i, 'size', e.target.value)} placeholder="e.g. Small, Large, 330ml" style={{width:130,flexShrink:0}} />
            <input className="input" value={s.price} onChange={e => setRow(i, 'price', e.target.value)} placeholder="45,000" style={{flex:1,fontFamily:'monospace'}} />
            {sizes.length > 1 && (
              <button onClick={() => removeRow(i)} style={{background:'rgba(192,48,32,0.15)',border:'1px solid rgba(192,48,32,0.3)',color:'#E06060',width:28,height:28,borderRadius:6,cursor:'pointer',fontSize:13,flexShrink:0}}>✕</button>
            )}
          </div>
        ))}
        <button onClick={addRow} style={{background:'rgba(255,255,255,0.04)',border:'1px dashed rgba(255,255,255,0.15)',color:'rgba(255,255,255,0.4)',padding:'6px',borderRadius:6,cursor:'pointer',fontSize:11,fontFamily:'DM Mono',letterSpacing:'0.1em',textTransform:'uppercase'}}>
          + Add Size
        </button>
      </div>
      {sizes.length > 0 && formatSizes(sizes) && (
        <div style={{fontSize:10,color:'rgba(255,255,255,0.25)',marginTop:5,fontFamily:'DM Mono'}}>
          Saves as: {formatSizes(sizes)}
        </div>
      )}
    </div>
  )
}

export default function MenuPage() {
  const [section, setSection] = useState('cocktails')
  const [items, setItems] = useState<MenuItem[]>([])
  const [loading, setLoading] = useState(true)
  const [saving, setSaving] = useState<string|null>(null)
  const [toast, setToast] = useState('')
  const [showAdd, setShowAdd] = useState(false)
  const [newItem, setNewItem] = useState({ name:'', subtitle:'', description:'', price:'TBA', abv:'', tags:[] as string[], is_draft:false })

  useEffect(() => { loadItems() }, [section])

  async function loadItems() {
    setLoading(true)
    const { data } = await supabase.from('menu_items').select('*').eq('section', section).order('sort_order')
    setItems(data || [])
    setLoading(false)
  }

  async function updateItem(id: string, changes: Partial<MenuItem>) {
    setSaving(id)
    await supabase.from('menu_items').update({...changes, updated_at: new Date().toISOString()}).eq('id', id)
    setItems(prev => prev.map(i => i.id === id ? {...i, ...changes} : i))
    setSaving(null)
    showToast('Saved!')
  }

  async function addItem() {
    if (!newItem.name) return
    const { data } = await supabase.from('menu_items').insert({ ...newItem, section, sort_order: items.length + 1 }).select().single()
    if (data) { setItems(prev => [...prev, data]); setNewItem({ name:'', subtitle:'', description:'', price:'TBA', abv:'', tags:[], is_draft:false }); setShowAdd(false); showToast('Item added!') }
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
    <div>
      <div style={{display:'flex',justifyContent:'space-between',alignItems:'center',marginBottom:20}}>
        <div style={{fontFamily:'Bebas Neue',fontSize:32,letterSpacing:'0.06em'}}>Menu</div>
        <button className="btn-yellow" onClick={() => setShowAdd(!showAdd)} style={{fontFamily:'Bebas Neue',fontSize:16,letterSpacing:'0.1em'}}>+ Add Item</button>
      </div>

      <div style={{display:'flex',gap:6,marginBottom:20,flexWrap:'wrap'}}>
        {SECTIONS.map(s => (
          <button key={s.key} onClick={() => setSection(s.key)} style={{padding:'8px 18px',borderRadius:100,fontFamily:'DM Mono',fontSize:11,letterSpacing:'0.08em',textTransform:'uppercase',cursor:'pointer',transition:'all 0.15s',background:section===s.key?'#E8A820':'transparent',color:section===s.key?'#1a0800':'rgba(255,255,255,0.5)',border:`1px solid ${section===s.key?'#E8A820':'rgba(255,255,255,0.15)'}`}}>
            {s.label}
          </button>
        ))}
      </div>

      {showAdd && (
        <div className="card" style={{padding:20,marginBottom:20,border:'1px dashed rgba(58,168,164,0.4)'}}>
          <div style={{fontFamily:'DM Mono',fontSize:10,letterSpacing:'0.15em',textTransform:'uppercase',color:'#3AA8A4',marginBottom:14}}>+ Add New Item</div>
          <div style={{display:'grid',gridTemplateColumns:'1fr 1fr',gap:10,marginBottom:10}}>
            <div><label className="label">Name</label><input className="input" value={newItem.name} onChange={e=>setNewItem(p=>({...p,name:e.target.value}))} placeholder="Item name" /></div>
            <div><label className="label">Subtitle (food only)</label><input className="input" value={newItem.subtitle} onChange={e=>setNewItem(p=>({...p,subtitle:e.target.value}))} placeholder="e.g. Pulled Pork Slamwich" /></div>
          </div>
          {section === 'beer' ? (
            <div style={{marginBottom:10}}>
              <BeerPriceEditor value={newItem.price === 'TBA' ? '' : newItem.price} onChange={v => setNewItem(p=>({...p, price: v || 'TBA'}))} />
            </div>
          ) : (
            <div style={{marginBottom:10}}>
              <label className="label">Price</label>
              <input className="input" value={newItem.price} onChange={e=>setNewItem(p=>({...p,price:e.target.value}))} placeholder="TBA" style={{width:120}} />
            </div>
          )}
          {section !== 'bites' && (
            <div style={{display:'grid',gridTemplateColumns:'1fr 80px',gap:10,marginBottom:10}}>
              <div><label className="label">Description</label><input className="input" value={newItem.description} onChange={e=>setNewItem(p=>({...p,description:e.target.value}))} placeholder="Short punchy description" /></div>
              <div><label className="label">ABV</label><input className="input" value={newItem.abv} onChange={e=>setNewItem(p=>({...p,abv:e.target.value}))} placeholder="~8%" /></div>
            </div>
          )}
          {section === 'bites' && <div style={{marginBottom:10}}><label className="label">Description</label><input className="input" value={newItem.description} onChange={e=>setNewItem(p=>({...p,description:e.target.value}))} placeholder="Short punchy description" /></div>}
          <div style={{display:'flex',gap:10,alignItems:'center'}}>
            {section !== 'bites' && <label style={{display:'flex',alignItems:'center',gap:6,fontSize:13,color:'rgba(255,255,255,0.6)',cursor:'pointer'}}><input type="checkbox" checked={newItem.is_draft} onChange={e=>setNewItem(p=>({...p,is_draft:e.target.checked}))} style={{accentColor:'#E8A820'}} /> On Tap</label>}
            <button className="btn-green" onClick={addItem}>+ Add</button>
            <button className="btn-outline" onClick={() => setShowAdd(false)}>Cancel</button>
          </div>
        </div>
      )}

      {loading ? <div style={{color:'rgba(255,255,255,0.4)',padding:20}}>Loading...</div> : (
        <div style={{display:'flex',flexDirection:'column',gap:8}}>
          {items.map(item => {
            const presets = TAG_PRESETS[section] || []
            return (
              <div key={item.id} className="card" style={{padding:16}}>
                <div style={{marginBottom:10}}>
                  <label className="label">Name</label>
                  <input className="input" defaultValue={item.name} onBlur={e => e.target.value !== item.name && updateItem(item.id, {name: e.target.value})} style={{fontWeight:600}} />
                </div>

                <div style={{marginBottom:10}}>
                  {section === 'beer' ? (
                    <BeerPriceEditor value={item.price || ''} onChange={v => updateItem(item.id, {price: v || 'TBA'})} />
                  ) : (
                    <div style={{display:'grid',gridTemplateColumns:'120px 80px',gap:10}}>
                      <div><label className="label">Price</label>
                        <input className="input" defaultValue={item.price} onBlur={e => e.target.value !== item.price && updateItem(item.id, {price: e.target.value})} style={{fontFamily:'monospace',textAlign:'center'}} />
                      </div>
                      <div><label className="label">ABV</label>
                        <input className="input" defaultValue={item.abv||''} onBlur={e => updateItem(item.id, {abv: e.target.value})} style={{fontFamily:'monospace',fontSize:12}} />
                      </div>
                    </div>
                  )}
                </div>

                {section === 'beer' && (
                  <div style={{marginBottom:10,display:'grid',gridTemplateColumns:'1fr 80px',gap:10}}>
                    <div><label className="label">Description</label>
                      <input className="input" defaultValue={item.description||''} onBlur={e => updateItem(item.id, {description: e.target.value})} style={{fontStyle:'italic',fontSize:13}} />
                    </div>
                    <div><label className="label">ABV</label>
                      <input className="input" defaultValue={item.abv||''} onBlur={e => updateItem(item.id, {abv: e.target.value})} style={{fontFamily:'monospace',fontSize:12}} />
                    </div>
                  </div>
                )}

                {section !== 'beer' && (
                  <div style={{marginBottom:10}}>
                    <label className="label">Description</label>
                    <input className="input" defaultValue={item.description||''} onBlur={e => updateItem(item.id, {description: e.target.value})} style={{fontStyle:'italic',fontSize:13}} />
                  </div>
                )}

                {section === 'bites' && (
                  <div style={{marginBottom:10}}>
                    <label className="label">Subtitle</label>
                    <input className="input" defaultValue={item.subtitle||''} onBlur={e => updateItem(item.id, {subtitle: e.target.value})} />
                  </div>
                )}

                <div style={{display:'flex',gap:8,alignItems:'center',flexWrap:'wrap'}}>
                  {presets.map(p => {
                    const on = item.tags?.includes(p.label)
                    return (
                      <span key={p.label} onClick={() => toggleTag(item, p.label)} style={{...tagStyle(on ? p.color : 'none'), background: on ? tagStyle(p.color).background : 'rgba(255,255,255,0.04)', color: on ? tagStyle(p.color).color : 'rgba(255,255,255,0.3)', border: on ? tagStyle(p.color).border : '1px solid rgba(255,255,255,0.1)', padding:'2px 9px',borderRadius:100,fontSize:9,letterSpacing:'0.08em',textTransform:'uppercase',cursor:'pointer',userSelect:'none'}}>
                        {p.label}
                      </span>
                    )
                  })}
                  <div style={{marginLeft:'auto',display:'flex',gap:6,alignItems:'center'}}>
                    {section !== 'bites' && (
                      <label style={{display:'flex',alignItems:'center',gap:5,fontSize:11,color:'rgba(255,255,255,0.5)',cursor:'pointer'}}>
                        <input type="checkbox" checked={item.is_draft} onChange={e => updateItem(item.id, {is_draft: e.target.checked})} style={{accentColor:'#E8A820'}} />
                        On Tap
                      </label>
                    )}
                    <label style={{display:'flex',alignItems:'center',gap:5,fontSize:11,color:'rgba(255,255,255,0.5)',cursor:'pointer'}}>
                      <input type="checkbox" checked={item.is_available} onChange={e => updateItem(item.id, {is_available: e.target.checked})} style={{accentColor:'#00B14F'}} />
                      Available
                    </label>
                    {saving === item.id && <span style={{fontSize:11,color:'#3AA8A4'}}>Saving...</span>}
                    <button className="btn-red" onClick={() => deleteItem(item.id)}>✕</button>
                  </div>
                </div>
              </div>
            )
          })}
        </div>
      )}

      {toast && (
        <div style={{position:'fixed',bottom:24,right:24,background:'#00B14F',color:'#fff',padding:'11px 20px',borderRadius:8,fontFamily:'DM Mono',fontSize:11,letterSpacing:'0.1em',zIndex:9999}}>
          {toast}
        </div>
      )}
    </div>
  )
}

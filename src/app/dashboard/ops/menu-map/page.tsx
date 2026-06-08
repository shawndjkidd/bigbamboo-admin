'use client'
import { useEffect, useState } from 'react'
import { ops, canManageRecipes, type StaffRole } from '@/lib/ops/api'
import { supabase } from '@/lib/supabase'

type MapRow = { id: string; item_name: string; recipe_id: string | null; ignore: boolean }
type Recipe = { id: string; name: string; category: string | null }

export default function MenuMapPage() {
  const [role, setRole] = useState<StaffRole | null>(null)
  const [venueId, setVenueId] = useState<string | null>(null)
  const [rows, setRows] = useState<MapRow[]>([])
  const [recipes, setRecipes] = useState<Recipe[]>([])
  const [loading, setLoading] = useState(true)
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
    const [{ data: m }, { data: r }] = await Promise.all([
      ops().from('pos_item_map').select('id, item_name, recipe_id, ignore').order('item_name'),
      ops().from('recipes').select('id, name, category').order('name'),
    ])
    setRows((m as MapRow[]) || [])
    setRecipes((r as Recipe[]) || [])
    setLoading(false)
  }

  async function setMapping(row: MapRow, value: string) {
    if (!venueId) return
    setMsg(null)
    const patch = value === '__ignore__'
      ? { recipe_id: null, ignore: true }
      : { recipe_id: value || null, ignore: false }
    const { error } = await ops().from('pos_item_map').update(patch).eq('id', row.id)
    if (error) { setMsg(error.message); return }
    // Stamp the recipe onto any past sales of this item that haven't deducted yet,
    // so they'll be picked up on the next Square sync.
    await ops().from('sales_items')
      .update({ recipe_id: patch.recipe_id })
      .eq('venue_id', venueId).eq('menu_item_name', row.item_name).eq('stock_applied', false)
    await load()
  }

  if (loading) return <div style={{ color: 'var(--text-muted, #999)', fontSize: 14 }}>Loading…</div>
  const canManage = role && canManageRecipes(role)
  if (!canManage) return <div style={{ color: 'var(--text-muted, #999)', fontSize: 14 }}>The menu map is managed by managers.</div>

  const unmapped = rows.filter(r => !r.recipe_id && !r.ignore).length

  return (
    <div style={{ maxWidth: 720 }}>
      <h2 style={{ fontSize: 22, fontWeight: 600 }}>Menu map (POS → recipes)</h2>
      <div style={{ fontSize: 13, color: 'var(--text-muted, #999)', marginTop: 2, marginBottom: 16 }}>
        Each item sold on Square is linked to a recipe so its ingredients can be deducted from stock automatically.
        New items auto-link when the names match — anything below needs a quick confirm or fix.
      </div>

      {rows.length === 0 && (
        <div style={{ fontSize: 14, color: 'var(--text-muted, #999)', padding: 12, border: '1px dashed var(--border, #e5e5e5)', borderRadius: 8 }}>
          Nothing here yet. Items appear after your next Square sync.
        </div>
      )}

      {unmapped > 0 && (
        <div style={{ fontSize: 13, color: 'var(--burgundy, #7b2d3a)', marginBottom: 12 }}>
          {unmapped} item{unmapped === 1 ? '' : 's'} not yet linked — these won&apos;t deduct stock until mapped.
        </div>
      )}

      {rows.length > 0 && (
        <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 14 }}>
          <thead><tr style={{ background: 'var(--bg-sidebar, #fafafa)' }}>
            <th style={th}>Square item</th><th style={th}>Linked recipe</th>
          </tr></thead>
          <tbody>
            {rows.map(row => {
              const value = row.ignore ? '__ignore__' : (row.recipe_id || '')
              const needs = !row.recipe_id && !row.ignore
              return (
                <tr key={row.id} style={{ borderTop: '1px solid var(--border, #eee)' }}>
                  <td style={{ ...td, fontWeight: 600 }}>{row.item_name}</td>
                  <td style={td}>
                    <select value={value} onChange={e => setMapping(row, e.target.value)}
                      style={{ ...inp, width: 'auto', minWidth: 240, padding: '6px 8px', borderColor: needs ? 'var(--burgundy, #7b2d3a)' : undefined }}>
                      <option value="">— needs mapping —</option>
                      <option value="__ignore__">Don&apos;t track (no recipe)</option>
                      {recipes.map(r => (
                        <option key={r.id} value={r.id}>{r.name}{r.category ? ` (${r.category})` : ''}</option>
                      ))}
                    </select>
                  </td>
                </tr>
              )
            })}
          </tbody>
        </table>
      )}
      {msg && <div style={{ fontSize: 12, color: 'var(--burgundy, #7b2d3a)', marginTop: 10 }}>{msg}</div>}
      <div style={{ fontSize: 12, color: 'var(--text-muted, #999)', marginTop: 12 }}>
        Mapping changes apply from your next sync onward (already-counted sales aren&apos;t re-deducted).
      </div>
    </div>
  )
}

const inp = { width: '100%', padding: '10px 12px', fontSize: 14, border: '1px solid var(--border, #e5e5e5)', borderRadius: 8, background: 'var(--bg-input, #fff)', color: 'var(--text, #333)', boxSizing: 'border-box' as const }
const th = { padding: '8px 12px', textAlign: 'left' as const, fontWeight: 600, fontSize: 11, textTransform: 'uppercase' as const, color: 'var(--text-muted, #999)', letterSpacing: '0.05em' }
const td = { padding: '10px 12px', color: 'var(--text, #333)' }

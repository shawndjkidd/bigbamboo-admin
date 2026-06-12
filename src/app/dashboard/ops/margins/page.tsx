'use client'
import { useEffect, useState } from 'react'
import Link from 'next/link'
import { ops, vnd, canManageRecipes, type StaffRole } from '@/lib/ops/api'
import { supabase } from '@/lib/supabase'

type Row = { id: string; name: string; type: string; sale_price: number | null; cost: number | null }

export default function MarginsPage() {
  const [role, setRole] = useState<StaffRole | null>(null)
  const [rows, setRows] = useState<Row[]>([])
  const [target, setTarget] = useState(30)
  const [loading, setLoading] = useState(true)
  const [advice, setAdvice] = useState('')
  const [aiBusy, setAiBusy] = useState(false)

  useEffect(() => { init() }, [])
  async function init() {
    const { data: { user } } = await supabase.auth.getUser()
    if (!user) return
    const { data: su } = await supabase.from('staff_users').select('role').eq('email', user.email).maybeSingle()
    setRole((su?.role || 'staff') as StaffRole)
    const venueId = (await supabase.from('venues').select('id').eq('slug', 'bigbamboo').single()).data?.id
    const [{ data: recs }, { data: costs }] = await Promise.all([
      ops().from('recipes').select('id, name, type, sale_price').eq('venue_id', venueId).eq('active', true).in('type', ['menu_item', 'add_on']).eq('category', 'food'),
      ops().from('v_recipe_cost').select('recipe_id, cost_per_unit'),
    ])
    const costMap = new Map((costs || []).map((c: any) => [c.recipe_id, Number(c.cost_per_unit)]))
    setRows((recs || []).map((r: any) => ({
      id: r.id, name: r.name, type: r.type,
      sale_price: r.sale_price != null ? Number(r.sale_price) : null,
      cost: costMap.has(r.id) ? Number(costMap.get(r.id)) : null,
    })))
    setLoading(false)
  }

  const withCogs = rows
    .map(r => ({ ...r, cogs: (r.cost != null && r.sale_price) ? r.cost / r.sale_price : null }))
    .sort((a, b) => (b.cogs ?? -1) - (a.cogs ?? -1))
  const over = withCogs.filter(r => r.cogs != null && r.cogs * 100 > target)
  const suggested = (cost: number) => Math.ceil(cost / (target / 100) / 1000) * 1000

  async function askAi() {
    setAiBusy(true); setAdvice('')
    const items = over.slice(0, 15).map(r => `${r.name}: cost ${Math.round(Number(r.cost))}d, price ${r.sale_price}d, food cost ${Math.round(Number(r.cogs) * 100)}%`)
    try {
      const res = await fetch('/api/admin/ops/insight', {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ target, items }),
      })
      const j = await res.json().catch(() => ({}))
      setAdvice(res.ok ? (j.advice || 'No suggestions.') : (j.error || 'Could not get advice'))
    } catch (e: any) { setAdvice('Error: ' + (e?.message || e)) }
    setAiBusy(false)
  }

  if (loading) return <div style={{ color: 'var(--text-muted, #999)', fontSize: 14 }}>Loading…</div>
  if (!(role && canManageRecipes(role))) return <div style={{ color: 'var(--text-muted, #999)', fontSize: 14 }}>Margins are available to managers.</div>

  return (
    <div style={{ maxWidth: 880 }}>
      <h2 style={{ fontSize: 22, fontWeight: 600 }}>Margins</h2>
      <div style={{ fontSize: 13, color: 'var(--text-muted, #999)', marginTop: 2, marginBottom: 20 }}>
        Food items by cost-of-goods %. Anything over your target is flagged, with a suggested price to hit it. <Link href="/dashboard/ops/recipes" style={{ color: 'var(--accent)' }}>Recipes →</Link>
      </div>

      <div style={{ display: 'flex', alignItems: 'center', gap: 16, flexWrap: 'wrap', marginBottom: 16 }}>
        <label style={{ fontSize: 13, display: 'flex', alignItems: 'center', gap: 8 }}>
          Target food cost
          <input inputMode="numeric" value={String(target)} onChange={e => setTarget(Math.min(95, Math.max(5, Number(e.target.value.replace(/[^\d]/g, '')) || 0)))} style={{ ...inp, width: 64, textAlign: 'right', padding: '6px 8px' }} />%
        </label>
        <span style={{ fontSize: 13, color: over.length ? 'var(--burgundy, #7b2d3a)' : '#548235', fontWeight: 600 }}>
          {over.length} of {withCogs.filter(r => r.cogs != null).length} priced items over {target}%
        </span>
        <button onClick={askAi} disabled={aiBusy || !over.length} style={{ ...btnPrimary, opacity: (aiBusy || !over.length) ? 0.6 : 1 }}>{aiBusy ? 'Thinking…' : '✨ AI: what should I do?'}</button>
      </div>

      {advice && <div style={{ whiteSpace: 'pre-wrap', fontSize: 13, lineHeight: 1.5, background: 'var(--bg-sidebar, #fafafa)', border: '1px solid var(--border, #eee)', borderRadius: 8, padding: '12px 14px', marginBottom: 18, color: 'var(--text, #333)' }}>{advice}</div>}

      <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 13 }}>
        <thead><tr style={{ background: 'var(--bg-sidebar, #fafafa)' }}>
          <th style={th}>Item</th>
          <th style={{ ...th, textAlign: 'right' }}>Cost</th>
          <th style={{ ...th, textAlign: 'right' }}>Price</th>
          <th style={{ ...th, textAlign: 'right' }}>Food cost %</th>
          <th style={{ ...th, textAlign: 'right' }}>Suggested price (≤{target}%)</th>
        </tr></thead>
        <tbody>
          {withCogs.map(r => {
            const flagged = r.cogs != null && r.cogs * 100 > target
            return (
              <tr key={r.id} style={{ borderTop: '1px solid var(--border, #eee)' }}>
                <td style={td}>
                  <Link href={`/dashboard/ops/recipes/${r.id}`} style={{ color: 'var(--text, #333)', textDecoration: 'none' }}>{r.name}</Link>
                  {r.type === 'add_on' && <span style={{ color: 'var(--text-muted, #999)', fontSize: 11 }}> · add-on</span>}
                </td>
                <td style={{ ...td, textAlign: 'right' }}>{r.cost != null ? vnd(r.cost) : '—'}</td>
                <td style={{ ...td, textAlign: 'right' }}>{r.sale_price ? vnd(r.sale_price) : <span style={{ color: 'var(--text-muted, #bbb)' }}>no price</span>}</td>
                <td style={{ ...td, textAlign: 'right', fontWeight: 600, color: r.cogs == null ? 'var(--text-muted, #bbb)' : flagged ? 'var(--burgundy, #7b2d3a)' : '#548235' }}>
                  {r.cogs == null ? '—' : `${(r.cogs * 100).toFixed(1)}%`}
                </td>
                <td style={{ ...td, textAlign: 'right', color: 'var(--text-muted, #999)' }}>
                  {flagged && r.cost != null ? vnd(suggested(Number(r.cost))) : ''}
                </td>
              </tr>
            )
          })}
        </tbody>
      </table>
      <div style={{ fontSize: 12, color: 'var(--text-muted, #999)', marginTop: 10 }}>Drinks are excluded here (their cost is pour-based — see each recipe&apos;s COGS tile). Suggested price = cost ÷ target, rounded up to the nearest 1,000₫.</div>
    </div>
  )
}

const inp = { padding: '10px 12px', fontSize: 14, border: '1px solid var(--border, #e5e5e5)', borderRadius: 8, background: 'var(--bg-input, #fff)', color: 'var(--text, #333)', boxSizing: 'border-box' as const }
const th = { padding: '8px 10px', textAlign: 'left' as const, fontWeight: 600, fontSize: 11, textTransform: 'uppercase' as const, color: 'var(--text-muted, #999)', letterSpacing: '0.05em' }
const td = { padding: '8px 10px', color: 'var(--text, #333)' }
const btnPrimary = { padding: '8px 14px', background: 'var(--accent, #e87830)', color: '#fff', border: 'none', borderRadius: 8, fontSize: 13, fontWeight: 600, cursor: 'pointer' }

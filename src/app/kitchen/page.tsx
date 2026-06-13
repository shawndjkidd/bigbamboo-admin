'use client'
// Kitchen Mode — a clean, full-screen, read-only library of recipes, batches and SOPs
// for the kitchen/bar iPad. Big touch targets, bilingual detail, always live. Plus a
// "Download everything" button that bundles the whole book into one offline PDF.
import { useEffect, useState } from 'react'
import { useRouter } from 'next/navigation'
import { supabase } from '@/lib/supabase'
import { canSeeDashboard, type StaffRole } from '@/lib/ops/api'
import {
  fetchKitchenList, buildRecipeDetailHtml, buildSopDetailHtml, buildKitchenPdf,
  RECIPE_BOOK_CSS, type KStation, type KRecipe, type KSop,
} from '@/lib/ops/kitchenBook'

type TypeFilter = 'all' | 'recipes' | 'addons' | 'batches' | 'sops'

export default function KitchenPage() {
  const router = useRouter()
  const [loading, setLoading] = useState(true)
  const [canExport, setCanExport] = useState(false)
  const [station, setStation] = useState<KStation>('kitchen')
  const [type, setType] = useState<TypeFilter>('all')
  const [q, setQ] = useState('')
  const [recipes, setRecipes] = useState<KRecipe[]>([])
  const [sops, setSops] = useState<KSop[]>([])
  const [detail, setDetail] = useState<{ title: string; html: string } | null>(null)
  const [detailBusy, setDetailBusy] = useState(false)
  const [dl, setDl] = useState(false)

  useEffect(() => {
    (async () => {
      const { data: { session } } = await supabase.auth.getSession()
      if (!session?.user) { router.push('/login'); return }
      const { data: su } = await supabase.from('staff_users').select('active, role, department').eq('email', session.user.email).maybeSingle()
      if (!su || su.active === false) { router.push('/login'); return }
      // Only managers+ can export the book and switch stations. Display / staff accounts are
      // view-only and locked to their own station by Department: a Bar device only sees the
      // bar, a Kitchen (or any non-bar) device only sees the kitchen.
      const exporter = canSeeDashboard((su.role || 'staff') as StaffRole)
      setCanExport(exporter)
      if (exporter) {
        try {
          const s = localStorage.getItem('bbb_kitchen_station')
          if (s === 'kitchen' || s === 'bar' || s === 'all') setStation(s)
        } catch {}
      } else {
        setStation(su.department === 'bar' ? 'bar' : 'kitchen')
      }
      setLoading(false)
    })()
  }, [])

  useEffect(() => { if (!loading) loadList(station) }, [loading, station])

  async function loadList(s: KStation) {
    const { recipes, sops } = await fetchKitchenList(s)
    setRecipes(recipes); setSops(sops)
  }
  function chooseStation(s: KStation) {
    setStation(s); try { localStorage.setItem('bbb_kitchen_station', s) } catch {}
  }

  async function openRecipe(r: KRecipe) {
    setDetail({ title: r.name, html: '' }); setDetailBusy(true)
    const html = await buildRecipeDetailHtml(r.id)
    setDetail({ title: r.name, html }); setDetailBusy(false)
  }
  function openSop(s: KSop) {
    setDetail({ title: s.title, html: buildSopDetailHtml(s) })
  }

  async function download(share: boolean) {
    setDl(true)
    try {
      const pdf = await buildKitchenPdf({ station })
      if (!pdf) { alert('Nothing to download for this station yet.'); return }
      const file = new File([pdf.blob], pdf.fname, { type: 'application/pdf' })
      const nav: any = navigator
      if (share && nav.canShare && nav.canShare({ files: [file] })) {
        try { await nav.share({ files: [file], title: pdf.fname }) } catch {}
      } else {
        const url = URL.createObjectURL(pdf.blob); const a = document.createElement('a')
        a.href = url; a.download = pdf.fname; a.click(); setTimeout(() => URL.revokeObjectURL(url), 4000)
      }
    } finally { setDl(false) }
  }

  const ql = q.trim().toLowerCase()
  const showRecipes = type === 'all' || type === 'recipes' || type === 'addons' || type === 'batches'
  const showSops = type === 'all' || type === 'sops'
  const recipeCards = !showRecipes ? [] : recipes.filter(r => {
    if (type === 'recipes' && r.type !== 'menu_item') return false
    if (type === 'addons' && r.type !== 'add_on') return false
    if (type === 'batches' && !(r.type === 'batch' || r.type === 'sub_recipe')) return false
    if (ql && !(`${r.name} ${r.name_vi || ''}`.toLowerCase().includes(ql))) return false
    return true
  })
  const sopCards = !showSops ? [] : sops.filter(s => {
    if (ql && !(`${s.title} ${s.category}`.toLowerCase().includes(ql))) return false
    return true
  })
  const empty = recipeCards.length === 0 && sopCards.length === 0

  if (loading) return <div style={{ height: '100vh', display: 'flex', alignItems: 'center', justifyContent: 'center', color: '#999' }}>Loading…</div>

  return (
    <div style={{ minHeight: '100vh', background: 'var(--bg, #fff)', color: 'var(--text, #1a1a1a)' }}>
      <style>{`.rbk{font-size:16px}` + RECIPE_BOOK_CSS}</style>

      {/* Header */}
      <div style={{ position: 'sticky', top: 0, zIndex: 10, background: 'var(--bg-sidebar, #fafafa)', borderBottom: '1px solid var(--border, #e5e5e5)', padding: '14px 20px' }}>
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', flexWrap: 'wrap', gap: 12 }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
            <span style={{ fontSize: 20, fontWeight: 700, color: 'var(--accent, #e87830)' }}>BigBamBoo Kitchen</span>
            {canExport && <Seg value={station} onChange={v => chooseStation(v as KStation)} options={[['kitchen', 'Kitchen'], ['bar', 'Bar'], ['all', 'All']]} />}
          </div>
          {canExport && (
            <div style={{ display: 'flex', gap: 8 }}>
              <button onClick={() => download(false)} disabled={dl} style={{ ...bigBtn, opacity: dl ? 0.6 : 1 }}>{dl ? 'Building…' : '⬇ Download PDF'}</button>
              <button onClick={() => download(true)} disabled={dl} style={{ ...bigBtnOutline, opacity: dl ? 0.6 : 1 }}>⤴ Share</button>
            </div>
          )}
        </div>
        <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginTop: 12, flexWrap: 'wrap' }}>
          <Seg value={type} onChange={v => setType(v as TypeFilter)} options={[['all', 'All'], ['recipes', 'Recipes'], ['addons', 'Add-ons'], ['batches', 'Batches'], ['sops', 'SOPs']]} />
          <input value={q} onChange={e => setQ(e.target.value)} placeholder="Search…" style={{ flex: 1, minWidth: 180, padding: '12px 16px', fontSize: 16, border: '1px solid var(--border, #e5e5e5)', borderRadius: 10, background: 'var(--bg-card, #fff)', color: 'var(--text, #333)' }} />
        </div>
      </div>

      {/* Grid */}
      <div style={{ padding: 20 }}>
        {empty && <div style={{ color: '#999', fontSize: 15, padding: 20 }}>Nothing here yet for this filter.</div>}

        {sopCards.length > 0 && showSops && type === 'all' && recipeCards.length > 0 && (
          <SectionLabel>Recipes &amp; batches</SectionLabel>
        )}
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(190px, 1fr))', gap: 12 }}>
          {recipeCards.map(r => (
            <button key={r.id} onClick={() => openRecipe(r)} style={card}>
              <div style={{ fontSize: 17, fontWeight: 600, color: 'var(--text, #1a1a1a)' }}>{r.name}</div>
              {r.name_vi && <div style={{ fontSize: 14, color: 'var(--accent, #b85c00)', marginTop: 2 }}>{r.name_vi}</div>}
              <div style={{ fontSize: 11, color: '#999', marginTop: 10, textTransform: 'uppercase', letterSpacing: '0.04em' }}>
                {r.type === 'batch' || r.type === 'sub_recipe' ? 'Batch' : r.type === 'add_on' ? 'Add-on' : 'Recipe'} · {r.category}
              </div>
            </button>
          ))}
        </div>

        {sopCards.length > 0 && (
          <>
            {type === 'all' && <SectionLabel>SOPs</SectionLabel>}
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(190px, 1fr))', gap: 12, marginTop: type === 'all' ? 0 : 0 }}>
              {sopCards.map(s => (
                <button key={s.id} onClick={() => openSop(s)} style={{ ...card, borderColor: 'var(--border, #e5e5e5)' }}>
                  <div style={{ fontSize: 17, fontWeight: 600, color: 'var(--text, #1a1a1a)' }}>{s.title}</div>
                  {s.title_vi && <div style={{ fontSize: 14, color: 'var(--accent, #b85c00)', marginTop: 2 }}>{s.title_vi}</div>}
                  <div style={{ fontSize: 11, color: '#999', marginTop: 10, textTransform: 'uppercase', letterSpacing: '0.04em' }}>
                    SOP · {s.category}
                  </div>
                </button>
              ))}
            </div>
          </>
        )}
      </div>

      {/* Detail overlay */}
      {detail && (
        <div onClick={() => setDetail(null)} style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.45)', display: 'flex', justifyContent: 'center', alignItems: 'flex-start', padding: '24px 16px', zIndex: 50, overflowY: 'auto' }}>
          <div onClick={e => e.stopPropagation()} style={{ background: '#fff', color: '#1a1a1a', borderRadius: 14, width: '100%', maxWidth: 820, padding: '24px 28px 40px', position: 'relative', boxShadow: '0 10px 40px rgba(0,0,0,0.25)' }}>
            <button onClick={() => setDetail(null)} style={{ position: 'sticky', float: 'right', top: 0, fontSize: 26, lineHeight: 1, background: '#f0f0f0', border: 'none', borderRadius: '50%', width: 44, height: 44, cursor: 'pointer', color: '#555' }} aria-label="Close">✕</button>
            {detailBusy
              ? <div style={{ color: '#999', padding: 40, textAlign: 'center' }}>Loading…</div>
              : <div className="rbk" dangerouslySetInnerHTML={{ __html: detail.html }} />}
          </div>
        </div>
      )}
    </div>
  )
}

function Seg({ value, onChange, options }: { value: string; onChange: (v: string) => void; options: [string, string][] }) {
  return (
    <div style={{ display: 'inline-flex', border: '1px solid var(--border, #e5e5e5)', borderRadius: 10, overflow: 'hidden' }}>
      {options.map(([v, label], i) => (
        <button key={v} onClick={() => onChange(v)} style={{
          padding: '10px 18px', fontSize: 14, fontWeight: 600, cursor: 'pointer', border: 'none',
          borderRight: i < options.length - 1 ? '1px solid var(--border, #e5e5e5)' : 'none',
          background: value === v ? 'var(--accent, #e87830)' : 'var(--bg-card, #fff)',
          color: value === v ? '#fff' : 'var(--text-muted, #777)',
        }}>{label}</button>
      ))}
    </div>
  )
}

function SectionLabel({ children }: { children: React.ReactNode }) {
  return <div style={{ fontSize: 12, fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.06em', color: '#999', margin: '22px 0 8px' }}>{children}</div>
}

const card: React.CSSProperties = {
  textAlign: 'left', background: 'var(--bg-card, #fff)', border: '1px solid var(--border, #e5e5e5)',
  borderRadius: 12, padding: '16px 16px', cursor: 'pointer', minHeight: 96, display: 'block',
}
const bigBtn: React.CSSProperties = {
  padding: '11px 18px', background: 'var(--accent, #e87830)', color: '#fff', border: 'none',
  borderRadius: 10, fontSize: 15, fontWeight: 600, cursor: 'pointer',
}
const bigBtnOutline: React.CSSProperties = {
  padding: '11px 18px', background: 'transparent', color: 'var(--text-secondary, #666)',
  border: '1px solid var(--border, #e5e5e5)', borderRadius: 10, fontSize: 15, fontWeight: 600, cursor: 'pointer',
}

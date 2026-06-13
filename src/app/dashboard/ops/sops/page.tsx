'use client'
import { useEffect, useState, Suspense } from 'react'
import { useSearchParams } from 'next/navigation'
import { supabase } from '@/lib/supabase'

type Sop = {
  id: string; department: string; category: string; title: string
  purpose: string | null; responsible: string | null; frequency: string | null; est_time: string | null
  steps: string | null; note: string | null; image_url: string | null
  sort_order: number; is_published: boolean; version: number
  title_vi?: string | null; purpose_vi?: string | null; steps_vi?: string | null; note_vi?: string | null
}

const CATEGORY_PRESETS = ['Opening', 'Closing', 'Cleaning', 'Safety', 'Service', 'Prep', 'Admin', 'General']

function SopsInner() {
  const search = useSearchParams()
  const urlDept = (search.get('dept') as 'kitchen' | 'bar' | 'general' | null) || null
  const [role, setRole] = useState<string | null>(null)
  const [userDept, setUserDept] = useState<string | null>(null)
  const [rows, setRows] = useState<Sop[]>([])
  const [loading, setLoading] = useState(true)
  const [expanded, setExpanded] = useState<Set<string>>(new Set())
  const [cat, setCat] = useState('all')
  const [showAdd, setShowAdd] = useState(false)
  const [toast, setToast] = useState('')
  const blank = { department: urlDept || 'general', category: 'Opening', title: '', purpose: '', responsible: '', frequency: '', est_time: '', steps: '', note: '', is_published: true }
  const [nu, setNu] = useState<any>(blank)

  useEffect(() => { init() }, [])
  async function init() {
    const { data: { session } } = await supabase.auth.getSession()
    const u = session?.user; if (!u) return
    const { data: su } = await supabase.from('staff_users').select('role, department').eq('email', u.email).maybeSingle()
    setRole(su?.role || 'staff'); setUserDept(su?.department || null)
    await load()
  }
  async function load() {
    setLoading(true)
    const { data } = await supabase.from('sops').select('*').order('category').order('sort_order')
    setRows((data as Sop[]) || []); setLoading(false)
  }
  function showToast(m: string) { setToast(m); setTimeout(() => setToast(''), 2200) }
  const isManager = !!role && ['super_admin', 'admin', 'manager'].includes(role)
  const effDept = isManager ? urlDept : (userDept || urlDept)
  const heading = effDept === 'bar' ? 'Bar SOPs' : effDept === 'kitchen' ? 'Kitchen SOPs' : effDept === 'general' ? 'General SOPs' : 'SOPs'

  // English → Vietnamese via the Gemini endpoint. Returns '' on failure.
  async function translateToVi(text: string): Promise<string> {
    try {
      const res = await fetch('/api/admin/ops/translate', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ text }) })
      const j = await res.json().catch(() => ({}))
      return res.ok ? String(j.vi || '') : ''
    } catch { return '' }
  }
  // Translate step lists line-by-line so the Vietnamese keeps the same number of steps
  // as the English (the Kitchen view pairs them up by line number).
  async function translateLines(text: string): Promise<string> {
    const out: string[] = []
    for (const ln of text.split('\n')) out.push(ln.trim() ? (await translateToVi(ln)) || ln : '')
    return out.join('\n')
  }
  // Build the Vietnamese counterparts for whichever English fields are present.
  async function viFor(src: { title?: string | null; purpose?: string | null; steps?: string | null; note?: string | null }) {
    const vi: any = {}
    if (typeof src.title === 'string' && src.title.trim()) vi.title_vi = await translateToVi(src.title)
    if (typeof src.purpose === 'string' && src.purpose.trim()) vi.purpose_vi = await translateToVi(src.purpose)
    if (typeof src.note === 'string' && src.note.trim()) vi.note_vi = await translateToVi(src.note)
    if (typeof src.steps === 'string' && src.steps.trim()) vi.steps_vi = await translateLines(src.steps)
    return vi
  }

  async function updateSop(id: string, changes: Partial<Sop>) {
    await supabase.from('sops').update({ ...changes, updated_at: new Date().toISOString() }).eq('id', id)
    setRows(prev => prev.map(s => s.id === id ? { ...s, ...changes } : s)); showToast('Saved')
    // Auto-translate any English content that changed so the Vietnamese stays in sync.
    const vi = await viFor(changes as any)
    if (Object.keys(vi).length) {
      await supabase.from('sops').update(vi).eq('id', id)
      setRows(prev => prev.map(s => s.id === id ? { ...s, ...vi } : s)); showToast('Vietnamese updated')
    }
  }
  async function addSop() {
    if (!nu.title) { showToast('Title required'); return }
    showToast('Translating…')
    const vi = await viFor(nu)
    const { data, error } = await supabase.from('sops').insert({ ...nu, ...vi, sort_order: rows.length }).select().single()
    if (error) { showToast('Failed: ' + error.message); return }
    if (data) { setRows(prev => [...prev, data as Sop]); setNu(blank); setShowAdd(false); showToast('SOP added') }
  }
  async function deleteSop(id: string) {
    if (!confirm('Delete this SOP?')) return
    await supabase.from('sops').delete().eq('id', id)
    setRows(prev => prev.filter(s => s.id !== id)); showToast('Deleted')
  }
  async function publishVersion(s: Sop) {
    await supabase.from('sop_versions').insert({ sop_id: s.id, version: s.version, snapshot: s })
    await supabase.from('sops').update({ version: s.version + 1 }).eq('id', s.id)
    setRows(prev => prev.map(x => x.id === s.id ? { ...x, version: x.version + 1 } : x)); showToast('Published v' + s.version)
  }
  function toggle(id: string) { setExpanded(p => { const n = new Set(p); n.has(id) ? n.delete(id) : n.add(id); return n }) }
  function printSop(s: Sop) {
    const steps = (s.steps || '').split('\n').filter(Boolean).map((t, i) => `<li>${t.replace(/</g, '&lt;')}</li>`).join('')
    const w = window.open('', '_blank'); if (!w) return
    w.document.write(`<html><head><title>${s.title}</title><style>body{font-family:Inter,Arial,sans-serif;max-width:700px;margin:32px auto;color:#1a1a1a;padding:0 20px}h1{margin:0 0 4px}.meta{color:#666;font-size:13px;margin-bottom:16px}.chip{display:inline-block;background:#f0f0f0;border-radius:6px;padding:4px 10px;font-size:12px;margin-right:8px}ol{line-height:1.7}.note{background:#fbe7e9;border-radius:8px;padding:10px 14px;margin-top:16px;font-size:14px}</style></head><body><div class="meta">${s.category} · ${s.department}</div><h1>${s.title}</h1>${s.purpose ? '<p>' + s.purpose + '</p>' : ''}<div style="margin:12px 0">${s.responsible ? '<span class="chip">Who: ' + s.responsible + '</span>' : ''}${s.frequency ? '<span class="chip">When: ' + s.frequency + '</span>' : ''}${s.est_time ? '<span class="chip">Time: ' + s.est_time + '</span>' : ''}</div><ol>${steps}</ol>${s.note ? '<div class="note">' + s.note + '</div>' : ''}<p style="margin-top:24px;color:#999;font-size:11px">BigBamBoo SOP · v${s.version}</p></body></html>`)
    w.document.close(); w.focus(); setTimeout(() => w.print(), 300)
  }

  const cats = ['all', ...Array.from(new Set(rows.map(r => r.category)))]
  const visible = rows.filter(s => {
    if (effDept && s.department !== effDept && s.department !== 'general') return false
    if (cat !== 'all' && s.category !== cat) return false
    return true
  })

  const setN = (k: string, v: any) => setNu((p: any) => ({ ...p, [k]: v }))

  return (
    <div style={{ maxWidth: 900 }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 24 }}>
        <div>
          <div className="page-title">{heading}</div>
          <div style={{ fontSize: 14, color: 'var(--text-muted)', marginTop: 4 }}>{visible.length} procedures</div>
        </div>
        {isManager && <button className="btn-accent" onClick={() => { setNu({ ...blank, department: effDept || 'general' }); setShowAdd(!showAdd) }}>+ Add SOP</button>}
      </div>

      <div style={{ display: 'flex', gap: 6, marginBottom: 20, flexWrap: 'wrap' }}>
        {cats.map(c => (
          <button key={c} onClick={() => setCat(c)} className={cat === c ? 'menu-pill-active' : 'menu-pill-inactive'} style={{ padding: '8px 16px', borderRadius: 100, fontSize: 13, fontWeight: 500, cursor: 'pointer', textTransform: 'capitalize' }}>{c}</button>
        ))}
      </div>

      {showAdd && isManager && (
        <div className="card" style={{ padding: 22, marginBottom: 20, borderColor: 'var(--accent)', borderStyle: 'dashed' }}>
          <div className="section-title" style={{ color: 'var(--accent)', marginBottom: 16 }}>New SOP</div>
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', gap: 12, marginBottom: 12 }}>
            <div><label className="label">Title</label><input className="input" value={nu.title} onChange={e => setN('title', e.target.value)} placeholder="e.g. Bar opening procedure" /></div>
            <div><label className="label">Department</label><select className="input" value={nu.department} onChange={e => setN('department', e.target.value)}><option value="kitchen">Kitchen</option><option value="bar">Bar</option><option value="general">General</option></select></div>
            <div><label className="label">Category</label><select className="input" value={nu.category} onChange={e => setN('category', e.target.value)}>{CATEGORY_PRESETS.map(c => <option key={c} value={c}>{c}</option>)}</select></div>
          </div>
          <div style={{ marginBottom: 12 }}><label className="label">Purpose</label><input className="input" value={nu.purpose} onChange={e => setN('purpose', e.target.value)} placeholder="One line: what this is for" /></div>
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', gap: 12, marginBottom: 12 }}>
            <div><label className="label">Responsible</label><input className="input" value={nu.responsible} onChange={e => setN('responsible', e.target.value)} placeholder="e.g. Bartender" /></div>
            <div><label className="label">Frequency</label><input className="input" value={nu.frequency} onChange={e => setN('frequency', e.target.value)} placeholder="e.g. Daily — open" /></div>
            <div><label className="label">Est. time</label><input className="input" value={nu.est_time} onChange={e => setN('est_time', e.target.value)} placeholder="e.g. 20 min" /></div>
          </div>
          <div style={{ marginBottom: 12 }}><label className="label">Steps (one per line)</label><textarea className="input" rows={6} value={nu.steps} onChange={e => setN('steps', e.target.value)} placeholder={'Unlock and disarm alarm\nTurn on lights and music\n...'} style={{ fontFamily: 'inherit', lineHeight: 1.6 }} /></div>
          <div style={{ marginBottom: 12 }}><label className="label">Important note (optional)</label><input className="input" value={nu.note} onChange={e => setN('note', e.target.value)} placeholder="Safety / heads-up" /></div>
          <div style={{ display: 'flex', gap: 10 }}><button className="btn-accent" onClick={addSop}>Add SOP</button><button className="btn-outline" onClick={() => setShowAdd(false)}>Cancel</button></div>
        </div>
      )}

      {loading ? <div style={{ color: 'var(--text-muted)', padding: 30 }}>Loading…</div>
        : visible.length === 0 ? <div className="card" style={{ padding: 36, textAlign: 'center', color: 'var(--text-muted)' }}>No SOPs here yet.</div>
        : (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
          {visible.map(s => {
            const open = expanded.has(s.id)
            return (
              <div key={s.id} className="card" style={{ padding: open ? 20 : '12px 16px' }}>
                <div onClick={() => toggle(s.id)} style={{ display: 'flex', alignItems: 'center', gap: 12, cursor: 'pointer' }}>
                  <span style={{ color: 'var(--text-muted)', fontSize: 13, width: 14 }}>{open ? '▾' : '▸'}</span>
                  <span style={{ fontWeight: 600, fontSize: 15, flex: 1 }}>{s.title || '(untitled)'}</span>
                  <span style={{ fontSize: 11, color: 'var(--text-muted)' }}>{s.category}</span>
                  {s.frequency && <span style={{ fontSize: 11, color: 'var(--text-secondary)' }}>{s.frequency}</span>}
                  {!s.is_published && <span style={{ fontSize: 10, padding: '2px 8px', borderRadius: 100, background: 'var(--badge-red-bg)', color: 'var(--badge-red-text)' }}>Draft</span>}
                </div>
                {open && (
                  <div style={{ marginTop: 16 }}>
                    {isManager ? (
                      <>
                        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', gap: 12, marginBottom: 12 }}>
                          <div><label className="label">Title</label><input className="input" defaultValue={s.title} onBlur={e => e.target.value !== s.title && updateSop(s.id, { title: e.target.value })} /></div>
                          <div><label className="label">Department</label><select className="input" defaultValue={s.department} onChange={e => updateSop(s.id, { department: e.target.value })}><option value="kitchen">Kitchen</option><option value="bar">Bar</option><option value="general">General</option></select></div>
                          <div><label className="label">Category</label><select className="input" defaultValue={s.category} onChange={e => updateSop(s.id, { category: e.target.value })}>{CATEGORY_PRESETS.map(c => <option key={c} value={c}>{c}</option>)}</select></div>
                        </div>
                        <div style={{ marginBottom: 12 }}><label className="label">Purpose</label><input className="input" defaultValue={s.purpose || ''} onBlur={e => updateSop(s.id, { purpose: e.target.value })} /></div>
                        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', gap: 12, marginBottom: 12 }}>
                          <div><label className="label">Responsible</label><input className="input" defaultValue={s.responsible || ''} onBlur={e => updateSop(s.id, { responsible: e.target.value })} /></div>
                          <div><label className="label">Frequency</label><input className="input" defaultValue={s.frequency || ''} onBlur={e => updateSop(s.id, { frequency: e.target.value })} /></div>
                          <div><label className="label">Est. time</label><input className="input" defaultValue={s.est_time || ''} onBlur={e => updateSop(s.id, { est_time: e.target.value })} /></div>
                        </div>
                        <div style={{ marginBottom: 12 }}><label className="label">Steps (one per line)</label><textarea className="input" rows={7} defaultValue={s.steps || ''} onBlur={e => updateSop(s.id, { steps: e.target.value })} style={{ fontFamily: 'inherit', lineHeight: 1.6 }} /></div>
                        <div style={{ marginBottom: 14 }}><label className="label">Important note</label><input className="input" defaultValue={s.note || ''} onBlur={e => updateSop(s.id, { note: e.target.value })} /></div>
                        <div style={{ display: 'flex', gap: 10, flexWrap: 'wrap', alignItems: 'center' }}>
                          <button className="btn-accent" onClick={() => printSop(s)}>Print</button>
                          <button className="btn-outline" onClick={() => publishVersion(s)}>Publish new version</button>
                          <label style={{ display: 'flex', alignItems: 'center', gap: 6, fontSize: 13, color: 'var(--text-secondary)', cursor: 'pointer' }}><input type="checkbox" checked={s.is_published} onChange={e => updateSop(s.id, { is_published: e.target.checked })} style={{ accentColor: 'var(--accent)' }} /> Published</label>
                          <span style={{ fontSize: 12, color: 'var(--text-muted)' }}>v{s.version}</span>
                          <button className="btn-red" onClick={() => deleteSop(s.id)} style={{ marginLeft: 'auto' }}>Delete</button>
                        </div>
                      </>
                    ) : (
                      <div>
                        {s.purpose && <p style={{ fontSize: 14, color: 'var(--text-secondary)' }}>{s.purpose}</p>}
                        <ol style={{ fontSize: 14, lineHeight: 1.7 }}>{(s.steps || '').split('\n').filter(Boolean).map((t, i) => <li key={i}>{t}</li>)}</ol>
                        {s.note && <div style={{ background: 'var(--badge-red-bg)', color: 'var(--badge-red-text)', borderRadius: 8, padding: '10px 14px', fontSize: 13 }}>{s.note}</div>}
                        <button className="btn-accent" onClick={() => printSop(s)} style={{ marginTop: 12 }}>Print</button>
                      </div>
                    )}
                  </div>
                )}
              </div>
            )
          })}
        </div>
      )}

      {toast && <div className="toast">{toast}</div>}
    </div>
  )
}

export default function SopsPage() {
  return (
    <Suspense fallback={<div style={{ color: 'var(--text-muted)', fontSize: 14 }}>Loading…</div>}>
      <SopsInner />
    </Suspense>
  )
}

'use client'
import { useEffect, useMemo, useState } from 'react'
import { supabase } from '@/lib/supabase'
import { FIELDS, LINKS, DEFAULTS } from '@/app/site/copy'

// Website editor: every word on the public homepage (bigbamboo.app), in English and
// Vietnamese, plus the social, Maps and Grab links. Saved to site_settings under home_*.
//
// FIELDS and LINKS are imported from the homepage's own copy.ts rather than repeated
// here, so a string added to the page shows up in this editor without anyone having to
// remember to add it twice.
//
// "Fill in Vietnamese" fills the empty Vietnamese boxes from the English ones with
// Gemini; they're suggestions, so read them before they go out.

// Labels read "Hero: big slogan", "Visit: heading" and so on. Split on the first colon
// to group them, so this is a set of short lists rather than one wall of forty boxes.
function groupOf(label: string) {
  const i = label.indexOf(':')
  return i === -1 ? 'Page' : label.slice(0, i).trim()
}
function shortLabel(label: string) {
  const i = label.indexOf(':')
  return i === -1 ? label : label.slice(i + 1).trim()
}

// The old Hostinger keys the homepage still falls back to when a home_* box is empty.
const LEGACY_KEYS = ['slogan', 'instagram_url', 'facebook_url', 'google_maps_url', 'grab_url']

export default function SiteEditorPage() {
  const [vals, setVals] = useState<Record<string, string>>({})
  const [loading, setLoading] = useState(true)
  const [saved, setSaved] = useState<string | null>(null)
  const [busy, setBusy] = useState(false)
  const [msg, setMsg] = useState('')

  useEffect(() => { load() }, [])

  const groups = useMemo(() => {
    const out: { name: string; fields: typeof FIELDS }[] = []
    for (const f of FIELDS) {
      const g = groupOf(f.label)
      const found = out.find(o => o.name === g)
      if (found) found.fields.push(f)
      else out.push({ name: g, fields: [f] })
    }
    return out
  }, [])

  async function load() {
    setLoading(true)
    const { data, error } = await supabase
      .from('site_settings')
      .select('key, value')
      .or(`key.like.home_%,key.in.(${LEGACY_KEYS.join(',')})`)
    setLoading(false)
    if (error) { setMsg(error.message); return }
    setVals(Object.fromEntries((data || []).map(r => [String(r.key), String(r.value ?? '')])))
  }

  async function save(key: string, value: string) {
    const { data: existing } = await supabase.from('site_settings').select('key').eq('key', key).maybeSingle()
    const res = existing
      ? await supabase.from('site_settings').update({ value, updated_at: new Date().toISOString() }).eq('key', key)
      : await supabase.from('site_settings').insert({ key, value, updated_at: new Date().toISOString() })
    if (res.error) { setMsg('Could not save. Try again.'); return }
    setMsg('')
    setSaved(key)
    setTimeout(() => setSaved(s => (s === key ? null : s)), 1500)
  }

  const set = (k: string, v: string) => setVals(p => ({ ...p, [k]: v }))
  const enKey = (n: string) => `home_${n}_en`
  const viKey = (n: string) => `home_${n}_vi`

  // Translate every English box that has something in it and whose Vietnamese is empty.
  async function translateMissing(force = false) {
    setBusy(true); setMsg('')
    try {
      const todo = FIELDS.filter(f => (vals[enKey(f.name)] || '').trim() && (force || !(vals[viKey(f.name)] || '').trim()))
      if (!todo.length) { setMsg('Nothing to translate — the Vietnamese boxes are filled in.'); return }
      const { data: sess } = await supabase.auth.getSession()
      const r = await fetch('/api/admin/ops/translate', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${sess.session?.access_token || ''}` },
        body: JSON.stringify({ items: todo.map(f => vals[enKey(f.name)]) }),
      })
      const j = await r.json().catch(() => ({}))
      if (!r.ok || !j.ok) { setMsg(j.error || 'Could not translate. Try again.'); return }
      for (const it of j.items as { i: number; vi: string }[]) {
        const f = todo[it.i]
        if (!f) continue
        set(viKey(f.name), it.vi)
        await save(viKey(f.name), it.vi)
      }
      setMsg(`Translated ${j.items.length} of ${todo.length}. Please read them over.`)
    } finally { setBusy(false) }
  }

  if (loading) return <div className="keg-wrap"><div className="card" style={{ padding: 24, color: 'var(--text-muted)' }}>Loading…</div></div>

  return (
    <div className="keg-wrap">
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', gap: 16, flexWrap: 'wrap' }}>
        <div>
          <div className="page-title">Website</div>
          <p style={{ color: 'var(--text-muted)', fontSize: 13, margin: '6px 0 0', maxWidth: 620, lineHeight: 1.55 }}>
            Every word on the public homepage. Leave a box empty to use our standard wording —
            the grey text in each box shows what that is. Changes go live as soon as you click away.
          </p>
        </div>
        <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
          <a className="btn-outline" href="/site" target="_blank" rel="noreferrer" style={{ fontSize: 13, textDecoration: 'none' }}>Open homepage</a>
          <button className="btn-outline" onClick={() => translateMissing(true)} disabled={busy} style={{ fontSize: 13 }}>Redo all Vietnamese</button>
          <button className="btn-accent" onClick={() => translateMissing(false)} disabled={busy}>{busy ? 'Translating…' : 'Fill in Vietnamese'}</button>
        </div>
      </div>

      {msg && <div className="card" style={{ padding: '10px 14px', marginTop: 14, fontSize: 13, color: 'var(--text-secondary)' }}>{msg}</div>}

      {groups.map(g => (
        <div className="card" style={{ padding: 18, marginTop: 18 }} key={g.name}>
          <div className="section-title" style={{ margin: '0 0 14px' }}>{g.name}</div>
          {g.fields.map(f => (
            <div key={f.name} style={{ marginBottom: 18 }}>
              <div style={{ fontSize: 12.5, fontWeight: 600, color: 'var(--text-secondary)', marginBottom: 6 }}>
                {shortLabel(f.label)}
                {(saved === enKey(f.name) || saved === viKey(f.name)) && <span style={{ color: 'var(--accent)' }}> · saved</span>}
              </div>
              <div className="keg-grid-2">
                <label>
                  <span style={{ display: 'block', fontSize: 11, color: 'var(--text-muted)', marginBottom: 4 }}>English</span>
                  {f.area
                    ? <textarea className="input" rows={3} placeholder={DEFAULTS.en[f.name] || ''} value={vals[enKey(f.name)] || ''} onChange={e => set(enKey(f.name), e.target.value)} onBlur={e => save(enKey(f.name), e.target.value)} />
                    : <input className="input" placeholder={DEFAULTS.en[f.name] || ''} value={vals[enKey(f.name)] || ''} onChange={e => set(enKey(f.name), e.target.value)} onBlur={e => save(enKey(f.name), e.target.value)} />}
                </label>
                <label>
                  <span style={{ display: 'block', fontSize: 11, color: 'var(--text-muted)', marginBottom: 4 }}>Tiếng Việt</span>
                  {f.area
                    ? <textarea className="input" rows={3} placeholder={DEFAULTS.vi[f.name] || ''} value={vals[viKey(f.name)] || ''} onChange={e => set(viKey(f.name), e.target.value)} onBlur={e => save(viKey(f.name), e.target.value)} />
                    : <input className="input" placeholder={DEFAULTS.vi[f.name] || ''} value={vals[viKey(f.name)] || ''} onChange={e => set(viKey(f.name), e.target.value)} onBlur={e => save(viKey(f.name), e.target.value)} />}
                </label>
              </div>
            </div>
          ))}
        </div>
      ))}

      <div className="card" style={{ padding: 18, marginTop: 18 }}>
        <div className="section-title" style={{ margin: '0 0 6px' }}>Links</div>
        <p style={{ color: 'var(--text-muted)', fontSize: 12.5, margin: '0 0 14px', lineHeight: 1.5 }}>
          Shared between both languages. Leave one empty to hide its button — except where the
          box says it is still using an older setting, which the homepage falls back to.
        </p>
        <div className="keg-grid-3">
          {LINKS.map(l => {
            const key = `home_${l.name}`
            const legacy = l.legacy ? (vals[l.legacy] || '') : ''
            return (
              <label key={key}>
                <span style={{ display: 'block', fontSize: 12, fontWeight: 600, color: 'var(--text-secondary)', marginBottom: 5 }}>
                  {l.label}{saved === key && <span style={{ color: 'var(--accent)' }}> · saved</span>}
                </span>
                <input
                  className="input"
                  value={vals[key] || ''}
                  placeholder={legacy ? `Currently using: ${legacy}` : l.hint}
                  onChange={e => set(key, e.target.value)}
                  onBlur={e => save(key, e.target.value)}
                />
                {legacy && !(vals[key] || '').trim() && (
                  <span style={{ display: 'block', fontSize: 11, color: 'var(--text-muted)', marginTop: 4, lineHeight: 1.45 }}>
                    From an older setting. Type here to replace it.
                  </span>
                )}
              </label>
            )
          })}
        </div>
      </div>
    </div>
  )
}

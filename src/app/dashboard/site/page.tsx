'use client'
import { useEffect, useState } from 'react'
import { supabase } from '@/lib/supabase'

// Website editor: every word on the public homepage (bigbamboo.app), in English and
// Vietnamese, plus the social and Grab links. Saved to site_settings under home_*.
// "Translate to Vietnamese" fills the Vietnamese boxes from the English ones with Gemini;
// they're suggestions, so read them before they go out.

type F = { name: string; label: string; area?: boolean }
const FIELDS: F[] = [
  { name: 'tagline', label: 'Big line at the top' },
  { name: 'sub', label: 'Line under it', area: true },
  { name: 'statusLabel', label: 'Status card: label' },
  { name: 'statusValue', label: 'Status card: main line' },
  { name: 'statusNote', label: 'Status card: small line' },
  { name: 'locLabel', label: 'Location card: label' },
  { name: 'locValue', label: 'Location card: main line' },
  { name: 'locNote', label: 'Location card: address' },
  { name: 'nextLabel', label: 'Coming-up card: label' },
  { name: 'nextNone', label: 'Coming-up card: when there are no events' },
  { name: 'eventsTitle', label: 'Events heading' },
  { name: 'eventsNone', label: 'When there are no events' },
  { name: 'festTitle', label: 'Collab Fest block: title' },
  { name: 'festText', label: 'Collab Fest block: text', area: true },
  { name: 'festCta', label: 'Collab Fest block: button' },
  { name: 'visitTitle', label: 'Visit heading' },
  { name: 'visitAddress', label: 'Visit address line' },
  { name: 'maps', label: 'Maps button' },
  { name: 'grab', label: 'Grab button' },
  { name: 'footer', label: 'Footer line' },
]
const LINKS = [
  { key: 'home_instagram_url', label: 'Instagram link', hint: 'Leave empty to hide the button' },
  { key: 'home_facebook_url', label: 'Facebook link', hint: 'Leave empty to hide the button' },
  { key: 'home_grab_url', label: 'Grab link', hint: 'Your BigBamBoo page on Grab, not grab.com' },
]

export default function SiteEditorPage() {
  const [vals, setVals] = useState<Record<string, string>>({})
  const [loading, setLoading] = useState(true)
  const [saved, setSaved] = useState<string | null>(null)
  const [busy, setBusy] = useState(false)
  const [msg, setMsg] = useState('')

  useEffect(() => { load() }, [])

  async function load() {
    setLoading(true)
    const { data, error } = await supabase.from('site_settings').select('key, value').like('key', 'home_%')
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
          <p style={{ color: 'var(--text-muted)', fontSize: 13, margin: '6px 0 0', maxWidth: 560, lineHeight: 1.55 }}>
            Every word on the public homepage. Leave a box empty to use our standard wording. Changes are live as soon as you click away.
          </p>
        </div>
        <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
          <a className="btn-outline" href="/site" target="_blank" rel="noreferrer" style={{ fontSize: 13, textDecoration: 'none' }}>Open homepage</a>
          <button className="btn-outline" onClick={() => translateMissing(true)} disabled={busy} style={{ fontSize: 13 }}>Redo all Vietnamese</button>
          <button className="btn-accent" onClick={() => translateMissing(false)} disabled={busy}>{busy ? 'Translating…' : 'Fill in Vietnamese'}</button>
        </div>
      </div>

      {msg && <div className="card" style={{ padding: '10px 14px', marginTop: 14, fontSize: 13, color: 'var(--text-secondary)' }}>{msg}</div>}

      <div className="card" style={{ padding: 18, marginTop: 18 }}>
        {FIELDS.map(f => (
          <div key={f.name} style={{ marginBottom: 18 }}>
            <div style={{ fontSize: 12.5, fontWeight: 600, color: 'var(--text-secondary)', marginBottom: 6 }}>
              {f.label}
              {(saved === enKey(f.name) || saved === viKey(f.name)) && <span style={{ color: 'var(--accent)' }}> · saved</span>}
            </div>
            <div className="keg-grid-2">
              <label>
                <span style={{ display: 'block', fontSize: 11, color: 'var(--text-muted)', marginBottom: 4 }}>English</span>
                {f.area
                  ? <textarea className="input" rows={3} value={vals[enKey(f.name)] || ''} onChange={e => set(enKey(f.name), e.target.value)} onBlur={e => save(enKey(f.name), e.target.value)} />
                  : <input className="input" value={vals[enKey(f.name)] || ''} onChange={e => set(enKey(f.name), e.target.value)} onBlur={e => save(enKey(f.name), e.target.value)} />}
              </label>
              <label>
                <span style={{ display: 'block', fontSize: 11, color: 'var(--text-muted)', marginBottom: 4 }}>Tiếng Việt</span>
                {f.area
                  ? <textarea className="input" rows={3} value={vals[viKey(f.name)] || ''} onChange={e => set(viKey(f.name), e.target.value)} onBlur={e => save(viKey(f.name), e.target.value)} />
                  : <input className="input" value={vals[viKey(f.name)] || ''} onChange={e => set(viKey(f.name), e.target.value)} onBlur={e => save(viKey(f.name), e.target.value)} />}
              </label>
            </div>
          </div>
        ))}

        <div className="section-title" style={{ margin: '6px 0 12px' }}>Links</div>
        <div className="keg-grid-3">
          {LINKS.map(l => (
            <label key={l.key}>
              <span style={{ display: 'block', fontSize: 12, fontWeight: 600, color: 'var(--text-secondary)', marginBottom: 5 }}>
                {l.label}{saved === l.key && <span style={{ color: 'var(--accent)' }}> · saved</span>}
              </span>
              <input className="input" value={vals[l.key] || ''} placeholder={l.hint} onChange={e => set(l.key, e.target.value)} onBlur={e => save(l.key, e.target.value)} />
            </label>
          ))}
        </div>
      </div>
    </div>
  )
}

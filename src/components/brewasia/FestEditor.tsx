'use client'
import { useEffect, useState } from 'react'
import { supabase } from '@/lib/supabase'

// Edits the public Collab Fest page (/brewasia/collabfest) without touching code.
// Everything is stored in site_settings under fest_*. Empty field = the built-in default.
// Text fields have an English and a Vietnamese version; links and the poster are shared.

const TEXT_FIELDS: { name: string; label: string; hint?: string; area?: boolean }[] = [
  { name: 'title', label: 'Event name' },
  { name: 'eyebrow', label: 'Line above the name' },
  { name: 'date', label: 'Date line' },
  { name: 'time', label: 'Time line' },
  { name: 'blurb', label: 'Description', area: true },
  { name: 'entry', label: 'Entry line', hint: 'Who gets in free, who buys a ticket.' },
  { name: 'tickets', label: 'Ticket button text' },
  { name: 'statCollabs', label: 'Big number: collabs' },
  { name: 'statCollabsLabel', label: 'Big number: collabs — label' },
  { name: 'statCountries', label: 'Big number: countries' },
  { name: 'statCountriesLabel', label: 'Big number: countries — label' },
  { name: 'statHours', label: 'Big number: hours' },
  { name: 'statHoursLabel', label: 'Big number: hours — label' },
  { name: 'countriesTitle', label: 'Line above the country list' },
  { name: 'countries', label: 'Country list' },
  { name: 'plus', label: 'Lead-in above the three extras (e.g. “Plus…”)' },
  { name: 'draw1', label: 'Headline draw 1' },
  { name: 'draw2', label: 'Headline draw 2' },
  { name: 'draw3', label: 'Headline draw 3' },
  { name: 'lineupSub', label: 'Line under “What’s pouring”' },
  { name: 'priceTitle', label: 'Ticket section: title' },
  { name: 'ticketsOnline', label: 'Ticket line, when there IS a ticket link' },
  { name: 'priceDoor', label: 'Door price' },
  { name: 'priceDoorText', label: 'Door price: line under it' },
  { name: 'packTitle', label: 'Tasting packs: label' },
  { name: 'pack1', label: 'Small pack price' },
  { name: 'pack1Text', label: 'Small pack: what you get' },
  { name: 'pack2', label: 'Big pack price' },
  { name: 'pack2Text', label: 'Big pack: what you get' },
  { name: 'packNote', label: 'Token note' },
  { name: 'soon', label: 'Shown instead of the ticket button, until there is a ticket link' },
  { name: 'countries', label: 'Countries line' },
  { name: 'ctaTitle', label: 'Brewery call-out: title' },
  { name: 'ctaText', label: 'Brewery call-out: text', area: true },
  { name: 'also', label: 'Friday Ale Trail note', area: true },
]
const PLAIN_FIELDS: { key: string; label: string; hint?: string }[] = [
  { key: 'fest_ticket_url', label: 'Ticket link', hint: 'Leave empty to hide the ticket button.' },
  { key: 'fest_poster_url', label: 'Poster image link', hint: 'Leave empty to use the Collab Fest poster we uploaded.' },
  { key: 'fest_starts_at', label: 'Countdown start', hint: '2026-10-31T16:00:00+07:00' },
]

const FONT_CHOICES = ['Alfa Slab One', 'Creepster', 'Eater', 'Nosifer', 'Metal Mania', 'Rye', 'Bowlby One', 'Ultra', 'Bungee']

export function FestEditor({ url }: { url: string }) {
  const [vals, setVals] = useState<Record<string, string>>({})
  const [lang, setLang] = useState<'en' | 'vi'>('en')
  const [loading, setLoading] = useState(true)
  const [saved, setSaved] = useState<string | null>(null)
  const [error, setError] = useState('')

  useEffect(() => { load() }, [])

  async function load() {
    setLoading(true)
    const { data, error } = await supabase.from('site_settings').select('key, value').like('key', 'fest_%')
    setLoading(false)
    if (error) { setError(error.message); return }
    setVals(Object.fromEntries((data || []).map(r => [String(r.key), String(r.value ?? '')])))
  }

  async function save(key: string, value: string) {
    const { data: existing } = await supabase.from('site_settings').select('key').eq('key', key).maybeSingle()
    const res = existing
      ? await supabase.from('site_settings').update({ value, updated_at: new Date().toISOString() }).eq('key', key)
      : await supabase.from('site_settings').insert({ key, value, updated_at: new Date().toISOString() })
    if (res.error) { setError('Could not save. Try again.'); return }
    setError('')
    setSaved(key)
    setTimeout(() => setSaved(s => (s === key ? null : s)), 1600)
  }

  const set = (key: string, value: string) => setVals(v => ({ ...v, [key]: value }))
  const k = (name: string) => `fest_${name}_${lang}`

  if (loading) return <div style={{ padding: '12px 16px', fontSize: 13, color: 'var(--text-muted)' }}>Loading…</div>

  return (
    <div style={{ padding: '14px 16px 18px', borderTop: '1px solid var(--border-light)' }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: 10, flexWrap: 'wrap', marginBottom: 12 }}>
        <span style={{ fontSize: 13, color: 'var(--text-secondary)' }}>
          Change the wording on the public event page. Leave a box empty to use our standard wording.
        </span>
        <span style={{ marginLeft: 'auto', display: 'flex', gap: 4 }}>
          {(['en', 'vi'] as const).map(l => (
            <button key={l} className={lang === l ? 'btn-accent' : 'btn-outline'} onClick={() => setLang(l)} style={{ fontSize: 12, height: 30, padding: '0 12px' }}>
              {l === 'en' ? 'English' : 'Tiếng Việt'}
            </button>
          ))}
        </span>
        <a className="btn-outline" href={url} target="_blank" rel="noreferrer" style={{ fontSize: 12, height: 30, padding: '0 12px', textDecoration: 'none', display: 'inline-flex', alignItems: 'center' }}>Open page</a>
      </div>

      {error && <div style={{ color: 'var(--badge-red-text)', fontSize: 13, marginBottom: 10 }}>{error}</div>}

      <div style={{ display: 'grid', gap: 12 }}>
        {TEXT_FIELDS.map(f => (
          <label key={f.name} style={{ display: 'block' }}>
            <span style={{ display: 'block', fontSize: 12, fontWeight: 600, color: 'var(--text-secondary)', marginBottom: 5 }}>
              {f.label} {saved === k(f.name) && <span style={{ color: 'var(--accent)' }}>· saved</span>}
            </span>
            {f.area ? (
              <textarea className="input" rows={3} value={vals[k(f.name)] || ''} onChange={e => set(k(f.name), e.target.value)} onBlur={e => save(k(f.name), e.target.value)} />
            ) : (
              <input className="input" value={vals[k(f.name)] || ''} onChange={e => set(k(f.name), e.target.value)} onBlur={e => save(k(f.name), e.target.value)} />
            )}
            {f.hint && <span style={{ fontSize: 11.5, color: 'var(--text-muted)' }}>{f.hint}</span>}
          </label>
        ))}

        <label style={{ display: 'block' }}>
          <span style={{ display: 'block', fontSize: 12, fontWeight: 600, color: 'var(--text-secondary)', marginBottom: 5 }}>
            Title font {saved === 'fest_title_font' && <span style={{ color: 'var(--accent)' }}>· saved</span>}
          </span>
          <select className="input" style={{ maxWidth: 280 }} value={vals.fest_title_font || 'Alfa Slab One'}
            onChange={e => { set('fest_title_font', e.target.value); save('fest_title_font', e.target.value) }}>
            {FONT_CHOICES.map(f => <option key={f} value={f}>{f}</option>)}
          </select>
          <span style={{ fontSize: 11.5, color: 'var(--text-muted)' }}>The big headings on the event page. Changes the page straight away.</span>
        </label>

        {PLAIN_FIELDS.map(f => (
          <label key={f.key} style={{ display: 'block' }}>
            <span style={{ display: 'block', fontSize: 12, fontWeight: 600, color: 'var(--text-secondary)', marginBottom: 5 }}>
              {f.label} {saved === f.key && <span style={{ color: 'var(--accent)' }}>· saved</span>}
            </span>
            <input className="input" value={vals[f.key] || ''} onChange={e => set(f.key, e.target.value)} onBlur={e => save(f.key, e.target.value)} placeholder={f.hint} />
          </label>
        ))}
      </div>
    </div>
  )
}

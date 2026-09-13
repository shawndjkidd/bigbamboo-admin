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
  { name: 'tickets', label: 'Ticket button text' },
  { name: 'statCollabs', label: 'Stats strip 1: collabs', hint: 'A floor, e.g. 20+. Once more collabs than this are live on the page, the real count shows.' },
  { name: 'statCollabsLabel', label: 'Stats strip 1: label' },
  { name: 'statBreweries', label: 'Stats strip 2: breweries', hint: 'A floor, e.g. 10+. Once more breweries than this are on Fest collabs, the real count shows.' },
  { name: 'statBreweriesLabel', label: 'Stats strip 2: label' },
  { name: 'statCostumes', label: 'Stats strip 3: big word' },
  { name: 'statCostumesLabel', label: 'Stats strip 3: label' },
  { name: 'countriesTitle', label: 'Line above the country list' },
  { name: 'countries', label: 'Country list' },
  { name: 'plus', label: 'Lead-in above the three extras (e.g. “Plus…”)' },
  { name: 'draw1', label: 'Feature card 1: title' },
  { name: 'draw1Sub', label: 'Feature card 1: line under the title' },
  { name: 'draw2', label: 'Feature card 2: title' },
  { name: 'draw2Sub', label: 'Feature card 2: line under the title' },
  { name: 'draw3', label: 'Feature card 3: title' },
  { name: 'draw3Sub', label: 'Feature card 3: line under the title', hint: 'Optional. Empty shows the title alone.' },
  { name: 'lineupSub', label: 'Line under “What’s pouring”' },
  { name: 'navGetTickets', label: 'Nav: Get tickets button (shown only when there is a ticket link)' },
  { name: 'navMenu', label: 'Nav: menu button on phones (read out by screen readers)' },
  { name: 'tapsPrev', label: 'Tap carousel: previous arrow (read out by screen readers)' },
  { name: 'tapsNext', label: 'Tap carousel: next arrow (read out by screen readers)' },
  { name: 'justAdded', label: 'Tap card: badge for a beer announced in the last 7 days' },
  { name: 'kicked', label: 'Tap card: stamp once the keg has blown' },
  { name: 'comingSoon', label: 'Tap card: placeholder line (e.g. Next collab dropping soon)' },
  { name: 'pourLabel', label: 'Tap card: label under the pour size (e.g. ml / token)' },
  { name: 'step1', label: 'Step 1 heading (getting in)' },
  { name: 'step2', label: 'Step 2 heading (buying tokens)' },
  { name: 'priceTitle', label: 'Ticket section: title' },
  { name: 'ticketsOnline', label: 'Ticket line, when there IS a ticket link' },
  { name: 'priceDoor', label: 'Door price' },
  { name: 'priceDoorText', label: 'Door price: line under it (keep the pass-holder line out of here)' },
  { name: 'passNote', label: 'Small note under both ticket steps (BrewAsia pass holders)' },
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
  { key: 'fest_feature1_img', label: 'Feature card 1 artwork (pig BBQ)', hint: 'Image link, e.g. /images/pig-bbq.png. Empty shows the words alone.' },
  { key: 'fest_feature2_img', label: 'Feature card 2 artwork (BZZD bar)', hint: 'Image link, e.g. /images/bzzd-bar.png' },
  { key: 'fest_feature3_img', label: 'Feature card 3 artwork (live music)', hint: 'Image link, e.g. /images/live-music.png' },
  { key: 'fest_pour_ml', label: 'Pour size per token, in ml (shown on every tap card)', hint: '150' },
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

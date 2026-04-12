'use client'
import { useEffect, useState } from 'react'
import { supabase } from '@/lib/supabase'

const TIME_OPTIONS: string[] = []
for (let h = 0; h < 24; h++) {
  TIME_OPTIONS.push(`${String(h).padStart(2, '0')}:00`)
  TIME_OPTIONS.push(`${String(h).padStart(2, '0')}:30`)
}

function formatTime12(t: string): string {
  if (!t) return ''
  const [hStr, mStr] = t.split(':')
  const h = parseInt(hStr, 10)
  const m = mStr || '00'
  const ampm = h < 12 ? 'AM' : 'PM'
  const h12 = h % 12 === 0 ? 12 : h % 12
  return `${h12}:${m} ${ampm}`
}

type Settings = Record<string, string>

function Field({ label, k, placeholder, settings, onChange, onSave }: {
  label: string
  k: string
  placeholder?: string
  settings: Settings
  onChange: (k: string, v: string) => void
  onSave: (k: string, v: string) => void
}) {
  return (
    <div>
      <label className="label">{label}</label>
      <input
        className="input"
        type="text"
        value={settings[k] || ''}
        onChange={e => onChange(k, e.target.value)}
        onBlur={e => onSave(k, e.target.value)}
        placeholder={placeholder}
        name={`bb_field_${k}`}
        autoComplete="off"
        data-lpignore="true"
        data-form-type="other"
        data-1p-ignore="true"
      />
    </div>
  )
}

function HoursRow({ label, openKey, closeKey, settings, onSave }: {
  label: string
  openKey: string
  closeKey: string
  settings: Settings
  onSave: (k: string, v: string) => void
}) {
  const isClosed = settings[openKey] === 'closed'
  return (
    <div style={{ display: 'grid', gridTemplateColumns: '130px 1fr', alignItems: 'center', gap: 14 }}>
      <div style={{ fontSize: 14, fontWeight: 500, color: 'var(--text-secondary)' }}>{label}</div>
      {isClosed ? (
        <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
          <span style={{ fontSize: 14, color: 'var(--text-muted)', fontFamily: 'DM Mono, monospace' }}>Closed</span>
          <button
            className="btn-outline"
            style={{ fontSize: 12, padding: '4px 12px' }}
            onClick={() => { onSave(openKey, ''); onSave(closeKey, '') }}
          >Set Hours</button>
        </div>
      ) : (
        <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
          <select
            className="input"
            value={settings[openKey] || ''}
            onChange={e => onSave(openKey, e.target.value)}
            style={{ fontFamily: 'DM Mono, monospace', fontSize: 14, width: 130 }}
          >
            <option value="">Open time</option>
            {TIME_OPTIONS.map(t => <option key={t} value={t}>{formatTime12(t)}</option>)}
          </select>
          <span style={{ fontSize: 13, color: 'var(--text-muted)' }}>to</span>
          <select
            className="input"
            value={settings[closeKey] || ''}
            onChange={e => onSave(closeKey, e.target.value)}
            style={{ fontFamily: 'DM Mono, monospace', fontSize: 14, width: 130 }}
          >
            <option value="">Close time</option>
            {TIME_OPTIONS.map(t => <option key={t} value={t}>{formatTime12(t)}</option>)}
          </select>
          <button
            className="btn-outline"
            style={{ fontSize: 12, padding: '4px 12px' }}
            onClick={() => { onSave(openKey, 'closed'); onSave(closeKey, 'closed') }}
          >Closed</button>
        </div>
      )}
    </div>
  )
}

export default function HoursPage() {
  const [settings, setSettings] = useState<Settings>({})
  const [loading, setLoading] = useState(true)
  const [toast, setToast] = useState('')

  useEffect(() => {
    async function load() {
      const { data } = await supabase.from('site_settings').select('key,value')
      if (data) {
        const map: Settings = {}
        data.forEach((r: any) => { map[r.key] = r.value || '' })
        setSettings(map)
      }
      setLoading(false)
    }
    load()
  }, [])

  async function save(key: string, value: string) {
    setSettings(p => ({ ...p, [key]: value }))
    const { data: existing } = await supabase.from('site_settings').select('key').eq('key', key).single()
    if (existing) {
      await supabase.from('site_settings').update({ value, updated_at: new Date().toISOString() }).eq('key', key)
    } else {
      await supabase.from('site_settings').insert({ key, value, updated_at: new Date().toISOString() })
    }
    showToast('Saved')
  }

  const handleChange = (k: string, v: string) => setSettings(p => ({ ...p, [k]: v }))

  function showToast(msg: string) { setToast(msg); setTimeout(() => setToast(''), 2500) }

  if (loading) return <div style={{ padding: 40, textAlign: 'center', color: 'var(--text-muted)' }}>Loading...</div>

  return (
    <div style={{ maxWidth: 720 }}>
      <div className="page-title" style={{ marginBottom: 28 }}>Hours & Location</div>

      {/* Opening Hours */}
      <div className="card" style={{ padding: 24, marginBottom: 20 }}>
        <div className="section-title" style={{ marginBottom: 18 }}>Opening Hours</div>
        <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
          <HoursRow label="Monday"    openKey="hours_mon_open"    closeKey="hours_mon_close"    settings={settings} onSave={save} />
          <HoursRow label="Tuesday"   openKey="hours_tue_open"    closeKey="hours_tue_close"    settings={settings} onSave={save} />
          <HoursRow label="Wednesday" openKey="hours_wed_open"    closeKey="hours_wed_close"    settings={settings} onSave={save} />
          <HoursRow label="Thursday"  openKey="hours_thu_open"    closeKey="hours_thu_close"    settings={settings} onSave={save} />
          <HoursRow label="Friday"    openKey="hours_fri_open"    closeKey="hours_fri_close"    settings={settings} onSave={save} />
          <HoursRow label="Saturday"  openKey="hours_sat_open"    closeKey="hours_sat_close"    settings={settings} onSave={save} />
          <HoursRow label="Sunday"    openKey="hours_sun_open"    closeKey="hours_sun_close"    settings={settings} onSave={save} />
        </div>
      </div>

      {/* Location */}
      <div className="card" style={{ padding: 24, marginBottom: 20 }}>
        <div className="section-title" style={{ marginBottom: 18 }}>Location</div>
        <div style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
          <Field label="Street Address" k="address_street" placeholder="Duong So 10, An Phu"         settings={settings} onChange={handleChange} onSave={save} />
          <Field label="City"           k="address_city"   placeholder="Thu Duc, TP. Ho Chi Minh"    settings={settings} onChange={handleChange} onSave={save} />
          <Field label="Google Maps URL" k="google_maps_url" placeholder="https://maps.google.com/..." settings={settings} onChange={handleChange} onSave={save} />
        </div>
      </div>

      {/* Social Links */}
      <div className="card" style={{ padding: 24, marginBottom: 20 }}>
        <div className="section-title" style={{ marginBottom: 18 }}>Social & Order Links</div>
        <div style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
          <Field label="Instagram URL" k="instagram_url" placeholder="https://instagram.com/bigbamboo.saigon" settings={settings} onChange={handleChange} onSave={save} />
          <Field label="Facebook URL"  k="facebook_url"  placeholder="https://facebook.com/bigbamboo.vn"      settings={settings} onChange={handleChange} onSave={save} />
          <Field label="Grab URL"      k="grab_url"      placeholder="https://food.grab.com/..."               settings={settings} onChange={handleChange} onSave={save} />
          <div>
            <label className="label">Grab Coming Soon?</label>
            <select className="input" value={settings['grab_coming_soon'] || 'true'} onChange={e => save('grab_coming_soon', e.target.value)} style={{ width: 280 }}>
              <option value="true">Yes — show Coming Soon</option>
              <option value="false">No — show Grab button</option>
            </select>
          </div>
        </div>
      </div>

      {/* Hero Copy */}
      <div className="card" style={{ padding: 24 }}>
        <div className="section-title" style={{ marginBottom: 18 }}>Hero Copy</div>
        <div style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
          <Field label="Slogan"  k="slogan"  placeholder="Cold drinks. Warm nights. No bad vibes." settings={settings} onChange={handleChange} onSave={save} />
          <Field label="Tagline" k="tagline" placeholder="Tropical bar & venue · An Phu, Saigon"   settings={settings} onChange={handleChange} onSave={save} />
        </div>
      </div>

      {toast && <div className="toast">{toast}</div>}
    </div>
  )
}

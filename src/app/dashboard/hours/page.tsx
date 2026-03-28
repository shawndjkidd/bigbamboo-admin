'use client'
import { useEffect, useState } from 'react'
import { supabase } from '@/lib/supabase'

export default function HoursPage() {
  const [settings, setSettings] = useState<Record<string, string>>({})
  const [loading, setLoading] = useState(true)
  const [toast, setToast] = useState('')

  useEffect(() => {
    async function load() {
      const { data } = await supabase.from('site_settings').select('key,value')
      if (data) {
        const map: Record<string, string> = {}
        data.forEach((r: any) => { map[r.key] = r.value || '' })
        setSettings(map)
      }
      setLoading(false)
    }
    load()
  }, [])

  async function save(key: string, value: string) {
    setSettings(p => ({ ...p, [key]: value }))
    await supabase.from('site_settings').upsert({ key, value, updated_at: new Date().toISOString() }, { onConflict: 'key' })
    showToast('Saved')
  }

  function showToast(msg: string) { setToast(msg); setTimeout(() => setToast(''), 2500) }

  const Field = ({ label, k, placeholder, type = 'text' }: { label: string, k: string, placeholder?: string, type?: string }) => (
    <div>
      <label className="label">{label}</label>
      <input className="input" type={type} value={settings[k] || ''} onChange={e => setSettings(p => ({ ...p, [k]: e.target.value }))} onBlur={e => save(k, e.target.value)} placeholder={placeholder} />
    </div>
  )

  if (loading) return <div style={{ padding: 40, textAlign: 'center', color: 'var(--text-muted)' }}>Loading...</div>

  return (
    <div style={{ maxWidth: 720 }}>
      <div className="page-title" style={{ marginBottom: 28 }}>Hours & Location</div>

      {/* Opening Hours */}
      <div className="card" style={{ padding: 24, marginBottom: 20 }}>
        <div className="section-title" style={{ marginBottom: 18 }}>Opening Hours</div>
        <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
          {[
            { label: 'Mon \u2013 Thu', k: 'hours_mon_thu' },
            { label: 'Friday', k: 'hours_fri' },
            { label: 'Saturday', k: 'hours_sat' },
            { label: 'Sunday', k: 'hours_sun' },
          ].map(h => (
            <div key={h.k} style={{ display: 'grid', gridTemplateColumns: '130px 1fr', alignItems: 'center', gap: 14 }}>
              <div style={{ fontSize: 14, fontWeight: 500, color: 'var(--text-secondary)' }}>{h.label}</div>
              <input className="input" value={settings[h.k] || ''} onChange={e => setSettings(p => ({ ...p, [h.k]: e.target.value }))} onBlur={e => save(h.k, e.target.value)} placeholder={h.k.includes('mon') ? 'Closed' : '17:00 \u2013 23:00'} style={{ fontFamily: 'DM Mono, monospace', fontSize: 14 }} />
            </div>
          ))}
        </div>
      </div>

      {/* Location */}
      <div className="card" style={{ padding: 24, marginBottom: 20 }}>
        <div className="section-title" style={{ marginBottom: 18 }}>Location</div>
        <div style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
          <Field label="Street Address" k="address_street" placeholder="Duong So 10, An Phu" />
          <Field label="City" k="address_city" placeholder="Thu Duc, TP. Ho Chi Minh" />
          <Field label="Google Maps URL" k="google_maps_url" placeholder="https://maps.google.com/..." />
        </div>
      </div>

      {/* Social Links */}
      <div className="card" style={{ padding: 24, marginBottom: 20 }}>
        <div className="section-title" style={{ marginBottom: 18 }}>Social & Order Links</div>
        <div style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
          <Field label="Instagram URL" k="instagram_url" placeholder="https://instagram.com/bigbamboo.saigon" />
          <Field label="Facebook URL" k="facebook_url" placeholder="https://facebook.com/bigbamboo.vn" />
          <Field label="Grab URL" k="grab_url" placeholder="https://food.grab.com/..." />
          <div>
            <label className="label">Grab Coming Soon?</label>
            <select className="input" value={settings['grab_coming_soon'] || 'true'} onChange={e => save('grab_coming_soon', e.target.value)} style={{ width: 280 }}>
              <option value="true">Yes \u2014 show Coming Soon</option>
              <option value="false">No \u2014 show Grab button</option>
            </select>
          </div>
        </div>
      </div>

      {/* Hero Copy */}
      <div className="card" style={{ padding: 24 }}>
        <div className="section-title" style={{ marginBottom: 18 }}>Hero Copy</div>
        <div style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
          <Field label="Slogan" k="slogan" placeholder="Cold drinks. Warm nights. No bad vibes." />
          <Field label="Tagline" k="tagline" placeholder="Tropical bar & venue \u00b7 An Phu, Saigon" />
        </div>
      </div>

      {toast && <div className="toast">{toast}</div>}
    </div>
  )
}

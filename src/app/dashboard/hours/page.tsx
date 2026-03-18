'use client'
import { useEffect, useState } from 'react'
import { supabase } from '@/lib/supabase'

export default function HoursPage() {
  const [settings, setSettings] = useState<Record<string,string>>({})
  const [loading, setLoading] = useState(true)
  const [toast, setToast] = useState('')

  useEffect(() => {
    async function load() {
      const { data } = await supabase.from('site_settings').select('key,value')
      if (data) {
        const map: Record<string,string> = {}
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
    showToast('Saved!')
  }

  function showToast(msg: string) { setToast(msg); setTimeout(() => setToast(''), 2500) }

  const Field = ({ label, k, placeholder, type='text' }: { label:string, k:string, placeholder?:string, type?:string }) => (
    <div>
      <label className="label">{label}</label>
      <input className="input" type={type} value={settings[k]||''} onChange={e => setSettings(p=>({...p,[k]:e.target.value}))} onBlur={e => save(k, e.target.value)} placeholder={placeholder} />
    </div>
  )

  if (loading) return <div style={{color:'rgba(255,255,255,0.4)',padding:20}}>Loading...</div>

  return (
    <div style={{maxWidth:640}}>
      <div style={{fontFamily:'Bebas Neue',fontSize:32,letterSpacing:'0.06em',marginBottom:24}}>Hours & Location</div>

      {/* Opening Hours */}
      <div className="card" style={{padding:20,marginBottom:16}}>
        <div style={{fontFamily:'DM Mono',fontSize:10,letterSpacing:'0.18em',textTransform:'uppercase',color:'#3AA8A4',marginBottom:16}}>Opening Hours</div>
        <div style={{display:'flex',flexDirection:'column',gap:10}}>
          {[
            { label:'Mon – Thu', k:'hours_mon_thu' },
            { label:'Friday', k:'hours_fri' },
            { label:'Saturday', k:'hours_sat' },
            { label:'Sunday', k:'hours_sun' },
          ].map(h => (
            <div key={h.k} style={{display:'grid',gridTemplateColumns:'120px 1fr',alignItems:'center',gap:12}}>
              <div style={{fontSize:13,color:'rgba(255,255,255,0.5)'}}>{h.label}</div>
              <input className="input" value={settings[h.k]||''} onChange={e=>setSettings(p=>({...p,[h.k]:e.target.value}))} onBlur={e=>save(h.k, e.target.value)} placeholder={h.k.includes('mon') ? 'closed' : '17:00-23:00'} style={{fontFamily:'DM Mono',fontSize:13}} />
            </div>
          ))}
        </div>
      </div>

      {/* Location */}
      <div className="card" style={{padding:20,marginBottom:16}}>
        <div style={{fontFamily:'DM Mono',fontSize:10,letterSpacing:'0.18em',textTransform:'uppercase',color:'#3AA8A4',marginBottom:16}}>Location</div>
        <div style={{display:'flex',flexDirection:'column',gap:10}}>
          <Field label="Street Address" k="address_street" placeholder="Đường Số 10, An Phú" />
          <Field label="City" k="address_city" placeholder="Thủ Đức, TP. Hồ Chí Minh" />
          <Field label="Google Maps URL" k="google_maps_url" placeholder="https://maps.google.com/..." />
        </div>
      </div>

      {/* Social Links */}
      <div className="card" style={{padding:20,marginBottom:16}}>
        <div style={{fontFamily:'DM Mono',fontSize:10,letterSpacing:'0.18em',textTransform:'uppercase',color:'#3AA8A4',marginBottom:16}}>Social & Order Links</div>
        <div style={{display:'flex',flexDirection:'column',gap:10}}>
          <Field label="Instagram URL" k="instagram_url" placeholder="https://instagram.com/bigbamboo.saigon" />
          <Field label="Facebook URL" k="facebook_url" placeholder="https://facebook.com/bigbamboo.vn" />
          <Field label="Grab URL" k="grab_url" placeholder="https://food.grab.com/..." />
          <div>
            <label className="label">Grab Coming Soon?</label>
            <select className="input" value={settings['grab_coming_soon']||'true'} onChange={e=>save('grab_coming_soon', e.target.value)} style={{cursor:'pointer'}}>
              <option value="true">Yes — show "Coming Soon"</option>
              <option value="false">No — show Grab button</option>
            </select>
          </div>
        </div>
      </div>

      {/* Hero Copy */}
      <div className="card" style={{padding:20}}>
        <div style={{fontFamily:'DM Mono',fontSize:10,letterSpacing:'0.18em',textTransform:'uppercase',color:'#3AA8A4',marginBottom:16}}>Hero Copy</div>
        <div style={{display:'flex',flexDirection:'column',gap:10}}>
          <Field label="Slogan" k="slogan" placeholder="Cold drinks. Warm nights. No bad vibes." />
          <Field label="Tagline" k="tagline" placeholder="Tropical bar & venue · An Phú, Saigon" />
        </div>
      </div>

      {toast && <div style={{position:'fixed',bottom:24,right:24,background:'#00B14F',color:'#fff',padding:'11px 20px',borderRadius:8,fontFamily:'DM Mono',fontSize:11,letterSpacing:'0.1em',zIndex:9999}}>{toast}</div>}
    </div>
  )
}

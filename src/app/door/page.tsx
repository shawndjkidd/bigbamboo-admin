'use client'
import { useEffect, useRef, useState } from 'react'
import { supabase } from '@/lib/supabase'

const DOOR_PIN = '2024'

type Order = {
  id: string
  name: string
  email: string
  phone: string
  quantity: number
  status: string
  checked_in: boolean
  event_title: string
}

export default function DoorPage() {
  const [authed, setAuthed] = useState(false)
  const [pin, setPin] = useState('')
  const [pinError, setPinError] = useState(false)
  const [mode, setMode] = useState<'home' | 'scan' | 'manual'>('home')
  const [search, setSearch] = useState('')
  const [results, setResults] = useState<Order[]>([])
  const [selected, setSelected] = useState<Order | null>(null)
  const [scanning, setScanning] = useState(false)
  const [toast, setToast] = useState('')
  const [loading, setLoading] = useState(false)
  const videoRef = useRef<HTMLVideoElement>(null)
  const canvasRef = useRef<HTMLCanvasElement>(null)
  const intervalRef = useRef<any>(null)

  useEffect(() => {
    const saved = sessionStorage.getItem('door_authed')
    if (saved === 'yes') setAuthed(true)
  }, [])

  useEffect(() => { return () => stopCamera() }, [])

  function submitPin() {
    if (pin === DOOR_PIN) {
      setAuthed(true)
      sessionStorage.setItem('door_authed', 'yes')
    } else {
      setPinError(true)
      setPin('')
      setTimeout(() => setPinError(false), 1500)
    }
  }

  async function startCamera() {
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ video: { facingMode: 'environment' } })
      if (videoRef.current) {
        videoRef.current.srcObject = stream
        videoRef.current.play()
        setScanning(true)
        intervalRef.current = setInterval(scanFrame, 600)
      }
    } catch {
      showToast('Camera not available — use manual search')
      setMode('manual')
    }
  }

  function stopCamera() {
    clearInterval(intervalRef.current)
    if (videoRef.current?.srcObject) {
      (videoRef.current.srcObject as MediaStream).getTracks().forEach(t => t.stop())
      videoRef.current.srcObject = null
    }
    setScanning(false)
  }

  async function scanFrame() {
    if (!videoRef.current || !canvasRef.current) return
    const video = videoRef.current
    const canvas = canvasRef.current
    canvas.width = video.videoWidth
    canvas.height = video.videoHeight
    const ctx = canvas.getContext('2d')
    if (!ctx || video.videoWidth === 0) return
    ctx.drawImage(video, 0, 0)
    try {
      const detector = new (window as any).BarcodeDetector({ formats: ['qr_code'] })
      const codes = await detector.detect(canvas)
      if (codes.length > 0) {
        stopCamera()
        await lookupQR(codes[0].rawValue)
      }
    } catch {}
  }

  async function lookupQR(raw: string) {
    const shortId = raw.split('|')[0].replace('BBQ-', '').toLowerCase()
    const namePart = raw.split('|')[1] || ''
    setLoading(true)
    const { data } = await supabase.from('ticket_orders').select('*').ilike('id', shortId + '%').limit(1)
    setLoading(false)
    if (data && data.length > 0) { setSelected(data[0]) }
    else { await searchByName(namePart) }
  }

  async function searchByName(name: string) {
    if (!name.trim()) return
    setLoading(true)
    const { data } = await supabase.from('ticket_orders').select('*').ilike('name', '%' + name + '%').neq('status', 'cancelled').limit(10)
    setLoading(false)
    setResults(data || [])
    if (data && data.length === 1) setSelected(data[0])
  }

  async function checkIn(order: Order) {
    const newVal = !order.checked_in
    await supabase.from('ticket_orders').update({ checked_in: newVal, status: 'confirmed', checked_in_at: newVal ? new Date().toISOString() : null }).eq('id', order.id)
    const updated = { ...order, checked_in: newVal, status: 'confirmed' }
    setSelected(updated)
    setResults(prev => prev.map(o => o.id === order.id ? updated : o))
    showToast(newVal ? '✓ Checked in!' : 'Removed check-in')
  }

  function showToast(msg: string) { setToast(msg); setTimeout(() => setToast(''), 3000) }

  function reset() { stopCamera(); setSelected(null); setResults([]); setSearch(''); setMode('home') }

  if (!authed) {
    return (
      <div style={{ minHeight: '100vh', background: '#0E2220', display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', padding: 24 }}>
        <div style={{ fontFamily: 'Bebas Neue, sans-serif', fontSize: 40, letterSpacing: '0.06em', color: '#E8A820', marginBottom: 4 }}>BigBamBoo</div>
        <div style={{ fontFamily: 'DM Mono, monospace', fontSize: 10, letterSpacing: '0.2em', textTransform: 'uppercase' as const, color: 'rgba(255,255,255,0.3)', marginBottom: 48 }}>Door Mode</div>
        <div style={{ background: '#1A3A38', border: '1px solid rgba(255,255,255,0.1)', borderRadius: 16, padding: 32, width: '100%', maxWidth: 340, textAlign: 'center' as const }}>
          <div style={{ fontFamily: 'DM Mono, monospace', fontSize: 11, letterSpacing: '0.15em', textTransform: 'uppercase' as const, color: 'rgba(255,255,255,0.4)', marginBottom: 20 }}>Enter PIN</div>
          <input type="password" inputMode="numeric" maxLength={6} value={pin} onChange={e => setPin(e.target.value)} onKeyDown={e => e.key === 'Enter' && submitPin()}
            style={{ width: '100%', textAlign: 'center' as const, fontSize: 32, letterSpacing: '0.3em', background: pinError ? 'rgba(192,48,32,0.15)' : 'rgba(255,255,255,0.06)', border: `2px solid ${pinError ? '#E06060' : 'rgba(255,255,255,0.12)'}`, borderRadius: 10, padding: '14px 20px', color: '#F5EED8', outline: 'none', marginBottom: 16, boxSizing: 'border-box' as const, fontFamily: 'DM Mono, monospace' }}
            placeholder="••••" autoFocus />
          {pinError && <div style={{ color: '#E06060', fontFamily: 'DM Mono, monospace', fontSize: 11, marginBottom: 12 }}>Wrong PIN — try again</div>}
          <button onClick={submitPin} style={{ width: '100%', background: '#E8A820', color: '#1a0800', border: 'none', borderRadius: 10, padding: '14px', fontSize: 18, fontFamily: 'Bebas Neue, sans-serif', letterSpacing: '0.1em', cursor: 'pointer' }}>Enter</button>
        </div>
      </div>
    )
  }

  if (mode === 'home') {
    return (
      <div style={{ minHeight: '100vh', background: '#0E2220', display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', padding: 24, gap: 16 }}>
        <div style={{ fontFamily: 'Bebas Neue, sans-serif', fontSize: 44, letterSpacing: '0.06em', color: '#E8A820' }}>BigBamBoo</div>
        <div style={{ fontFamily: 'DM Mono, monospace', fontSize: 11, letterSpacing: '0.18em', textTransform: 'uppercase' as const, color: 'rgba(255,255,255,0.35)', marginBottom: 24 }}>🎟 Door Check-In</div>
        <button onClick={() => { setMode('scan'); startCamera() }} style={{ width: '100%', maxWidth: 340, background: '#2D5A52', border: '2px solid rgba(255,255,255,0.12)', borderRadius: 16, padding: '28px 24px', color: '#F5EED8', cursor: 'pointer', textAlign: 'center' as const }}>
          <div style={{ fontSize: 48, marginBottom: 8 }}>📷</div>
          <div style={{ fontFamily: 'Bebas Neue, sans-serif', fontSize: 26, letterSpacing: '0.06em' }}>Scan QR Code</div>
          <div style={{ fontFamily: 'DM Mono, monospace', fontSize: 10, color: 'rgba(255,255,255,0.4)', letterSpacing: '0.1em', textTransform: 'uppercase' as const, marginTop: 4 }}>Point camera at ticket</div>
        </button>
        <button onClick={() => setMode('manual')} style={{ width: '100%', maxWidth: 340, background: '#1A3A38', border: '2px solid rgba(255,255,255,0.12)', borderRadius: 16, padding: '28px 24px', color: '#F5EED8', cursor: 'pointer', textAlign: 'center' as const }}>
          <div style={{ fontSize: 48, marginBottom: 8 }}>🔍</div>
          <div style={{ fontFamily: 'Bebas Neue, sans-serif', fontSize: 26, letterSpacing: '0.06em' }}>Search by Name</div>
          <div style={{ fontFamily: 'DM Mono, monospace', fontSize: 10, color: 'rgba(255,255,255,0.4)', letterSpacing: '0.1em', textTransform: 'uppercase' as const, marginTop: 4 }}>Type guest name</div>
        </button>
        <button onClick={() => { sessionStorage.removeItem('door_authed'); setAuthed(false) }} style={{ fontFamily: 'DM Mono, monospace', fontSize: 10, letterSpacing: '0.1em', textTransform: 'uppercase' as const, color: 'rgba(255,255,255,0.2)', background: 'none', border: 'none', cursor: 'pointer', marginTop: 24 }}>Lock Screen</button>
      </div>
    )
  }

  if (mode === 'scan' && !selected) {
    return (
      <div style={{ minHeight: '100vh', background: '#0E2220', display: 'flex', flexDirection: 'column' }}>
        <div style={{ padding: '16px 20px', display: 'flex', alignItems: 'center', gap: 12 }}>
          <button onClick={reset} style={{ background: 'rgba(255,255,255,0.08)', border: 'none', color: 'rgba(255,255,255,0.6)', padding: '8px 16px', borderRadius: 100, cursor: 'pointer', fontFamily: 'DM Mono, monospace', fontSize: 11 }}>← Back</button>
          <div style={{ fontFamily: 'Bebas Neue, sans-serif', fontSize: 22, letterSpacing: '0.06em', color: '#F5EED8' }}>Scan QR Code</div>
        </div>
        <video ref={videoRef} style={{ width: '100%', flex: 1, objectFit: 'cover' as const, background: '#000' }} />
        <canvas ref={canvasRef} style={{ display: 'none' }} />
        <div style={{ padding: 20, textAlign: 'center' as const }}>
          {loading ? <div style={{ color: '#E8A820', fontFamily: 'DM Mono, monospace', fontSize: 12 }}>Looking up ticket...</div>
            : <div style={{ color: 'rgba(255,255,255,0.4)', fontFamily: 'DM Mono, monospace', fontSize: 11 }}>POINT CAMERA AT GUEST QR CODE</div>}
          <button onClick={() => { stopCamera(); setMode('manual') }} style={{ marginTop: 16, fontFamily: 'DM Mono, monospace', fontSize: 10, color: 'rgba(255,255,255,0.35)', background: 'none', border: 'none', cursor: 'pointer' }}>Switch to manual search</button>
        </div>
      </div>
    )
  }

  if (mode === 'manual' && !selected) {
    return (
      <div style={{ minHeight: '100vh', background: '#0E2220', padding: 20 }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 12, marginBottom: 20 }}>
          <button onClick={reset} style={{ background: 'rgba(255,255,255,0.08)', border: 'none', color: 'rgba(255,255,255,0.6)', padding: '8px 16px', borderRadius: 100, cursor: 'pointer', fontFamily: 'DM Mono, monospace', fontSize: 11 }}>← Back</button>
          <div style={{ fontFamily: 'Bebas Neue, sans-serif', fontSize: 22, letterSpacing: '0.06em', color: '#F5EED8' }}>Search Guest</div>
        </div>
        <div style={{ display: 'flex', gap: 8, marginBottom: 20 }}>
          <input autoFocus type="text" value={search} onChange={e => setSearch(e.target.value)} onKeyDown={e => e.key === 'Enter' && searchByName(search)} placeholder="Guest name..."
            style={{ flex: 1, background: 'rgba(255,255,255,0.08)', border: '1px solid rgba(255,255,255,0.15)', borderRadius: 10, padding: '14px 16px', color: '#F5EED8', fontSize: 16, outline: 'none' }} />
          <button onClick={() => searchByName(search)} style={{ background: '#E8A820', color: '#1a0800', border: 'none', borderRadius: 10, padding: '14px 20px', fontFamily: 'Bebas Neue, sans-serif', fontSize: 18, cursor: 'pointer' }}>Search</button>
        </div>
        {loading && <div style={{ textAlign: 'center' as const, color: 'rgba(255,255,255,0.4)', fontFamily: 'DM Mono, monospace', fontSize: 12, padding: 20 }}>Searching...</div>}
        {results.length === 0 && !loading && search && <div style={{ textAlign: 'center' as const, color: 'rgba(255,255,255,0.3)', fontFamily: 'DM Mono, monospace', fontSize: 12, padding: 20 }}>No results found</div>}
        {results.map(order => (
          <div key={order.id} onClick={() => setSelected(order)} style={{ background: '#1A3A38', border: `1px solid ${order.checked_in ? 'rgba(0,200,88,0.3)' : 'rgba(255,255,255,0.1)'}`, borderRadius: 12, padding: '14px 16px', marginBottom: 10, cursor: 'pointer' }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
              <div>
                <div style={{ fontWeight: 700, fontSize: 17, color: '#F5EED8' }}>{order.name}</div>
                <div style={{ fontFamily: 'DM Mono, monospace', fontSize: 11, color: 'rgba(255,255,255,0.4)', marginTop: 2 }}>{order.quantity} ticket{order.quantity > 1 ? 's' : ''} · {order.event_title}</div>
              </div>
              {order.checked_in ? <span style={{ background: 'rgba(0,200,88,0.15)', color: '#00C858', border: '1px solid rgba(0,200,88,0.3)', padding: '3px 10px', borderRadius: 100, fontSize: 10, fontFamily: 'DM Mono, monospace' }}>✓ IN</span>
                : <span style={{ color: 'rgba(255,255,255,0.3)', fontSize: 20 }}>›</span>}
            </div>
          </div>
        ))}
      </div>
    )
  }

  if (selected) {
    const isIn = selected.checked_in
    const isPaid = selected.status === 'confirmed'
    return (
      <div style={{ minHeight: '100vh', background: '#0E2220', display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', padding: 24 }}>
        <div style={{ width: '100%', maxWidth: 380 }}>
          <button onClick={reset} style={{ background: 'rgba(255,255,255,0.08)', border: 'none', color: 'rgba(255,255,255,0.6)', padding: '8px 16px', borderRadius: 100, cursor: 'pointer', fontFamily: 'DM Mono, monospace', fontSize: 11, marginBottom: 24 }}>← Back</button>
          <div style={{ background: '#1A3A38', border: `3px solid ${isIn ? '#00C858' : isPaid ? '#E8A820' : '#E06060'}`, borderRadius: 20, padding: 32, textAlign: 'center' as const }}>
            <div style={{ fontSize: 72, marginBottom: 12 }}>{isIn ? '✅' : isPaid ? '🎟️' : '⚠️'}</div>
            <div style={{ fontFamily: 'Bebas Neue, sans-serif', fontSize: 34, letterSpacing: '0.03em', color: '#F5EED8', marginBottom: 4 }}>{selected.name}</div>
            <div style={{ fontFamily: 'DM Mono, monospace', fontSize: 12, color: 'rgba(255,255,255,0.45)', marginBottom: 6 }}>{selected.event_title}</div>
            <div style={{ fontFamily: 'DM Mono, monospace', fontSize: 13, color: '#E8A820', marginBottom: 20 }}>{selected.quantity} ticket{selected.quantity > 1 ? 's' : ''}</div>
            {!isPaid && <div style={{ background: 'rgba(192,48,32,0.12)', border: '1px solid rgba(192,48,32,0.3)', borderRadius: 10, padding: '12px 16px', marginBottom: 20, color: '#E06060', fontFamily: 'DM Mono, monospace', fontSize: 11 }}>⚠ PAYMENT NOT CONFIRMED</div>}
            {isIn && <div style={{ background: 'rgba(0,200,88,0.1)', border: '1px solid rgba(0,200,88,0.25)', borderRadius: 10, padding: '12px 16px', marginBottom: 20, color: '#00C858', fontFamily: 'DM Mono, monospace', fontSize: 11 }}>✓ ALREADY CHECKED IN</div>}
            <button onClick={() => checkIn(selected)} style={{ width: '100%', padding: '18px', background: isIn ? 'rgba(192,48,32,0.15)' : 'rgba(0,177,79,0.15)', border: `2px solid ${isIn ? 'rgba(192,48,32,0.4)' : 'rgba(0,177,79,0.4)'}`, color: isIn ? '#E06060' : '#00C858', borderRadius: 14, fontFamily: 'Bebas Neue, sans-serif', fontSize: 28, letterSpacing: '0.06em', cursor: 'pointer' }}>
              {isIn ? 'Undo Check-In' : '✓ Check In'}
            </button>
          </div>
        </div>
        {toast && <div style={{ position: 'fixed', bottom: 32, left: '50%', transform: 'translateX(-50%)', background: '#00B14F', color: '#fff', padding: '14px 32px', borderRadius: 10, fontFamily: 'DM Mono, monospace', fontSize: 14, zIndex: 9999 }}>{toast}</div>}
      </div>
    )
  }

  return null
}

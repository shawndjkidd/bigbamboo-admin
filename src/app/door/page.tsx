'use client'
import { useEffect, useRef, useState } from 'react'
import { useRouter } from 'next/navigation'
import Script from 'next/script'
import { supabase } from '@/lib/supabase'

export default function DoorPage() {
  const router = useRouter()
  const [mode, setMode] = useState<'scan' | 'search'>('scan')
  const [events, setEvents] = useState<any[]>([])
  const [selectedEvent, setSelectedEvent] = useState('')
  const [orders, setOrders] = useState<any[]>([])
  const [searchQuery, setSearchQuery] = useState('')
  const [result, setResult] = useState<{ type: 'success' | 'error' | 'info', message: string } | null>(null)
  const [scanning, setScanning] = useState(false)
  const [jsQRLoaded, setJsQRLoaded] = useState(false)
  const videoRef = useRef<HTMLVideoElement>(null)
  const canvasRef = useRef<HTMLCanvasElement>(null)
  const scanIntervalRef = useRef<any>(null)
  const lastScannedRef = useRef<string>('')
  const streamRef = useRef<MediaStream | null>(null)

  useEffect(() => {
    loadEvents()
  }, [])

  useEffect(() => {
    if (selectedEvent) loadOrders()
  }, [selectedEvent])

  useEffect(() => {
    if (mode === 'scan' && selectedEvent) startCamera()
    else stopCamera()
    return () => stopCamera()
  }, [mode, selectedEvent])

  // When jsQR loads and camera is waiting, start the jsQR scan loop
  useEffect(() => {
    if (jsQRLoaded && scanning && !scanIntervalRef.current && (window as any).jsQR) {
      startJsQRScan()
    }
  }, [jsQRLoaded])

  async function loadEvents() {
    const { data } = await supabase.from('events').select('id, title, event_date').eq('is_published', true).order('event_date', { ascending: false })
    setEvents(data || [])
    if (data && data.length > 0) setSelectedEvent(data[0].id)
  }

  async function loadOrders() {
    const { data } = await supabase.from('ticket_orders').select('*').eq('event_id', selectedEvent).eq('status', 'confirmed').order('name')
    setOrders(data || [])
  }

  async function checkInGuest(orderId: string, name: string) {
    const order = orders.find(o => o.id === orderId)
    if (order?.checked_in) {
      setResult({ type: 'info', message: name + ' is already checked in' })
      return
    }
    const { error } = await supabase.from('ticket_orders').update({ checked_in: true, checked_in_at: new Date().toISOString() }).eq('id', orderId)
    if (error) {
      setResult({ type: 'error', message: 'Error: ' + error.message })
      return
    }
    setOrders(prev => prev.map(o => o.id === orderId ? { ...o, checked_in: true } : o))
    setResult({ type: 'success', message: '✓ ' + name + ' checked in!' })
    setTimeout(() => setResult(null), 3000)
  }

  async function handleQRData(data: string) {
    // QR format: BBQ-{id8}|{name}|{event_title}
    if (!data.startsWith('BBQ-')) {
      setResult({ type: 'error', message: 'Invalid QR code' })
      setTimeout(() => setResult(null), 2000)
      return
    }
    const parts = data.split('|')
    // QR stores uppercase ID fragment, but Supabase UUIDs are lowercase
    const idFragment = parts[0].replace('BBQ-', '').toLowerCase()
    const name = parts[1] || 'Guest'

    // Find matching order by ID prefix
    const match = orders.find(o => o.id.startsWith(idFragment))
    if (!match) {
      // Try broader search across all confirmed orders for this event
      const { data: found } = await supabase.from('ticket_orders').select('*').eq('event_id', selectedEvent).like('id', idFragment + '%').single()
      if (found) {
        await checkInGuest(found.id, found.name)
        loadOrders()
        return
      }
      setResult({ type: 'error', message: 'Ticket not found for this event' })
      setTimeout(() => setResult(null), 3000)
      return
    }
    await checkInGuest(match.id, match.name)
  }

  function startCamera() {
    if (!navigator.mediaDevices) {
      setResult({ type: 'error', message: 'Camera not available on this device' })
      return
    }
    setScanning(true)
    lastScannedRef.current = ''
    navigator.mediaDevices.getUserMedia({ video: { facingMode: 'environment', width: { ideal: 1280 }, height: { ideal: 720 } } })
      .then(stream => {
        streamRef.current = stream
        if (videoRef.current) {
          videoRef.current.srcObject = stream
          videoRef.current.play()
          // Use BarcodeDetector if available (Chrome Android), otherwise jsQR fallback
          if ('BarcodeDetector' in window) {
            const detector = new (window as any).BarcodeDetector({ formats: ['qr_code'] })
            scanIntervalRef.current = setInterval(async () => {
              if (!videoRef.current || videoRef.current.readyState < 2) return
              try {
                const barcodes = await detector.detect(videoRef.current)
                if (barcodes.length > 0) {
                  const value = barcodes[0].rawValue
                  if (value && value !== lastScannedRef.current) {
                    lastScannedRef.current = value
                    stopCamera()
                    await handleQRData(value)
                    setTimeout(() => { if (mode === 'scan') startCamera() }, 2000)
                  }
                }
              } catch {}
            }, 300)
          } else if ((window as any).jsQR) {
            startJsQRScan()
          } else {
            setResult({ type: 'info', message: 'Loading scanner...' })
          }
        }
      })
      .catch(() => {
        setResult({ type: 'error', message: 'Camera access denied. Please allow camera access and try again.' })
        setScanning(false)
      })
  }

  function startJsQRScan() {
    const jsQR = (window as any).jsQR
    if (!jsQR) return
    setResult(null)
    scanIntervalRef.current = setInterval(() => {
      if (!videoRef.current || videoRef.current.readyState < 2 || !canvasRef.current) return
      const video = videoRef.current
      const canvas = canvasRef.current
      const ctx = canvas.getContext('2d')
      if (!ctx) return
      canvas.width = video.videoWidth
      canvas.height = video.videoHeight
      ctx.drawImage(video, 0, 0, canvas.width, canvas.height)
      const imageData = ctx.getImageData(0, 0, canvas.width, canvas.height)
      const code = jsQR(imageData.data, imageData.width, imageData.height, { inversionAttempts: 'dontInvert' })
      if (code && code.data && code.data !== lastScannedRef.current) {
        lastScannedRef.current = code.data
        stopCamera()
        handleQRData(code.data)
        setTimeout(() => { if (mode === 'scan') startCamera() }, 2000)
      }
    }, 250)
  }

  function stopCamera() {
    if (scanIntervalRef.current) { clearInterval(scanIntervalRef.current); scanIntervalRef.current = null }
    if (streamRef.current) {
      streamRef.current.getTracks().forEach(t => t.stop())
      streamRef.current = null
    }
    if (videoRef.current) videoRef.current.srcObject = null
    setScanning(false)
  }

  const filteredOrders = orders.filter(o => {
    if (!searchQuery) return true
    const q = searchQuery.toLowerCase()
    return o.name?.toLowerCase().includes(q) || o.email?.toLowerCase().includes(q) || o.phone?.toLowerCase().includes(q)
  })

  const checkedInCount = orders.filter(o => o.checked_in).length

  return (
    <>
    <Script src="https://cdn.jsdelivr.net/npm/jsqr@1.4.0/dist/jsQR.min.js" strategy="afterInteractive"
      onLoad={() => setJsQRLoaded(true)} />
    <div style={{ minHeight: '100vh', background: '#0d0d0d', color: '#fff', fontFamily: '-apple-system, system-ui, sans-serif' }}>
      {/* Header */}
      <div style={{ padding: '16px 20px', borderBottom: '1px solid rgba(255,255,255,0.1)', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
          <button onClick={() => { stopCamera(); router.push('/dashboard'); }} style={{ background: 'rgba(255,255,255,0.08)', border: 'none', borderRadius: 8, width: 36, height: 36, display: 'flex', alignItems: 'center', justifyContent: 'center', cursor: 'pointer', color: 'rgba(255,255,255,0.6)', fontSize: 18 }}>←</button>
          <div>
            <div style={{ fontFamily: 'Bebas Neue, sans-serif', fontSize: 24, letterSpacing: '0.04em', color: '#e8772e' }}>BigBamBoo</div>
            <div style={{ fontSize: 12, color: 'rgba(255,255,255,0.4)' }}>Door Check-In</div>
          </div>
        </div>
        <div style={{ textAlign: 'right' }}>
          <div style={{ fontSize: 24, fontWeight: 700, color: '#e8772e' }}>{checkedInCount}</div>
          <div style={{ fontSize: 11, color: 'rgba(255,255,255,0.4)' }}>checked in</div>
        </div>
      </div>

      {/* Event selector */}
      <div style={{ padding: '12px 20px' }}>
        <select value={selectedEvent} onChange={e => setSelectedEvent(e.target.value)} style={{ width: '100%', padding: '12px 16px', background: '#1a1a1a', color: '#fff', border: '1px solid rgba(255,255,255,0.15)', borderRadius: 10, fontSize: 15 }}>
          <option value="">Select Event</option>
          {events.map(ev => <option key={ev.id} value={ev.id}>{ev.title}</option>)}
        </select>
      </div>

      {selectedEvent && (
        <>
          {/* Mode toggle */}
          <div style={{ display: 'flex', gap: 8, padding: '0 20px 12px' }}>
            <button onClick={() => setMode('scan')} style={{ flex: 1, padding: '10px', borderRadius: 10, fontSize: 14, fontWeight: 600, cursor: 'pointer', border: 'none', background: mode === 'scan' ? '#e8772e' : '#1a1a1a', color: mode === 'scan' ? '#fff' : 'rgba(255,255,255,0.5)' }}>
              Scan QR
            </button>
            <button onClick={() => setMode('search')} style={{ flex: 1, padding: '10px', borderRadius: 10, fontSize: 14, fontWeight: 600, cursor: 'pointer', border: 'none', background: mode === 'search' ? '#e8772e' : '#1a1a1a', color: mode === 'search' ? '#fff' : 'rgba(255,255,255,0.5)' }}>
              Search Guest
            </button>
          </div>

          {/* Result banner */}
          {result && (
            <div style={{ margin: '0 20px 12px', padding: '14px 18px', borderRadius: 10, fontSize: 15, fontWeight: 600, textAlign: 'center', background: result.type === 'success' ? 'rgba(34,197,94,0.15)' : result.type === 'error' ? 'rgba(239,68,68,0.15)' : 'rgba(59,130,246,0.15)', color: result.type === 'success' ? '#22c55e' : result.type === 'error' ? '#ef4444' : '#3b82f6', border: '1px solid ' + (result.type === 'success' ? 'rgba(34,197,94,0.3)' : result.type === 'error' ? 'rgba(239,68,68,0.3)' : 'rgba(59,130,246,0.3)') }}>
              {result.message}
            </div>
          )}

          {/* Scan mode */}
          {mode === 'scan' && (
            <div style={{ padding: '0 20px' }}>
              <div style={{ position: 'relative', width: '100%', maxWidth: 400, margin: '0 auto', aspectRatio: '1', borderRadius: 16, overflow: 'hidden', background: '#000', border: '2px solid rgba(232,119,46,0.3)' }}>
                <video ref={videoRef} style={{ width: '100%', height: '100%', objectFit: 'cover' }} playsInline muted />
                <canvas ref={canvasRef} style={{ display: 'none' }} />
                {/* Scan overlay corners */}
                <div style={{ position: 'absolute', top: '15%', left: '15%', right: '15%', bottom: '15%', border: '2px solid rgba(232,119,46,0.6)', borderRadius: 12 }} />
                {!scanning && (
                  <div style={{ position: 'absolute', inset: 0, display: 'flex', alignItems: 'center', justifyContent: 'center', background: 'rgba(0,0,0,0.7)' }}>
                    <div style={{ textAlign: 'center', color: 'rgba(255,255,255,0.5)', fontSize: 14 }}>Starting camera...</div>
                  </div>
                )}
              </div>
              <div style={{ textAlign: 'center', marginTop: 16, fontSize: 13, color: 'rgba(255,255,255,0.4)' }}>Point camera at ticket QR code</div>
            </div>
          )}

          {/* Search mode */}
          {mode === 'search' && (
            <div style={{ padding: '0 20px' }}>
              <input value={searchQuery} onChange={e => setSearchQuery(e.target.value)} placeholder="Search by name, email, or phone..." style={{ width: '100%', padding: '14px 18px', background: '#1a1a1a', color: '#fff', border: '1px solid rgba(255,255,255,0.15)', borderRadius: 10, fontSize: 15, marginBottom: 12, boxSizing: 'border-box' }} autoFocus />
              <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
                {filteredOrders.map(o => (
                  <div key={o.id} onClick={() => !o.checked_in && checkInGuest(o.id, o.name)} style={{ padding: '14px 18px', background: o.checked_in ? 'rgba(34,197,94,0.08)' : '#1a1a1a', border: '1px solid ' + (o.checked_in ? 'rgba(34,197,94,0.2)' : 'rgba(255,255,255,0.08)'), borderRadius: 10, cursor: o.checked_in ? 'default' : 'pointer' }}>
                    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                      <div>
                        <div style={{ fontWeight: 600, fontSize: 15 }}>{o.name}</div>
                        <div style={{ fontSize: 12, color: 'rgba(255,255,255,0.4)', marginTop: 2 }}>{o.email || o.phone || ''}{o.quantity > 1 ? ' · ' + o.quantity + ' tickets' : ''}</div>
                      </div>
                      <div style={{ padding: '6px 14px', borderRadius: 50, fontSize: 12, fontWeight: 600, background: o.checked_in ? 'rgba(34,197,94,0.2)' : '#e8772e', color: o.checked_in ? '#22c55e' : '#fff' }}>
                        {o.checked_in ? 'Checked In' : 'Check In'}
                      </div>
                    </div>
                  </div>
                ))}
                {filteredOrders.length === 0 && (
                  <div style={{ textAlign: 'center', padding: 30, color: 'rgba(255,255,255,0.3)', fontSize: 14 }}>
                    {searchQuery ? 'No guests found' : 'No confirmed guests for this event'}
                  </div>
                )}
              </div>
            </div>
          )}

          {/* Stats bar */}
          <div style={{ padding: '20px', marginTop: 20, borderTop: '1px solid rgba(255,255,255,0.08)', display: 'flex', justifyContent: 'space-around', textAlign: 'center' }}>
            <div><div style={{ fontSize: 22, fontWeight: 700 }}>{orders.length}</div><div style={{ fontSize: 11, color: 'rgba(255,255,255,0.4)' }}>Total Guests</div></div>
            <div><div style={{ fontSize: 22, fontWeight: 700, color: '#22c55e' }}>{checkedInCount}</div><div style={{ fontSize: 11, color: 'rgba(255,255,255,0.4)' }}>Checked In</div></div>
            <div><div style={{ fontSize: 22, fontWeight: 700, color: '#e8772e' }}>{orders.length - checkedInCount}</div><div style={{ fontSize: 11, color: 'rgba(255,255,255,0.4)' }}>Remaining</div></div>
          </div>
        </>
      )}
    </div>
    </>
  )
}

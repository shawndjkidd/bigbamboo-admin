'use client'
import { useEffect, useRef, useState } from 'react'
import Script from 'next/script'

/*
 * ════════════════════════════════════════════════════════════════
 *  BIGBAMBOO UNIFIED STAFF SCANNER
 *  Handles both ticket check-ins (BBQ-) and prize redemptions (BB-)
 *  Auto-detects QR type. Staff PIN login — no dashboard access.
 *  Access: admin.bigbamboo.app/scanner
 * ════════════════════════════════════════════════════════════════
 */

const SB_URL = process.env.NEXT_PUBLIC_SUPABASE_URL!
const SB_KEY = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!
const SB_HEADERS = {
  apikey: SB_KEY,
  Authorization: `Bearer ${SB_KEY}`,
  'Content-Type': 'application/json',
  Prefer: 'return=representation',
}

async function sbFetch(table: string, opts: { method?: string; body?: any; query?: string } = {}) {
  const url = `${SB_URL}/rest/v1/${table}${opts.query || ''}`
  const res = await fetch(url, {
    method: opts.method || 'GET',
    headers: SB_HEADERS,
    ...(opts.body ? { body: JSON.stringify(opts.body) } : {}),
  })
  if (!res.ok) return null
  const text = await res.text()
  return text ? JSON.parse(text) : null
}

// ─── Brand Palette ───
const B = {
  bg: '#0a1614',
  bgCard: '#1a3a38',
  bgCardLight: '#1f4442',
  teal: '#2a8a86',
  tealBright: '#3aa8a4',
  tealGlow: 'rgba(58,168,164,0.25)',
  gold: '#e8a820',
  goldLight: '#f5c842',
  orange: '#fa832e',
  green: '#00b14f',
  cream: '#f5eed8',
  creamSoft: 'rgba(245,238,216,0.75)',
  creamMuted: 'rgba(245,238,216,0.4)',
  creamFaint: 'rgba(245,238,216,0.15)',
  red: '#ef4444',
}

interface StaffUser { id: string; name: string; role: 'door_staff' | 'bar_staff' | 'manager'; pin: string }
interface PromoClaim {
  id: string; claim_code: string; prize_type: string; prize_label: string;
  contact_type: string; contact_value: string; status: string;
  issued_at: string; expires_at: string; redeemed_at: string | null;
  redeemed_by: string | null; discount_percent: number | null; max_discount_vnd: number | null;
  source_code: string;
}
interface TicketOrder {
  id: string; name: string; email: string; phone: string;
  event_id: string; event_title: string; quantity: number;
  status: string; checked_in: boolean; checked_in_at: string | null;
}

// ─── Login Screen ───
function LoginScreen({ onLogin }: { onLogin: (user: StaffUser) => void }) {
  const [name, setName] = useState('')
  const [pin, setPin] = useState('')
  const [error, setError] = useState('')
  const [loading, setLoading] = useState(false)

  async function handleLogin() {
    setError('')
    if (!name.trim()) { setError('Enter your name'); return }
    if (!pin || pin.length < 4) { setError('Enter your 4-digit PIN'); return }

    setLoading(true)
    // Look up staff login by name (case-insensitive) and PIN
    const data = await sbFetch('staff_logins', {
      query: `?name=ilike.${encodeURIComponent(name.trim())}&pin=eq.${encodeURIComponent(pin)}&is_active=eq.true&select=*`
    })

    if (!data || data.length === 0) {
      // Fallback: check if ANY active login matches just the PIN (in case name is slightly different)
      const byPin = await sbFetch('staff_logins', {
        query: `?pin=eq.${encodeURIComponent(pin)}&is_active=eq.true&select=*`
      })
      if (byPin && byPin.length === 1) {
        // Single match by PIN — use it
        const staff = byPin[0]
        setLoading(false)
        onLogin({ id: staff.id, name: staff.name, role: staff.role, pin: staff.pin })
        return
      }
      setLoading(false)
      setError('Invalid name or PIN')
      return
    }

    const staff = data[0]
    setLoading(false)
    onLogin({ id: staff.id, name: staff.name, role: staff.role, pin: staff.pin })
  }

  return (
    <div style={{ minHeight: '100vh', background: B.bg, display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 20, fontFamily: "'DM Sans', sans-serif" }}>
      <div style={{ width: '100%', maxWidth: 340, textAlign: 'center' }}>
        {/* Logo — centered */}
        <img src="https://bigbamboo.app/images/bbb-img-5.png" alt="BigBamBoo"
          style={{ display: 'block', margin: '0 auto 24px', width: 120, height: 120, borderRadius: 28, objectFit: 'cover',
            boxShadow: '0 4px 24px rgba(0,0,0,0.4)',
            border: `2px solid ${B.creamFaint}` }} />

        <div style={{ fontFamily: "'Sigmar', cursive", fontSize: 24, color: B.gold,
          letterSpacing: '0.02em', marginBottom: 6, lineHeight: 1.1 }}>
          Staff Scanner
        </div>
        <div style={{ fontSize: 13, color: B.creamMuted, marginBottom: 32 }}>Enter your name &amp; PIN to continue</div>

        <div style={{ display: 'flex', flexDirection: 'column', gap: 12, marginBottom: 20 }}>
          <input type="text" value={name} onChange={e => setName(e.target.value)}
            placeholder="Your name" onKeyDown={e => e.key === 'Enter' && handleLogin()}
            style={{ padding: '15px 18px', borderRadius: 12, fontSize: 16, border: `1px solid ${B.creamFaint}`,
              background: B.bgCard, color: B.cream, outline: 'none', textAlign: 'center',
              fontFamily: "'DM Sans', sans-serif", boxSizing: 'border-box', width: '100%' }} />
          <input type="password" inputMode="numeric" maxLength={4} value={pin}
            onChange={e => setPin(e.target.value.replace(/\D/g, '').slice(0, 4))}
            placeholder="4-digit PIN" onKeyDown={e => e.key === 'Enter' && handleLogin()}
            style={{ padding: '15px 18px', borderRadius: 12, fontSize: 20, border: `1px solid ${B.creamFaint}`,
              background: B.bgCard, color: B.cream, outline: 'none', textAlign: 'center',
              fontFamily: "'DM Mono', monospace", letterSpacing: '0.3em',
              boxSizing: 'border-box', width: '100%' }} />
        </div>

        {error && (
          <div style={{ padding: '12px 16px', borderRadius: 10, background: 'rgba(239,68,68,0.1)', color: '#f08060', fontSize: 13, fontWeight: 600, marginBottom: 16, border: '1px solid rgba(239,68,68,0.2)' }}>
            {error}
          </div>
        )}

        <button onClick={handleLogin} disabled={loading}
          style={{ width: '100%', padding: '16px', borderRadius: 14, fontSize: 16, fontWeight: 700,
            border: 'none', cursor: 'pointer', fontFamily: "'DM Sans', sans-serif",
            background: B.orange, color: '#fff',
            boxShadow: '0 4px 20px rgba(232,120,48,0.3)',
            opacity: loading ? 0.6 : 1 }}>
          {loading ? 'Checking...' : 'Log In'}
        </button>

        <div style={{ marginTop: 28, fontSize: 11, color: 'rgba(255,255,255,0.12)', letterSpacing: '0.1em', textTransform: 'uppercase' }}>
          BigBamBoo · An Phu
        </div>
      </div>

      <style>{`@import url('https://fonts.googleapis.com/css2?family=Sigmar&family=Bebas+Neue&family=DM+Sans:wght@400;500;600;700&family=DM+Mono:wght@400;500&display=swap');`}</style>
    </div>
  )
}

// ─── Unified Scanner Interface ───
function ScannerInterface({ staff, onLogout }: { staff: StaffUser; onLogout: () => void }) {
  const [mode, setMode] = useState<'scan' | 'guests' | 'prizes'>('scan')
  const [result, setResult] = useState<{ type: 'success' | 'error' | 'info'; message: string } | null>(null)
  const [scanning, setScanning] = useState(false)

  // Prize state
  const [claim, setClaim] = useState<PromoClaim | null>(null)
  const [redeeming, setRedeeming] = useState(false)

  // Ticket/door state
  const [ticketOrder, setTicketOrder] = useState<TicketOrder | null>(null)
  const [events, setEvents] = useState<any[]>([])
  const [selectedEvent, setSelectedEvent] = useState('')
  const [guestOrders, setGuestOrders] = useState<TicketOrder[]>([])
  const [guestSearch, setGuestSearch] = useState('')

  // Search state (for prize manual lookup)
  const [searchQuery, setSearchQuery] = useState('')
  const [searchResults, setSearchResults] = useState<PromoClaim[]>([])
  const [searching, setSearching] = useState(false)

  // Camera refs
  const videoRef = useRef<HTMLVideoElement>(null)
  const canvasRef = useRef<HTMLCanvasElement>(null)
  const scanIntervalRef = useRef<any>(null)
  const lastScannedRef = useRef<string>('')
  const streamRef = useRef<MediaStream | null>(null)

  // Recent activity
  const [recentActivity, setRecentActivity] = useState<{ type: string; label: string; time: string }[]>([])

  useEffect(() => {
    loadEvents()
  }, [])

  useEffect(() => {
    if (selectedEvent) loadGuestOrders()
  }, [selectedEvent])

  useEffect(() => {
    if (mode === 'scan' && !claim && !ticketOrder) startCamera()
    else stopCamera()
    return () => stopCamera()
  }, [mode, claim, ticketOrder])

  async function loadEvents() {
    const data = await sbFetch('events', { query: '?is_published=eq.true&order=event_date.desc&select=id,title,event_date' })
    setEvents(data || [])
    if (data && data.length > 0) setSelectedEvent(data[0].id)
  }

  async function loadGuestOrders() {
    const data = await sbFetch('ticket_orders', {
      query: `?event_id=eq.${selectedEvent}&status=eq.confirmed&order=name&select=*`
    })
    setGuestOrders(data || [])
  }

  // ─── Camera / QR Scanning ───
  function startCamera() {
    if (!navigator.mediaDevices) {
      setResult({ type: 'error', message: 'Camera not available' })
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
        setResult({ type: 'error', message: 'Camera access denied' })
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
      }
    }, 250)
  }

  function stopCamera() {
    if (scanIntervalRef.current) { clearInterval(scanIntervalRef.current); scanIntervalRef.current = null }
    if (streamRef.current) { streamRef.current.getTracks().forEach(t => t.stop()); streamRef.current = null }
    if (videoRef.current) videoRef.current.srcObject = null
    setScanning(false)
  }

  // ─── QR Handler — auto-detects type, respects role ───
  async function handleQRData(raw: string) {
    // Ticket QR: BBQ-{id8}|{name}|{event_title}
    if (raw.startsWith('BBQ-')) {
      if (staff.role === 'bar_staff') {
        setResult({ type: 'error', message: 'Ticket check-in not available for bar staff' })
        setTimeout(() => { setResult(null); if (mode === 'scan') startCamera() }, 2500)
        return
      }
      await handleTicketQR(raw)
      return
    }

    // Prize QR: BB-xxx or JSON { code: "BB-xxx" }
    let code = ''
    try { const parsed = JSON.parse(raw); code = parsed.code || '' }
    catch { if (raw.startsWith('BB-')) code = raw }

    if (code && code.startsWith('BB-')) {
      if (staff.role === 'door_staff') {
        setResult({ type: 'error', message: 'Prize redemption not available for door staff' })
        setTimeout(() => { setResult(null); if (mode === 'scan') startCamera() }, 2500)
        return
      }
      await handlePrizeQR(code)
      return
    }

    // Unknown QR
    setResult({ type: 'error', message: 'Unknown QR code format' })
    setTimeout(() => { setResult(null); if (mode === 'scan') startCamera() }, 2500)
  }

  // ─── Ticket Check-In ───
  async function handleTicketQR(data: string) {
    const parts = data.split('|')
    const idFragment = parts[0].replace('BBQ-', '')
    const guestName = parts[1] || 'Guest'

    setResult({ type: 'info', message: 'Looking up ticket...' })

    // Try to find by ID prefix
    const found = await sbFetch('ticket_orders', {
      query: `?id=like.${idFragment}*&event_id=eq.${selectedEvent}&select=*`
    })

    if (found && found.length > 0) {
      const order = found[0]
      setResult(null)
      setTicketOrder(order)
      return
    }

    // Try broader: any event
    const broader = await sbFetch('ticket_orders', {
      query: `?id=like.${idFragment}*&select=*`
    })

    if (broader && broader.length > 0) {
      setResult(null)
      setTicketOrder(broader[0])
      return
    }

    setResult({ type: 'error', message: `Ticket not found for "${guestName}"` })
    setTimeout(() => { setResult(null); if (mode === 'scan') startCamera() }, 3000)
  }

  async function checkInGuest(order: TicketOrder) {
    if (order.checked_in) {
      setResult({ type: 'info', message: order.name + ' is already checked in' })
      return
    }

    const res = await fetch(`${SB_URL}/rest/v1/ticket_orders?id=eq.${order.id}`, {
      method: 'PATCH',
      headers: { ...SB_HEADERS, Prefer: 'return=representation' },
      body: JSON.stringify({ checked_in: true, checked_in_at: new Date().toISOString() }),
    })

    if (!res.ok) {
      setResult({ type: 'error', message: 'Check-in failed' })
      return
    }

    const updated = { ...order, checked_in: true, checked_in_at: new Date().toISOString() }
    setTicketOrder(updated)
    setGuestOrders(prev => prev.map(o => o.id === order.id ? updated : o))
    setResult({ type: 'success', message: '✓ ' + order.name + ' checked in!' })
    addActivity('check-in', order.name)
  }

  // ─── Prize Redemption ───
  async function handlePrizeQR(code: string) {
    setResult({ type: 'info', message: 'Looking up ' + code + '...' })

    const data = await sbFetch('promo_claims', {
      query: `?claim_code=eq.${encodeURIComponent(code)}&select=*`
    })

    if (!data || data.length === 0) {
      setResult({ type: 'error', message: 'Prize not found: ' + code })
      setTimeout(() => { setResult(null); if (mode === 'scan') startCamera() }, 3000)
      return
    }

    setResult(null)
    setClaim(data[0])
  }

  async function redeemClaim() {
    if (!claim) return
    setRedeeming(true)

    const res = await fetch(`${SB_URL}/rest/v1/promo_claims?id=eq.${claim.id}&status=eq.active`, {
      method: 'PATCH',
      headers: { ...SB_HEADERS, Prefer: 'return=representation' },
      body: JSON.stringify({
        status: 'redeemed',
        redeemed_at: new Date().toISOString(),
        redeemed_by: staff.name,
      }),
    })

    if (!res.ok) {
      setResult({ type: 'error', message: 'Redeem failed' })
      setRedeeming(false)
      return
    }

    setClaim({ ...claim, status: 'redeemed', redeemed_at: new Date().toISOString(), redeemed_by: staff.name })
    setResult({ type: 'success', message: 'Prize redeemed!' })
    addActivity('redeem', claim.prize_label)
    setRedeeming(false)
  }

  // ─── Manual Prize Search ───
  async function handlePrizeSearch() {
    if (!searchQuery.trim()) return
    setSearching(true); setSearchResults([])
    const q = searchQuery.trim().toUpperCase()
    let query: string
    if (q.startsWith('BB-')) {
      query = `?claim_code=eq.${encodeURIComponent(q)}&select=*&order=issued_at.desc&limit=20`
    } else {
      query = `?contact_value=ilike.*${encodeURIComponent(searchQuery.trim())}*&select=*&order=issued_at.desc&limit=20`
    }
    const data = await sbFetch('promo_claims', { query })
    setSearchResults(data || [])
    setSearching(false)
  }

  // ─── Helpers ───
  function dismissResult() {
    setClaim(null); setTicketOrder(null); setResult(null); lastScannedRef.current = ''
    if (mode === 'scan') startCamera()
  }

  function addActivity(type: string, label: string) {
    setRecentActivity(prev => [{ type, label, time: new Date().toLocaleTimeString('en', { hour: '2-digit', minute: '2-digit' }) }, ...prev].slice(0, 15))
  }

  function getClaimStatus(c: PromoClaim) {
    const expired = new Date(c.expires_at) < new Date()
    if (c.status === 'redeemed') return { label: 'Redeemed', color: B.green, bg: 'rgba(0,177,79,0.12)', border: 'rgba(0,177,79,0.3)' }
    if (expired) return { label: 'Expired', color: B.red, bg: 'rgba(239,68,68,0.12)', border: 'rgba(239,68,68,0.3)' }
    return { label: 'Active', color: B.orange, bg: 'rgba(250,131,46,0.12)', border: 'rgba(250,131,46,0.3)' }
  }

  function fmtDate(d: string) {
    return new Date(d).toLocaleDateString('en-US', { day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit' })
  }

  const filteredGuests = guestOrders.filter(o => {
    if (!guestSearch) return true
    const q = guestSearch.toLowerCase()
    return o.name?.toLowerCase().includes(q) || o.email?.toLowerCase().includes(q) || o.phone?.toLowerCase().includes(q)
  })

  const checkedInCount = guestOrders.filter(o => o.checked_in).length
  const claimStatus = claim ? getClaimStatus(claim) : null
  const isExpired = claim ? new Date(claim.expires_at) < new Date() : false
  const canRedeem = claim?.status === 'active'

  return (
    <div style={{ minHeight: '100vh', background: B.bg, fontFamily: "'DM Sans', sans-serif", padding: '0 0 40px' }}>
      <canvas ref={canvasRef} style={{ display: 'none' }} />

      {/* ─── Header ─── */}
      <div style={{ padding: '14px 20px', display: 'flex', alignItems: 'center', justifyContent: 'space-between', borderBottom: `1px solid ${B.creamFaint}` }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
          <img src="https://bigbamboo.app/images/bbb-img-5.png" alt="" style={{ width: 36, height: 36, borderRadius: 10, objectFit: 'cover' }} />
          <div>
            <div style={{ fontFamily: "'Sigmar', cursive", fontSize: 16, color: B.gold, letterSpacing: '0.02em' }}>Staff Scanner</div>
            <div style={{ fontSize: 11, color: B.creamMuted }}>{staff.name} · {staff.role === 'door_staff' ? 'Door' : staff.role === 'bar_staff' ? 'Bar' : 'Manager'}</div>
          </div>
        </div>
        <button onClick={onLogout} style={{ padding: '8px 16px', borderRadius: 8, fontSize: 12, fontWeight: 600,
          border: `1px solid ${B.creamFaint}`, background: 'transparent', color: B.creamMuted, cursor: 'pointer' }}>
          Logout
        </button>
      </div>

      <div style={{ maxWidth: 420, margin: '0 auto', padding: '16px 20px' }}>

        {/* ─── Mode Tabs (filtered by role) ─── */}
        <div style={{ display: 'flex', gap: 6, marginBottom: 16 }}>
          {[
            { key: 'scan', label: 'Scan QR', roles: ['door_staff', 'bar_staff', 'manager'] },
            { key: 'guests', label: 'Guest List', roles: ['door_staff', 'manager'] },
            { key: 'prizes', label: 'Prize Search', roles: ['bar_staff', 'manager'] },
          ].filter(tab => tab.roles.includes(staff.role)).map(tab => (
            <button key={tab.key}
              onClick={() => { setMode(tab.key as any); setClaim(null); setTicketOrder(null); setResult(null) }}
              style={{ flex: 1, padding: '11px 8px', borderRadius: 10, fontSize: 13, fontWeight: 600, cursor: 'pointer', border: 'none',
                background: mode === tab.key ? `${B.teal}25` : B.bgCard,
                color: mode === tab.key ? B.tealBright : B.creamMuted, fontFamily: "'DM Sans', sans-serif" }}>
              {tab.label}
            </button>
          ))}
        </div>

        {/* ─── Event Selector (shown in scan & guests modes) ─── */}
        {(mode === 'scan' || mode === 'guests') && (
          <select value={selectedEvent} onChange={e => setSelectedEvent(e.target.value)}
            style={{ width: '100%', padding: '12px 16px', background: B.bgCard, color: B.cream,
              border: `1px solid ${B.creamFaint}`, borderRadius: 10, fontSize: 14, marginBottom: 14,
              fontFamily: "'DM Sans', sans-serif", outline: 'none' }}>
            <option value="">Select Event</option>
            {events.map(ev => <option key={ev.id} value={ev.id}>{ev.title}</option>)}
          </select>
        )}

        {/* ─── Result Banner ─── */}
        {result && (
          <div style={{ marginBottom: 14, padding: '14px 18px', borderRadius: 10, fontSize: 14, fontWeight: 600, textAlign: 'center',
            background: result.type === 'success' ? 'rgba(0,177,79,0.12)' : result.type === 'error' ? 'rgba(239,68,68,0.12)' : `${B.teal}15`,
            color: result.type === 'success' ? B.green : result.type === 'error' ? B.red : B.tealBright,
            border: `1px solid ${result.type === 'success' ? 'rgba(0,177,79,0.3)' : result.type === 'error' ? 'rgba(239,68,68,0.3)' : B.teal + '30'}` }}>
            {result.message}
          </div>
        )}

        {/* ═══════════════════════════════════════════════
            TICKET CHECK-IN CARD (from QR scan)
            ═══════════════════════════════════════════════ */}
        {ticketOrder && (
          <div style={{ background: B.bgCard, borderRadius: 16, border: `1px solid ${B.creamFaint}`, overflow: 'hidden', marginBottom: 20 }}>
            <div style={{ padding: '24px 24px 16px', borderBottom: `1px solid ${B.creamFaint}`, textAlign: 'center' }}>
              <div style={{ fontSize: 40, marginBottom: 8 }}>{ticketOrder.checked_in ? '✅' : '🎟️'}</div>
              <div style={{ fontFamily: "'Bebas Neue', sans-serif", fontSize: 24, letterSpacing: '0.03em', color: B.cream }}>
                {ticketOrder.name}
              </div>
              <div style={{ fontSize: 13, color: B.creamMuted, marginTop: 4 }}>
                {ticketOrder.event_title || 'Event'} · {ticketOrder.quantity || 1} ticket{(ticketOrder.quantity || 1) > 1 ? 's' : ''}
              </div>
              <div style={{ marginTop: 8 }}>
                <span style={{ display: 'inline-block', padding: '4px 14px', borderRadius: 50, fontSize: 12, fontWeight: 700,
                  background: ticketOrder.checked_in ? 'rgba(0,177,79,0.12)' : 'rgba(250,131,46,0.12)',
                  color: ticketOrder.checked_in ? B.green : B.orange,
                  border: `1px solid ${ticketOrder.checked_in ? 'rgba(0,177,79,0.3)' : 'rgba(250,131,46,0.3)'}`,
                  letterSpacing: '0.06em', textTransform: 'uppercase' }}>
                  {ticketOrder.checked_in ? 'Checked In' : 'Not Checked In'}
                </span>
              </div>
            </div>

            <div style={{ padding: '16px 24px' }}>
              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '10px 24px', fontSize: 13 }}>
                {ticketOrder.email && (
                  <div>
                    <div style={{ color: B.creamMuted, fontSize: 11, textTransform: 'uppercase', letterSpacing: '0.08em', marginBottom: 2 }}>Email</div>
                    <div style={{ color: B.cream }}>{ticketOrder.email}</div>
                  </div>
                )}
                {ticketOrder.phone && (
                  <div>
                    <div style={{ color: B.creamMuted, fontSize: 11, textTransform: 'uppercase', letterSpacing: '0.08em', marginBottom: 2 }}>Phone</div>
                    <div style={{ color: B.cream }}>{ticketOrder.phone}</div>
                  </div>
                )}
              </div>
            </div>

            <div style={{ padding: '16px 24px 24px', display: 'flex', gap: 10 }}>
              {!ticketOrder.checked_in ? (
                <button onClick={() => checkInGuest(ticketOrder)}
                  style={{ flex: 1, padding: '15px', borderRadius: 12, fontSize: 16, fontWeight: 700, cursor: 'pointer',
                    border: 'none', background: B.green, color: '#fff',
                    fontFamily: "'Bebas Neue', sans-serif", letterSpacing: '0.06em' }}>
                  Check In Guest
                </button>
              ) : (
                <div style={{ flex: 1, padding: '15px', borderRadius: 12, fontSize: 16, fontWeight: 700, textAlign: 'center',
                  background: 'rgba(0,177,79,0.1)', color: B.green, border: '1px solid rgba(0,177,79,0.25)',
                  fontFamily: "'Bebas Neue', sans-serif", letterSpacing: '0.06em' }}>
                  Already Checked In
                </div>
              )}
              <button onClick={dismissResult}
                style={{ padding: '15px 20px', borderRadius: 12, fontSize: 14, fontWeight: 600, cursor: 'pointer',
                  border: `1px solid ${B.creamFaint}`, background: 'transparent', color: B.creamMuted, fontFamily: "'DM Sans', sans-serif" }}>
                Scan Next
              </button>
            </div>
          </div>
        )}

        {/* ═══════════════════════════════════════════════
            PRIZE CLAIM CARD (from QR scan or search)
            ═══════════════════════════════════════════════ */}
        {claim && (
          <div style={{ background: B.bgCard, borderRadius: 16, border: `1px solid ${B.creamFaint}`, overflow: 'hidden', marginBottom: 20 }}>
            <div style={{ padding: '24px 24px 16px', borderBottom: `1px solid ${B.creamFaint}`, textAlign: 'center' }}>
              <div style={{ fontSize: 40, marginBottom: 8 }}>🎁</div>
              <div style={{ fontFamily: "'Bebas Neue', sans-serif", fontSize: 26, letterSpacing: '0.03em', color: B.gold }}>
                {claim.prize_label}
              </div>
              <div style={{ marginTop: 8 }}>
                <span style={{ display: 'inline-block', padding: '4px 14px', borderRadius: 50, fontSize: 12, fontWeight: 700,
                  background: claimStatus?.bg, color: claimStatus?.color, border: `1px solid ${claimStatus?.border}`,
                  letterSpacing: '0.06em', textTransform: 'uppercase' }}>
                  {claimStatus?.label}
                </span>
              </div>
            </div>

            <div style={{ padding: '16px 24px' }}>
              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '12px 24px', fontSize: 13 }}>
                <div>
                  <div style={{ color: B.creamMuted, fontSize: 11, textTransform: 'uppercase', letterSpacing: '0.08em', marginBottom: 2 }}>Code</div>
                  <div style={{ fontWeight: 700, fontFamily: 'monospace', fontSize: 15, color: B.cream }}>{claim.claim_code}</div>
                </div>
                <div>
                  <div style={{ color: B.creamMuted, fontSize: 11, textTransform: 'uppercase', letterSpacing: '0.08em', marginBottom: 2 }}>Source</div>
                  <div style={{ color: B.cream }}>{claim.source_code}</div>
                </div>
                <div>
                  <div style={{ color: B.creamMuted, fontSize: 11, textTransform: 'uppercase', letterSpacing: '0.08em', marginBottom: 2 }}>Issued</div>
                  <div style={{ color: B.cream }}>{fmtDate(claim.issued_at)}</div>
                </div>
                <div>
                  <div style={{ color: B.creamMuted, fontSize: 11, textTransform: 'uppercase', letterSpacing: '0.08em', marginBottom: 2 }}>Expires</div>
                  <div style={{ color: isExpired ? B.red : B.cream }}>{fmtDate(claim.expires_at)}</div>
                </div>
                {claim.discount_percent && (
                  <div>
                    <div style={{ color: B.creamMuted, fontSize: 11, textTransform: 'uppercase', letterSpacing: '0.08em', marginBottom: 2 }}>Discount</div>
                    <div style={{ color: B.cream }}>{claim.discount_percent}%{claim.max_discount_vnd ? ` (max ${(claim.max_discount_vnd / 1000)}k)` : ''}</div>
                  </div>
                )}
                {claim.redeemed_at && (
                  <>
                    <div>
                      <div style={{ color: B.creamMuted, fontSize: 11, textTransform: 'uppercase', letterSpacing: '0.08em', marginBottom: 2 }}>Redeemed</div>
                      <div style={{ color: B.green }}>{fmtDate(claim.redeemed_at)}</div>
                    </div>
                    <div>
                      <div style={{ color: B.creamMuted, fontSize: 11, textTransform: 'uppercase', letterSpacing: '0.08em', marginBottom: 2 }}>By</div>
                      <div style={{ color: B.green }}>{claim.redeemed_by || '—'}</div>
                    </div>
                  </>
                )}
              </div>
            </div>

            <div style={{ padding: '16px 24px 24px', display: 'flex', gap: 10 }}>
              {canRedeem && (
                <div style={{ flex: 1, display: 'flex', flexDirection: 'column', gap: 6 }}>
                  {isExpired && (
                    <div style={{ fontSize: 11, color: B.orange, fontWeight: 600, textAlign: 'center', letterSpacing: '0.04em' }}>
                      Technically expired — but still redeemable
                    </div>
                  )}
                  <button onClick={redeemClaim} disabled={redeeming}
                    style={{ width: '100%', padding: '15px', borderRadius: 12, fontSize: 16, fontWeight: 700, cursor: 'pointer',
                      border: 'none', background: B.green, color: '#fff', opacity: redeeming ? 0.6 : 1,
                      fontFamily: "'Bebas Neue', sans-serif", letterSpacing: '0.06em' }}>
                    {redeeming ? 'Redeeming...' : 'Redeem Prize'}
                  </button>
                </div>
              )}
              {claim.status === 'redeemed' && (
                <div style={{ flex: 1, padding: '15px', borderRadius: 12, fontSize: 16, fontWeight: 700, textAlign: 'center',
                  background: 'rgba(0,177,79,0.1)', color: B.green, border: '1px solid rgba(0,177,79,0.25)',
                  fontFamily: "'Bebas Neue', sans-serif", letterSpacing: '0.06em' }}>
                  Already Redeemed
                </div>
              )}
              <button onClick={dismissResult}
                style={{ padding: '15px 20px', borderRadius: 12, fontSize: 14, fontWeight: 600, cursor: 'pointer',
                  border: `1px solid ${B.creamFaint}`, background: 'transparent', color: B.creamMuted, fontFamily: "'DM Sans', sans-serif" }}>
                {mode === 'scan' ? 'Scan Next' : 'Back'}
              </button>
            </div>
          </div>
        )}

        {/* ═══════════════════════════════════════════════
            SCAN MODE — Camera
            ═══════════════════════════════════════════════ */}
        {mode === 'scan' && !claim && !ticketOrder && (
          <div>
            <div style={{ position: 'relative', width: '100%', aspectRatio: '1', borderRadius: 16, overflow: 'hidden',
              background: '#000', border: `2px solid ${B.teal}30` }}>
              <video ref={videoRef} style={{ width: '100%', height: '100%', objectFit: 'cover' }} playsInline muted />
              <div style={{ position: 'absolute', top: '15%', left: '15%', right: '15%', bottom: '15%',
                border: `2px solid ${B.teal}80`, borderRadius: 12 }} />
              {!scanning && !result && (
                <div style={{ position: 'absolute', inset: 0, display: 'flex', alignItems: 'center', justifyContent: 'center', background: 'rgba(0,0,0,0.7)' }}>
                  <div style={{ textAlign: 'center', color: B.creamMuted, fontSize: 14 }}>Starting camera...</div>
                </div>
              )}
            </div>
            <div style={{ textAlign: 'center', marginTop: 14, fontSize: 13, color: B.creamMuted }}>
              {staff.role === 'door_staff' ? 'Scan ticket QR to check in guests' :
               staff.role === 'bar_staff' ? 'Scan prize QR to redeem' :
               'Scan any QR — tickets & prizes detected automatically'}
            </div>
          </div>
        )}

        {/* ═══════════════════════════════════════════════
            GUEST LIST MODE — Ticket check-in by name
            ═══════════════════════════════════════════════ */}
        {mode === 'guests' && !ticketOrder && (
          <div>
            {/* Stats bar */}
            <div style={{ display: 'flex', gap: 10, marginBottom: 14 }}>
              <div style={{ flex: 1, padding: '12px 16px', background: B.bgCard, borderRadius: 10, border: `1px solid ${B.creamFaint}`, textAlign: 'center' }}>
                <div style={{ fontFamily: "'Bebas Neue', sans-serif", fontSize: 28, color: B.cream, lineHeight: 1 }}>{guestOrders.length}</div>
                <div style={{ fontSize: 11, color: B.creamMuted, marginTop: 2 }}>Total</div>
              </div>
              <div style={{ flex: 1, padding: '12px 16px', background: B.bgCard, borderRadius: 10, border: `1px solid ${B.creamFaint}`, textAlign: 'center' }}>
                <div style={{ fontFamily: "'Bebas Neue', sans-serif", fontSize: 28, color: B.green, lineHeight: 1 }}>{checkedInCount}</div>
                <div style={{ fontSize: 11, color: B.creamMuted, marginTop: 2 }}>Checked In</div>
              </div>
              <div style={{ flex: 1, padding: '12px 16px', background: B.bgCard, borderRadius: 10, border: `1px solid ${B.creamFaint}`, textAlign: 'center' }}>
                <div style={{ fontFamily: "'Bebas Neue', sans-serif", fontSize: 28, color: B.orange, lineHeight: 1 }}>{guestOrders.length - checkedInCount}</div>
                <div style={{ fontSize: 11, color: B.creamMuted, marginTop: 2 }}>Remaining</div>
              </div>
            </div>

            {/* Search */}
            <input value={guestSearch} onChange={e => setGuestSearch(e.target.value)}
              placeholder="Search by name, email, or phone..."
              style={{ width: '100%', padding: '14px 18px', background: B.bgCard, color: B.cream,
                border: `1px solid ${B.creamFaint}`, borderRadius: 10, fontSize: 14, marginBottom: 12,
                boxSizing: 'border-box', fontFamily: "'DM Sans', sans-serif", outline: 'none' }} autoFocus />

            {/* Guest list */}
            <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
              {filteredGuests.map(o => (
                <div key={o.id} onClick={() => !o.checked_in ? checkInGuest(o) : setTicketOrder(o)}
                  style={{ padding: '14px 18px', background: o.checked_in ? 'rgba(0,177,79,0.06)' : B.bgCard,
                    border: `1px solid ${o.checked_in ? 'rgba(0,177,79,0.15)' : B.creamFaint}`,
                    borderRadius: 10, cursor: 'pointer' }}>
                  <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                    <div>
                      <div style={{ fontWeight: 600, fontSize: 15, color: B.cream }}>{o.name}</div>
                      <div style={{ fontSize: 12, color: B.creamMuted, marginTop: 2 }}>
                        {o.email || o.phone || ''}{(o.quantity || 1) > 1 ? ` · ${o.quantity} tickets` : ''}
                      </div>
                    </div>
                    <div style={{ padding: '6px 14px', borderRadius: 50, fontSize: 12, fontWeight: 600,
                      background: o.checked_in ? 'rgba(0,177,79,0.15)' : B.orange,
                      color: o.checked_in ? B.green : '#fff' }}>
                      {o.checked_in ? 'Checked In' : 'Check In'}
                    </div>
                  </div>
                </div>
              ))}
              {filteredGuests.length === 0 && (
                <div style={{ textAlign: 'center', padding: 30, color: B.creamMuted, fontSize: 14 }}>
                  {guestSearch ? 'No guests found' : 'No confirmed guests for this event'}
                </div>
              )}
            </div>
          </div>
        )}

        {/* ═══════════════════════════════════════════════
            PRIZE SEARCH MODE — Manual code/phone lookup
            ═══════════════════════════════════════════════ */}
        {mode === 'prizes' && !claim && (
          <div>
            <div style={{ display: 'flex', gap: 8, marginBottom: 16 }}>
              <input value={searchQuery} onChange={e => setSearchQuery(e.target.value)}
                onKeyDown={e => e.key === 'Enter' && handlePrizeSearch()}
                placeholder="Code (BB-...) or phone/email..."
                style={{ flex: 1, padding: '14px 18px', background: B.bgCard, color: B.cream,
                  border: `1px solid ${B.creamFaint}`, borderRadius: 10, fontSize: 14,
                  fontFamily: "'DM Sans', sans-serif", outline: 'none' }} autoFocus />
              <button onClick={handlePrizeSearch} disabled={searching}
                style={{ padding: '14px 20px', borderRadius: 10, fontSize: 14, fontWeight: 600, cursor: 'pointer',
                  border: 'none', background: B.teal, color: B.cream, fontFamily: "'DM Sans', sans-serif" }}>
                {searching ? '...' : 'Search'}
              </button>
            </div>

            {searchResults.length > 0 && (
              <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
                {searchResults.map(c => {
                  const s = getClaimStatus(c)
                  return (
                    <div key={c.id} onClick={() => setClaim(c)}
                      style={{ padding: '14px 18px', background: B.bgCard, border: `1px solid ${B.creamFaint}`,
                        borderRadius: 10, cursor: 'pointer' }}>
                      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                        <div>
                          <div style={{ fontWeight: 600, fontSize: 14, color: B.cream }}>{c.prize_label}</div>
                          <div style={{ fontSize: 12, color: B.creamMuted, marginTop: 2 }}>
                            {c.claim_code} · {fmtDate(c.issued_at)}
                          </div>
                        </div>
                        <span style={{ padding: '4px 12px', borderRadius: 50, fontSize: 11, fontWeight: 700,
                          background: s.bg, color: s.color, border: `1px solid ${s.border}` }}>
                          {s.label}
                        </span>
                      </div>
                    </div>
                  )
                })}
              </div>
            )}

            {searchResults.length === 0 && searchQuery && !searching && (
              <div style={{ textAlign: 'center', padding: 30, color: B.creamMuted, fontSize: 14 }}>No prizes found</div>
            )}
          </div>
        )}

        {/* ─── Recent Activity ─── */}
        {!claim && !ticketOrder && recentActivity.length > 0 && (
          <div style={{ marginTop: 28 }}>
            <div style={{ fontFamily: "'Bebas Neue', sans-serif", fontSize: 18, letterSpacing: '0.04em', color: B.cream, marginBottom: 10 }}>
              Recent Activity
            </div>
            <div style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
              {recentActivity.map((a, i) => (
                <div key={i} style={{ padding: '8px 14px', background: B.bgCard, border: `1px solid ${B.creamFaint}`,
                  borderRadius: 8, display: 'flex', alignItems: 'center', gap: 10, fontSize: 13 }}>
                  <span>{a.type === 'check-in' ? '🎟️' : '🎁'}</span>
                  <span style={{ fontWeight: 600, color: B.cream }}>{a.label}</span>
                  <span style={{ color: B.creamMuted, fontSize: 11 }}>
                    {a.type === 'check-in' ? 'checked in' : 'redeemed'}
                  </span>
                  <span style={{ marginLeft: 'auto', color: B.creamMuted, fontSize: 12 }}>{a.time}</span>
                </div>
              ))}
            </div>
          </div>
        )}
      </div>

      <style>{`@import url('https://fonts.googleapis.com/css2?family=Sigmar&family=Bebas+Neue&family=DM+Sans:wght@400;500;600;700&family=DM+Mono:wght@400;500&display=swap');`}</style>
    </div>
  )
}

// ─── Main Page ───
export default function ScannerPage() {
  const [staff, setStaff] = useState<StaffUser | null>(null)
  const [jsQRLoaded, setJsQRLoaded] = useState(false)

  useEffect(() => {
    const saved = sessionStorage.getItem('bb_scanner_staff')
    if (saved) {
      try { setStaff(JSON.parse(saved)) } catch {}
    }
  }, [])

  function handleLogin(user: StaffUser) {
    setStaff(user)
    sessionStorage.setItem('bb_scanner_staff', JSON.stringify(user))
  }

  function handleLogout() {
    setStaff(null)
    sessionStorage.removeItem('bb_scanner_staff')
  }

  if (!staff) return <LoginScreen onLogin={handleLogin} />
  return (
    <>
      <Script src="https://cdn.jsdelivr.net/npm/jsqr@1.4.0/dist/jsQR.min.js" strategy="afterInteractive"
        onLoad={() => {
          setJsQRLoaded(true)
          // Trigger re-render so camera picks up jsQR
          setStaff(prev => prev ? { ...prev } : prev)
        }} />
      <ScannerInterface staff={staff} onLogout={handleLogout} />
    </>
  )
}

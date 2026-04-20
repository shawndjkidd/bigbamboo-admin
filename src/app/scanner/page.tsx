'use client'
import { useEffect, useRef, useState } from 'react'
import Script from 'next/script'

/*
 * ════════════════════════════════════════════════════════════════
 *  BIGBAMBOO EVENT SCANNER
 *  Standalone scanner page with PIN login for event staff.
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

interface StaffUser { id: string; email: string; name: string; role: string; pin: string }
interface PromoClaim {
  id: string; claim_code: string; prize_type: string; prize_label: string;
  contact_type: string; contact_value: string; status: string;
  issued_at: string; expires_at: string; redeemed_at: string | null;
  redeemed_by: string | null; discount_percent: number | null; max_discount_vnd: number | null;
  source_code: string;
}

// ─── Login Screen ───
function LoginScreen({ onLogin }: { onLogin: (user: StaffUser) => void }) {
  const [name, setName] = useState('')
  const [pin, setPin] = useState('')
  const [error, setError] = useState('')

  function handleLogin() {
    setError('')
    if (!name.trim()) { setError('Enter your name'); return }
    if (pin !== '1234') { setError('Incorrect PIN'); return }

    onLogin({ id: 'staff-' + Date.now(), email: '', name: name.trim(), role: 'staff', pin })
  }

  return (
    <div style={{ minHeight: '100vh', background: B.bg, display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 20, fontFamily: "'DM Sans', sans-serif" }}>
      <div style={{ width: '100%', maxWidth: 380, textAlign: 'center' }}>
        <img src="https://bigbamboo.app/images/bbb-img-5.png" alt="BigBamBoo" style={{ width: 80, height: 80, borderRadius: 20, objectFit: 'cover', marginBottom: 20, boxShadow: '0 4px 20px rgba(0,0,0,0.4)' }} />
        <div style={{ fontFamily: "'Bebas Neue', sans-serif", fontSize: 28, color: B.cream, letterSpacing: '0.06em', marginBottom: 6 }}>Event Scanner</div>
        <div style={{ fontSize: 13, color: B.creamMuted, marginBottom: 32 }}>Staff login required</div>

        <div style={{ display: 'flex', flexDirection: 'column', gap: 12, marginBottom: 20 }}>
          <input
            type="text"
            value={name}
            onChange={e => setName(e.target.value)}
            placeholder="Your name"
            onKeyDown={e => e.key === 'Enter' && handleLogin()}
            style={{
              padding: '14px 18px', borderRadius: 12, fontSize: 15, border: `1px solid ${B.creamFaint}`,
              background: B.bgCard, color: B.cream, outline: 'none', fontFamily: "'DM Sans', sans-serif",
            }}
          />
          <input
            type="password"
            inputMode="numeric"
            maxLength={4}
            value={pin}
            onChange={e => setPin(e.target.value.replace(/\D/g, '').slice(0, 4))}
            placeholder="4-digit PIN"
            onKeyDown={e => e.key === 'Enter' && handleLogin()}
            style={{
              padding: '14px 18px', borderRadius: 12, fontSize: 15, border: `1px solid ${B.creamFaint}`,
              background: B.bgCard, color: B.cream, outline: 'none', fontFamily: "'DM Sans', sans-serif",
              letterSpacing: '0.3em', textAlign: 'center',
            }}
          />
        </div>

        {error && (
          <div style={{ padding: '10px 16px', borderRadius: 10, background: 'rgba(239,68,68,0.12)', color: B.red, fontSize: 13, fontWeight: 600, marginBottom: 16, border: '1px solid rgba(239,68,68,0.25)' }}>
            {error}
          </div>
        )}

        <button onClick={handleLogin}
          style={{
            width: '100%', padding: '15px', borderRadius: 14, fontSize: 16, fontWeight: 700,
            border: 'none', cursor: 'pointer', fontFamily: "'Bebas Neue', sans-serif",
            letterSpacing: '0.08em',
            background: `linear-gradient(135deg, ${B.teal}, ${B.tealBright})`,
            color: B.cream,
            boxShadow: `0 6px 24px ${B.tealGlow}`,
          }}>
          Login
        </button>
      </div>

      <style>{`@import url('https://fonts.googleapis.com/css2?family=Bebas+Neue&family=DM+Sans:wght@400;500;600;700&display=swap');`}</style>
    </div>
  )
}

// ─── Scanner Interface ───
function ScannerInterface({ staff, onLogout }: { staff: StaffUser; onLogout: () => void }) {
  const [mode, setMode] = useState<'scan' | 'search'>('scan')
  const [result, setResult] = useState<{ type: 'success' | 'error' | 'info'; message: string } | null>(null)
  const [claim, setClaim] = useState<PromoClaim | null>(null)
  const [redeeming, setRedeeming] = useState(false)
  const [searchQuery, setSearchQuery] = useState('')
  const [searchResults, setSearchResults] = useState<PromoClaim[]>([])
  const [searching, setSearching] = useState(false)
  const [scanning, setScanning] = useState(false)
  const [recentRedemptions, setRecentRedemptions] = useState<PromoClaim[]>([])

  const videoRef = useRef<HTMLVideoElement>(null)
  const canvasRef = useRef<HTMLCanvasElement>(null)
  const scanIntervalRef = useRef<any>(null)
  const lastScannedRef = useRef<string>('')
  const streamRef = useRef<MediaStream | null>(null)
  const [jsQRReady, setJsQRReady] = useState(false)

  useEffect(() => {
    loadRecentRedemptions()
  }, [])

  useEffect(() => {
    if (mode === 'scan' && !claim) startCamera()
    else stopCamera()
    return () => stopCamera()
  }, [mode, claim])

  async function loadRecentRedemptions() {
    const data = await sbFetch('promo_claims', {
      query: '?status=eq.redeemed&order=redeemed_at.desc&limit=10&select=*'
    })
    setRecentRedemptions(data || [])
  }

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
    if (streamRef.current) {
      streamRef.current.getTracks().forEach(t => t.stop())
      streamRef.current = null
    }
    if (videoRef.current) videoRef.current.srcObject = null
    setScanning(false)
  }

  async function handleQRData(raw: string) {
    let code = ''
    try { const parsed = JSON.parse(raw); code = parsed.code || '' }
    catch { if (raw.startsWith('BB-')) code = raw }

    if (!code || !code.startsWith('BB-')) {
      setResult({ type: 'error', message: 'Not a valid promo QR code' })
      setTimeout(() => { setResult(null); if (mode === 'scan') startCamera() }, 2500)
      return
    }
    await lookupClaim(code)
  }

  async function lookupClaim(code: string) {
    setClaim(null)
    setResult({ type: 'info', message: 'Looking up ' + code + '...' })

    const data = await sbFetch('promo_claims', {
      query: `?claim_code=eq.${encodeURIComponent(code)}&select=*`
    })

    if (!data || data.length === 0) {
      setResult({ type: 'error', message: 'Claim not found: ' + code })
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
        redeemed_by: staff.email,
      }),
    })

    if (!res.ok) {
      setResult({ type: 'error', message: 'Redeem failed' })
      setRedeeming(false)
      return
    }

    setClaim({ ...claim, status: 'redeemed', redeemed_at: new Date().toISOString(), redeemed_by: staff.email })
    setResult({ type: 'success', message: 'Prize redeemed!' })
    loadRecentRedemptions()
    setRedeeming(false)
  }

  function dismissClaim() {
    setClaim(null); setResult(null); lastScannedRef.current = ''
    if (mode === 'scan') startCamera()
  }

  async function handleSearch() {
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

  function getStatus(c: PromoClaim) {
    const expired = new Date(c.expires_at) < new Date()
    if (c.status === 'redeemed') return { label: 'Redeemed', color: B.green, bg: 'rgba(0,177,79,0.12)', border: 'rgba(0,177,79,0.3)' }
    if (expired) return { label: 'Expired', color: B.red, bg: 'rgba(239,68,68,0.12)', border: 'rgba(239,68,68,0.3)' }
    return { label: 'Active', color: B.orange, bg: 'rgba(250,131,46,0.12)', border: 'rgba(250,131,46,0.3)' }
  }

  function fmtDate(d: string) {
    return new Date(d).toLocaleDateString('en-US', { day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit' })
  }

  const status = claim ? getStatus(claim) : null
  const isExpired = claim ? new Date(claim.expires_at) < new Date() : false
  const canRedeem = claim?.status === 'active'

  return (
    <div style={{ minHeight: '100vh', background: B.bg, fontFamily: "'DM Sans', sans-serif", padding: '0 0 40px' }}>
      <canvas ref={canvasRef} style={{ display: 'none' }} />
      {/* Header */}
      <div style={{ padding: '16px 20px', display: 'flex', alignItems: 'center', justifyContent: 'space-between', borderBottom: `1px solid ${B.creamFaint}` }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
          <img src="https://bigbamboo.app/images/bbb-img-5.png" alt="" style={{ width: 36, height: 36, borderRadius: 10, objectFit: 'cover' }} />
          <div>
            <div style={{ fontFamily: "'Bebas Neue', sans-serif", fontSize: 18, color: B.cream, letterSpacing: '0.04em' }}>Event Scanner</div>
            <div style={{ fontSize: 11, color: B.creamMuted }}>{staff.name} · {staff.role}</div>
          </div>
        </div>
        <div style={{ display: 'flex', gap: 8 }}>
          <a href="/dashboard" style={{ padding: '8px 16px', borderRadius: 8, fontSize: 12, fontWeight: 600, border: `1px solid ${B.creamFaint}`, background: 'transparent', color: B.creamMuted, cursor: 'pointer', textDecoration: 'none' }}>
            Dashboard
          </a>
          <button onClick={onLogout} style={{ padding: '8px 16px', borderRadius: 8, fontSize: 12, fontWeight: 600, border: `1px solid ${B.creamFaint}`, background: 'transparent', color: B.creamMuted, cursor: 'pointer' }}>
            Logout
          </button>
        </div>
      </div>

      <div style={{ maxWidth: 420, margin: '0 auto', padding: '20px 20px' }}>
        {/* Mode toggle */}
        <div style={{ display: 'flex', gap: 8, marginBottom: 20 }}>
          <button onClick={() => { setMode('scan'); setClaim(null); setResult(null) }}
            style={{ flex: 1, padding: '12px', borderRadius: 10, fontSize: 14, fontWeight: 600, cursor: 'pointer', border: 'none',
              background: mode === 'scan' ? `${B.teal}25` : B.bgCard,
              color: mode === 'scan' ? B.tealBright : B.creamMuted, fontFamily: "'DM Sans', sans-serif" }}>
            Scan QR
          </button>
          <button onClick={() => { setMode('search'); setClaim(null); setResult(null); stopCamera() }}
            style={{ flex: 1, padding: '12px', borderRadius: 10, fontSize: 14, fontWeight: 600, cursor: 'pointer', border: 'none',
              background: mode === 'search' ? `${B.teal}25` : B.bgCard,
              color: mode === 'search' ? B.tealBright : B.creamMuted, fontFamily: "'DM Sans', sans-serif" }}>
            Manual Search
          </button>
        </div>

        {/* Result banner */}
        {result && (
          <div style={{ marginBottom: 16, padding: '14px 18px', borderRadius: 10, fontSize: 14, fontWeight: 600, textAlign: 'center',
            background: result.type === 'success' ? 'rgba(0,177,79,0.12)' : result.type === 'error' ? 'rgba(239,68,68,0.12)' : `${B.teal}15`,
            color: result.type === 'success' ? B.green : result.type === 'error' ? B.red : B.tealBright,
            border: `1px solid ${result.type === 'success' ? 'rgba(0,177,79,0.3)' : result.type === 'error' ? 'rgba(239,68,68,0.3)' : `${B.teal}30`}` }}>
            {result.message}
          </div>
        )}

        {/* Claim detail card */}
        {claim && (
          <div style={{ background: B.bgCard, borderRadius: 16, border: `1px solid ${B.creamFaint}`, overflow: 'hidden', marginBottom: 20 }}>
            <div style={{ padding: '24px 24px 16px', borderBottom: `1px solid ${B.creamFaint}`, textAlign: 'center' }}>
              <div style={{ fontSize: 40, marginBottom: 8 }}>🎁</div>
              <div style={{ fontFamily: "'Bebas Neue', sans-serif", fontSize: 26, letterSpacing: '0.03em', color: B.gold }}>
                {claim.prize_label}
              </div>
              <div style={{ marginTop: 8 }}>
                <span style={{ display: 'inline-block', padding: '4px 14px', borderRadius: 50, fontSize: 12, fontWeight: 700,
                  background: status?.bg, color: status?.color, border: `1px solid ${status?.border}`,
                  letterSpacing: '0.06em', textTransform: 'uppercase' }}>
                  {status?.label}
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
                    <div style={{ fontSize: 11, color: B.orange, fontWeight: 600, textAlign: 'center',
                      letterSpacing: '0.04em' }}>
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
                  background: 'rgba(0,177,79,0.1)', color: B.green, border: `1px solid rgba(0,177,79,0.25)`,
                  fontFamily: "'Bebas Neue', sans-serif", letterSpacing: '0.06em' }}>
                  Already Redeemed
                </div>
              )}
              <button onClick={dismissClaim}
                style={{ padding: '15px 20px', borderRadius: 12, fontSize: 14, fontWeight: 600, cursor: 'pointer',
                  border: `1px solid ${B.creamFaint}`, background: 'transparent', color: B.creamMuted, fontFamily: "'DM Sans', sans-serif" }}>
                {mode === 'scan' ? 'Scan Next' : 'Back'}
              </button>
            </div>
          </div>
        )}

        {/* Scan mode: camera */}
        {mode === 'scan' && !claim && (
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
              Point camera at customer's prize QR code
            </div>
          </div>
        )}

        {/* Search mode */}
        {mode === 'search' && !claim && (
          <div>
            <div style={{ display: 'flex', gap: 8, marginBottom: 16 }}>
              <input value={searchQuery} onChange={e => setSearchQuery(e.target.value)}
                onKeyDown={e => e.key === 'Enter' && handleSearch()}
                placeholder="Code (BB-...) or phone/email..."
                style={{ flex: 1, padding: '14px 18px', background: B.bgCard, color: B.cream,
                  border: `1px solid ${B.creamFaint}`, borderRadius: 10, fontSize: 14, fontFamily: "'DM Sans', sans-serif", outline: 'none' }} autoFocus />
              <button onClick={handleSearch} disabled={searching}
                style={{ padding: '14px 20px', borderRadius: 10, fontSize: 14, fontWeight: 600, cursor: 'pointer',
                  border: 'none', background: B.teal, color: B.cream, fontFamily: "'DM Sans', sans-serif" }}>
                {searching ? '...' : 'Search'}
              </button>
            </div>

            {searchResults.length > 0 && (
              <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
                {searchResults.map(c => {
                  const s = getStatus(c)
                  return (
                    <div key={c.id} onClick={() => { setClaim(c); stopCamera() }}
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
              <div style={{ textAlign: 'center', padding: 30, color: B.creamMuted, fontSize: 14 }}>No claims found</div>
            )}
          </div>
        )}

        {/* Recent redemptions */}
        {!claim && recentRedemptions.length > 0 && (
          <div style={{ marginTop: 32 }}>
            <div style={{ fontFamily: "'Bebas Neue', sans-serif", fontSize: 18, letterSpacing: '0.04em', color: B.cream, marginBottom: 12 }}>
              Recent Redemptions
            </div>
            <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
              {recentRedemptions.map(c => (
                <div key={c.id} onClick={() => setClaim(c)}
                  style={{ padding: '10px 14px', background: B.bgCard, border: `1px solid ${B.creamFaint}`,
                    borderRadius: 8, cursor: 'pointer', display: 'flex', alignItems: 'center', gap: 10, fontSize: 13 }}>
                  <span>🎁</span>
                  <span style={{ fontWeight: 600, color: B.cream }}>{c.prize_label}</span>
                  <span style={{ color: B.creamMuted }}>·</span>
                  <span style={{ color: B.creamMuted, fontSize: 12 }}>{c.claim_code}</span>
                  <span style={{ marginLeft: 'auto', color: B.creamMuted, fontSize: 12 }}>
                    {c.redeemed_at ? fmtDate(c.redeemed_at) : ''}
                  </span>
                </div>
              ))}
            </div>
          </div>
        )}
      </div>

      <style>{`@import url('https://fonts.googleapis.com/css2?family=Bebas+Neue&family=DM+Sans:wght@400;500;600;700&display=swap');`}</style>
    </div>
  )
}

// ─── Main Page ───
export default function ScannerPage() {
  const [staff, setStaff] = useState<StaffUser | null>(null)

  useEffect(() => {
    // Check for existing session
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
          // If camera is waiting for jsQR, trigger a re-render
          setStaff(prev => prev ? { ...prev } : prev)
        }} />
      <ScannerInterface staff={staff} onLogout={handleLogout} />
    </>
  )
}

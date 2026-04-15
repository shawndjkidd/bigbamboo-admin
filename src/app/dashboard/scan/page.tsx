'use client'
import { useEffect, useRef, useState, useCallback } from 'react'
import { supabase } from '@/lib/supabase'
import Script from 'next/script'

/*
 * ════════════════════════════════════════════════════════════════
 *  BIGBAMBOO PROMO SCANNER — Full-screen mobile-first design
 *  Uses BarcodeDetector where available, jsQR as fallback (iOS)
 * ════════════════════════════════════════════════════════════════
 */

interface PromoClaim {
  id: string; claim_code: string; prize_type: string; prize_label: string;
  contact_type: string; contact_value: string; status: string;
  issued_at: string; expires_at: string; redeemed_at: string | null;
  redeemed_by: string | null; source_code: string;
  discount_percent: number | null; max_discount_vnd: number | null;
}

const PRIZE_EMOJI: Record<string, string> = {
  onion_rings: '🧅', welcome_shot: '🥃', '15off_food': '🍽️',
  huda: '🍺', vodka_earl_grey: '🍋', sparkling_sangria: '🥂',
  sandwich: '🥪', any_cocktail: '🍹', '50off_bill': '💰',
  bogo_cocktail: '🍹', '10off_bill': '🏷️', '20off_bill': '💸',
}

export default function ScanPage() {
  const [mode, setMode] = useState<'scan' | 'search'>('scan')
  const [scanning, setScanning] = useState(false)
  const [result, setResult] = useState<{ type: 'success' | 'error' | 'info'; msg: string } | null>(null)
  const [claim, setClaim] = useState<PromoClaim | null>(null)
  const [redeeming, setRedeeming] = useState(false)
  const [searchQuery, setSearchQuery] = useState('')
  const [searchResults, setSearchResults] = useState<PromoClaim[]>([])
  const [searching, setSearching] = useState(false)
  const [staffEmail, setStaffEmail] = useState('')
  const [jsQRReady, setJsQRReady] = useState(false)

  const videoRef = useRef<HTMLVideoElement>(null)
  const canvasRef = useRef<HTMLCanvasElement>(null)
  const scanIntervalRef = useRef<any>(null)
  const lastScannedRef = useRef<string>('')
  const streamRef = useRef<MediaStream | null>(null)

  useEffect(() => {
    supabase.auth.getUser().then(({ data: { user } }) => {
      if (user?.email) setStaffEmail(user.email)
    })
  }, [])

  // Start/stop camera based on mode & claim state
  useEffect(() => {
    if (mode === 'scan' && !claim) startCamera()
    else stopCamera()
    return () => stopCamera()
  }, [mode, claim, jsQRReady])

  function startCamera() {
    if (!navigator.mediaDevices) {
      setResult({ type: 'error', msg: 'Camera not available' })
      return
    }
    setScanning(true)
    lastScannedRef.current = ''

    navigator.mediaDevices.getUserMedia({
      video: { facingMode: 'environment', width: { ideal: 1280 }, height: { ideal: 720 } }
    })
    .then(stream => {
      streamRef.current = stream
      if (videoRef.current) {
        videoRef.current.srcObject = stream
        videoRef.current.play()

        // Try native BarcodeDetector first, fall back to jsQR
        if ('BarcodeDetector' in window) {
          startNativeScan()
        } else if ((window as any).jsQR) {
          startJsQRScan()
        } else {
          // jsQR not loaded yet — will retry when script loads
          setResult({ type: 'info', msg: 'Loading scanner...' })
        }
      }
    })
    .catch(() => {
      setResult({ type: 'error', msg: 'Camera access denied. Check browser permissions.' })
      setScanning(false)
    })
  }

  function startNativeScan() {
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
      setResult({ type: 'error', msg: 'Not a valid prize QR code' })
      setTimeout(() => { setResult(null); if (mode === 'scan') startCamera() }, 2500)
      return
    }
    await lookupClaim(code)
  }

  async function lookupClaim(code: string) {
    setClaim(null)
    setResult({ type: 'info', msg: 'Looking up ' + code + '...' })

    const { data, error } = await supabase
      .from('promo_claims').select('*').eq('claim_code', code).single()

    if (error || !data) {
      setResult({ type: 'error', msg: 'Claim not found: ' + code })
      setTimeout(() => { setResult(null); if (mode === 'scan') startCamera() }, 3000)
      return
    }
    setResult(null)
    setClaim(data as PromoClaim)
  }

  async function redeemClaim() {
    if (!claim) return
    setRedeeming(true)

    const { error } = await supabase
      .from('promo_claims')
      .update({ status: 'redeemed', redeemed_at: new Date().toISOString(), redeemed_by: staffEmail })
      .eq('id', claim.id)
      .eq('status', 'active')

    if (error) {
      setResult({ type: 'error', msg: 'Redeem failed' })
      setRedeeming(false)
      return
    }

    setClaim({ ...claim, status: 'redeemed', redeemed_at: new Date().toISOString(), redeemed_by: staffEmail })
    setResult({ type: 'success', msg: 'Prize redeemed!' })
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
    let query = supabase.from('promo_claims').select('*')
    if (q.startsWith('BB-')) query = query.eq('claim_code', q)
    else query = query.ilike('contact_value', '%' + searchQuery.trim() + '%')
    const { data } = await query.order('issued_at', { ascending: false }).limit(20)
    setSearchResults(data || [])
    setSearching(false)
  }

  const isExpired = claim ? new Date(claim.expires_at) < new Date() : false
  const canRedeem = claim?.status === 'active' // expired but active = still redeemable
  const emoji = PRIZE_EMOJI[claim?.prize_type || ''] || '🎁'

  function statusBadge(c: PromoClaim) {
    if (c.status === 'redeemed') return { label: 'Redeemed', color: '#00b14f', bg: 'rgba(0,177,79,0.15)' }
    if (new Date(c.expires_at) < new Date()) return { label: 'Expired', color: '#ef4444', bg: 'rgba(239,68,68,0.15)' }
    return { label: 'Active', color: '#e8a820', bg: 'rgba(232,168,32,0.15)' }
  }

  function fmtDate(d: string) {
    return new Date(d).toLocaleDateString('en-US', { day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit' })
  }

  function handleJsQRLoad() {
    setJsQRReady(true)
    // If we're currently waiting for jsQR, start scanning now
    if (mode === 'scan' && !claim && streamRef.current && !scanIntervalRef.current) {
      startJsQRScan()
    }
  }

  return (
    <>
      {/* Load jsQR as fallback for iOS Safari */}
      <Script
        src="https://cdn.jsdelivr.net/npm/jsqr@1.4.0/dist/jsQR.min.js"
        strategy="afterInteractive"
        onLoad={handleJsQRLoad}
      />

      {/* Hidden canvas for jsQR processing */}
      <canvas ref={canvasRef} style={{ display: 'none' }} />

      {/* FULL-SCREEN OVERLAY — covers sidebar on mobile */}
      <div style={{
        position: 'fixed', inset: 0, zIndex: 9999,
        background: '#0a1614',
        display: 'flex', flexDirection: 'column',
        fontFamily: "'DM Sans', sans-serif",
        overflow: 'auto',
      }}>

        {/* Top bar */}
        <div style={{
          padding: '12px 16px', display: 'flex', alignItems: 'center', justifyContent: 'space-between',
          borderBottom: '1px solid rgba(245,238,216,0.08)', flexShrink: 0,
          background: 'rgba(10,22,20,0.95)', backdropFilter: 'blur(10px)',
        }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
            <div style={{ width: 32, height: 32, borderRadius: 8, background: 'linear-gradient(135deg, #e8772e, #fa832e)',
              display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 16 }}>🎁</div>
            <div>
              <div style={{ fontFamily: "'Bebas Neue', sans-serif", fontSize: 16, color: '#f5eed8', letterSpacing: '0.04em', lineHeight: 1 }}>
                Prize Scanner
              </div>
              <div style={{ fontSize: 10, color: 'rgba(245,238,216,0.4)', marginTop: 1 }}>{staffEmail || 'Staff'}</div>
            </div>
          </div>
          <a href="/dashboard" style={{
            padding: '6px 14px', borderRadius: 8, fontSize: 12, fontWeight: 600,
            border: '1px solid rgba(245,238,216,0.12)', background: 'transparent',
            color: 'rgba(245,238,216,0.5)', textDecoration: 'none',
          }}>
            ← Dashboard
          </a>
        </div>

        {/* Mode toggle */}
        <div style={{ padding: '12px 16px 0', flexShrink: 0 }}>
          <div style={{ display: 'flex', gap: 6, background: 'rgba(245,238,216,0.06)', borderRadius: 10, padding: 3 }}>
            {(['scan', 'search'] as const).map(m => (
              <button key={m} onClick={() => { setMode(m); setClaim(null); setResult(null); if (m === 'search') stopCamera() }}
                style={{
                  flex: 1, padding: '10px', borderRadius: 8, fontSize: 14, fontWeight: 600,
                  cursor: 'pointer', border: 'none', transition: 'all 0.2s',
                  fontFamily: "'DM Sans', sans-serif",
                  background: mode === m ? 'rgba(232,119,46,0.2)' : 'transparent',
                  color: mode === m ? '#fa832e' : 'rgba(245,238,216,0.4)',
                }}>
                {m === 'scan' ? '📷 Scan QR' : '🔍 Search'}
              </button>
            ))}
          </div>
        </div>

        {/* Main content */}
        <div style={{ flex: 1, padding: '12px 16px 24px', overflowY: 'auto' }}>

          {/* Result banner */}
          {result && (
            <div style={{
              marginBottom: 12, padding: '12px 16px', borderRadius: 10, fontSize: 14, fontWeight: 600, textAlign: 'center',
              background: result.type === 'success' ? 'rgba(0,177,79,0.15)' : result.type === 'error' ? 'rgba(239,68,68,0.15)' : 'rgba(42,138,134,0.15)',
              color: result.type === 'success' ? '#00b14f' : result.type === 'error' ? '#ef4444' : '#3aa8a4',
            }}>
              {result.msg}
            </div>
          )}

          {/* ─── CLAIM DETAIL CARD ─── */}
          {claim && (
            <div style={{ background: '#1a3a38', borderRadius: 16, overflow: 'hidden', marginBottom: 16, border: '1px solid rgba(245,238,216,0.08)' }}>
              <div style={{ padding: '28px 20px 16px', textAlign: 'center', borderBottom: '1px solid rgba(245,238,216,0.06)' }}>
                <div style={{ fontSize: 48, marginBottom: 8 }}>{emoji}</div>
                <div style={{ fontFamily: "'Bebas Neue', sans-serif", fontSize: 28, letterSpacing: '0.03em', color: '#e8a820' }}>
                  {claim.prize_label}
                </div>
                <div style={{ marginTop: 10 }}>
                  {(() => {
                    const s = statusBadge(claim)
                    return (
                      <span style={{
                        display: 'inline-block', padding: '4px 16px', borderRadius: 50, fontSize: 12, fontWeight: 700,
                        background: s.bg, color: s.color, letterSpacing: '0.06em', textTransform: 'uppercase',
                      }}>{s.label}</span>
                    )
                  })()}
                </div>
              </div>

              <div style={{ padding: '14px 20px', display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '10px 20px', fontSize: 13 }}>
                <div>
                  <div style={{ color: 'rgba(245,238,216,0.35)', fontSize: 10, textTransform: 'uppercase', letterSpacing: '0.08em' }}>Code</div>
                  <div style={{ fontWeight: 700, fontFamily: 'monospace', fontSize: 15, color: '#f5eed8' }}>{claim.claim_code}</div>
                </div>
                <div>
                  <div style={{ color: 'rgba(245,238,216,0.35)', fontSize: 10, textTransform: 'uppercase', letterSpacing: '0.08em' }}>Contact</div>
                  <div style={{ color: '#f5eed8' }}>{claim.contact_type === 'anonymous' ? 'Anonymous' : claim.contact_value}</div>
                </div>
                <div>
                  <div style={{ color: 'rgba(245,238,216,0.35)', fontSize: 10, textTransform: 'uppercase', letterSpacing: '0.08em' }}>Issued</div>
                  <div style={{ color: '#f5eed8' }}>{fmtDate(claim.issued_at)}</div>
                </div>
                <div>
                  <div style={{ color: 'rgba(245,238,216,0.35)', fontSize: 10, textTransform: 'uppercase', letterSpacing: '0.08em' }}>Expires</div>
                  <div style={{ color: isExpired ? '#ef4444' : '#f5eed8' }}>{fmtDate(claim.expires_at)}</div>
                </div>
                {claim.discount_percent && (
                  <div>
                    <div style={{ color: 'rgba(245,238,216,0.35)', fontSize: 10, textTransform: 'uppercase', letterSpacing: '0.08em' }}>Discount</div>
                    <div style={{ color: '#f5eed8' }}>{claim.discount_percent}%{claim.max_discount_vnd ? ` (max ${(claim.max_discount_vnd / 1000)}k)` : ''}</div>
                  </div>
                )}
                {claim.redeemed_at && (
                  <>
                    <div>
                      <div style={{ color: 'rgba(245,238,216,0.35)', fontSize: 10, textTransform: 'uppercase', letterSpacing: '0.08em' }}>Redeemed</div>
                      <div style={{ color: '#00b14f' }}>{fmtDate(claim.redeemed_at)}</div>
                    </div>
                    <div>
                      <div style={{ color: 'rgba(245,238,216,0.35)', fontSize: 10, textTransform: 'uppercase', letterSpacing: '0.08em' }}>By</div>
                      <div style={{ color: '#00b14f' }}>{claim.redeemed_by || '—'}</div>
                    </div>
                  </>
                )}
              </div>

              {/* Action buttons */}
              <div style={{ padding: '12px 20px 20px', display: 'flex', gap: 10 }}>
                {canRedeem && (
                  <div style={{ flex: 1, display: 'flex', flexDirection: 'column', gap: 6 }}>
                    {isExpired && (
                      <div style={{ fontSize: 11, color: '#fa832e', fontWeight: 600, textAlign: 'center', letterSpacing: '0.04em' }}>
                        Expired — still redeemable
                      </div>
                    )}
                    <button onClick={redeemClaim} disabled={redeeming}
                      style={{
                        width: '100%', padding: '16px', borderRadius: 12, fontSize: 18, fontWeight: 700, cursor: 'pointer',
                        border: 'none', background: '#00b14f', color: '#fff', opacity: redeeming ? 0.6 : 1,
                        fontFamily: "'Bebas Neue', sans-serif", letterSpacing: '0.06em',
                      }}>
                      {redeeming ? 'Redeeming...' : '✓ Redeem Prize'}
                    </button>
                  </div>
                )}
                {claim.status === 'redeemed' && (
                  <div style={{
                    flex: 1, padding: '16px', borderRadius: 12, fontSize: 18, fontWeight: 700, textAlign: 'center',
                    background: 'rgba(0,177,79,0.1)', color: '#00b14f', border: '1px solid rgba(0,177,79,0.25)',
                    fontFamily: "'Bebas Neue', sans-serif", letterSpacing: '0.06em',
                  }}>
                    ✓ Already Redeemed
                  </div>
                )}
                <button onClick={dismissClaim}
                  style={{
                    padding: '16px 20px', borderRadius: 12, fontSize: 15, fontWeight: 600, cursor: 'pointer',
                    border: '1px solid rgba(245,238,216,0.12)', background: 'transparent', color: 'rgba(245,238,216,0.5)',
                    fontFamily: "'DM Sans', sans-serif",
                  }}>
                  {mode === 'scan' ? 'Next' : 'Back'}
                </button>
              </div>
            </div>
          )}

          {/* ─── SCAN MODE: CAMERA ─── */}
          {mode === 'scan' && !claim && (
            <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center' }}>
              <div style={{
                position: 'relative', width: '100%', maxWidth: 400, aspectRatio: '3/4',
                borderRadius: 20, overflow: 'hidden', background: '#000',
                border: '2px solid rgba(42,138,134,0.3)',
              }}>
                <video ref={videoRef} style={{ width: '100%', height: '100%', objectFit: 'cover' }} playsInline muted />

                {/* Corner scan guides */}
                <div style={{ position: 'absolute', top: '12%', left: '12%', right: '12%', bottom: '12%', pointerEvents: 'none' }}>
                  {/* Top-left */}
                  <div style={{ position: 'absolute', top: 0, left: 0, width: 30, height: 30, borderTop: '3px solid #3aa8a4', borderLeft: '3px solid #3aa8a4', borderRadius: '4px 0 0 0' }} />
                  {/* Top-right */}
                  <div style={{ position: 'absolute', top: 0, right: 0, width: 30, height: 30, borderTop: '3px solid #3aa8a4', borderRight: '3px solid #3aa8a4', borderRadius: '0 4px 0 0' }} />
                  {/* Bottom-left */}
                  <div style={{ position: 'absolute', bottom: 0, left: 0, width: 30, height: 30, borderBottom: '3px solid #3aa8a4', borderLeft: '3px solid #3aa8a4', borderRadius: '0 0 0 4px' }} />
                  {/* Bottom-right */}
                  <div style={{ position: 'absolute', bottom: 0, right: 0, width: 30, height: 30, borderBottom: '3px solid #3aa8a4', borderRight: '3px solid #3aa8a4', borderRadius: '0 0 4px 0' }} />
                </div>

                {/* Scanning animation line */}
                {scanning && (
                  <div style={{
                    position: 'absolute', left: '12%', right: '12%', height: 2,
                    background: 'linear-gradient(90deg, transparent, #3aa8a4, transparent)',
                    animation: 'scanline 2s ease-in-out infinite',
                    top: '50%',
                  }} />
                )}

                {!scanning && !result && (
                  <div style={{ position: 'absolute', inset: 0, display: 'flex', alignItems: 'center', justifyContent: 'center', background: 'rgba(0,0,0,0.8)' }}>
                    <div style={{ textAlign: 'center' }}>
                      <div style={{ fontSize: 32, marginBottom: 8 }}>📷</div>
                      <div style={{ color: 'rgba(245,238,216,0.5)', fontSize: 14 }}>Starting camera...</div>
                    </div>
                  </div>
                )}
              </div>
              <div style={{ textAlign: 'center', marginTop: 16, fontSize: 14, color: 'rgba(245,238,216,0.5)' }}>
                Point at customer's prize QR code
              </div>
            </div>
          )}

          {/* ─── SEARCH MODE ─── */}
          {mode === 'search' && !claim && (
            <div>
              <div style={{ display: 'flex', gap: 8, marginBottom: 16 }}>
                <input value={searchQuery} onChange={e => setSearchQuery(e.target.value)}
                  onKeyDown={e => e.key === 'Enter' && handleSearch()}
                  placeholder="Code (BB-...) or phone/email"
                  style={{
                    flex: 1, padding: '14px 16px', background: '#1a3a38', color: '#f5eed8',
                    border: '1px solid rgba(245,238,216,0.1)', borderRadius: 10, fontSize: 15,
                    fontFamily: "'DM Sans', sans-serif", outline: 'none',
                  }} autoFocus />
                <button onClick={handleSearch} disabled={searching}
                  style={{
                    padding: '14px 20px', borderRadius: 10, fontSize: 14, fontWeight: 600, cursor: 'pointer',
                    border: 'none', background: '#2a8a86', color: '#f5eed8', fontFamily: "'DM Sans', sans-serif",
                  }}>
                  {searching ? '...' : 'Go'}
                </button>
              </div>

              {searchResults.length > 0 && (
                <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
                  {searchResults.map(c => {
                    const s = statusBadge(c)
                    const e = PRIZE_EMOJI[c.prize_type] || '🎁'
                    return (
                      <div key={c.id} onClick={() => setClaim(c)}
                        style={{
                          padding: '14px 16px', background: '#1a3a38', border: '1px solid rgba(245,238,216,0.08)',
                          borderRadius: 12, cursor: 'pointer', display: 'flex', alignItems: 'center', gap: 12,
                        }}>
                        <span style={{ fontSize: 24 }}>{e}</span>
                        <div style={{ flex: 1, minWidth: 0 }}>
                          <div style={{ fontWeight: 600, fontSize: 14, color: '#f5eed8' }}>{c.prize_label}</div>
                          <div style={{ fontSize: 12, color: 'rgba(245,238,216,0.4)', marginTop: 2, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                            {c.claim_code} · {c.contact_type === 'anonymous' ? 'Anonymous' : c.contact_value}
                          </div>
                        </div>
                        <span style={{ padding: '3px 10px', borderRadius: 50, fontSize: 10, fontWeight: 700, background: s.bg, color: s.color, flexShrink: 0 }}>
                          {s.label}
                        </span>
                      </div>
                    )
                  })}
                </div>
              )}

              {searchResults.length === 0 && searchQuery && !searching && (
                <div style={{ textAlign: 'center', padding: 40, color: 'rgba(245,238,216,0.3)', fontSize: 14 }}>No claims found</div>
              )}
            </div>
          )}
        </div>

        {/* CSS animations */}
        <style>{`
          @import url('https://fonts.googleapis.com/css2?family=Bebas+Neue&family=DM+Sans:wght@400;500;600;700&display=swap');
          @keyframes scanline {
            0%, 100% { top: 15%; opacity: 0.4; }
            50% { top: 80%; opacity: 1; }
          }
        `}</style>
      </div>
    </>
  )
}

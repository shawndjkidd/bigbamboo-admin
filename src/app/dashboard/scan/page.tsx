'use client'
import { useEffect, useRef, useState } from 'react'
import { supabase } from '@/lib/supabase'

interface PromoClaim {
  id: string
  claim_code: string
  prize_type: string
  prize_label: string
  contact_type: string
  contact_value: string
  status: string
  issued_at: string
  expires_at: string
  redeemed_at: string | null
  redeemed_by: string | null
  source_code: string
  discount_percent: number | null
  max_discount_vnd: number | null
}

const PRIZE_DISPLAY: Record<string, { emoji: string; color: string }> = {
  onion_rings:      { emoji: '🧅', color: '#F0A830' },
  welcome_shot:     { emoji: '🥃', color: '#D44060' },
  '15off_food':     { emoji: '🍽️', color: '#4CAF50' },
  huda:             { emoji: '🍺', color: '#F5D623' },
  vodka_earl_grey:  { emoji: '🍋', color: '#8DB850' },
  sparkling_sangria:{ emoji: '🥂', color: '#D44060' },
  sandwich:         { emoji: '🥪', color: '#E84430' },
  any_cocktail:     { emoji: '🍹', color: '#4CAF50' },
  '50off_bill':     { emoji: '💰', color: '#e8772e' },
}

export default function ScanPage() {
  const [tab, setTab] = useState<'promo' | 'door'>('promo')
  const [mode, setMode] = useState<'scan' | 'search'>('scan')
  const [scanning, setScanning] = useState(false)
  const [result, setResult] = useState<{ type: 'success' | 'error' | 'info' | 'warn'; message: string } | null>(null)
  const [claim, setClaim] = useState<PromoClaim | null>(null)
  const [redeeming, setRedeeming] = useState(false)
  const [searchQuery, setSearchQuery] = useState('')
  const [searchResults, setSearchResults] = useState<PromoClaim[]>([])
  const [searching, setSearching] = useState(false)
  const [staffEmail, setStaffEmail] = useState('')
  const [recentRedemptions, setRecentRedemptions] = useState<PromoClaim[]>([])

  const videoRef = useRef<HTMLVideoElement>(null)
  const scanIntervalRef = useRef<any>(null)
  const lastScannedRef = useRef<string>('')

  useEffect(() => {
    supabase.auth.getUser().then(({ data: { user } }) => {
      if (user?.email) setStaffEmail(user.email)
    })
    loadRecentRedemptions()
  }, [])

  useEffect(() => {
    if (tab === 'promo' && mode === 'scan') startCamera()
    else stopCamera()
    return () => stopCamera()
  }, [tab, mode])

  async function loadRecentRedemptions() {
    const { data } = await supabase
      .from('promo_claims')
      .select('*')
      .eq('status', 'redeemed')
      .order('redeemed_at', { ascending: false })
      .limit(10)
    setRecentRedemptions(data || [])
  }

  function startCamera() {
    if (!navigator.mediaDevices) {
      setResult({ type: 'error', message: 'Camera not available on this device' })
      return
    }
    setScanning(true)
    lastScannedRef.current = ''
    navigator.mediaDevices.getUserMedia({ video: { facingMode: 'environment' } })
      .then(stream => {
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
            }, 400)
          } else {
            setResult({ type: 'info', message: 'QR scanning not supported on this browser. Use manual search.' })
          }
        }
      })
      .catch(() => {
        setResult({ type: 'error', message: 'Camera access denied' })
        setScanning(false)
      })
  }

  function stopCamera() {
    if (scanIntervalRef.current) { clearInterval(scanIntervalRef.current); scanIntervalRef.current = null }
    if (videoRef.current?.srcObject) {
      (videoRef.current.srcObject as MediaStream).getTracks().forEach(t => t.stop())
      videoRef.current.srcObject = null
    }
    setScanning(false)
  }

  async function handleQRData(raw: string) {
    let code = ''
    try {
      const parsed = JSON.parse(raw)
      code = parsed.code || ''
    } catch {
      // Maybe just a plain code
      if (raw.startsWith('BB-')) code = raw
    }

    if (!code || !code.startsWith('BB-')) {
      setResult({ type: 'error', message: 'Not a valid promo QR code' })
      setTimeout(() => { setResult(null); if (tab === 'promo' && mode === 'scan') startCamera() }, 2500)
      return
    }

    await lookupClaim(code)
  }

  async function lookupClaim(code: string) {
    setClaim(null)
    setResult({ type: 'info', message: 'Looking up ' + code + '...' })

    const { data, error } = await supabase
      .from('promo_claims')
      .select('*')
      .eq('claim_code', code)
      .single()

    if (error || !data) {
      setResult({ type: 'error', message: 'Claim not found: ' + code })
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
      .update({
        status: 'redeemed',
        redeemed_at: new Date().toISOString(),
        redeemed_by: staffEmail
      })
      .eq('id', claim.id)
      .eq('status', 'active')

    if (error) {
      setResult({ type: 'error', message: 'Redeem failed: ' + error.message })
      setRedeeming(false)
      return
    }

    setClaim({ ...claim, status: 'redeemed', redeemed_at: new Date().toISOString(), redeemed_by: staffEmail })
    setResult({ type: 'success', message: 'Prize redeemed!' })
    loadRecentRedemptions()
    setRedeeming(false)
  }

  function dismissClaim() {
    setClaim(null)
    setResult(null)
    lastScannedRef.current = ''
    if (mode === 'scan') startCamera()
  }

  async function handleSearch() {
    if (!searchQuery.trim()) return
    setSearching(true)
    setSearchResults([])

    // Search by code or contact value
    const q = searchQuery.trim().toUpperCase()
    let query = supabase.from('promo_claims').select('*')

    if (q.startsWith('BB-')) {
      query = query.eq('claim_code', q)
    } else {
      query = query.ilike('contact_value', '%' + searchQuery.trim() + '%')
    }

    const { data } = await query.order('issued_at', { ascending: false }).limit(20)
    setSearchResults(data || [])
    setSearching(false)
  }

  function getStatusBadge(c: PromoClaim) {
    const now = new Date()
    const expires = new Date(c.expires_at)
    if (c.status === 'redeemed') return { label: 'Redeemed', bg: 'rgba(34,197,94,0.15)', color: '#22c55e', border: 'rgba(34,197,94,0.3)' }
    if (expires < now) return { label: 'Expired', bg: 'rgba(239,68,68,0.15)', color: '#ef4444', border: 'rgba(239,68,68,0.3)' }
    return { label: 'Active', bg: 'rgba(232,119,46,0.15)', color: '#e8772e', border: 'rgba(232,119,46,0.3)' }
  }

  function formatDate(d: string) {
    return new Date(d).toLocaleDateString('en-US', { day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit' })
  }

  const prizeInfo = PRIZE_DISPLAY[claim?.prize_type || ''] || { emoji: '🎁', color: '#e8772e' }
  const status = claim ? getStatusBadge(claim) : null
  const isExpired = claim ? new Date(claim.expires_at) < new Date() : false
  const canRedeem = claim?.status === 'active' && !isExpired

  return (
    <div>
      {/* Page header */}
      <div style={{ marginBottom: 28 }}>
        <h1 style={{ fontFamily: 'Bebas Neue, sans-serif', fontSize: 32, letterSpacing: '0.04em', color: 'var(--text)', margin: 0 }}>Scanner</h1>
        <p style={{ color: 'var(--text-muted)', fontSize: 14, margin: '4px 0 0' }}>Choose a scanner below</p>
      </div>

      {/* Scanner picker — two big clear cards */}
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(220px, 1fr))', gap: 16, marginBottom: 28, maxWidth: 560 }}>
        <button onClick={() => { setTab('promo'); setClaim(null); setResult(null) }}
          style={{ padding: '28px 24px', borderRadius: 16, cursor: 'pointer', textAlign: 'left', transition: 'all 0.2s',
            background: tab === 'promo' ? 'rgba(232,119,46,0.12)' : 'var(--card-bg)',
            border: tab === 'promo' ? '2px solid #e8772e' : '2px solid var(--border)' }}>
          <div style={{ fontFamily: 'Bebas Neue, sans-serif', fontSize: 22, letterSpacing: '0.04em',
            color: tab === 'promo' ? '#e8772e' : 'var(--text)' }}>
            Promo Prizes
          </div>
          <div style={{ fontSize: 13, color: 'var(--text-muted)', marginTop: 4, lineHeight: 1.4 }}>
            Scan a customer's Spin to Win QR code to redeem their prize
          </div>
        </button>

        <a href="/door" target="_blank" rel="noopener noreferrer"
          style={{ padding: '28px 24px', borderRadius: 16, cursor: 'pointer', textAlign: 'left', transition: 'all 0.2s',
            background: 'var(--card-bg)', border: '2px solid var(--border)', textDecoration: 'none', display: 'block' }}>
          <div style={{ fontFamily: 'Bebas Neue, sans-serif', fontSize: 22, letterSpacing: '0.04em', color: 'var(--text)' }}>
            Event Door Check-In
          </div>
          <div style={{ fontSize: 13, color: 'var(--text-muted)', marginTop: 4, lineHeight: 1.4 }}>
            Scan event ticket QR codes at the door to check guests in
          </div>
          <div style={{ fontSize: 11, color: 'var(--text-muted)', marginTop: 10, opacity: 0.7 }}>Opens in new tab ↗</div>
        </a>
      </div>

      {tab === 'promo' && (
        <div style={{ maxWidth: 520 }}>
          {/* Mode toggle */}
          <div style={{ display: 'flex', gap: 8, marginBottom: 20 }}>
            <button onClick={() => { setMode('scan'); setClaim(null); setResult(null) }}
              style={{ flex: 1, padding: '10px', borderRadius: 10, fontSize: 14, fontWeight: 600, cursor: 'pointer', border: 'none',
                background: mode === 'scan' ? 'rgba(232,119,46,0.15)' : 'var(--card-bg)',
                color: mode === 'scan' ? '#e8772e' : 'var(--text-muted)' }}>
              Scan QR
            </button>
            <button onClick={() => { setMode('search'); setClaim(null); setResult(null); stopCamera() }}
              style={{ flex: 1, padding: '10px', borderRadius: 10, fontSize: 14, fontWeight: 600, cursor: 'pointer', border: 'none',
                background: mode === 'search' ? 'rgba(232,119,46,0.15)' : 'var(--card-bg)',
                color: mode === 'search' ? '#e8772e' : 'var(--text-muted)' }}>
              Search
            </button>
          </div>

          {/* Result banner */}
          {result && (
            <div style={{ marginBottom: 16, padding: '14px 18px', borderRadius: 10, fontSize: 14, fontWeight: 600, textAlign: 'center',
              background: result.type === 'success' ? 'rgba(34,197,94,0.12)' : result.type === 'error' ? 'rgba(239,68,68,0.12)' : 'rgba(59,130,246,0.12)',
              color: result.type === 'success' ? '#22c55e' : result.type === 'error' ? '#ef4444' : '#3b82f6',
              border: '1px solid ' + (result.type === 'success' ? 'rgba(34,197,94,0.25)' : result.type === 'error' ? 'rgba(239,68,68,0.25)' : 'rgba(59,130,246,0.25)') }}>
              {result.message}
            </div>
          )}

          {/* Claim detail card */}
          {claim && (
            <div style={{ background: 'var(--card-bg)', borderRadius: 16, border: '1px solid var(--border)', overflow: 'hidden', marginBottom: 20 }}>
              {/* Prize header */}
              <div style={{ padding: '24px 24px 16px', borderBottom: '1px solid var(--border)', textAlign: 'center' }}>
                <div style={{ fontSize: 40, marginBottom: 8 }}>{prizeInfo.emoji}</div>
                <div style={{ fontFamily: 'Bebas Neue, sans-serif', fontSize: 26, letterSpacing: '0.03em', color: prizeInfo.color }}>
                  {claim.prize_label}
                </div>
                <div style={{ marginTop: 8 }}>
                  <span style={{ display: 'inline-block', padding: '4px 14px', borderRadius: 50, fontSize: 12, fontWeight: 700,
                    background: status?.bg, color: status?.color, border: '1px solid ' + status?.border,
                    letterSpacing: '0.06em', textTransform: 'uppercase' }}>
                    {status?.label}
                  </span>
                </div>
              </div>

              {/* Details */}
              <div style={{ padding: '16px 24px' }}>
                <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '12px 24px', fontSize: 13 }}>
                  <div>
                    <div style={{ color: 'var(--text-muted)', fontSize: 11, textTransform: 'uppercase', letterSpacing: '0.08em', marginBottom: 2 }}>Code</div>
                    <div style={{ fontWeight: 700, fontFamily: 'monospace', fontSize: 15, color: 'var(--text)' }}>{claim.claim_code}</div>
                  </div>
                  <div>
                    <div style={{ color: 'var(--text-muted)', fontSize: 11, textTransform: 'uppercase', letterSpacing: '0.08em', marginBottom: 2 }}>Contact</div>
                    <div style={{ color: 'var(--text)' }}>{claim.contact_value}</div>
                  </div>
                  <div>
                    <div style={{ color: 'var(--text-muted)', fontSize: 11, textTransform: 'uppercase', letterSpacing: '0.08em', marginBottom: 2 }}>Issued</div>
                    <div style={{ color: 'var(--text)' }}>{formatDate(claim.issued_at)}</div>
                  </div>
                  <div>
                    <div style={{ color: 'var(--text-muted)', fontSize: 11, textTransform: 'uppercase', letterSpacing: '0.08em', marginBottom: 2 }}>Expires</div>
                    <div style={{ color: isExpired ? '#ef4444' : 'var(--text)' }}>{formatDate(claim.expires_at)}</div>
                  </div>
                  {claim.source_code && claim.source_code !== 'DIRECT' && (
                    <div>
                      <div style={{ color: 'var(--text-muted)', fontSize: 11, textTransform: 'uppercase', letterSpacing: '0.08em', marginBottom: 2 }}>Source</div>
                      <div style={{ color: 'var(--text)' }}>{claim.source_code}</div>
                    </div>
                  )}
                  {claim.discount_percent && (
                    <div>
                      <div style={{ color: 'var(--text-muted)', fontSize: 11, textTransform: 'uppercase', letterSpacing: '0.08em', marginBottom: 2 }}>Discount</div>
                      <div style={{ color: 'var(--text)' }}>{claim.discount_percent}%{claim.max_discount_vnd ? ' (max ' + (claim.max_discount_vnd / 1000) + 'k)' : ''}</div>
                    </div>
                  )}
                  {claim.redeemed_at && (
                    <>
                      <div>
                        <div style={{ color: 'var(--text-muted)', fontSize: 11, textTransform: 'uppercase', letterSpacing: '0.08em', marginBottom: 2 }}>Redeemed At</div>
                        <div style={{ color: '#22c55e' }}>{formatDate(claim.redeemed_at)}</div>
                      </div>
                      <div>
                        <div style={{ color: 'var(--text-muted)', fontSize: 11, textTransform: 'uppercase', letterSpacing: '0.08em', marginBottom: 2 }}>Redeemed By</div>
                        <div style={{ color: '#22c55e' }}>{claim.redeemed_by || '—'}</div>
                      </div>
                    </>
                  )}
                </div>
              </div>

              {/* Action buttons */}
              <div style={{ padding: '16px 24px 24px', display: 'flex', gap: 10 }}>
                {canRedeem && (
                  <button onClick={redeemClaim} disabled={redeeming}
                    style={{ flex: 1, padding: '14px', borderRadius: 10, fontSize: 16, fontWeight: 700, cursor: 'pointer',
                      border: 'none', background: '#22c55e', color: '#fff', opacity: redeeming ? 0.6 : 1,
                      fontFamily: 'Bebas Neue, sans-serif', letterSpacing: '0.06em' }}>
                    {redeeming ? 'Redeeming...' : 'Redeem Prize'}
                  </button>
                )}
                {claim.status === 'redeemed' && (
                  <div style={{ flex: 1, padding: '14px', borderRadius: 10, fontSize: 16, fontWeight: 700, textAlign: 'center',
                    background: 'rgba(34,197,94,0.1)', color: '#22c55e', border: '1px solid rgba(34,197,94,0.25)',
                    fontFamily: 'Bebas Neue, sans-serif', letterSpacing: '0.06em' }}>
                    Already Redeemed
                  </div>
                )}
                {isExpired && claim.status !== 'redeemed' && (
                  <div style={{ flex: 1, padding: '14px', borderRadius: 10, fontSize: 16, fontWeight: 700, textAlign: 'center',
                    background: 'rgba(239,68,68,0.1)', color: '#ef4444', border: '1px solid rgba(239,68,68,0.25)',
                    fontFamily: 'Bebas Neue, sans-serif', letterSpacing: '0.06em' }}>
                    Expired
                  </div>
                )}
                <button onClick={dismissClaim}
                  style={{ padding: '14px 20px', borderRadius: 10, fontSize: 14, fontWeight: 600, cursor: 'pointer',
                    border: '1px solid var(--border)', background: 'transparent', color: 'var(--text-muted)' }}>
                  {mode === 'scan' ? 'Scan Next' : 'Back'}
                </button>
              </div>
            </div>
          )}

          {/* Scan mode: camera */}
          {mode === 'scan' && !claim && (
            <div>
              <div style={{ position: 'relative', width: '100%', aspectRatio: '1', borderRadius: 16, overflow: 'hidden',
                background: '#000', border: '2px solid rgba(232,119,46,0.2)' }}>
                <video ref={videoRef} style={{ width: '100%', height: '100%', objectFit: 'cover' }} playsInline muted />
                {/* Scan overlay */}
                <div style={{ position: 'absolute', top: '15%', left: '15%', right: '15%', bottom: '15%',
                  border: '2px solid rgba(232,119,46,0.5)', borderRadius: 12 }} />
                {!scanning && !result && (
                  <div style={{ position: 'absolute', inset: 0, display: 'flex', alignItems: 'center', justifyContent: 'center', background: 'rgba(0,0,0,0.7)' }}>
                    <div style={{ textAlign: 'center', color: 'rgba(255,255,255,0.5)', fontSize: 14 }}>Starting camera...</div>
                  </div>
                )}
              </div>
              <div style={{ textAlign: 'center', marginTop: 14, fontSize: 13, color: 'var(--text-muted)' }}>
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
                  placeholder="Search by code (BB-...) or phone/email..."
                  style={{ flex: 1, padding: '14px 18px', background: 'var(--card-bg)', color: 'var(--text)',
                    border: '1px solid var(--border)', borderRadius: 10, fontSize: 14 }} autoFocus />
                <button onClick={handleSearch} disabled={searching}
                  style={{ padding: '14px 20px', borderRadius: 10, fontSize: 14, fontWeight: 600, cursor: 'pointer',
                    border: 'none', background: '#e8772e', color: '#fff' }}>
                  {searching ? '...' : 'Search'}
                </button>
              </div>

              {searchResults.length > 0 && (
                <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
                  {searchResults.map(c => {
                    const s = getStatusBadge(c)
                    const pi = PRIZE_DISPLAY[c.prize_type] || { emoji: '🎁', color: '#e8772e' }
                    return (
                      <div key={c.id} onClick={() => setClaim(c)}
                        style={{ padding: '14px 18px', background: 'var(--card-bg)', border: '1px solid var(--border)',
                          borderRadius: 10, cursor: 'pointer', transition: 'border-color 0.2s' }}>
                        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                          <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
                            <span style={{ fontSize: 24 }}>{pi.emoji}</span>
                            <div>
                              <div style={{ fontWeight: 600, fontSize: 14, color: 'var(--text)' }}>{c.prize_label}</div>
                              <div style={{ fontSize: 12, color: 'var(--text-muted)', marginTop: 2 }}>
                                {c.claim_code} · {c.contact_value}
                              </div>
                            </div>
                          </div>
                          <span style={{ padding: '4px 12px', borderRadius: 50, fontSize: 11, fontWeight: 700,
                            background: s.bg, color: s.color, border: '1px solid ' + s.border }}>
                            {s.label}
                          </span>
                        </div>
                      </div>
                    )
                  })}
                </div>
              )}

              {searchResults.length === 0 && searchQuery && !searching && (
                <div style={{ textAlign: 'center', padding: 30, color: 'var(--text-muted)', fontSize: 14 }}>
                  No claims found
                </div>
              )}
            </div>
          )}

          {/* Recent redemptions */}
          {!claim && recentRedemptions.length > 0 && (
            <div style={{ marginTop: 32 }}>
              <h3 style={{ fontFamily: 'Bebas Neue, sans-serif', fontSize: 18, letterSpacing: '0.04em', color: 'var(--text)', marginBottom: 12 }}>
                Recent Redemptions
              </h3>
              <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
                {recentRedemptions.map(c => {
                  const pi = PRIZE_DISPLAY[c.prize_type] || { emoji: '🎁', color: '#e8772e' }
                  return (
                    <div key={c.id} onClick={() => setClaim(c)}
                      style={{ padding: '10px 14px', background: 'var(--card-bg)', border: '1px solid var(--border)',
                        borderRadius: 8, cursor: 'pointer', display: 'flex', alignItems: 'center', gap: 10, fontSize: 13 }}>
                      <span>{pi.emoji}</span>
                      <span style={{ fontWeight: 600, color: 'var(--text)' }}>{c.prize_label}</span>
                      <span style={{ color: 'var(--text-muted)' }}>·</span>
                      <span style={{ color: 'var(--text-muted)' }}>{c.contact_value}</span>
                      <span style={{ marginLeft: 'auto', color: 'var(--text-muted)', fontSize: 12 }}>
                        {c.redeemed_at ? formatDate(c.redeemed_at) : ''}
                      </span>
                    </div>
                  )
                })}
              </div>
            </div>
          )}
        </div>
      )}
    </div>
  )
}

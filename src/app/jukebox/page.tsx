'use client'
// ═══════════════════════════════════════════════════════════════
//  /jukebox — Guest page (no auth)
//  Scan QR → search → pick → nickname → submit. That's it.
// ═══════════════════════════════════════════════════════════════

import { useEffect, useMemo, useRef, useState } from 'react'
import { copy } from '@/lib/jukebox/copy'

interface Track {
  id: string
  name: string
  artists: { id: string; name: string }[]
  album: { name: string; artUrl: string | null }
  durationMs: number
  explicit: boolean
}

interface PublicSettings {
  is_active: boolean
  mode: 'approval' | 'open' | 'locked' | 'event'
  guest_cooldown_minutes: number
  member_cooldown_minutes: number
  max_song_length_seconds: number
  allow_explicit: boolean
  max_queue_length: number
}

const DEVICE_KEY = 'bbb_jukebox_device_id'
const NICK_KEY = 'bbb_jukebox_nickname'
const FIRST_SUBMITTED_KEY = 'bbb_jukebox_first_submitted'
const NEXT_AVAILABLE_KEY = 'bbb_jukebox_next_available_at'

function getOrCreateDeviceId(): string {
  if (typeof window === 'undefined') return ''
  let id = localStorage.getItem(DEVICE_KEY)
  if (!id) {
    const rnd =
      (typeof crypto !== 'undefined' && 'randomUUID' in crypto && (crypto as Crypto).randomUUID()) ||
      Math.random().toString(36).slice(2) + Math.random().toString(36).slice(2)
    id = String(rnd).replace(/[^A-Za-z0-9_-]/g, '').slice(0, 32) || 'fallback-' + Date.now().toString(36)
    localStorage.setItem(DEVICE_KEY, id)
  }
  return id
}

function fmtDuration(ms: number): string {
  const s = Math.floor(ms / 1000)
  const mm = Math.floor(s / 60)
  const ss = (s % 60).toString().padStart(2, '0')
  return `${mm}:${ss}`
}

function fmtMmSs(ms: number): string {
  const s = Math.max(0, Math.ceil(ms / 1000))
  const mm = Math.floor(s / 60).toString().padStart(2, '0')
  const ss = (s % 60).toString().padStart(2, '0')
  return `${mm}:${ss}`
}

export default function JukeboxGuestPage() {
  const [deviceId, setDeviceId] = useState('')
  const [settings, setSettings] = useState<PublicSettings | null>(null)
  const [settingsErr, setSettingsErr] = useState('')

  const [query, setQuery] = useState('')
  const [results, setResults] = useState<Track[]>([])
  const [searching, setSearching] = useState(false)
  const [searchErr, setSearchErr] = useState('')

  const [picked, setPicked] = useState<Track | null>(null)
  const [nickname, setNickname] = useState('')
  const [submitting, setSubmitting] = useState(false)
  const [submitErr, setSubmitErr] = useState('')
  const [submitOk, setSubmitOk] = useState<{ position: number | null; mode: PublicSettings['mode']; status: string } | null>(null)

  const [now, setNow] = useState(Date.now())
  const [showLoyalty, setShowLoyalty] = useState(false)
  const debounceRef = useRef<number | null>(null)

  // Hydrate device + saved nickname + cooldown
  useEffect(() => {
    setDeviceId(getOrCreateDeviceId())
    setNickname(localStorage.getItem(NICK_KEY) || '')
    const tick = setInterval(() => setNow(Date.now()), 1000)
    return () => clearInterval(tick)
  }, [])

  // Load public settings
  useEffect(() => {
    let alive = true
    fetch('/api/jukebox/settings', { cache: 'no-store' })
      .then(r => r.json())
      .then(j => {
        if (!alive) return
        if (j.ok) setSettings(j.data)
        else setSettingsErr(j.error?.message || 'Could not load.')
      })
      .catch(() => alive && setSettingsErr('Could not load.'))
    return () => { alive = false }
  }, [])

  // Debounced search
  useEffect(() => {
    if (!deviceId) return
    if (debounceRef.current) window.clearTimeout(debounceRef.current)
    if (query.trim().length < 2) {
      setResults([])
      setSearchErr('')
      return
    }
    setSearching(true)
    setSearchErr('')
    debounceRef.current = window.setTimeout(async () => {
      try {
        const r = await fetch(
          `/api/jukebox/search?q=${encodeURIComponent(query.trim())}&device_id=${encodeURIComponent(deviceId)}`,
          { cache: 'no-store' },
        )
        const j = await r.json()
        if (j.ok) setResults(j.data.tracks || [])
        else setSearchErr(j.error?.message || 'Search failed.')
      } catch {
        setSearchErr('Search failed.')
      } finally {
        setSearching(false)
      }
    }, 300)
  }, [query, deviceId])

  const cooldownMs = useMemo(() => {
    if (typeof window === 'undefined') return 0
    const v = Number(localStorage.getItem(NEXT_AVAILABLE_KEY) || 0)
    return Math.max(0, v - now)
  }, [now])

  async function handleSubmit() {
    if (!picked || submitting) return
    if (!nickname.trim()) {
      setSubmitErr('Pick a nickname.')
      return
    }
    setSubmitting(true)
    setSubmitErr('')
    try {
      const r = await fetch('/api/jukebox/request', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          provider_track_id: picked.id,
          nickname: nickname.trim(),
          device_id: deviceId,
        }),
      })
      const j = await r.json()
      if (j.ok === false) {
        const retry = j.error?.meta?.retryAfterSec
        if (retry && typeof retry === 'number') {
          localStorage.setItem(NEXT_AVAILABLE_KEY, String(Date.now() + retry * 1000))
        }
        setSubmitErr(j.error?.message || 'Request failed.')
        return
      }
      // Success
      localStorage.setItem(NICK_KEY, nickname.trim())
      const next = j.data.next_request_available_in_sec || 0
      if (next > 0) localStorage.setItem(NEXT_AVAILABLE_KEY, String(Date.now() + next * 1000))

      const firstTime = !localStorage.getItem(FIRST_SUBMITTED_KEY)
      if (firstTime) {
        localStorage.setItem(FIRST_SUBMITTED_KEY, '1')
        setShowLoyalty(true)
      }

      setSubmitOk({ position: j.data.queue_position ?? null, mode: settings?.mode ?? 'approval', status: j.data.status })
      setPicked(null)
      setQuery('')
      setResults([])
    } catch {
      setSubmitErr('Request failed.')
    } finally {
      setSubmitting(false)
    }
  }

  // ── Render ────────────────────────────────────────────────
  return (
    <div style={pageWrap}>
      {/* Brand */}
      <header style={{ textAlign: 'center', marginBottom: 22 }}>
        <div style={brandKicker}>{copy.brand.title.toUpperCase()}</div>
        <div style={brandTagline}>{copy.brand.tagline}</div>
      </header>

      {/* System state banners */}
      {settingsErr && <Banner kind="warn">{settingsErr}</Banner>}
      {settings && !settings.is_active && <Banner kind="warn">{copy.guest.requestsPaused}</Banner>}
      {settings && settings.mode === 'locked' && <Banner kind="warn">{copy.guest.requestsLocked}</Banner>}

      {/* Cooldown */}
      {cooldownMs > 0 && (
        <Banner kind="info">{copy.guest.cooldownActive(fmtMmSs(cooldownMs))}</Banner>
      )}

      {/* Just submitted */}
      {submitOk && (
        <div className="card" style={{ padding: 18, marginBottom: 14 }}>
          <div style={{ fontSize: 13, color: 'var(--text-muted)', textTransform: 'uppercase', letterSpacing: '0.06em', marginBottom: 6 }}>
            {submitOk.status === 'pending' ? 'Pending staff approval' : 'In the queue'}
          </div>
          <div style={{ fontSize: 18, fontWeight: 700, color: 'var(--text)' }}>
            {copy.guest.submitConfirm}
          </div>
          {submitOk.position && (
            <div style={{ fontSize: 14, color: 'var(--text-secondary)', marginTop: 4 }}>
              {copy.guest.queuePositionLine(submitOk.position)}
            </div>
          )}
        </div>
      )}

      {/* Search */}
      {settings && settings.is_active && settings.mode !== 'locked' && cooldownMs === 0 && !picked && (
        <>
          <input
            className="input"
            type="search"
            placeholder={copy.guest.searchPlaceholder}
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            style={{ fontSize: 16, padding: '14px 16px' }}
            autoFocus
          />

          {searching && <div style={hint}>Searching…</div>}
          {searchErr && <div style={errorHint}>{searchErr}</div>}

          {!searching && !searchErr && query.trim().length >= 2 && results.length === 0 && (
            <div style={hint}>{copy.guest.emptyResults}</div>
          )}

          <div style={{ marginTop: 14, display: 'flex', flexDirection: 'column', gap: 10 }}>
            {results.map((t) => (
              <button
                key={t.id}
                onClick={() => setPicked(t)}
                style={resultRow}
                aria-label={`Pick ${t.name} by ${t.artists[0]?.name}`}
              >
                <div style={{ width: 56, height: 56, flexShrink: 0, borderRadius: 6, overflow: 'hidden', background: 'var(--bg-input)' }}>
                  {t.album.artUrl ? (
                    // eslint-disable-next-line @next/next/no-img-element
                    <img src={t.album.artUrl} alt="" width={56} height={56} style={{ display: 'block', objectFit: 'cover' }} />
                  ) : null}
                </div>
                <div style={{ flex: 1, minWidth: 0, textAlign: 'left' }}>
                  <div style={{ fontSize: 15, fontWeight: 600, color: 'var(--text)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                    {t.name}
                  </div>
                  <div style={{ fontSize: 13, color: 'var(--text-secondary)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                    {t.artists.map(a => a.name).join(', ')}
                  </div>
                </div>
                <div style={{ flexShrink: 0, fontSize: 12, color: 'var(--text-muted)', display: 'flex', flexDirection: 'column', alignItems: 'flex-end', gap: 4 }}>
                  <span style={{ fontFeatureSettings: '"tnum"' }}>{fmtDuration(t.durationMs)}</span>
                  {t.explicit && <span className="badge badge-gray">{copy.guest.explicitTag}</span>}
                </div>
              </button>
            ))}
          </div>
        </>
      )}

      {/* Picked → confirm */}
      {picked && (
        <div className="card" style={{ padding: 18 }}>
          <div style={{ display: 'flex', gap: 14, alignItems: 'center', marginBottom: 16 }}>
            <div style={{ width: 64, height: 64, flexShrink: 0, borderRadius: 8, overflow: 'hidden', background: 'var(--bg-input)' }}>
              {picked.album.artUrl ? (
                // eslint-disable-next-line @next/next/no-img-element
                <img src={picked.album.artUrl} alt="" width={64} height={64} style={{ display: 'block', objectFit: 'cover' }} />
              ) : null}
            </div>
            <div style={{ flex: 1, minWidth: 0 }}>
              <div style={{ fontSize: 16, fontWeight: 700, color: 'var(--text)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{picked.name}</div>
              <div style={{ fontSize: 14, color: 'var(--text-secondary)' }}>{picked.artists.map(a => a.name).join(', ')}</div>
              <div style={{ fontSize: 12, color: 'var(--text-muted)', marginTop: 2 }}>{fmtDuration(picked.durationMs)}{picked.explicit ? ' · explicit' : ''}</div>
            </div>
          </div>

          <label className="label">Nickname</label>
          <input
            className="input"
            placeholder={copy.guest.nicknamePlaceholder}
            value={nickname}
            onChange={(e) => setNickname(e.target.value.slice(0, 32))}
            maxLength={32}
            style={{ marginBottom: 12 }}
          />

          {submitErr && <div style={errorHint}>{submitErr}</div>}

          <div style={{ display: 'flex', gap: 10 }}>
            <button className="btn-outline" onClick={() => { setPicked(null); setSubmitErr('') }} style={{ flex: 1 }}>
              Back
            </button>
            <button
              className="btn-accent"
              onClick={handleSubmit}
              disabled={submitting || !nickname.trim()}
              style={{ flex: 2 }}
            >
              {submitting ? copy.guest.submitting : copy.guest.submitButton}
            </button>
          </div>
        </div>
      )}

      {/* Rules */}
      <footer style={{ marginTop: 28, fontSize: 12, color: 'var(--text-muted)', lineHeight: 1.6, textAlign: 'center' }}>
        <div>{copy.rules.cooldownLine}</div>
        <div>{copy.rules.staffLine}</div>
        <div>{copy.rules.rewardsLine}</div>
      </footer>

      {/* Soft loyalty modal */}
      {showLoyalty && (
        <div role="dialog" aria-modal="true" style={modalBackdrop} onClick={() => setShowLoyalty(false)}>
          <div className="card" style={modalCard} onClick={(e) => e.stopPropagation()}>
            <div style={{ fontFamily: 'Bebas Neue, sans-serif', fontSize: 28, color: 'var(--accent)', letterSpacing: '0.04em', marginBottom: 6 }}>
              {copy.guest.loyaltyHook}
            </div>
            <div style={{ fontSize: 14, color: 'var(--text-secondary)', marginBottom: 18, lineHeight: 1.5 }}>
              {copy.guest.loyaltyPitch}
            </div>
            <div style={{ display: 'flex', gap: 10 }}>
              <button className="btn-outline" onClick={() => setShowLoyalty(false)} style={{ flex: 1 }}>
                {copy.guest.loyaltyNo}
              </button>
              <button
                className="btn-accent"
                onClick={() => {
                  setShowLoyalty(false)
                  // Wallet pass is the loyalty front door — point at the existing scan/play entry.
                  window.location.href = '/play'
                }}
                style={{ flex: 1 }}
              >
                {copy.guest.loyaltyYes}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}

// ── Inline styles ──────────────────────────────────────────────
const pageWrap: React.CSSProperties = {
  maxWidth: 520,
  margin: '0 auto',
  padding: '24px 20px 40px',
  minHeight: '100vh',
  background: 'var(--bg)',
  color: 'var(--text)',
}
const brandKicker: React.CSSProperties = {
  fontSize: 12,
  fontWeight: 700,
  letterSpacing: '0.18em',
  color: 'var(--accent)',
  marginBottom: 6,
}
const brandTagline: React.CSSProperties = {
  fontFamily: 'Bebas Neue, sans-serif',
  fontSize: 26,
  letterSpacing: '0.04em',
  color: 'var(--text)',
  lineHeight: 1.1,
}
const hint: React.CSSProperties = { fontSize: 13, color: 'var(--text-muted)', marginTop: 12, textAlign: 'center' }
const errorHint: React.CSSProperties = { fontSize: 13, color: 'var(--badge-red-text)', marginTop: 8, marginBottom: 6, textAlign: 'left' }
const resultRow: React.CSSProperties = {
  display: 'flex', alignItems: 'center', gap: 12, padding: 10,
  background: 'var(--bg-card)', border: '1px solid var(--border)',
  borderRadius: 10, cursor: 'pointer', textAlign: 'left',
}
const modalBackdrop: React.CSSProperties = {
  position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.5)',
  display: 'flex', alignItems: 'center', justifyContent: 'center',
  padding: 16, zIndex: 100,
}
const modalCard: React.CSSProperties = { padding: 24, maxWidth: 380, width: '100%' }

function Banner({ kind, children }: { kind: 'info' | 'warn'; children: React.ReactNode }) {
  const bg = kind === 'warn' ? 'var(--badge-orange-bg)' : 'var(--badge-blue-bg)'
  const border = kind === 'warn' ? 'var(--badge-orange-border)' : 'var(--badge-blue-border)'
  const color = kind === 'warn' ? 'var(--badge-orange-text)' : 'var(--badge-blue-text)'
  return (
    <div style={{
      padding: '10px 14px', borderRadius: 10, border: `1px solid ${border}`,
      background: bg, color, fontSize: 13, marginBottom: 12, textAlign: 'center',
    }}>
      {children}
    </div>
  )
}

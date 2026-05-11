'use client'
// ═══════════════════════════════════════════════════════════════
//  /jukebox — Guest page (no auth)
//  Tropical/tiki redesign matching the bigbamboo.app website hero.
//  Same logic as before — search → pick → nickname → submit.
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

function slotLabel(i: number): string {
  // Jukebox-style A1, A2, ... B1, B2, ... — purely cosmetic
  const row = String.fromCharCode(65 + Math.floor(i / 9))
  const col = (i % 9) + 1
  return `${row}${col}`
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
  const debounceRef = useRef<number | null>(null)

  useEffect(() => {
    setDeviceId(getOrCreateDeviceId())
    setNickname(localStorage.getItem(NICK_KEY) || '')
    const tick = setInterval(() => setNow(Date.now()), 1000)
    return () => clearInterval(tick)
  }, [])

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
      if (!j.ok) {
        const retry = j.error?.meta?.retryAfterSec
        if (retry && typeof retry === 'number') {
          localStorage.setItem(NEXT_AVAILABLE_KEY, String(Date.now() + retry * 1000))
        }
        setSubmitErr(j.error?.message || 'Request failed.')
        return
      }
      localStorage.setItem(NICK_KEY, nickname.trim())
      const next = j.data.next_request_available_in_sec || 0
      if (next > 0) localStorage.setItem(NEXT_AVAILABLE_KEY, String(Date.now() + next * 1000))

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

      {/* Brand logo from bigbamboo.app */}
      <header style={{ textAlign: 'center', padding: '4px 0 20px' }}>
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img
          src="https://bigbamboo.app/images/bbb-img-5.png"
          alt="BigBamBoo"
          className="bbb-logo"
        />
        <div className="jukebox-wordmark">
          <span className="jukebox-poweredby">powered by</span>
          <span className="jukebox-vibequeue">VibeQueue</span>
        </div>
        <div className="jukebox-tagline">
          Scan. <span className="jukebox-tagline-accent">Pick a song.</span><br/>
          Don&apos;t kill the vibe.
        </div>
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
        <div className="jukebox-cabinet" style={{ marginBottom: 14 }}>
          <div className="section-title" style={{ marginBottom: 6 }}>
            {submitOk.status === 'pending' ? 'Pending staff approval' : 'In the queue'}
          </div>
          <div style={{ fontFamily: 'Sigmar, sans-serif', fontSize: 22, color: 'var(--bbb-wood-dark)' }}>
            {copy.guest.submitConfirm}
          </div>
          {submitOk.position && (
            <div style={{ fontSize: 14, color: 'var(--bbb-wood)', marginTop: 4, fontStyle: 'italic' }}>
              {copy.guest.queuePositionLine(submitOk.position)}
            </div>
          )}
        </div>
      )}

      {/* Search + results — wrapped in cabinet when there's something to show */}
      {settings && settings.is_active && settings.mode !== 'locked' && cooldownMs === 0 && !picked && (
        <div className="jukebox-cabinet">
          <div style={{ position: 'relative' }}>
            <input
              className="input"
              type="search"
              placeholder={copy.guest.searchPlaceholder}
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              autoFocus
            />
          </div>

          {searching && <div style={hint}>Searching…</div>}
          {searchErr && <div style={errorHint}>{searchErr}</div>}

          {!searching && !searchErr && query.trim().length >= 2 && results.length === 0 && (
            <div style={hint}>{copy.guest.emptyResults}</div>
          )}

          {results.length > 0 && (
            <div style={{ marginTop: 10 }}>
              {results.map((t, i) => (
                <div key={t.id} className="jukebox-strip">
                  <div className="jukebox-slot">{slotLabel(i)}</div>
                  <div className="jukebox-art">
                    {t.album.artUrl ? (
                      // eslint-disable-next-line @next/next/no-img-element
                      <img src={t.album.artUrl} alt="" />
                    ) : null}
                  </div>
                  <div className="jukebox-strip-meta">
                    <div className="jukebox-strip-title">
                      {t.name}
                      {t.explicit && <span className="badge badge-gray" style={{ marginLeft: 6, fontSize: 9 }}>E</span>}
                    </div>
                    <div className="jukebox-strip-sub">
                      {t.artists.map(a => a.name).join(', ')} · {fmtDuration(t.durationMs)}
                    </div>
                  </div>
                  <button
                    className="btn-play"
                    onClick={() => setPicked(t)}
                    aria-label={`Pick ${t.name} by ${t.artists[0]?.name}`}
                  >
                    Play
                  </button>
                </div>
              ))}
            </div>
          )}

          <div className="jukebox-marquee">— Pick a song. We&apos;ll queue it up —</div>
        </div>
      )}

      {/* Picked → confirm */}
      {picked && (
        <div className="jukebox-cabinet">
          <div style={{ display: 'flex', gap: 14, alignItems: 'center', marginBottom: 16 }}>
            <div className="jukebox-art jukebox-art--hero" style={{ width: 112, height: 112 }}>
              {picked.album.artUrl ? (
                // eslint-disable-next-line @next/next/no-img-element
                <img src={picked.album.artUrl} alt="" />
              ) : null}
            </div>
            <div style={{ flex: 1, minWidth: 0 }}>
              <div className="jukebox-strip-title" style={{ fontSize: 16 }}>{picked.name}</div>
              <div className="jukebox-strip-sub" style={{ fontSize: 13 }}>{picked.artists.map(a => a.name).join(', ')}</div>
              <div style={{ fontSize: 12, color: 'var(--bbb-wood-light)', marginTop: 4 }}>
                {fmtDuration(picked.durationMs)}{picked.explicit ? ' · explicit' : ''}
              </div>
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

    </div>
  )
}

// ── Inline styles ──────────────────────────────────────────────
const pageWrap: React.CSSProperties = {
  maxWidth: 620,
  margin: '0 auto',
  padding: '24px 18px 32px',
  minHeight: '100vh',
}
const hint: React.CSSProperties = {
  fontSize: 13, color: 'var(--bbb-wood-light)', marginTop: 12,
  textAlign: 'center', fontStyle: 'italic',
}
const errorHint: React.CSSProperties = {
  fontSize: 13, color: 'var(--badge-red-text)',
  marginTop: 8, marginBottom: 6, textAlign: 'left',
}
function Banner({ kind, children }: { kind: 'info' | 'warn'; children: React.ReactNode }) {
  const styles = kind === 'warn'
    ? { bg: 'rgba(216,90,48,0.18)', border: 'rgba(216,90,48,0.45)', color: '#fff8e7' }
    : { bg: 'rgba(74,170,144,0.18)', border: 'rgba(74,170,144,0.45)', color: '#fff8e7' }
  return (
    <div style={{
      padding: '10px 14px', borderRadius: 10, border: `1px solid ${styles.border}`,
      background: styles.bg, color: styles.color, fontSize: 13,
      marginBottom: 12, textAlign: 'center', fontStyle: 'italic',
    }}>
      {children}
    </div>
  )
}

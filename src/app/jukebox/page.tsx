'use client'
// ═══════════════════════════════════════════════════════════════
//  /jukebox — Guest page (no auth)
//  Tropical/tiki redesign matching the bigbamboo.app website hero.
//  Same logic as before — search → pick → nickname → submit.
// ═══════════════════════════════════════════════════════════════

import { useEffect, useMemo, useRef, useState } from 'react'
import { type Lang, LANG_KEY, translations } from '@/i18n/guest'

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
  const row = String.fromCharCode(65 + Math.floor(i / 9))
  const col = (i % 9) + 1
  return `${row}${col}`
}

// ── Language toggle ────────────────────────────────────────────
function useLang() {
  const [lang, setLang] = useState<Lang>('en')

  useEffect(() => {
    const stored = localStorage.getItem(LANG_KEY) as Lang | null
    if (stored === 'en' || stored === 'vi') {
      setLang(stored)
      return
    }
    if (navigator.language.toLowerCase().startsWith('vi')) setLang('vi')
  }, [])

  function switchLang(l: Lang) {
    setLang(l)
    localStorage.setItem(LANG_KEY, l)
  }

  return { lang, switchLang, t: translations[lang] }
}

function LangToggle({ lang, onSwitch }: { lang: Lang; onSwitch: (l: Lang) => void }) {
  return (
    <div style={{
      display: 'inline-flex',
      border: '1px solid rgba(255,248,231,0.3)',
      borderRadius: 8,
      overflow: 'hidden',
      background: 'rgba(0,0,0,0.25)',
    }}>
      {(['en', 'vi'] as const).map((l) => (
        <button
          key={l}
          type="button"
          onClick={() => onSwitch(l)}
          style={{
            border: 'none',
            borderRight: l === 'en' ? '1px solid rgba(255,248,231,0.2)' : 'none',
            background: lang === l ? 'rgba(255,248,231,0.2)' : 'transparent',
            color: lang === l ? '#fff8e7' : 'rgba(255,248,231,0.5)',
            fontFamily: 'Inter, system-ui, sans-serif',
            fontSize: 11,
            fontWeight: lang === l ? 700 : 500,
            padding: '5px 11px',
            cursor: 'pointer',
            letterSpacing: '0.06em',
            textTransform: 'uppercase',
          }}
        >
          {l.toUpperCase()}
        </button>
      ))}
    </div>
  )
}

// ── Main page ──────────────────────────────────────────────────
export default function JukeboxGuestPage() {
  const { lang, switchLang, t } = useLang()

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
  const [queueCount, setQueueCount] = useState<number | null>(null)
  const [submitErr, setSubmitErr] = useState('')
  const [submitOk, setSubmitOk] = useState<{ position: number | null; mode: PublicSettings['mode']; status: string } | null>(null)

  const [now, setNow] = useState(Date.now())
  const [nowPlaying, setNowPlaying] = useState<{ track_name: string; artist_name: string; album_art_url: string | null } | null>(null)
  const debounceRef = useRef<number | null>(null)
  // Keeps last non-null data so card content persists during fade-out.
  const lastNpRef = useRef<{ track_name: string; artist_name: string; album_art_url: string | null } | null>(null)
  if (nowPlaying) lastNpRef.current = nowPlaying

  useEffect(() => {
    setDeviceId(getOrCreateDeviceId())
    setNickname(localStorage.getItem(NICK_KEY) || '')
    const tick = setInterval(() => setNow(Date.now()), 1000)
    return () => clearInterval(tick)
  }, [])

  useEffect(() => {
    let alive = true
    async function fetchNP() {
      try {
        const r = await fetch('/api/jukebox/now-playing', { cache: 'no-store' })
        const j = await r.json()
        if (!alive) return
        setNowPlaying(j.ok && j.data ? j.data : null)
      } catch { /* strip stays hidden */ }
    }
    fetchNP()
    const t = setInterval(fetchNP, 10_000)
    return () => { alive = false; clearInterval(t) }
  }, [])

  useEffect(() => {
    let alive = true
    fetch('/api/jukebox/settings', { cache: 'no-store' })
      .then(r => r.json())
      .then(j => {
        if (!alive) return
        if (j.ok) setSettings(j.data)
        else setSettingsErr(j.error?.message || t.couldNotLoad)
      })
      .catch(() => alive && setSettingsErr(t.couldNotLoad))
    return () => { alive = false }
  // eslint-disable-next-line react-hooks/exhaustive-deps
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
        else setSearchErr(j.error?.message || t.searchFailed)
      } catch {
        setSearchErr(t.searchFailed)
      } finally {
        setSearching(false)
      }
    }, 300)
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [query, deviceId])

  useEffect(() => {
    if (!picked) return
    fetch('/api/jukebox/queue', { cache: 'no-store' })
      .then(r => r.json())
      .then(j => { if (j.ok) setQueueCount((j.data.queue as Array<unknown>).length) })
      .catch(() => {})
  }, [picked])

  const cooldownMs = useMemo(() => {
    if (typeof window === 'undefined') return 0
    const v = Number(localStorage.getItem(NEXT_AVAILABLE_KEY) || 0)
    return Math.max(0, v - now)
  }, [now])

  async function handleSubmit() {
    if (!picked || submitting) return
    if (!nickname.trim()) {
      setSubmitErr(t.pickNickname)
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
        setSubmitErr(j.error?.message || t.requestFailed)
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
      setSubmitErr(t.requestFailed)
    } finally {
      setSubmitting(false)
    }
  }

  // ── Render ─────────────────────────────────────────────────
  return (
    <div style={pageWrap}>

      {/* Brand header */}
      <header style={{ textAlign: 'center', padding: '4px 0 20px', position: 'relative' }}>
        <div style={{ position: 'absolute', top: 0, right: 0 }}>
          <LangToggle lang={lang} onSwitch={switchLang} />
        </div>

        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img
          src="https://bigbamboo.app/images/bbb-img-5.png"
          alt="BigBamBoo"
          className="bbb-logo"
        />
        <div className="jukebox-wordmark">
          <span className="jukebox-poweredby">{t.poweredBy}</span>
          <span className="jukebox-vibequeue">VibeQueue</span>
        </div>
        <div className="jukebox-tagline">
          {t.tagBefore}<span className="jukebox-tagline-accent">{t.tagHighlight}</span>{t.tagAfter}
        </div>
      </header>

      {/* System state banners */}
      {settingsErr && <Banner kind="warn">{settingsErr}</Banner>}
      {settings && !settings.is_active && <Banner kind="warn">{t.requestsPaused}</Banner>}
      {settings && settings.mode === 'locked' && <Banner kind="warn">{t.requestsLocked}</Banner>}

      {/* Cooldown */}
      {cooldownMs > 0 && (
        <Banner kind="info">{t.cooldownActive(fmtMmSs(cooldownMs))}</Banner>
      )}

      {/* Just submitted */}
      {submitOk && (
        <div className="jukebox-cabinet" style={{ marginBottom: 14 }}>
          <div className="section-title" style={{ marginBottom: 6 }}>
            {submitOk.status === 'pending' ? t.pendingApproval : t.inTheQueue}
          </div>
          <div style={{ fontFamily: 'Sigmar, sans-serif', fontSize: 22, color: 'var(--bbb-wood-dark)' }}>
            {t.submitConfirm}
          </div>
          {submitOk.position && (
            <div style={{ fontSize: 14, color: 'var(--bbb-wood)', marginTop: 4, fontStyle: 'italic' }}>
              {t.queuePosition(submitOk.position)}
            </div>
          )}
        </div>
      )}

      {/* Now Playing card — fades in/out above search box */}
      <div style={{
        opacity: nowPlaying ? 1 : 0,
        maxHeight: nowPlaying ? '160px' : '0px',
        marginBottom: nowPlaying ? 14 : 0,
        overflow: 'hidden',
        transition: 'opacity 0.35s ease, max-height 0.4s ease, margin-bottom 0.4s ease',
      }}>
        {lastNpRef.current && (
          <div className="jukebox-cabinet" style={{ display: 'flex', gap: 14, alignItems: 'center', padding: '12px 14px', margin: 0 }}>
            {lastNpRef.current.album_art_url ? (
              // eslint-disable-next-line @next/next/no-img-element
              <img
                src={lastNpRef.current.album_art_url}
                alt=""
                style={{ width: 80, height: 80, borderRadius: 8, flexShrink: 0, objectFit: 'cover' }}
              />
            ) : (
              <div style={{ width: 80, height: 80, borderRadius: 8, flexShrink: 0, background: 'rgba(44,24,16,0.1)', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 28, color: 'var(--bbb-wood-light)' }}>♪</div>
            )}
            <div style={{ minWidth: 0, flex: 1 }}>
              <div style={{ fontSize: 10, fontWeight: 700, letterSpacing: '0.1em', color: 'var(--theme-coral)', marginBottom: 4 }}>
                NOW PLAYING
              </div>
              <div style={{ fontFamily: 'Sigmar, sans-serif', fontSize: 20, color: 'var(--bbb-wood-dark)', lineHeight: 1.15, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                {lastNpRef.current.track_name}
              </div>
              <div style={{ fontSize: 15, fontStyle: 'italic', fontFamily: 'Inter, system-ui, sans-serif', color: 'var(--bbb-wood)', marginTop: 4, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                {lastNpRef.current.artist_name}
              </div>
            </div>
          </div>
        )}
      </div>

      {/* Search + results */}
      {settings && settings.is_active && settings.mode !== 'locked' && cooldownMs === 0 && !picked && (
        <div className="jukebox-cabinet">
          <div style={{ position: 'relative' }}>
            <input
              className="input"
              type="search"
              placeholder={t.searchPlaceholder}
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              autoFocus
            />
          </div>

          {searching && <div style={hint}>{t.searching}</div>}
          {searchErr && <div style={errorHint}>{searchErr}</div>}

          {!searching && !searchErr && query.trim().length >= 2 && results.length === 0 && (
            <div style={hint}>{t.noResults}</div>
          )}

          {results.length > 0 && (
            <div style={{ marginTop: 10 }}>
              {results.map((track, i) => (
                <div key={track.id} className="jukebox-strip">
                  <div className="jukebox-slot">{slotLabel(i)}</div>
                  <div className="jukebox-art">
                    {track.album.artUrl ? (
                      // eslint-disable-next-line @next/next/no-img-element
                      <img src={track.album.artUrl} alt="" />
                    ) : null}
                  </div>
                  <div className="jukebox-strip-meta">
                    <div className="jukebox-strip-title">
                      {track.name}
                      {track.explicit && <span className="badge badge-gray" style={{ marginLeft: 6, fontSize: 9 }}>E</span>}
                    </div>
                    <div className="jukebox-strip-sub">
                      {track.artists.map(a => a.name).join(', ')} · {fmtDuration(track.durationMs)}
                    </div>
                  </div>
                  <button
                    className="btn-play"
                    onClick={() => setPicked(track)}
                    aria-label={`${t.play} ${track.name}`}
                  >
                    {t.play}
                  </button>
                </div>
              ))}
            </div>
          )}

          <div className="jukebox-marquee">{t.pickASong}</div>
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
              <div className="jukebox-strip-title" style={{ fontSize: 22, whiteSpace: 'normal', lineHeight: 1.15 }}>{picked.name}</div>
              <div style={{ fontSize: 18, color: 'var(--bbb-wood)', fontStyle: 'italic', fontFamily: 'Inter, system-ui, sans-serif', marginTop: 4, lineHeight: 1.2 }}>{picked.artists.map(a => a.name).join(', ')}</div>
              <div style={{ fontSize: 15, color: 'var(--bbb-wood-light)', marginTop: 6 }}>{fmtDuration(picked.durationMs)}</div>
              {picked.explicit && (
                <div style={{ marginTop: 4, fontSize: 11, color: 'var(--bbb-wood-light)', fontFamily: 'Inter, system-ui, sans-serif', fontWeight: 500, letterSpacing: '0.02em' }}>
                  🅴 {t.explicit}
                </div>
              )}
              {typeof queueCount === 'number' && (
                <div style={{ marginTop: 8, fontSize: 13, color: 'var(--bbb-wood-light)', fontStyle: 'italic', fontFamily: 'Inter, system-ui, sans-serif' }}>
                  {queueCount === 0 ? t.noWait : t.estimatedWait(queueCount * 4)}
                </div>
              )}
            </div>
          </div>

          <label className="label">{t.nickname}</label>
          <input
            className="input"
            placeholder={t.nicknamePlaceholder}
            value={nickname}
            onChange={(e) => setNickname(e.target.value.slice(0, 32))}
            maxLength={32}
            style={{ marginBottom: 12 }}
          />

          {submitErr && <div style={errorHint}>{submitErr}</div>}

          <div style={{ display: 'flex', gap: 10 }}>
            <button className="btn-outline" onClick={() => { setPicked(null); setSubmitErr('') }} style={{ flex: 1 }}>
              {t.back}
            </button>
            <button
              className="btn-accent"
              onClick={handleSubmit}
              disabled={submitting || !nickname.trim()}
              style={{ flex: 2 }}
            >
              {submitting ? t.sending : t.sendToJungle}
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

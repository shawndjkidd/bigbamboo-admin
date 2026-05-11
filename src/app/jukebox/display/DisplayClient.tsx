'use client'

import { useEffect, useRef, useState } from 'react'

interface Item {
  id: string
  track_name: string
  artist_name: string
  album_art_url: string | null
  duration_ms: number
  requested_by: string
  position: number
}

interface NowPlaying {
  id: string
  track_name: string
  artist_name: string
  album_art_url: string | null
  duration_ms: number
  requested_by: string
  played_at: string | null
  is_fallback: boolean
  progress_ms?: number
  is_playing?: boolean
}

interface QueuePayload {
  queue: Item[]
  now_playing: NowPlaying | null
  just_played: unknown
  played_today_count: number
}

interface SpotifyLiveNow {
  track_name: string
  artist_name: string
  album_art_url: string | null
  duration_ms: number
  progress_ms: number
  is_playing: boolean
}

interface Props {
  guestUrl: string
  qr: string
  wifiNetwork?: string | null
  wifiPassword?: string | null
  logoUrl?: string | null
}

function fmtDuration(ms: number): string {
  const s = Math.floor(ms / 1000)
  const mm = Math.floor(s / 60)
  const ss = (s % 60).toString().padStart(2, '0')
  return `${mm}:${ss}`
}

// ── Poster data ───────────────────────────────────────────────────
const POSTERS = [
  { cls: 'kp-live',   decor: '♪', tag: 'TONIGHT', headline: 'LIVE MUSIC', sub: 'Request your favourites', foot: 'Scan the QR →' },
  { cls: 'kp-happy',  decor: '☀', tag: 'EVERY DAY 5–8PM', headline: 'HAPPY HOUR', sub: 'Half-off cocktails & bar bites', foot: 'Come early!' },
  { cls: 'kp-brand',  decor: '🌴', tag: 'BIG BAM BOO', headline: 'TROPICAL VIBES', sub: 'Ho Chi Minh City · District 1', foot: 'Welcome to the jungle' },
]

export default function DisplayClient({ guestUrl, qr, wifiNetwork, wifiPassword, logoUrl }: Props) {
  const [data, setData] = useState<QueuePayload | null>(null)
  const [spotifyNow, setSpotifyNow] = useState<SpotifyLiveNow | null>(null)

  // Poster rotator state
  const [posterIdx, setPosterIdx] = useState(0)
  const [posterVisible, setPosterVisible] = useState(true)
  const posterTimer = useRef<ReturnType<typeof setInterval> | null>(null)

  useEffect(() => {
    let alive = true
    async function loadQueue() {
      try {
        const r = await fetch('/api/jukebox/queue', { cache: 'no-store' })
        const j = await r.json()
        if (!alive) return
        if (j.ok) setData(j.data as QueuePayload)
      } catch { /* ignore */ }
    }
    async function loadSpotify() {
      try {
        const r = await fetch('/api/jukebox/now-playing', { cache: 'no-store' })
        const j = await r.json()
        if (!alive) return
        if (j.ok) setSpotifyNow((j.data as SpotifyLiveNow | null) ?? null)
      } catch { /* ignore */ }
    }
    loadQueue()
    loadSpotify()
    const tQueue = setInterval(loadQueue, 12_000)
    const tSpotify = setInterval(loadSpotify, 8_000)
    return () => { alive = false; clearInterval(tQueue); clearInterval(tSpotify) }
  }, [])

  useEffect(() => {
    posterTimer.current = setInterval(() => {
      setPosterVisible(false)
      setTimeout(() => {
        setPosterIdx(i => (i + 1) % POSTERS.length)
        setPosterVisible(true)
      }, 300)
    }, 8_000)
    return () => { if (posterTimer.current) clearInterval(posterTimer.current) }
  }, [])

  const items = data?.queue || []
  const queueNowPlaying = data?.now_playing ?? null

  const nowPlaying: NowPlaying | null = spotifyNow
    ? {
        id: queueNowPlaying?.id || 'spotify',
        track_name: spotifyNow.track_name,
        artist_name: spotifyNow.artist_name,
        album_art_url: spotifyNow.album_art_url,
        duration_ms: spotifyNow.duration_ms,
        requested_by:
          queueNowPlaying &&
          queueNowPlaying.track_name === spotifyNow.track_name &&
          queueNowPlaying.artist_name === spotifyNow.artist_name
            ? queueNowPlaying.requested_by
            : '',
        played_at: queueNowPlaying?.played_at ?? null,
        is_fallback: false,
        progress_ms: spotifyNow.progress_ms,
        is_playing: spotifyNow.is_playing,
      }
    : queueNowPlaying

  const onDeck = (nowPlaying?.is_fallback && items.length > 0) ? items.slice(1) : items

  const displayUrl = guestUrl.replace(/^https?:\/\//, '')
  const poster = POSTERS[posterIdx]

  return (
    <div className="kiosk-wrap">

      {/* ── Header strip ── */}
      <div className="kiosk-strip">
        <div className="kiosk-strip-brand">
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img
            src={logoUrl || 'https://bigbamboo.app/images/bbb-img-5.png'}
            alt="Venue logo"
            className="kiosk-strip-logo"
          />
          <div className="kiosk-strip-wordmark">
            <span className="kiosk-poweredby">powered by</span>
            <span className="kiosk-vibequeue">VibeQueue</span>
          </div>
        </div>
        {(wifiNetwork || wifiPassword) && (
          <div className="kiosk-wifi-bar">
            <span className="kiosk-wifi-label">FREE WIFI</span>
            {wifiNetwork && (
              <span className="kiosk-wifi-pair">
                <span className="kiosk-wifi-k">network</span>
                <span className="kiosk-wifi-v">{wifiNetwork}</span>
              </span>
            )}
            {wifiPassword && (
              <span className="kiosk-wifi-pair">
                <span className="kiosk-wifi-k">password</span>
                <span className="kiosk-wifi-v">{wifiPassword}</span>
              </span>
            )}
          </div>
        )}
      </div>

      {/* ── Content ── */}
      <div className="kiosk-content">

        {/* Top row: Now Playing (flex 1.6) + On Deck (flex 1) */}
        <div className="kiosk-row kiosk-row--top">

          <div className="kiosk-card kiosk-np-card">
            {nowPlaying
              ? <NowPlayingHero now={nowPlaying} />
              : <NowPlayingEmpty />
            }
          </div>

          <div className="kiosk-card kiosk-deck-card">
            <div className="kiosk-section-title">
              <span style={{ fontSize: '0.65em', lineHeight: 1, letterSpacing: 0, opacity: 0.9 }}>≡</span>
              NEXT IN QUEUE
            </div>
            <div className="kiosk-deck-list">
              {onDeck.length === 0 ? (
                <div className="kiosk-deck-empty">
                  Nothing queued yet — scan the QR to add a song!
                </div>
              ) : (
                onDeck.slice(0, 9).map((it) => (
                  <div key={it.id} className="kiosk-deck-row">
                    <div className="kiosk-deck-pos">{it.position}</div>
                    <div className="kiosk-deck-art">
                      {it.album_art_url
                        // eslint-disable-next-line @next/next/no-img-element
                        ? <img src={it.album_art_url} alt="" />
                        : null}
                    </div>
                    <div className="kiosk-deck-info">
                      <div className="kiosk-deck-title">{it.track_name}</div>
                      <div className="kiosk-deck-meta">
                        <span className="kiosk-deck-artist">{it.artist_name}</span>
                        {it.requested_by && (
                          <span className="kiosk-deck-by"> · {it.requested_by}</span>
                        )}
                      </div>
                    </div>
                    <div className="kiosk-deck-time">{fmtDuration(it.duration_ms)}</div>
                  </div>
                ))
              )}
            </div>
          </div>

        </div>

        {/* Bottom row: QR card (square, shrink 0) + Poster rotator (flex 1) */}
        <div className="kiosk-row kiosk-row--bottom">

          <div className="kiosk-card kiosk-qr-card">
            <div className="kiosk-qr-label">SCAN TO REQUEST A SONG</div>
            <div className="kiosk-qr-wrap">
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img src={qr} alt="Scan to request a song" className="kiosk-qr-img" />
            </div>
            <div className="kiosk-qr-url">{displayUrl}</div>
          </div>

          <div
            className={`kiosk-card kiosk-poster-panel ${poster.cls}`}
            style={{ opacity: posterVisible ? 1 : 0 }}
          >
            <div className="kiosk-poster-decor" aria-hidden="true">{poster.decor}</div>
            <div>
              <div className="kiosk-poster-tag">{poster.tag}</div>
              <div className="kiosk-poster-headline">{poster.headline}</div>
              <div className="kiosk-poster-sub">{poster.sub}</div>
            </div>
            <div className="kiosk-poster-foot">{poster.foot}</div>
            <div className="kiosk-poster-dots">
              {POSTERS.map((_, i) => (
                <div key={i} className={`kiosk-poster-dot${i === posterIdx ? ' is-active' : ''}`} />
              ))}
            </div>
          </div>

        </div>

      </div>
    </div>
  )
}

// ── Now Playing hero ─────────────────────────────────────────────
function NowPlayingHero({ now }: { now: NowPlaying }) {
  const hasLiveProgress = typeof now.progress_ms === 'number' && now.duration_ms > 0
  const pct = hasLiveProgress
    ? Math.max(0, Math.min(100, (now.progress_ms! / now.duration_ms) * 100))
    : 0
  const elapsed = hasLiveProgress ? fmtDuration(now.progress_ms!) : null
  const total = fmtDuration(now.duration_ms)
  const art = now.album_art_url

  return (
    <>
      <div className="kiosk-np-art">
        {art
          // eslint-disable-next-line @next/next/no-img-element
          ? <img src={art} alt="" />
          : <div className="kiosk-np-art-empty" aria-hidden="true">♪</div>
        }
      </div>
      <div className="kiosk-np-info">
        <div className="kiosk-np-banner">
          <span className="kiosk-np-onair-dot" aria-hidden="true" />
          NOW PLAYING
          {now.is_playing === false && (
            <span className="kiosk-np-paused-tag">PAUSED</span>
          )}
        </div>
        <div className="kiosk-np-body">
          <div className="kiosk-np-title">{now.track_name}</div>
          <div className="kiosk-np-artist">{now.artist_name}</div>
          <div className="kiosk-np-progress">
            <div className="kiosk-np-progress-fill" style={{ width: `${hasLiveProgress ? pct : 0}%` }} />
          </div>
          <div className="kiosk-np-times">
            <span>{elapsed ?? '— —'}</span>
            <span>{total}</span>
          </div>
          {now.requested_by && now.requested_by !== 'anonymous' && (
            <div className="kiosk-np-by">
              requested by <span className="kiosk-np-nick">{now.requested_by}</span>
            </div>
          )}
        </div>
      </div>
    </>
  )
}

function NowPlayingEmpty() {
  return (
    <div className="kiosk-np-empty">
      <div className="kiosk-np-empty-note" aria-hidden="true">♪</div>
      <div className="kiosk-np-empty-text">Nothing playing yet</div>
      <div className="kiosk-np-empty-sub">Scan the QR code to request the first song!</div>
    </div>
  )
}

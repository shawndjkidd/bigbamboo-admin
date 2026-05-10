'use client'
// ═══════════════════════════════════════════════════════════════
//  Kiosk display client — TV-scale 2-row layout:
//    Row 1 (60%): Now Playing (2/3) | QR code (1/3)
//    Row 2 (40%): Up Next (50%)     | Follow Us (50%)
//  Polls /api/jukebox/queue every 12s and /api/jukebox/now-playing
//  every 8s. Data fetching is unchanged from Phase 2.
// ═══════════════════════════════════════════════════════════════

import { useEffect, useState } from 'react'

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
}

function fmtDuration(ms: number): string {
  const s = Math.floor(ms / 1000)
  const mm = Math.floor(s / 60)
  const ss = (s % 60).toString().padStart(2, '0')
  return `${mm}:${ss}`
}

export default function DisplayClient({ guestUrl, qr }: Props) {
  const [data, setData] = useState<QueuePayload | null>(null)
  const [spotifyNow, setSpotifyNow] = useState<SpotifyLiveNow | null>(null)

  useEffect(() => {
    let alive = true
    async function loadQueue() {
      try {
        const r = await fetch('/api/jukebox/queue', { cache: 'no-store' })
        const j = await r.json()
        if (!alive) return
        if (j.ok) setData(j.data as QueuePayload)
      } catch { /* ignore — next tick */ }
    }
    async function loadSpotify() {
      try {
        const r = await fetch('/api/jukebox/now-playing', { cache: 'no-store' })
        const j = await r.json()
        if (!alive) return
        if (j.ok) setSpotifyNow((j.data as SpotifyLiveNow | null) ?? null)
      } catch { /* ignore — next tick */ }
    }
    loadQueue()
    loadSpotify()
    const tQueue = setInterval(loadQueue, 12_000)
    const tSpotify = setInterval(loadSpotify, 8_000)
    return () => { alive = false; clearInterval(tQueue); clearInterval(tSpotify) }
  }, [])

  const items = data?.queue || []
  const queueNowPlaying = data?.now_playing ?? null

  // Prefer Spotify's live state when present; fall back to queue's now_playing.
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

  // Hide the queue head from Up Next when it's the now-playing fallback.
  const upNext = (nowPlaying?.is_fallback && items.length > 0) ? items.slice(1) : items

  // Strip protocol for display-friendly URL under the QR.
  const displayUrl = guestUrl.replace(/^https?:\/\//, '')

  return (
    <div className="kiosk-body">

      {/* ── Row 1: Now Playing (2/3) + QR card (1/3) ── */}
      <div className="kiosk-row1">

        <div className="kiosk-now-card jukebox-cabinet">
          {nowPlaying
            ? <NowPlayingHero now={nowPlaying} />
            : <NowPlayingEmpty />
          }
        </div>

        <div className="kiosk-qr-card jukebox-cabinet">
          <div className="kiosk-scan-headline">SCAN TO REQUEST A SONG</div>
          <div className="kiosk-qr-wrapper">
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img src={qr} alt="Scan to request a song" className="kiosk-qr kiosk-qr--tv" />
          </div>
          <div className="kiosk-qr-url kiosk-qr-url--tv">{displayUrl}</div>
        </div>

      </div>

      {/* ── Row 2: Up Next (50%) + Follow Us (50%) ── */}
      <div className="kiosk-row2">

        <div className="kiosk-un-card jukebox-cabinet">
          <div className="kiosk-un-header">UP NEXT</div>
          <div className="kiosk-un-rows">
            {upNext.length === 0 ? (
              <div className="kiosk-up-next-empty">
                Nothing in the queue yet — scan the QR to add a song!
              </div>
            ) : (
              upNext.slice(0, 5).map((it) => (
                <div key={it.id} className="kiosk-un-row">
                  <div className="kiosk-un-pos">{it.position}</div>
                  <div className="kiosk-un-art">
                    {it.album_art_url
                      // eslint-disable-next-line @next/next/no-img-element
                      ? <img src={it.album_art_url} alt="" />
                      : null}
                  </div>
                  <div className="kiosk-un-meta">
                    <div className="kiosk-un-title">{it.track_name}</div>
                    <div className="kiosk-un-artist">{it.artist_name}</div>
                  </div>
                  <div className="kiosk-un-side">
                    <div className="kiosk-un-duration">{fmtDuration(it.duration_ms)}</div>
                    {it.requested_by && (
                      <div className="kiosk-un-req">— {it.requested_by}</div>
                    )}
                  </div>
                </div>
              ))
            )}
          </div>
        </div>

        <div className="kiosk-follow-card jukebox-cabinet">
          <div className="kiosk-un-header">FOLLOW US</div>
          {/* TODO Shawn: swap these handles for the real BigBamBoo social accounts */}
          <div className="kiosk-follow-rows">
            <div className="kiosk-follow-row">
              <div className="kiosk-follow-mark kiosk-follow-mark--ig">IG</div>
              <span className="kiosk-follow-handle">@bigbamboohcmc</span>
            </div>
            <div className="kiosk-follow-row">
              <div className="kiosk-follow-mark kiosk-follow-mark--fb">f</div>
              <span className="kiosk-follow-handle">/bigbamboohcmc</span>
            </div>
            <div className="kiosk-follow-row">
              <div className="kiosk-follow-mark kiosk-follow-mark--tt">♪</div>
              <span className="kiosk-follow-handle">@bigbamboohcmc</span>
            </div>
          </div>
          {/* Optional content slot — add venue tagline, drink special, or hours here */}
          <div className="kiosk-follow-slot" />
        </div>

      </div>
    </div>
  )
}

// ── Now Playing hero ─────────────────────────────────────────────
function NowPlayingHero({ now }: { now: NowPlaying }) {
  const label = now.is_fallback ? 'UP FIRST' : 'NOW PLAYING'
  const hasLiveProgress = typeof now.progress_ms === 'number' && now.duration_ms > 0
  const pct = hasLiveProgress
    ? Math.max(0, Math.min(100, (now.progress_ms! / now.duration_ms) * 100))
    : 0
  const elapsed = hasLiveProgress ? fmtDuration(now.progress_ms!) : null
  const total = fmtDuration(now.duration_ms)
  const art = now.album_art_url

  return (
    <div className="kiosk-np">
      <div className="kiosk-np-art">
        {art
          // eslint-disable-next-line @next/next/no-img-element
          ? <img src={art} alt="" />
          : <div className="kiosk-np-art-empty" aria-hidden="true">♪</div>
        }
      </div>

      <div className="kiosk-np-meta">
        <div className="kiosk-np-label">
          <span
            className={`kiosk-hero-dot ${
              now.is_playing === false || now.is_fallback ? 'is-paused' : 'is-live'
            }`}
            aria-hidden="true"
          />
          {label}
          {now.is_playing === false && !now.is_fallback && (
            <span className="kiosk-hero-paused-tag">PAUSED</span>
          )}
        </div>

        <div className="kiosk-np-title">{now.track_name}</div>
        <div className="kiosk-np-artist">{now.artist_name}</div>

        <div className="kiosk-np-progress">
          <div
            className="kiosk-np-progress-bar"
            style={{ width: `${hasLiveProgress ? pct : 0}%` }}
          />
        </div>
        <div className="kiosk-np-time">
          <span>{elapsed ?? '— —'}</span>
          <span>{total}</span>
        </div>

        {now.requested_by && now.requested_by !== 'anonymous' && (
          <div className="kiosk-np-req">
            <span className="kiosk-np-req-label">requested by</span>{' '}
            <span className="kiosk-np-req-name">{now.requested_by}</span>
          </div>
        )}
      </div>
    </div>
  )
}

function NowPlayingEmpty() {
  return (
    <div className="kiosk-np-empty">
      <div className="kiosk-np-empty-note">♪</div>
      <div className="kiosk-np-empty-text">Nothing playing yet</div>
      <div className="kiosk-np-empty-sub">Scan the QR code to request the first song!</div>
    </div>
  )
}

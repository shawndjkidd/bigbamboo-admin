'use client'
// ═══════════════════════════════════════════════════════════════
//  Kiosk display client — renders Now Playing hero + Up Next list,
//  plus the right-column "Just Played" pill and activity counter
//  via React portals (mount points are rendered in the parent
//  server component so styling/positioning is consistent).
//  Polls /api/jukebox/queue every 12s.
// ═══════════════════════════════════════════════════════════════

import { useEffect, useState } from 'react'
import { createPortal } from 'react-dom'

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
}

interface JustPlayed {
  id: string
  track_name: string
  artist_name: string
  album_art_url: string | null
  requested_by: string
  played_at: string
}

interface QueuePayload {
  queue: Item[]
  now_playing: NowPlaying | null
  just_played: JustPlayed | null
  played_today_count: number
}

function fmtDuration(ms: number): string {
  const s = Math.floor(ms / 1000)
  const mm = Math.floor(s / 60)
  const ss = (s % 60).toString().padStart(2, '0')
  return `${mm}:${ss}`
}

interface Props {
  guestUrl: string
}

export default function DisplayClient({ guestUrl }: Props) {
  const [data, setData] = useState<QueuePayload | null>(null)
  const [mounted, setMounted] = useState(false)

  useEffect(() => {
    setMounted(true)
    let alive = true
    async function load() {
      try {
        const r = await fetch('/api/jukebox/queue', { cache: 'no-store' })
        const j = await r.json()
        if (!alive) return
        if (j.ok) setData(j.data as QueuePayload)
      } catch { /* ignore — next tick */ }
    }
    load()
    const t = setInterval(load, 12_000)
    return () => { alive = false; clearInterval(t) }
  }, [])

  const items = data?.queue || []
  const nowPlaying = data?.now_playing ?? null
  const justPlayed = data?.just_played ?? null
  const playedTodayCount = data?.played_today_count ?? 0

  // When the queue head IS the now-playing fallback, hide it from the
  // Up Next list so the same song doesn't appear twice on screen.
  const upNext = (nowPlaying?.is_fallback && items.length > 0)
    ? items.slice(1)
    : items

  const isEmpty = !nowPlaying && upNext.length === 0

  return (
    <>
      {isEmpty ? (
        <EmptyState />
      ) : (
        <>
          {nowPlaying && <NowPlayingHero now={nowPlaying} />}

          <div className="jukebox-up-next-divider"><span>UP NEXT</span></div>

          <div className="kiosk-up-next-list">
            {upNext.length === 0 ? (
              <div style={{
                padding: '20px 0', textAlign: 'center',
                color: 'var(--theme-card-text-muted)', fontSize: 14, fontStyle: 'italic',
              }}>
                One song queued. Scan the QR to add the next.
              </div>
            ) : (
              upNext.slice(0, 8).map((it) => (
                <div key={it.id} className="kiosk-up-next-row">
                  <div className="kiosk-up-next-pos">{it.position}</div>
                  <div className="kiosk-up-next-art">
                    {it.album_art_url ? (
                      // eslint-disable-next-line @next/next/no-img-element
                      <img src={it.album_art_url} alt="" />
                    ) : null}
                  </div>
                  <div className="kiosk-up-next-meta">
                    <div className="kiosk-up-next-title">{it.track_name}</div>
                    <div className="kiosk-up-next-artist">{it.artist_name}</div>
                  </div>
                  <div className="kiosk-up-next-side">
                    <div className="kiosk-up-next-duration">{fmtDuration(it.duration_ms)}</div>
                    <div className="kiosk-up-next-req">— {it.requested_by}</div>
                  </div>
                </div>
              ))
            )}
          </div>
        </>
      )}

      {/* Right-column portals — mount into the server-rendered slots */}
      {mounted && <RightColumnExtras justPlayed={justPlayed} count={playedTodayCount} guestUrl={guestUrl} />}
    </>
  )
}

// ── Now Playing hero ────────────────────────────────────────────
function NowPlayingHero({ now }: { now: NowPlaying }) {
  const label = now.is_fallback ? 'COMING UP' : 'NOW PLAYING · ON AIR'
  return (
    <div className="kiosk-now-playing-hero">
      <div className="kiosk-now-playing-hero-art">
        {now.album_art_url ? (
          // eslint-disable-next-line @next/next/no-img-element
          <img src={now.album_art_url} alt="" />
        ) : null}
      </div>
      <div className="kiosk-now-playing-hero-meta">
        <div className="kiosk-now-playing-hero-label">
          <span className="jukebox-on-air-dot" /> {label}
        </div>
        <div className="kiosk-now-playing-hero-title">{now.track_name}</div>
        <div className="kiosk-now-playing-hero-artist">{now.artist_name}</div>
        {now.requested_by && now.requested_by !== 'anonymous' && (
          <div className="kiosk-now-playing-hero-req">requested by {now.requested_by}</div>
        )}
      </div>
    </div>
  )
}

// ── Empty state — big arrow at the QR ───────────────────────────
function EmptyState() {
  return (
    <div className="kiosk-empty">
      <div className="kiosk-empty-arrow" aria-hidden="true">→</div>
      <div className="kiosk-empty-cta">BE THE FIRST TO SCAN</div>
      <div className="kiosk-empty-sub">
        Pick a song from your phone. It&rsquo;ll show up here for the room to see.
      </div>
    </div>
  )
}

// ── Right column extras — Just Played pill + activity counter ───
// Rendered via portals into mount points in the server-rendered
// right cabinet, so server can lay them out in the correct slot.
function RightColumnExtras({
  justPlayed,
  count,
  guestUrl: _guestUrl,
}: { justPlayed: JustPlayed | null; count: number; guestUrl: string }) {
  const [justMount, setJustMount] = useState<HTMLElement | null>(null)
  const [counterMount, setCounterMount] = useState<HTMLElement | null>(null)

  useEffect(() => {
    setJustMount(document.getElementById('kiosk-just-played-mount'))
    setCounterMount(document.getElementById('kiosk-counter-mount'))
  }, [])

  return (
    <>
      {justMount && justPlayed
        ? createPortal(<JustPlayedPill jp={justPlayed} />, justMount)
        : null}
      {counterMount && count > 0
        ? createPortal(<ActivityCounter count={count} />, counterMount)
        : null}
    </>
  )
}

function JustPlayedPill({ jp }: { jp: JustPlayed }) {
  return (
    <div className="kiosk-just-played">
      <div className="kiosk-just-played-art">
        {jp.album_art_url ? (
          // eslint-disable-next-line @next/next/no-img-element
          <img src={jp.album_art_url} alt="" />
        ) : null}
      </div>
      <div className="kiosk-just-played-meta">
        <div className="kiosk-just-played-label">Just played</div>
        <div className="kiosk-just-played-title">{jp.track_name}</div>
        <div className="kiosk-just-played-artist">{jp.artist_name}</div>
      </div>
    </div>
  )
}

function ActivityCounter({ count }: { count: number }) {
  return (
    <div className="kiosk-counter">
      <span className="kiosk-counter-num">{count}</span>
      <span className="kiosk-counter-label">
        song{count === 1 ? '' : 's'} played today
      </span>
    </div>
  )
}

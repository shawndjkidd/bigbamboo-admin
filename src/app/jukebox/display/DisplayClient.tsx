'use client'
// Polls /api/jukebox/queue every 12s and renders Now Playing + Up Next,
// styled to match the tropical/tiki cabinet on the display kiosk.

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
}

function fmtDuration(ms: number): string {
  const s = Math.floor(ms / 1000)
  const mm = Math.floor(s / 60)
  const ss = (s % 60).toString().padStart(2, '0')
  return `${mm}:${ss}`
}

export default function DisplayClient() {
  const [items, setItems] = useState<Item[]>([])
  const [nowPlaying, setNowPlaying] = useState<NowPlaying | null>(null)
  const [empty, setEmpty] = useState(false)

  useEffect(() => {
    let alive = true
    async function load() {
      try {
        const r = await fetch('/api/jukebox/queue', { cache: 'no-store' })
        const j = await r.json()
        if (!alive) return
        if (j.ok) {
          const list = (j.data?.queue || []) as Item[]
          setItems(list.slice(0, 10))
          setEmpty(list.length === 0)
          setNowPlaying((j.data?.now_playing as NowPlaying | null) ?? null)
        }
      } catch { /* ignore — next tick */ }
    }
    load()
    const t = setInterval(load, 12_000)
    return () => { alive = false; clearInterval(t) }
  }, [])

  // When we're showing the queue head as a "Now Playing" fallback,
  // hide it from the Up Next list to avoid showing the same song twice.
  const upNext = (nowPlaying?.is_fallback && items.length > 0)
    ? items.slice(1)
    : items

  return (
    <div style={{ display: 'flex', flexDirection: 'column', height: '100%', minHeight: 0 }}>
      {nowPlaying ? (
        <NowPlayingCard now={nowPlaying} />
      ) : null}

      {nowPlaying ? (
        <div className="jukebox-up-next-divider"><span>UP NEXT</span></div>
      ) : (
        <div className="section-title" style={{ marginBottom: 10, fontSize: 15 }}>UP NEXT</div>
      )}

      <div style={{ flex: 1, minHeight: 0, overflowY: 'auto', paddingRight: 4 }}>
        {empty ? (
          <div style={{
            padding: '20px 0', textAlign: 'center',
            color: 'var(--bbb-wood)', fontSize: 16, fontStyle: 'italic',
          }}>
            Nothing queued yet — be the first to scan.
          </div>
        ) : upNext.length === 0 ? (
          <div style={{
            padding: '14px 0', textAlign: 'center',
            color: 'var(--bbb-wood)', fontSize: 14, fontStyle: 'italic',
          }}>
            One song queued. Tap scan to add the next.
          </div>
        ) : (
          upNext.map((it) => (
            <div key={it.id} className="jukebox-strip" style={{ padding: '8px 4px' }}>
              <div className="jukebox-slot" style={{ fontSize: 18, width: 30 }}>
                {it.position}
              </div>
              <div className="jukebox-art" style={{ width: 48, height: 48 }}>
                {it.album_art_url ? (
                  // eslint-disable-next-line @next/next/no-img-element
                  <img src={it.album_art_url} alt="" />
                ) : null}
              </div>
              <div className="jukebox-strip-meta">
                <div className="jukebox-strip-title" style={{ fontSize: 15 }}>
                  {it.track_name}
                </div>
                <div className="jukebox-strip-sub" style={{ fontSize: 12 }}>
                  {it.artist_name}
                </div>
              </div>
              <div style={{
                display: 'flex', flexDirection: 'column', alignItems: 'flex-end', gap: 2,
                color: 'var(--bbb-wood)', fontSize: 11, whiteSpace: 'nowrap',
              }}>
                <span style={{ fontFeatureSettings: '"tnum"' }}>{fmtDuration(it.duration_ms)}</span>
                <span style={{ fontStyle: 'italic' }}>— {it.requested_by}</span>
              </div>
            </div>
          ))
        )}
      </div>
    </div>
  )
}

// ── Now Playing card ──────────────────────────────────────────
function NowPlayingCard({ now }: { now: NowPlaying }) {
  // is_fallback means staff hasn't marked anything played yet — we're showing
  // the head of the queue. Use a softer label so we're not lying to guests.
  const label = now.is_fallback
    ? 'COMING UP'
    : 'NOW PLAYING · ON AIR'
  return (
    <div className="jukebox-now-playing">
      <div className="jukebox-now-playing-art">
        {now.album_art_url ? (
          // eslint-disable-next-line @next/next/no-img-element
          <img src={now.album_art_url} alt="" />
        ) : null}
      </div>
      <div style={{ flex: 1, minWidth: 0 }}>
        <div className="jukebox-now-playing-label">
          <span className="jukebox-on-air-dot" /> {label}
        </div>
        <div className="jukebox-now-playing-title">{now.track_name}</div>
        <div className="jukebox-now-playing-sub">{now.artist_name}</div>
        {now.requested_by && now.requested_by !== 'anonymous' && (
          <div className="jukebox-now-playing-req">requested by {now.requested_by}</div>
        )}
      </div>
    </div>
  )
}

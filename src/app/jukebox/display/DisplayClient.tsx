'use client'
// Polls /api/jukebox/queue every 12s and renders the NOW PLAYING + UP NEXT list.

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
  played_at: string
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

  return (
    <div>
      {nowPlaying && (
        <div className="on-air-card">
          <div style={{ display: 'flex', alignItems: 'center', gap: 6, marginBottom: 12 }}>
            <span className="on-air-dot" />
            <span style={{
              fontFamily: 'Sigmar, Bebas Neue, sans-serif',
              fontSize: 13,
              letterSpacing: '0.22em',
              textTransform: 'uppercase',
              color: 'var(--bbb-coral)',
            }}>
              On Air
            </span>
          </div>
          <div style={{ display: 'flex', alignItems: 'center', gap: 16 }}>
            <div style={{
              width: 88, height: 88,
              borderRadius: 10, overflow: 'hidden', flexShrink: 0,
              background: 'var(--bbb-wood-dark)',
              border: '3px solid var(--bbb-coral)',
              boxShadow: '0 4px 12px rgba(0,0,0,0.35)',
            }}>
              {nowPlaying.album_art_url ? (
                // eslint-disable-next-line @next/next/no-img-element
                <img src={nowPlaying.album_art_url} alt="" width={88} height={88} style={{ display: 'block', objectFit: 'cover' }} />
              ) : null}
            </div>
            <div style={{ flex: 1, minWidth: 0 }}>
              <div style={{
                fontFamily: 'Sigmar, sans-serif',
                fontSize: 26,
                color: 'var(--bbb-wood-dark)',
                overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap',
                lineHeight: 1.1,
              }}>
                {nowPlaying.track_name}
              </div>
              <div style={{
                fontSize: 18,
                color: 'var(--bbb-wood)',
                overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap',
                marginTop: 4,
              }}>
                {nowPlaying.artist_name}
              </div>
            </div>
          </div>
        </div>
      )}

      {items.length === 0 && !nowPlaying ? (
        <div style={{ padding: '40px 0', textAlign: 'center', color: 'var(--bbb-wood-light)', fontSize: 18 }}>
          Nothing queued yet — be the first to scan.
        </div>
      ) : items.length === 0 ? (
        <div style={{ padding: '16px 0', textAlign: 'center', color: 'var(--bbb-wood-light)', fontSize: 15 }}>
          Queue is empty.
        </div>
      ) : (
        <>
          <div style={{
            fontFamily: 'Sigmar, sans-serif',
            fontSize: 13, letterSpacing: '0.18em', textTransform: 'uppercase',
            color: 'var(--bbb-wood-light)', marginBottom: 12,
          }}>
            Up Next
          </div>
          <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
            {items.map((it) => (
              <div key={it.id} style={{ display: 'flex', alignItems: 'center', gap: 16 }}>
                <div style={{
                  fontFamily: 'Bebas Neue, sans-serif', fontSize: 36,
                  color: 'var(--bbb-orange)', width: 44, textAlign: 'center', flexShrink: 0,
                  lineHeight: 1,
                }}>
                  {it.position}
                </div>
                <div style={{ width: 64, height: 64, borderRadius: 8, overflow: 'hidden', background: 'var(--bbb-wood-dark)', flexShrink: 0, border: '2px solid var(--bbb-wood)' }}>
                  {it.album_art_url ? (
                    // eslint-disable-next-line @next/next/no-img-element
                    <img src={it.album_art_url} alt="" width={64} height={64} style={{ display: 'block', objectFit: 'cover' }} />
                  ) : null}
                </div>
                <div style={{ flex: 1, minWidth: 0 }}>
                  <div style={{ fontSize: 22, fontWeight: 700, color: 'var(--bbb-wood-dark)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                    {it.track_name}
                  </div>
                  <div style={{ fontSize: 16, color: 'var(--bbb-wood)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                    {it.artist_name}
                  </div>
                </div>
                <div style={{ fontSize: 14, color: 'var(--bbb-wood-light)', whiteSpace: 'nowrap', display: 'flex', flexDirection: 'column', alignItems: 'flex-end', gap: 4 }}>
                  <span style={{ fontFeatureSettings: '"tnum"' }}>{fmtDuration(it.duration_ms)}</span>
                  <span style={{ fontStyle: 'italic' }}>— {it.requested_by}</span>
                </div>
              </div>
            ))}
          </div>
        </>
      )}
    </div>
  )
}

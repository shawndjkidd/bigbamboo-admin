'use client'
// Polls /api/jukebox/queue every 12s and renders the upcoming list.

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

function fmtDuration(ms: number): string {
  const s = Math.floor(ms / 1000)
  const mm = Math.floor(s / 60)
  const ss = (s % 60).toString().padStart(2, '0')
  return `${mm}:${ss}`
}

export default function DisplayClient() {
  const [items, setItems] = useState<Item[]>([])
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
        }
      } catch { /* ignore — next tick */ }
    }
    load()
    const t = setInterval(load, 12_000)
    return () => { alive = false; clearInterval(t) }
  }, [])

  if (empty) {
    return (
      <div style={{ padding: '40px 0', textAlign: 'center', color: 'var(--text-muted)', fontSize: 18 }}>
        Nothing queued yet — be the first to scan.
      </div>
    )
  }

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
      {items.map((it) => (
        <div key={it.id} style={{ display: 'flex', alignItems: 'center', gap: 16 }}>
          <div style={{
            fontFamily: 'Bebas Neue, sans-serif', fontSize: 36,
            color: 'var(--accent)', width: 48, textAlign: 'center', flexShrink: 0,
            lineHeight: 1,
          }}>
            {it.position}
          </div>
          <div style={{ width: 64, height: 64, borderRadius: 8, overflow: 'hidden', background: 'var(--bg-input)', flexShrink: 0 }}>
            {it.album_art_url ? (
              // eslint-disable-next-line @next/next/no-img-element
              <img src={it.album_art_url} alt="" width={64} height={64} style={{ display: 'block', objectFit: 'cover' }} />
            ) : null}
          </div>
          <div style={{ flex: 1, minWidth: 0 }}>
            <div style={{ fontSize: 22, fontWeight: 700, color: 'var(--text)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
              {it.track_name}
            </div>
            <div style={{ fontSize: 16, color: 'var(--text-secondary)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
              {it.artist_name}
            </div>
          </div>
          <div style={{ fontSize: 14, color: 'var(--text-muted)', whiteSpace: 'nowrap', display: 'flex', flexDirection: 'column', alignItems: 'flex-end', gap: 4 }}>
            <span style={{ fontFeatureSettings: '"tnum"' }}>{fmtDuration(it.duration_ms)}</span>
            <span style={{ fontStyle: 'italic' }}>— {it.requested_by}</span>
          </div>
        </div>
      ))}
    </div>
  )
}

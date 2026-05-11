'use client'
// ═══════════════════════════════════════════════════════════════
//  /jukebox/admin — Staff admin (auth required)
//  Tabs: Pending · Up Next · History · Blocklist · Settings
// ═══════════════════════════════════════════════════════════════

import { useCallback, useEffect, useRef, useState } from 'react'
import { useRouter } from 'next/navigation'
import { supabase } from '@/lib/supabase'
import { copy } from '@/lib/jukebox/copy'
import { Button } from '@/components/ui/Button'
import { Card } from '@/components/ui/Card'

interface Settings {
  id: string
  venue_id: string
  is_active: boolean
  mode: 'approval' | 'autopilot' | 'locked' | 'event'
  logo_url?: string | null
  guest_cooldown_minutes: number
  member_cooldown_minutes: number
  max_song_length_seconds: number
  duplicate_cooldown_minutes: number
  same_artist_cooldown_minutes: number
  allow_explicit: boolean
  provider: string
  auto_add_to_provider: boolean
  max_queue_length: number
  pending_request_ttl_minutes: number
  display_token: string
  timezone: string
  wifi_network?: string | null
  wifi_password?: string | null
  blocked_genres?: string[] | null
  rotate_posters?: boolean | null
  poster_rotation_seconds?: number | null
  guest_token?: string | null
  guest_token_rotated_at?: string | null
  guest_token_rotation_hours?: number | null
}

interface ReqRow {
  id: string
  status: string
  track_name: string
  artist_name: string
  album_art_url: string | null
  duration_ms: number
  explicit: boolean
  requested_by: string
  requested_by_hidden: boolean
  device_id: string
  provider_track_id: string
  artist_ids: string[]
  created_at: string
  approved_at: string | null
  played_at: string | null
  rejection_reason: string | null
  provider_queue_status: string | null
}

interface BlockEntry {
  id: string
  type: 'track' | 'artist'
  provider_id: string
  name: string
  reason: string | null
  created_at: string
}

type Tab = 'queue' | 'history' | 'blocklist' | 'branding' | 'spotify' | 'settings'

export default function JukeboxAdminPage() {
  const router = useRouter()
  const [staff, setStaff] = useState<{ id: string; role: string } | null>(null)
  const [loading, setLoading] = useState(true)
  const [tab, setTab] = useState<Tab>('queue')
  const [toast, setToast] = useState('')
  const tokenRef = useRef<string | null>(null)
  const [isDark, setIsDark] = useState(true)

  const [settings, setSettings] = useState<Settings | null>(null)

  useEffect(() => {
    const stored = localStorage.getItem('admin-theme')
    if (stored !== null) setIsDark(stored === 'dark')
  }, [])

  function toggleTheme() {
    const next = !isDark
    setIsDark(next)
    localStorage.setItem('admin-theme', next ? 'dark' : 'light')
  }

  useEffect(() => {
    async function init() {
      const { data: { session } } = await supabase.auth.getSession()
      if (!session?.user?.email || !session.access_token) {
        router.push('/login')
        return
      }
      tokenRef.current = session.access_token
      const { data: row } = await supabase
        .from('staff_users')
        .select('id, role, active')
        .ilike('email', session.user.email)
        .maybeSingle()
      if (!row || row.active === false) {
        router.push('/login')
        return
      }
      setStaff({ id: row.id, role: row.role })
      setLoading(false)
    }
    init()
  }, [router])

  const apiFetch = useCallback(async (path: string, init?: RequestInit) => {
    const isFormData = init?.body instanceof FormData
    const headers: Record<string, string> = {
      ...(isFormData ? {} : { 'Content-Type': 'application/json' }),
      ...(init?.headers as Record<string, string> | undefined),
    }
    if (tokenRef.current) headers.Authorization = `Bearer ${tokenRef.current}`
    const res = await fetch(path, { ...init, headers, cache: 'no-store' })
    return res.json()
  }, [])

  useEffect(() => {
    if (!staff) return
    let alive = true
    void (async () => {
      const s = await apiFetch('/api/admin/jukebox/settings')
      if (!alive) return
      if (s.ok) setSettings(s.data as Settings)
    })()
    return () => { alive = false }
  }, [staff, apiFetch])

  const refreshSettings = useCallback(async () => {
    const j = await apiFetch('/api/admin/jukebox/settings')
    if (j.ok) setSettings(j.data as Settings)
  }, [apiFetch])

  function showToast(msg: string) {
    setToast(msg)
    setTimeout(() => setToast(''), 2400)
  }

  if (loading) {
    return (
      <div className="admin-page" style={{ padding: 40, textAlign: 'center', color: 'var(--adm-text-muted)', fontSize: 16 }}>
        Loading…
      </div>
    )
  }

  return (
    <div className={`admin-page${isDark ? '' : ' is-light'}`}>
      <div className="admin-nav">
        <div className="admin-nav-inner">
          <div className="admin-nav-brand">
            {settings?.logo_url && (
              // eslint-disable-next-line @next/next/no-img-element
              <img src={settings.logo_url} alt="Venue logo" style={{ height: 28, width: 'auto', borderRadius: 4 }} />
            )}
            <span className="admin-nav-title">VibeQueue</span>
          </div>
          <Tabs tab={tab} onChange={setTab} />
          <div className="admin-nav-end">
            <button className="admin-theme-toggle" onClick={toggleTheme} title={isDark ? 'Switch to light mode' : 'Switch to dark mode'}>
              {isDark ? '☀' : '☾'}
            </button>
            <Button variant="ghost" size="sm" onClick={() => router.push('/dashboard')}>
              ← Dashboard
            </Button>
          </div>
        </div>
      </div>

      <div style={{ maxWidth: 1400, margin: '0 auto', padding: '24px 24px 60px' }}>
        {tab === 'queue' && <QueueTab apiFetch={apiFetch} onAction={showToast} mode={settings?.mode ?? null} />}
        {tab === 'history' && <HistoryTab apiFetch={apiFetch} />}
        {tab === 'blocklist' && <BlocklistTab apiFetch={apiFetch} onAction={showToast} />}
        {tab === 'branding' && (
          <BrandingTab
            apiFetch={apiFetch}
            onAction={showToast}
            settings={settings}
            setSettings={setSettings}
          />
        )}
        {tab === 'spotify' && <SpotifyTab apiFetch={apiFetch} onAction={showToast} />}
        {tab === 'settings' && (
          <SettingsTab
            apiFetch={apiFetch}
            onAction={showToast}
            settings={settings}
            setSettings={setSettings}
            refreshSettings={refreshSettings}
          />
        )}
      </div>

      {toast && <div className="toast">{toast}</div>}
    </div>
  )
}

// ── Tabs ───────────────────────────────────────────────────────
function Tabs({ tab, onChange }: { tab: Tab; onChange: (t: Tab) => void }) {
  const items: { id: Tab; label: string }[] = [
    { id: 'queue', label: copy.admin.queueTab },
    { id: 'history', label: copy.admin.historyTab },
    { id: 'blocklist', label: copy.admin.blocklistTab },
    { id: 'branding', label: copy.admin.brandingTab },
    { id: 'spotify', label: copy.admin.spotifyTab },
    { id: 'settings', label: copy.admin.settingsTab },
  ]
  return (
    <nav className="jukebox-admin-tabs">
      {items.map((i) => (
        <button
          key={i.id}
          onClick={() => onChange(i.id)}
          className={`jukebox-admin-tab ${tab === i.id ? 'is-active' : ''}`}
        >
          {i.label}
        </button>
      ))}
    </nav>
  )
}

// ── Queue (merged pending + approved + queued) ─────────────────
function QueueTab({
  apiFetch,
  onAction,
  mode,
}: { apiFetch: (p: string, i?: RequestInit) => Promise<{ ok: boolean; data?: unknown; error?: { message: string } }>; onAction: (m: string) => void; mode: Settings['mode'] | null }) {
  const [rows, setRows] = useState<ReqRow[]>([])
  const [busy, setBusy] = useState<string | null>(null)
  const retryingRef = useRef<Set<string>>(new Set())

  const load = useCallback(async () => {
    const [pj, qj] = await Promise.all([
      apiFetch('/api/admin/jukebox/requests?status=pending'),
      apiFetch('/api/admin/jukebox/requests?status=approved,queued'),
    ])
    const pending = pj.ok ? (pj.data as { requests: ReqRow[] }).requests : []
    const queued = qj.ok ? (qj.data as { requests: ReqRow[] }).requests : []
    setRows([...pending, ...queued])
  }, [apiFetch])

  useEffect(() => {
    load()
    const t = setInterval(load, 7_000)
    return () => clearInterval(t)
  }, [load])

  // Auto-retry rows stuck with a failed Spotify push (no active device at approval time).
  // Fires once per row per polling cycle; stops after 30 min (cron cleanup takes over).
  useEffect(() => {
    const THIRTY_MIN = 30 * 60 * 1000
    for (const row of rows) {
      if (row.provider_queue_status !== 'failed') continue
      if (row.status === 'pending') continue
      if (Date.now() - new Date(row.created_at).getTime() >= THIRTY_MIN) continue
      if (retryingRef.current.has(row.id)) continue
      retryingRef.current.add(row.id)
      void apiFetch(`/api/admin/jukebox/requests/${row.id}/add-to-provider-queue`, { method: 'POST', body: '{}' })
        .then((j) => { if (j.ok) load() })
        .finally(() => retryingRef.current.delete(row.id))
    }
  }, [rows, apiFetch, load])

  async function act(id: string, action: 'approve' | 'reject' | 'remove' | 'skip' | 'mark-played' | 'hide-nickname') {
    setBusy(id + ':' + action)
    const j = await apiFetch(`/api/admin/jukebox/requests/${id}/${action}`, { method: 'POST', body: '{}' })
    setBusy(null)
    if (j.ok) {
      onAction(action === 'approve' ? 'Approved' : action === 'reject' ? 'Rejected' : action.replace(/-/g, ' '))
      if (action === 'hide-nickname') load()
      else setRows((r) => r.filter((x) => x.id !== id))
    } else {
      onAction(j.error?.message || 'Action failed')
    }
  }

  async function blockRow(row: ReqRow) {
    if (!row.provider_track_id) return
    setBusy(row.id + ':block')
    await apiFetch('/api/admin/jukebox/blocklist', {
      method: 'POST',
      body: JSON.stringify({ type: 'track', provider_id: row.provider_track_id, name: row.track_name, reason: 'blocked from queue' }),
    })
    const removeAction = row.status === 'pending' ? 'reject' : 'remove'
    const j = await apiFetch(`/api/admin/jukebox/requests/${row.id}/${removeAction}`, { method: 'POST', body: '{}' })
    setBusy(null)
    if (j.ok) {
      onAction('Blocked')
      setRows((r) => r.filter((x) => x.id !== row.id))
    } else {
      onAction(j.error?.message || 'Block failed')
    }
  }

  async function addToSpotify(id: string) {
    setBusy(id + ':spotify')
    const j = await apiFetch(`/api/admin/jukebox/requests/${id}/add-to-provider-queue`, { method: 'POST', body: '{}' })
    setBusy(null)
    if (j.ok) {
      onAction('Added to Spotify queue')
      load()
    } else {
      const code = (j.error as { code?: string } | undefined)?.code || ''
      onAction(
        code === 'no_active_device' ? 'No active Spotify device. Open Spotify and hit play, then try again.'
        : code === 'token_invalid' || code === 'token_expired' ? 'Spotify connection expired. Reconnect on the Spotify tab.'
        : code === 'not_premium' ? 'Connected Spotify account is not Premium.'
        : code === 'product_restricted' ? "This device doesn't allow queue adds — try a different Spotify player."
        : code === 'rate_limited' ? 'Spotify is throttling — try again in a moment.'
        : j.error?.message || 'Add to Spotify failed'
      )
    }
  }

  if (rows.length === 0) {
    return <EmptyCard title="Queue is empty." sub={mode === 'autopilot' ? 'Guest requests are auto-queued in Spotify.' : 'Guest requests land here for your approval.'} />
  }

  let queuePos = 0

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
      {rows.map((r) => {
        const isPending = r.status === 'pending'
        const isSpotifyQueued = r.status === 'queued' || r.provider_queue_status === 'queued'
        const isFailed = r.provider_queue_status === 'failed' || r.status === 'failed'
        if (!isPending) queuePos++

        const badge = isPending
          ? <span className="badge badge-orange" style={{ fontSize: 11 }}>Awaiting approval</span>
          : isSpotifyQueued
            ? <span className="badge badge-green" style={{ fontSize: 11 }}>✓ Queued in Spotify</span>
            : isFailed
              ? <span className="badge badge-red" style={{ fontSize: 11 }}>No Spotify device</span>
              : null

        return (
          <RowCard key={r.id} row={r} position={isPending ? undefined : queuePos} badge={badge}>
            {isPending && (
              <Button variant="success" disabled={!!busy} onClick={() => act(r.id, 'approve')}>
                {busy === r.id + ':approve' ? '…' : 'Approve'}
              </Button>
            )}
            {isPending && (
              <Button variant="secondary" disabled={!!busy} onClick={() => act(r.id, 'reject')}>
                {busy === r.id + ':reject' ? '…' : 'Reject'}
              </Button>
            )}
            <Button variant="secondary" disabled={!!busy} onClick={() => act(r.id, 'hide-nickname')}>
              Hide nickname
            </Button>
            {!isPending && (
              <Button variant="secondary" disabled={!!busy} onClick={() => act(r.id, 'skip')}>
                Skip
              </Button>
            )}
            {!isPending && (
              <Button variant="danger" disabled={!!busy} onClick={() => blockRow(r)}>
                {busy === r.id + ':block' ? '…' : 'Block'}
              </Button>
            )}
            {!isSpotifyQueued && !isPending && (
              <Button variant="secondary" disabled={!!busy} onClick={() => addToSpotify(r.id)} title="Push into Spotify queue">
                {busy === r.id + ':spotify' ? '…' : 'Add to Spotify'}
              </Button>
            )}
            {!isPending && (
              <Button variant="secondary" disabled={!!busy} onClick={() => act(r.id, 'mark-played')}>
                Mark played
              </Button>
            )}
          </RowCard>
        )
      })}
    </div>
  )
}

// ── History ────────────────────────────────────────────────────
function HistoryTab({
  apiFetch,
}: { apiFetch: (p: string, i?: RequestInit) => Promise<{ ok: boolean; data?: unknown }> }) {
  const [rows, setRows] = useState<ReqRow[]>([])

  const load = useCallback(async () => {
    const j = await apiFetch('/api/admin/jukebox/requests?status=played,skipped,rejected,removed,expired&limit=50')
    if (j.ok) setRows((j.data as { requests: ReqRow[] }).requests)
  }, [apiFetch])

  useEffect(() => { load() }, [load])

  if (rows.length === 0) {
    return <EmptyCard title="No history yet." sub="Played, skipped, rejected, and removed requests show up here." />
  }

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
      {rows.map((r) => (
        <Card key={r.id} padding={12} style={{ display: 'flex', gap: 12, alignItems: 'center' }}>
          <div style={{ width: 44, height: 44, flexShrink: 0, borderRadius: 6, overflow: 'hidden', background: 'var(--adm-input-bg)' }}>
            {r.album_art_url
              // eslint-disable-next-line @next/next/no-img-element
              ? <img src={r.album_art_url} alt="" width={44} height={44} style={{ display: 'block', objectFit: 'cover' }} />
              : null}
          </div>
          <div style={{ flex: 1, minWidth: 0 }}>
            <div style={{ fontSize: 14, fontWeight: 600, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
              {r.track_name}{r.explicit ? <span className="badge badge-gray" style={{ marginLeft: 6, fontSize: 10 }}>E</span> : null}
            </div>
            <div style={{ fontSize: 12, color: 'var(--adm-text-sec)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
              {r.artist_name}
              {r.requested_by && !r.requested_by_hidden && (
                <span style={{ color: 'var(--adm-text-muted)' }}> · {r.requested_by}</span>
              )}
            </div>
          </div>
          <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'flex-end', gap: 4, flexShrink: 0 }}>
            <span className={`badge ${badgeFor(r.status)}`}>{r.status}</span>
            <span style={{ fontSize: 11, color: 'var(--adm-text-muted)' }}>
              {new Date(r.played_at || r.created_at).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
            </span>
          </div>
        </Card>
      ))}
    </div>
  )
}

// ── Blocklist ──────────────────────────────────────────────────
function BlocklistTab({
  apiFetch,
  onAction,
}: { apiFetch: (p: string, i?: RequestInit) => Promise<{ ok: boolean; data?: unknown; error?: { message: string } }>; onAction: (m: string) => void }) {
  const [rows, setRows] = useState<BlockEntry[]>([])
  const [type, setType] = useState<'track' | 'artist'>('track')
  const [pid, setPid] = useState('')
  const [name, setName] = useState('')

  // Genre blocklist state
  const [blockedGenres, setBlockedGenres] = useState<string[]>([])
  const [genreInput, setGenreInput] = useState('')
  const [genreLoaded, setGenreLoaded] = useState(false)

  const load = useCallback(async () => {
    const j = await apiFetch('/api/admin/jukebox/blocklist')
    if (j.ok) setRows((j.data as { entries: BlockEntry[] }).entries)
  }, [apiFetch])
  useEffect(() => { load() }, [load])

  useEffect(() => {
    apiFetch('/api/admin/jukebox/settings').then((j) => {
      if (j.ok) {
        const s = j.data as { blocked_genres?: string[] | null }
        setBlockedGenres(s.blocked_genres ?? [])
      }
      setGenreLoaded(true)
    })
  }, [apiFetch])

  async function saveGenres(genres: string[]) {
    const j = await apiFetch('/api/admin/jukebox/settings', {
      method: 'PATCH',
      body: JSON.stringify({ blocked_genres: genres }),
    })
    if (j.ok) {
      setBlockedGenres(genres)
      onAction('Saved')
    } else {
      onAction((j.error as { message?: string } | undefined)?.message || 'Save failed')
    }
  }

  function addGenre() {
    const g = genreInput.trim().toLowerCase()
    if (!g || blockedGenres.includes(g)) { setGenreInput(''); return }
    const next = [...blockedGenres, g]
    setGenreInput('')
    saveGenres(next)
  }

  function removeGenre(g: string) {
    saveGenres(blockedGenres.filter((x) => x !== g))
  }

  async function add() {
    if (!pid.trim() || !name.trim()) return
    const j = await apiFetch('/api/admin/jukebox/blocklist', {
      method: 'POST',
      body: JSON.stringify({ type, provider_id: pid.trim(), name: name.trim() }),
    })
    if (j.ok) { setPid(''); setName(''); onAction('Blocked'); load() }
    else onAction(j.error?.message || 'Failed')
  }

  async function remove(id: string) {
    const j = await apiFetch(`/api/admin/jukebox/blocklist/${id}`, { method: 'DELETE' })
    if (j.ok) { onAction('Unblocked'); setRows((r) => r.filter((x) => x.id !== id)) }
    else onAction(j.error?.message || 'Failed')
  }

  return (
    <>
      <div className="card" style={{ padding: 16, marginBottom: 16 }}>
        <div className="section-title" style={{ marginBottom: 10 }}>Add to blocklist</div>
        <div style={{ display: 'grid', gridTemplateColumns: '120px 1fr 1fr 90px', gap: 10, alignItems: 'end' }}>
          <div>
            <label className="label">Type</label>
            <select className="input" value={type} onChange={(e) => setType(e.target.value as 'track' | 'artist')}>
              <option value="track">Track</option>
              <option value="artist">Artist</option>
            </select>
          </div>
          <div>
            <label className="label">Spotify ID</label>
            <input className="input" value={pid} onChange={(e) => setPid(e.target.value)} placeholder="track or artist id" />
          </div>
          <div>
            <label className="label">Name</label>
            <input className="input" value={name} onChange={(e) => setName(e.target.value)} placeholder="display name" />
          </div>
          <Button variant="danger" onClick={add}>Block</Button>
        </div>
      </div>

      {rows.length === 0 ? (
        <EmptyCard title="Nothing blocked." sub="Block a track or artist from the Pending tab." />
      ) : (
        <div className="card" style={{ padding: 0, overflow: 'hidden', marginBottom: 16 }}>
          <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 13 }}>
            <thead>
              <tr style={{ background: 'var(--adm-subtle-bg)' }}>
                <Th>Type</Th><Th>Name</Th><Th>Spotify ID</Th><Th>Added</Th><Th></Th>
              </tr>
            </thead>
            <tbody>
              {rows.map((r) => (
                <tr key={r.id} style={{ borderTop: '1px solid var(--adm-border)' }}>
                  <Td><span className={`badge ${r.type === 'artist' ? 'badge-orange' : 'badge-gray'}`}>{r.type}</span></Td>
                  <Td>{r.name}</Td>
                  <Td style={{ fontFamily: 'monospace', fontSize: 12 }}>{r.provider_id}</Td>
                  <Td>{new Date(r.created_at).toLocaleDateString()}</Td>
                  <Td><Button variant="secondary" onClick={() => remove(r.id)}>Unblock</Button></Td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      <div className="card" style={{ padding: 16 }}>
        <div className="section-title" style={{ marginBottom: 4 }}>Blocked genres</div>
        <div style={{ fontSize: 12, color: 'var(--adm-text-muted)', marginBottom: 12 }}>
          Substring match — e.g. &ldquo;metal&rdquo; blocks &ldquo;death metal&rdquo;, &ldquo;heavy metal&rdquo;, etc. Case-insensitive. Genres come from Spotify&apos;s artist data. Leave empty to allow all genres.
        </div>
        {genreLoaded && (
          <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6, marginBottom: 12 }}>
            {blockedGenres.length === 0 && (
              <span style={{ fontSize: 13, color: 'var(--adm-text-muted)' }}>No genres blocked.</span>
            )}
            {blockedGenres.map((g) => (
              <span
                key={g}
                style={{
                  display: 'inline-flex', alignItems: 'center', gap: 6,
                  padding: '4px 10px', borderRadius: 8,
                  background: 'var(--badge-orange-bg)', color: 'var(--badge-orange-text)',
                  border: '1px solid var(--badge-orange-border)',
                  fontSize: 12, fontWeight: 500,
                }}
              >
                {g}
                <button
                  onClick={() => removeGenre(g)}
                  style={{
                    background: 'none', border: 'none', cursor: 'pointer',
                    color: 'inherit', padding: 0, lineHeight: 1, fontSize: 14,
                  }}
                  title={`Remove ${g}`}
                >
                  ×
                </button>
              </span>
            ))}
          </div>
        )}
        <div style={{ display: 'flex', gap: 8 }}>
          <input
            className="input"
            placeholder="e.g. metal, country, trap"
            value={genreInput}
            onChange={(e) => setGenreInput(e.target.value)}
            onKeyDown={(e) => { if (e.key === 'Enter') { e.preventDefault(); addGenre() } }}
            style={{ flex: 1 }}
          />
          <Button variant="primary" onClick={addGenre} disabled={!genreInput.trim()}>Add</Button>
        </div>
      </div>
    </>
  )
}

// ── Settings ───────────────────────────────────────────────────
interface SettingsTabProps {
  apiFetch: (p: string, i?: RequestInit) => Promise<{ ok: boolean; data?: unknown; error?: { message: string } }>
  onAction: (m: string) => void
  settings: Settings | null
  setSettings: (s: Settings) => void
  refreshSettings: () => Promise<void>
}

function SettingsTab({
  apiFetch,
  onAction,
  settings: s,
  setSettings,
  refreshSettings,
}: SettingsTabProps) {
  const [saving, setSaving] = useState(false)

  async function patch(patchBody: Partial<Settings>) {
    setSaving(true)
    try {
      const j = await apiFetch('/api/admin/jukebox/settings', {
        method: 'PATCH',
        body: JSON.stringify(patchBody),
      })
      if (j.ok) { setSettings(j.data as Settings); onAction('Saved') }
      else onAction(j.error?.message || 'Save failed')
    } catch {
      onAction('Network error — try again')
    } finally {
      setSaving(false)
    }
  }

  async function rotateToken() {
    const j = await apiFetch('/api/admin/jukebox/settings/rotate-display-token', { method: 'POST', body: '{}' })
    if (j.ok) { onAction('Display token rotated'); refreshSettings() }
    else onAction(j.error?.message || 'Rotate failed')
  }

  // Show skeleton cards while the prefetch is in flight — feels much faster
  // than a single "Loading…" text, especially during a Vercel cold start.
  if (!s) return <SettingsSkeleton />

  // Always show the friendlier subdomain URL when the public base hint is set;
  // fall back to the current origin so admin-on-localhost still works in dev.
  const publicBase = (process.env.NEXT_PUBLIC_JUKEBOX_PUBLIC_URL || '').replace(/\/$/, '')
  const isSubdomain = /^https?:\/\/jukebox\./i.test(publicBase)
  const displayBase =
    publicBase ? publicBase : (typeof window !== 'undefined' ? window.location.origin : '')
  const displayUrl = displayBase
    ? (isSubdomain ? `${displayBase}/display?token=${s.display_token}` : `${displayBase}/jukebox/display?token=${s.display_token}`)
    : ''

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
      <Card>
        <div className="section-title" style={{ marginBottom: 16 }}>Options</div>
        <div style={{ display: 'flex', flexDirection: 'column', gap: 18 }}>
          <div style={{ display: 'flex', gap: 16, alignItems: 'flex-start' }}>
            <SegmentedControl
              options={[{ value: 'active', label: 'Active', color: 'green' }, { value: 'paused', label: 'Paused', color: 'red' }]}
              value={s.is_active ? 'active' : 'paused'}
              onChange={(v) => patch({ is_active: v === 'active' })}
              disabled={saving}
            />
            <div>
              <div style={{ fontWeight: 600, fontSize: 14, color: 'var(--adm-text)', marginBottom: 3 }}>VibeQueue</div>
              <div style={{ fontSize: 12, color: 'var(--adm-text-muted)', lineHeight: 1.5 }}>
                When paused, guests can&apos;t request anything.
              </div>
            </div>
          </div>

          <div style={{ display: 'flex', gap: 16, alignItems: 'flex-start', opacity: s.is_active ? 1 : 0.5 }}>
            <SegmentedControl
              options={[{ value: 'approval', label: 'Required', color: 'red' }, { value: 'autopilot', label: 'Autopilot', color: 'green' }]}
              value={s.mode === 'approval' ? 'approval' : 'autopilot'}
              onChange={(v) => patch({ mode: v as Settings['mode'] })}
              disabled={saving}
            />
            <div>
              <div style={{ fontWeight: 600, fontSize: 14, color: 'var(--adm-text)', marginBottom: 3 }}>Approval</div>
              <div style={{ fontSize: 12, color: 'var(--adm-text-muted)', lineHeight: 1.5 }}>
                {s.mode === 'approval'
                  ? 'Each request lands in Queue for your approval before it reaches Spotify.'
                  : 'Guest requests are auto-queued in Spotify. No staff input needed.'}
              </div>
            </div>
          </div>

          <div style={{ display: 'flex', gap: 16, alignItems: 'flex-start' }}>
            <SegmentedControl
              options={[{ value: 'yes', label: 'Active', color: 'green' }, { value: 'no', label: 'Paused', color: 'red' }]}
              value={s.allow_explicit ? 'yes' : 'no'}
              onChange={(v) => patch({ allow_explicit: v === 'yes' })}
              disabled={saving}
            />
            <div>
              <div style={{ fontWeight: 600, fontSize: 14, color: 'var(--adm-text)', marginBottom: 3 }}>Allow explicit</div>
              <div style={{ fontSize: 12, color: 'var(--adm-text-muted)', lineHeight: 1.5 }}>
                {s.allow_explicit
                  ? 'Explicit-tagged tracks are allowed in requests.'
                  : 'Explicit-tagged tracks are auto-rejected.'}
              </div>
            </div>
          </div>
        </div>
      </Card>

      <Card>
        <div className="section-title" style={{ marginBottom: 12 }}>Cooldowns &amp; rules</div>
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(2, 1fr)', gap: 12 }}>
          <NumberField
            label="Guest cooldown (min)"
            help="How long a guest must wait between requests."
            value={s.guest_cooldown_minutes}
            onSave={(v) => patch({ guest_cooldown_minutes: v })}
          />
          <NumberField
            label="Member cooldown (min)"
            help="Same, for logged-in members (if member system is active)."
            value={s.member_cooldown_minutes}
            onSave={(v) => patch({ member_cooldown_minutes: v })}
          />
          <NumberField
            label="Duplicate window (min)"
            help="How long before the same song can be requested again."
            value={s.duplicate_cooldown_minutes}
            onSave={(v) => patch({ duplicate_cooldown_minutes: v })}
          />
          <NumberField
            label="Same-artist window (min)"
            help="How long before the same artist can be requested again."
            value={s.same_artist_cooldown_minutes}
            onSave={(v) => patch({ same_artist_cooldown_minutes: v })}
          />
          <NumberField
            label="Max queue length"
            help="When the queue hits this many songs, new requests are rejected."
            value={s.max_queue_length}
            onSave={(v) => patch({ max_queue_length: v })}
          />
          <NumberField
            label="Pending requests expire after (min)"
            help="If you don't approve within this many minutes, the request is auto-rejected."
            value={s.pending_request_ttl_minutes}
            onSave={(v) => patch({ pending_request_ttl_minutes: v })}
          />
        </div>
      </Card>

      <Card>
        <div className="section-title" style={{ marginBottom: 12 }}>Display URL</div>
        <div style={{ fontSize: 12, color: 'var(--adm-text-muted)', marginBottom: 6 }}>
          Open this on the venue TV/kiosk. Rotate the token to invalidate old links.
        </div>
        <div style={{ display: 'flex', gap: 8 }}>
          <input className="input" readOnly value={displayUrl} style={{ fontFamily: 'monospace', fontSize: 12 }} />
          <Button variant="secondary" onClick={() => navigator.clipboard?.writeText(displayUrl).then(() => onAction('Copied'))}>Copy</Button>
          <Button variant="danger" onClick={rotateToken}>{copy.admin.rotateDisplayToken}</Button>
        </div>
      </Card>

    </div>
  )
}

// ── Branding tab ──────────────────────────────────────────────
interface BrandingTabProps {
  apiFetch: (p: string, i?: RequestInit) => Promise<{ ok: boolean; data?: unknown; error?: { message: string } }>
  onAction: (m: string) => void
  settings: Settings | null
  setSettings: (s: Settings) => void
}

function BrandingTab({ apiFetch, onAction, settings: s, setSettings }: BrandingTabProps) {
  const [saving, setSaving] = useState(false)

  async function patchSettings(patchBody: Partial<Settings>) {
    setSaving(true)
    try {
      const j = await apiFetch('/api/admin/jukebox/settings', {
        method: 'PATCH',
        body: JSON.stringify(patchBody),
      })
      if (j.ok) { setSettings(j.data as Settings); onAction('Saved') }
      else onAction(j.error?.message || 'Save failed')
    } catch {
      onAction('Network error — try again')
    } finally {
      setSaving(false)
    }
  }

  if (!s) return <SettingsSkeleton />

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
      <Card>
        <div className="section-title" style={{ marginBottom: 4 }}>Branding</div>
        <div style={{ fontSize: 12, color: 'var(--adm-text-muted)', marginBottom: 12 }}>
          Venue logo shown in the kiosk display header and admin page. PNG or JPG, max 500 KB. Leave blank to use the default BBB logo.
        </div>
        <LogoField
          logoUrl={s.logo_url ?? null}
          apiFetch={apiFetch}
          onAction={onAction}
          onSaved={(url) => setSettings({ ...s, logo_url: url })}
        />
      </Card>

      <Card>
        <div className="section-title" style={{ marginBottom: 4 }}>Display info</div>
        <div style={{ fontSize: 12, color: 'var(--adm-text-muted)', marginBottom: 12 }}>
          WiFi credentials shown on the kiosk header strip. Leave blank to hide.
        </div>
        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12 }}>
          <WifiField label="Network name (SSID)" field="wifi_network" settings={s} patch={patchSettings} disabled={saving} />
          <WifiField label="Password" field="wifi_password" settings={s} patch={patchSettings} disabled={saving} />
        </div>
      </Card>

      <PostersSection apiFetch={apiFetch} onAction={onAction} settings={s} setSettings={setSettings} />

      <GuestAccessSection apiFetch={apiFetch} onAction={onAction} settings={s} setSettings={setSettings} />
    </div>
  )
}

// ── Guest Access ───────────────────────────────────────────────
function GuestAccessSection({
  apiFetch,
  onAction,
  settings,
  setSettings,
}: {
  apiFetch: (p: string, i?: RequestInit) => Promise<{ ok: boolean; data?: unknown; error?: { message: string } }>
  onAction: (m: string) => void
  settings: Settings
  setSettings: (s: Settings) => void
}) {
  const [now, setNow] = useState(Date.now())
  const [rotating, setRotating] = useState(false)
  const [rotHours, setRotHours] = useState(String(settings.guest_token_rotation_hours ?? 12))

  useEffect(() => { setRotHours(String(settings.guest_token_rotation_hours ?? 12)) }, [settings.guest_token_rotation_hours])
  useEffect(() => {
    const t = setInterval(() => setNow(Date.now()), 10_000)
    return () => clearInterval(t)
  }, [])

  async function saveRotationHours() {
    const n = parseInt(rotHours, 10)
    if (!Number.isFinite(n) || n < 1 || n > 168) { setRotHours(String(settings.guest_token_rotation_hours ?? 12)); return }
    if (n === (settings.guest_token_rotation_hours ?? 12)) return
    const j = await apiFetch('/api/admin/jukebox/branding/settings', {
      method: 'PATCH',
      body: JSON.stringify({ guest_token_rotation_hours: n }),
    })
    if (j.ok) {
      setSettings({ ...settings, ...(j.data as Pick<Settings, 'guest_token_rotation_hours'>) })
      onAction('Saved')
    } else onAction(j.error?.message || 'Save failed')
  }

  async function rotateNow() {
    if (!confirm('Rotate the QR token now? Anyone with the current QR link will need to rescan.')) return
    setRotating(true)
    const j = await apiFetch('/api/admin/jukebox/branding/rotate-guest-token', { method: 'POST', body: '{}' })
    setRotating(false)
    if (j.ok) {
      const s = await apiFetch('/api/admin/jukebox/settings')
      if (s.ok) setSettings(s.data as Settings)
      onAction('Token rotated — old QR links invalidated')
    } else onAction(j.error?.message || 'Rotate failed')
  }

  const rotatedAt = settings.guest_token_rotated_at ? new Date(settings.guest_token_rotated_at).getTime() : now
  const hours = settings.guest_token_rotation_hours ?? 12
  const expiresAt = rotatedAt + hours * 3_600_000
  const msLeft = Math.max(0, expiresAt - now)
  const hLeft = Math.floor(msLeft / 3_600_000)
  const mLeft = Math.floor((msLeft % 3_600_000) / 60_000)
  const expiryLabel = msLeft === 0 ? 'Rotating soon…' : hLeft > 0 ? `${hLeft}h ${mLeft}m` : `${mLeft}m`

  return (
    <Card>
      <div className="section-title" style={{ marginBottom: 4 }}>Guest access</div>
      <div style={{ fontSize: 12, color: 'var(--adm-text-muted)', marginBottom: 16, lineHeight: 1.5 }}>
        The kiosk QR code embeds a token. When the token rotates, old QR links stop working — guests must rescan the TV. Use this to ensure only people physically present can request songs.
      </div>

      <div style={{ display: 'flex', gap: 20, alignItems: 'flex-end', flexWrap: 'wrap', marginBottom: 16 }}>
        <div>
          <label className="label" style={{ marginBottom: 4 }}>Auto-rotate every</label>
          <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
            <input
              className="input"
              type="number"
              min={1}
              max={168}
              style={{ width: 80 }}
              value={rotHours}
              onChange={(e) => setRotHours(e.target.value)}
              onBlur={saveRotationHours}
            />
            <span style={{ fontSize: 13, color: 'var(--adm-text-sec)' }}>hours</span>
          </div>
          <div style={{ fontSize: 11, color: 'var(--adm-text-muted)', marginTop: 3 }}>1 – 168 hours</div>
        </div>

        <div style={{ paddingBottom: 24 }}>
          <div style={{ fontSize: 12, color: 'var(--adm-text-muted)', marginBottom: 2 }}>Current token expires in</div>
          <div style={{ fontSize: 16, fontWeight: 600, color: msLeft < 3_600_000 ? 'var(--adm-danger)' : 'var(--adm-text)', fontVariantNumeric: 'tabular-nums' }}>
            {expiryLabel}
          </div>
        </div>
      </div>

      <div style={{ display: 'flex', gap: 10, alignItems: 'center' }}>
        <Button variant="danger" disabled={rotating} onClick={rotateNow}>
          {rotating ? 'Rotating…' : 'Rotate now'}
        </Button>
        <span style={{ fontSize: 12, color: 'var(--adm-text-muted)' }}>
          Invalidates all current QR links immediately.
        </span>
      </div>
    </Card>
  )
}

// ── Bits ───────────────────────────────────────────────────────
function RowCard({
  row,
  position,
  badge,
  children,
}: {
  row: ReqRow
  position?: number
  badge?: React.ReactNode
  children: React.ReactNode
}) {
  return (
    <div className="card" style={{ display: 'flex', gap: 14, alignItems: 'center', padding: 12 }}>
      {typeof position === 'number' && (
        <div style={{ fontSize: 18, fontWeight: 700, color: 'var(--adm-accent)', width: 28, textAlign: 'center', flexShrink: 0 }}>
          {position}
        </div>
      )}
      <div style={{ width: 48, height: 48, flexShrink: 0, borderRadius: 6, overflow: 'hidden', background: 'var(--adm-input-bg)' }}>
        {row.album_art_url ? (
          // eslint-disable-next-line @next/next/no-img-element
          <img src={row.album_art_url} alt="" width={48} height={48} style={{ display: 'block', objectFit: 'cover' }} />
        ) : null}
      </div>
      <div style={{ flex: 1, minWidth: 0 }}>
        <div style={{ fontSize: 14, fontWeight: 600, color: 'var(--adm-text)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
          {row.track_name}{row.explicit ? <span className="badge badge-gray" style={{ marginLeft: 8, fontSize: 10 }}>E</span> : null}
        </div>
        <div style={{ fontSize: 12, color: 'var(--adm-text-sec)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
          {row.artist_name} · <span style={{ color: row.requested_by_hidden ? 'var(--adm-text-muted)' : 'var(--adm-text-sec)' }}>{row.requested_by_hidden ? 'anonymous' : row.requested_by}</span>
        </div>
        {badge && <div style={{ marginTop: 4 }}>{badge}</div>}
      </div>
      <div style={{ display: 'flex', gap: 6, flexShrink: 0, flexWrap: 'wrap', justifyContent: 'flex-end' }}>
        {children}
      </div>
    </div>
  )
}


function NumberField({ label, help, value, onSave }: { label: string; help?: string; value: number; onSave: (n: number) => void }) {
  const [v, setV] = useState(String(value))
  useEffect(() => { setV(String(value)) }, [value])
  return (
    <div>
      <label className="label">{label}</label>
      {help && <div style={{ fontSize: 11, color: 'var(--adm-text-muted)', marginBottom: 4, lineHeight: 1.4 }}>{help}</div>}
      <input
        className="input"
        type="number"
        min={0}
        value={v}
        onChange={(e) => setV(e.target.value)}
        onBlur={() => {
          const n = parseInt(v, 10)
          if (Number.isFinite(n) && n !== value) onSave(n)
        }}
      />
    </div>
  )
}

function SegmentedControl({
  options,
  value,
  onChange,
  disabled,
}: {
  options: { value: string; label: string; color?: string }[]
  value: string
  onChange: (v: string) => void
  disabled?: boolean
}) {
  return (
    <div className="admin-seg">
      {options.map((o) => (
        <button
          key={o.value}
          className={[
            'admin-seg-btn',
            value === o.value ? 'is-active' : '',
            o.color ? `seg-${o.color}` : '',
          ].filter(Boolean).join(' ')}
          onClick={() => { if (!disabled) onChange(o.value) }}
          disabled={!!disabled && value !== o.value}
          type="button"
        >
          {o.label}
        </button>
      ))}
    </div>
  )
}

function WifiField({ label, field, settings, patch, disabled }: {
  label: string
  field: 'wifi_network' | 'wifi_password'
  settings: Settings
  patch: (b: Partial<Settings>) => void
  disabled?: boolean
}) {
  const [v, setV] = useState(settings[field] ?? '')
  useEffect(() => { setV(settings[field] ?? '') }, [settings, field])
  return (
    <div>
      <label className="label">{label}</label>
      <input
        className="input"
        type="text"
        value={v}
        disabled={disabled}
        onChange={(e) => setV(e.target.value)}
        onBlur={() => {
          const trimmed = v.trim()
          if (trimmed !== (settings[field] ?? '')) patch({ [field]: trimmed || null } as Partial<Settings>)
        }}
        placeholder="leave blank to hide"
      />
    </div>
  )
}

function LogoField({ logoUrl, apiFetch, onAction, onSaved }: {
  logoUrl: string | null
  apiFetch: (p: string, i?: RequestInit) => Promise<{ ok: boolean; data?: unknown; error?: { message: string } }>
  onAction: (m: string) => void
  onSaved: (url: string | null) => void
}) {
  const [uploading, setUploading] = useState(false)
  const fileRef = useRef<HTMLInputElement>(null)

  async function handleFile(file: File) {
    if (file.size > 512_000) { onAction('File too large (max 500 KB)'); return }
    setUploading(true)
    const form = new FormData()
    form.append('file', file)
    try {
      const j = await apiFetch('/api/admin/jukebox/settings/logo', { method: 'POST', body: form }) as { ok: boolean; data?: { url: string }; error?: { message: string } }
      if (j.ok && j.data?.url) {
        onSaved(j.data.url)
        onAction('Logo saved')
      } else {
        onAction(j.error?.message || 'Upload failed')
      }
    } catch {
      onAction('Upload failed')
    } finally {
      setUploading(false)
    }
  }

  async function removeLogo() {
    const j = await apiFetch('/api/admin/jukebox/settings', {
      method: 'PATCH',
      body: JSON.stringify({ logo_url: null }),
    })
    if (j.ok) { onSaved(null); onAction('Logo removed') }
    else onAction((j.error as { message?: string } | undefined)?.message || 'Remove failed')
  }

  return (
    <div style={{ display: 'flex', alignItems: 'center', gap: 14 }}>
      {logoUrl ? (
        // eslint-disable-next-line @next/next/no-img-element
        <img src={logoUrl} alt="Venue logo" style={{ height: 48, width: 'auto', borderRadius: 6, border: '1px solid var(--adm-border)' }} />
      ) : (
        <div style={{ width: 48, height: 48, borderRadius: 6, background: 'var(--adm-input-bg)', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 18, color: 'var(--adm-text-muted)' }}>
          🏷
        </div>
      )}
      <div style={{ display: 'flex', gap: 8 }}>
        <input
          ref={fileRef}
          type="file"
          accept="image/png,image/jpeg,image/webp"
          style={{ display: 'none' }}
          onChange={(e) => { const f = e.target.files?.[0]; if (f) handleFile(f) }}
        />
        <Button variant="secondary" disabled={uploading} onClick={() => fileRef.current?.click()}>
          {uploading ? 'Uploading…' : logoUrl ? 'Replace logo' : 'Upload logo'}
        </Button>
        {logoUrl && (
          <Button variant="danger" onClick={removeLogo}>Remove</Button>
        )}
      </div>
    </div>
  )
}

function EmptyCard({ title, sub }: { title: string; sub: string }) {
  return (
    <div className="card" style={{ padding: 32, textAlign: 'center' }}>
      <div style={{ fontSize: 16, fontWeight: 600, color: 'var(--adm-text)', marginBottom: 6 }}>{title}</div>
      <div style={{ fontSize: 13, color: 'var(--adm-text-muted)' }}>{sub}</div>
    </div>
  )
}

// ── Display Posters ────────────────────────────────────────────
interface PosterRow {
  id: string
  storage_path: string
  public_url: string
  position: number
  is_active: boolean
  created_at: string
}

function PostersSection({
  apiFetch,
  onAction,
  settings,
  setSettings,
}: {
  apiFetch: (p: string, i?: RequestInit) => Promise<{ ok: boolean; data?: unknown; error?: { message: string } }>
  onAction: (m: string) => void
  settings: Settings
  setSettings: (s: Settings) => void
}) {
  const [posters, setPosters] = useState<PosterRow[]>([])
  const [uploading, setUploading] = useState(false)
  const [busy, setBusy] = useState<string | null>(null)
  const [dragOver, setDragOver] = useState(false)
  const [rotSecs, setRotSecs] = useState(String(settings.poster_rotation_seconds ?? 8))
  const fileRef = useRef<HTMLInputElement>(null)
  const dragIdx = useRef<number | null>(null)

  useEffect(() => {
    setRotSecs(String(settings.poster_rotation_seconds ?? 8))
  }, [settings.poster_rotation_seconds])

  const load = useCallback(async () => {
    const j = await apiFetch('/api/admin/jukebox/branding/posters')
    if (j.ok) setPosters((j.data as { posters: PosterRow[] }).posters)
  }, [apiFetch])

  useEffect(() => { load() }, [load])

  async function patchRotation(body: { rotate_posters?: boolean; poster_rotation_seconds?: number }) {
    const j = await apiFetch('/api/admin/jukebox/branding/settings', {
      method: 'PATCH',
      body: JSON.stringify(body),
    })
    if (j.ok) {
      setSettings({ ...settings, ...(j.data as Pick<Settings, 'rotate_posters' | 'poster_rotation_seconds'>) })
      onAction('Saved')
    } else {
      onAction(j.error?.message || 'Save failed')
    }
  }

  async function uploadFile(file: File) {
    if (!['image/png', 'image/jpeg'].includes(file.type)) { onAction('Only PNG or JPEG allowed.'); return }
    if (file.size > 2_097_152) { onAction('File too large (max 2 MB).'); return }
    setUploading(true)
    const form = new FormData()
    form.append('file', file)
    try {
      const j = await apiFetch('/api/admin/jukebox/branding/posters', { method: 'POST', body: form }) as { ok: boolean; data?: { poster: PosterRow }; error?: { message: string } }
      if (j.ok && j.data?.poster) {
        setPosters(p => [...p, j.data!.poster])
        onAction('Poster uploaded')
      } else {
        onAction(j.error?.message || 'Upload failed')
      }
    } catch {
      onAction('Upload failed')
    } finally {
      setUploading(false)
    }
  }

  async function toggle(id: string, is_active: boolean) {
    setBusy(id + ':toggle')
    const j = await apiFetch(`/api/admin/jukebox/branding/posters/${id}`, { method: 'PATCH', body: JSON.stringify({ is_active }) })
    setBusy(null)
    if (j.ok) setPosters(p => p.map(x => x.id === id ? { ...x, is_active } : x))
    else onAction(j.error?.message || 'Update failed')
  }

  async function remove(id: string) {
    if (!confirm('Delete this poster?')) return
    setBusy(id + ':del')
    const j = await apiFetch(`/api/admin/jukebox/branding/posters/${id}`, { method: 'DELETE' })
    setBusy(null)
    if (j.ok) setPosters(p => p.filter(x => x.id !== id))
    else onAction(j.error?.message || 'Delete failed')
  }

  async function reorder(fromIdx: number, toIdx: number) {
    if (fromIdx === toIdx) return
    const next = [...posters]
    const [moved] = next.splice(fromIdx, 1)
    next.splice(toIdx, 0, moved)
    const reindexed = next.map((p, i) => ({ ...p, position: i }))
    setPosters(reindexed)
    await Promise.all(
      reindexed
        .filter((p, i) => p.position !== posters[i]?.position)
        .map(p => apiFetch(`/api/admin/jukebox/branding/posters/${p.id}`, { method: 'PATCH', body: JSON.stringify({ position: p.position }) }))
    )
  }

  function onDrop(e: React.DragEvent, toIdx: number) {
    e.preventDefault()
    if (dragIdx.current !== null) reorder(dragIdx.current, toIdx)
    dragIdx.current = null
  }

  function onZoneDrop(e: React.DragEvent) {
    e.preventDefault()
    setDragOver(false)
    const file = e.dataTransfer.files?.[0]
    if (file) uploadFile(file)
  }

  const rotateOn = settings.rotate_posters !== false

  return (
    <Card>
      <div className="section-title" style={{ marginBottom: 4 }}>Display Posters</div>
      <div style={{ fontSize: 12, color: 'var(--adm-text-muted)', marginBottom: 14 }}>
        Upload posters that rotate on the kiosk TV bottom-right panel. Recommended: <strong>1600 × 400 px</strong> (4:1 aspect ratio), PNG or JPG, max 2 MB.
      </div>

      {/* Global rotation controls */}
      <div style={{ display: 'flex', gap: 24, alignItems: 'flex-start', marginBottom: 18, flexWrap: 'wrap', paddingBottom: 16, borderBottom: '1px solid var(--adm-border)' }}>
        <div style={{ display: 'flex', gap: 12, alignItems: 'center' }}>
          <SegmentedControl
            options={[{ value: 'on', label: 'On', color: 'green' }, { value: 'off', label: 'Off', color: 'red' }]}
            value={rotateOn ? 'on' : 'off'}
            onChange={(v) => patchRotation({ rotate_posters: v === 'on' })}
          />
          <div>
            <div style={{ fontWeight: 600, fontSize: 13, color: 'var(--adm-text)', marginBottom: 2 }}>Rotate posters</div>
            <div style={{ fontSize: 11, color: 'var(--adm-text-muted)', lineHeight: 1.4 }}>
              {rotateOn ? 'Kiosk cycles through active posters.' : 'Kiosk shows only the first active poster.'}
            </div>
          </div>
        </div>
        <div>
          <label className="label" style={{ marginBottom: 4 }}>Seconds per poster</label>
          <input
            className="input"
            type="number"
            min={3}
            max={60}
            style={{ width: 80 }}
            value={rotSecs}
            disabled={!rotateOn}
            onChange={(e) => setRotSecs(e.target.value)}
            onBlur={() => {
              const n = parseInt(rotSecs, 10)
              const cur = settings.poster_rotation_seconds ?? 8
              if (Number.isFinite(n) && n >= 3 && n <= 60 && n !== cur) {
                patchRotation({ poster_rotation_seconds: n })
              } else {
                setRotSecs(String(cur))
              }
            }}
          />
          <div style={{ fontSize: 11, color: 'var(--adm-text-muted)', marginTop: 3 }}>3 – 60 seconds</div>
        </div>
      </div>

      {/* Drop zone */}
      <div
        onDragOver={(e) => { e.preventDefault(); setDragOver(true) }}
        onDragLeave={() => setDragOver(false)}
        onDrop={onZoneDrop}
        onClick={() => fileRef.current?.click()}
        style={{
          border: `2px dashed ${dragOver ? 'var(--adm-accent)' : 'var(--adm-border)'}`,
          borderRadius: 10, padding: '20px 16px', textAlign: 'center',
          cursor: 'pointer', marginBottom: 14, transition: 'border-color 0.15s',
          background: dragOver ? 'var(--adm-subtle-bg)' : 'transparent',
        }}
      >
        <input
          ref={fileRef}
          type="file"
          accept="image/png,image/jpeg"
          multiple
          style={{ display: 'none' }}
          onChange={(e) => {
            Array.from(e.target.files || []).forEach(uploadFile)
            e.target.value = ''
          }}
        />
        <div style={{ fontSize: 13, color: 'var(--adm-text-muted)' }}>
          {uploading ? 'Uploading…' : 'Drag & drop poster images here, or click to browse'}
        </div>
        <div style={{ fontSize: 11, color: 'var(--adm-text-muted)', marginTop: 4 }}>PNG · JPG · max 2 MB</div>
      </div>

      {/* Thumbnail grid */}
      {posters.length > 0 && (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
          {posters.map((poster, idx) => (
            <div
              key={poster.id}
              draggable
              onDragStart={() => { dragIdx.current = idx }}
              onDragOver={(e) => e.preventDefault()}
              onDrop={(e) => onDrop(e, idx)}
              style={{
                display: 'flex', alignItems: 'center', gap: 10,
                padding: '8px 10px', borderRadius: 8,
                border: '1px solid var(--adm-border)',
                background: poster.is_active ? 'var(--adm-card-bg)' : 'var(--adm-subtle-bg)',
                opacity: poster.is_active ? 1 : 0.55,
                cursor: 'grab',
              }}
            >
              <span style={{ fontSize: 16, color: 'var(--adm-text-muted)', cursor: 'grab', flexShrink: 0 }} title="Drag to reorder">⠿</span>
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img
                src={poster.public_url}
                alt=""
                style={{ width: 140, height: 35, objectFit: 'cover', borderRadius: 4, flexShrink: 0, background: 'var(--adm-input-bg)' }}
              />
              <div style={{ flex: 1, minWidth: 0 }}>
                <div style={{ fontSize: 11, color: 'var(--adm-text-muted)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                  #{idx + 1} · {poster.storage_path.split('/').pop()}
                </div>
                <div style={{ fontSize: 10, color: 'var(--adm-text-muted)', marginTop: 2 }}>
                  {new Date(poster.created_at).toLocaleDateString()}
                </div>
              </div>
              <SegmentedControl
                options={[{ value: 'active', label: 'Active', color: 'green' }, { value: 'hidden', label: 'Hidden', color: 'red' }]}
                value={poster.is_active ? 'active' : 'hidden'}
                onChange={(v) => toggle(poster.id, v === 'active')}
                disabled={busy === poster.id + ':toggle'}
              />
              <Button
                variant="danger"
                size="sm"
                disabled={busy === poster.id + ':del'}
                onClick={() => remove(poster.id)}
              >
                {busy === poster.id + ':del' ? '…' : '✕'}
              </Button>
            </div>
          ))}
        </div>
      )}

      {posters.length === 0 && !uploading && (
        <div style={{ fontSize: 13, color: 'var(--adm-text-muted)', textAlign: 'center', padding: '8px 0' }}>
          No posters yet. Upload one above.
        </div>
      )}
    </Card>
  )
}

// Skeleton placeholder shown while settings + presets are still in flight.
// Mimics the real layout (4 cards) so the click-to-Settings transition feels
// instant instead of "blank page → loading text → content".
function SettingsSkeleton() {
  const bar = (w: string, h = 14) => (
    <div style={{
      width: w, height: h, borderRadius: 4,
      background: 'var(--adm-skel-bg)',
      animation: 'bbb-skel 1.4s ease-in-out infinite',
    }} />
  )
  const card = (children: React.ReactNode) => (
    <div className="card" style={{ padding: 18, display: 'flex', flexDirection: 'column', gap: 10 }}>
      {children}
    </div>
  )
  return (
    <>
      <style>{`@keyframes bbb-skel{0%,100%{opacity:.6}50%{opacity:.95}}`}</style>
      <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
        {card(<>
          {bar('40%', 16)}
          <div style={{ display: 'flex', gap: 8, marginTop: 6 }}>
            {bar('80px', 32)}{bar('92px', 32)}{bar('70px', 32)}{bar('80px', 32)}
          </div>
        </>)}
        {card(<>
          {bar('46%', 16)}
          {bar('100%', 56)}
          {bar('100%', 56)}
        </>)}
        {card(<>
          {bar('44%', 16)}
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 10 }}>
            {bar('100%', 38)}{bar('100%', 38)}{bar('100%', 38)}{bar('100%', 38)}
          </div>
        </>)}
        {card(<>{bar('30%', 16)}{bar('100%', 38)}</>)}
      </div>
    </>
  )
}

function Th({ children }: { children?: React.ReactNode }) {
  return <th style={{ textAlign: 'left', padding: '10px 14px', fontSize: 11, fontWeight: 600, letterSpacing: '0.04em', textTransform: 'uppercase', color: 'var(--adm-text-muted)' }}>{children}</th>
}
function Td({ children, style }: { children: React.ReactNode; style?: React.CSSProperties }) {
  return <td style={{ padding: '10px 14px', verticalAlign: 'middle', ...style }}>{children}</td>
}

function badgeFor(status: string): string {
  if (status === 'played') return 'badge-green'
  if (status === 'skipped' || status === 'expired') return 'badge-gray'
  if (status === 'rejected' || status === 'removed' || status === 'failed') return 'badge-red'
  return 'badge-orange'
}

// ── Spotify ────────────────────────────────────────────────────
interface SpotifyStatus {
  connected: boolean
  provider_user_id: string | null
  provider_display_name: string | null
  scopes: string[]
  expires_at: string | null
  active_device: { id: string; name: string; is_active: boolean } | null
  all_devices: { id: string; name: string; is_active: boolean }[]
  devices_error: string | null
}

interface NowPlayingAdmin {
  track: {
    id: string
    name: string
    artists: { id: string; name: string }[]
    album: { name: string; artUrl: string | null }
    durationMs: number
  }
  isPlaying: boolean
  progressMs: number
  device?: { id: string; name: string; type: string }
}

function SpotifyTab({
  apiFetch,
  onAction,
}: {
  apiFetch: (p: string, i?: RequestInit) => Promise<{ ok: boolean; data?: unknown; error?: { message: string; code?: string } }>
  onAction: (m: string) => void
}) {
  const [status, setStatus] = useState<SpotifyStatus | null>(null)
  const [nowPlaying, setNowPlaying] = useState<NowPlayingAdmin | null>(null)
  const [busy, setBusy] = useState<string | null>(null)
  const [loaded, setLoaded] = useState(false)

  const load = useCallback(async () => {
    const s = await apiFetch('/api/admin/jukebox/provider/status')
    if (s.ok) setStatus(s.data as SpotifyStatus)
    const np = await apiFetch('/api/admin/jukebox/provider/now-playing')
    if (np.ok) setNowPlaying((np.data as NowPlayingAdmin | null) ?? null)
    else setNowPlaying(null)
    setLoaded(true)
  }, [apiFetch])

  useEffect(() => {
    load()
    // Light polling so the active-device indicator stays fresh.
    const t = setInterval(load, 15_000)
    return () => clearInterval(t)
  }, [load])

  function connect() {
    // Hard nav so the OAuth round-trip works (we need the cookie set
    // by /connect to come back in /callback). Same-origin redirect.
    window.location.href = '/api/admin/jukebox/provider/spotify/connect'
  }

  async function disconnect() {
    if (!confirm('Disconnect the venue Spotify account?')) return
    setBusy('disconnect')
    const j = await apiFetch('/api/admin/jukebox/provider/spotify/disconnect', {
      method: 'POST',
      body: '{}',
    })
    setBusy(null)
    if (j.ok) {
      onAction('Disconnected.')
      load()
    } else {
      onAction(j.error?.message || 'Disconnect failed')
    }
  }

  async function refresh() {
    setBusy('refresh')
    const j = await apiFetch('/api/admin/jukebox/provider/refresh', {
      method: 'POST',
      body: '{}',
    })
    setBusy(null)
    if (j.ok) {
      onAction('Token refreshed.')
      load()
    } else {
      onAction(j.error?.message || 'Refresh failed')
    }
  }

  if (!loaded) {
    return <EmptyCard title="Loading…" sub="" />
  }

  if (!status?.connected) {
    return (
      <div className="card" style={{ padding: 20, display: 'flex', flexDirection: 'column', gap: 12 }}>
        <div style={{ fontWeight: 600, fontSize: 16 }}>Spotify not connected</div>
        <div style={{ color: 'var(--adm-text-muted)', fontSize: 13, lineHeight: 1.5 }}>
          Connect the venue's Spotify account so approved requests can be pushed
          into Spotify's playback queue. The account must be Premium and have
          an active playback device (a speaker or computer playing Spotify).
        </div>
        <div>
          <Button variant="success" onClick={connect}>Connect Spotify</Button>
        </div>
      </div>
    )
  }

  const noDevice = !status.active_device
  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
      <div className="card" style={{ padding: 18, display: 'flex', flexDirection: 'column', gap: 10 }}>
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 12 }}>
          <div>
            <div style={{ fontWeight: 600, fontSize: 15 }}>
              ● Connected as {status.provider_display_name || status.provider_user_id || 'unknown'}
            </div>
            <div style={{ color: 'var(--adm-text-muted)', fontSize: 12, marginTop: 4 }}>
              Scopes: {status.scopes.join(', ') || '(none)'} · Expires{' '}
              {status.expires_at ? new Date(status.expires_at).toLocaleString() : 'unknown'}
            </div>
          </div>
          <div style={{ display: 'flex', gap: 8 }}>
            <Button variant="secondary" disabled={busy === 'refresh'} onClick={refresh}>
              {busy === 'refresh' ? '…' : 'Refresh token'}
            </Button>
            <Button variant="danger" disabled={busy === 'disconnect'} onClick={disconnect}>
              {busy === 'disconnect' ? '…' : 'Disconnect'}
            </Button>
          </div>
        </div>
      </div>

      <div className="card" style={{ padding: 18, display: 'flex', flexDirection: 'column', gap: 10 }}>
        <div style={{ fontWeight: 600, fontSize: 14 }}>Active device</div>
        {noDevice ? (
          <div
            style={{
              padding: 12,
              borderRadius: 8,
              background: 'var(--adm-warning-bg)',
              border: '1px solid var(--adm-warning-border)',
              color: 'var(--adm-text)',
              fontSize: 13,
              lineHeight: 1.5,
            }}
          >
            ⚠ No active Spotify device. Open Spotify on the venue computer or
            speaker, hit play on anything for a second, then click Refresh below.
            Spotify queue adds will fail until a device is active.
            <div style={{ marginTop: 8 }}>
              <Button variant="secondary" onClick={load}>Refresh devices</Button>
            </div>
          </div>
        ) : (
          <div style={{ fontSize: 14 }}>
            <span style={{ color: 'var(--adm-success)' }}>●</span>{' '}
            <strong>{status.active_device!.name}</strong>
            {status.all_devices.length > 1 && (
              <span style={{ color: 'var(--adm-text-muted)', marginLeft: 8, fontSize: 12 }}>
                ({status.all_devices.length} devices total)
              </span>
            )}
          </div>
        )}
        {status.devices_error && (
          <div style={{ color: 'var(--adm-danger)', fontSize: 12 }}>
            Device list error: {status.devices_error}
          </div>
        )}
      </div>

      <div className="card" style={{ padding: 18, display: 'flex', flexDirection: 'column', gap: 10 }}>
        <div style={{ fontWeight: 600, fontSize: 14 }}>Now playing on Spotify</div>
        {nowPlaying ? (
          <div style={{ display: 'flex', gap: 12, alignItems: 'center' }}>
            {nowPlaying.track.album.artUrl && (
              // eslint-disable-next-line @next/next/no-img-element
              <img
                src={nowPlaying.track.album.artUrl}
                alt=""
                style={{ width: 56, height: 56, borderRadius: 6, objectFit: 'cover' }}
              />
            )}
            <div style={{ flex: 1, minWidth: 0 }}>
              <div style={{ fontWeight: 600, fontSize: 15, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                {nowPlaying.track.name}
              </div>
              <div style={{ color: 'var(--adm-text-muted)', fontSize: 13 }}>
                {nowPlaying.track.artists.map((a) => a.name).join(', ')}
              </div>
              <div style={{ color: 'var(--adm-text-muted)', fontSize: 11, marginTop: 4 }}>
                {nowPlaying.isPlaying ? '▶ Playing' : '❚❚ Paused'} ·{' '}
                {Math.floor(nowPlaying.progressMs / 1000)}s of{' '}
                {Math.floor(nowPlaying.track.durationMs / 1000)}s
              </div>
            </div>
          </div>
        ) : (
          <div style={{ color: 'var(--adm-text-muted)', fontSize: 13 }}>
            Nothing playing right now.
          </div>
        )}
      </div>
    </div>
  )
}

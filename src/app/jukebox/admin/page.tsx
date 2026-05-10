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

type Tab = 'pending' | 'queue' | 'history' | 'blocklist' | 'spotify' | 'settings'

export default function JukeboxAdminPage() {
  const router = useRouter()
  const [staff, setStaff] = useState<{ id: string; role: string } | null>(null)
  const [loading, setLoading] = useState(true)
  const [tab, setTab] = useState<Tab>('pending')
  const [toast, setToast] = useState('')
  const tokenRef = useRef<string | null>(null)

  const [settings, setSettings] = useState<Settings | null>(null)

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
      <div style={{ padding: 40, textAlign: 'center', color: 'var(--bbb-cream-light)', fontSize: 16 }}>
        Loading…
      </div>
    )
  }

  return (
    <div style={{ maxWidth: 960, margin: '0 auto', padding: '24px 24px 60px' }}>
      <div className="jukebox-admin-header">
        <header style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
            {settings?.logo_url && (
              // eslint-disable-next-line @next/next/no-img-element
              <img src={settings.logo_url} alt="Venue logo" style={{ height: 32, width: 'auto', borderRadius: 4 }} />
            )}
            <div>
              <div className="page-title">Jukebox</div>
              <div className="jukebox-admin-sub">
                Approve, queue, and tune the room.
              </div>
            </div>
          </div>
          <button
            className="btn-outline"
            style={{ borderColor: '#E8553A', color: '#E8553A' }}
            onClick={() => router.push('/dashboard')}
          >
            ← Dashboard
          </button>
        </header>
        <Tabs tab={tab} onChange={setTab} />
      </div>

      {tab === 'pending' && <PendingTab apiFetch={apiFetch} onAction={showToast} mode={settings?.mode ?? null} />}
      {tab === 'queue' && <QueueTab apiFetch={apiFetch} onAction={showToast} />}
      {tab === 'history' && <HistoryTab apiFetch={apiFetch} />}
      {tab === 'blocklist' && <BlocklistTab apiFetch={apiFetch} onAction={showToast} />}
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

      {toast && <div className="toast">{toast}</div>}
    </div>
  )
}

// ── Tabs ───────────────────────────────────────────────────────
function Tabs({ tab, onChange }: { tab: Tab; onChange: (t: Tab) => void }) {
  const items: { id: Tab; label: string }[] = [
    { id: 'pending', label: copy.admin.pendingTab },
    { id: 'queue', label: copy.admin.queueTab },
    { id: 'history', label: copy.admin.historyTab },
    { id: 'blocklist', label: copy.admin.blocklistTab },
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

// ── Pending ────────────────────────────────────────────────────
function PendingTab({
  apiFetch,
  onAction,
  mode,
}: { apiFetch: (p: string, i?: RequestInit) => Promise<{ ok: boolean; data?: unknown; error?: { message: string } }>; onAction: (m: string) => void; mode: Settings['mode'] | null }) {
  const [rows, setRows] = useState<ReqRow[]>([])
  const [busy, setBusy] = useState<string | null>(null)

  const load = useCallback(async () => {
    const j = await apiFetch('/api/admin/jukebox/requests?status=pending')
    if (j.ok) setRows((j.data as { requests: ReqRow[] }).requests)
  }, [apiFetch])

  useEffect(() => {
    load()
    const t = setInterval(load, 7_000)
    return () => clearInterval(t)
  }, [load])

  async function act(id: string, action: 'approve' | 'reject') {
    setBusy(id + ':' + action)
    const j = await apiFetch(`/api/admin/jukebox/requests/${id}/${action}`, { method: 'POST', body: '{}' })
    setBusy(null)
    if (j.ok) {
      onAction(action === 'approve' ? 'Approved' : 'Rejected')
      setRows((r) => r.filter((x) => x.id !== id))
    } else {
      onAction(j.error?.message || 'Action failed')
    }
  }

  async function blockAndReject(row: ReqRow, type: 'track' | 'artist') {
    const providerId = type === 'track' ? row.provider_track_id : row.artist_ids?.[0]
    const name = type === 'track' ? row.track_name : row.artist_name
    if (!providerId) return
    await apiFetch('/api/admin/jukebox/blocklist', {
      method: 'POST',
      body: JSON.stringify({ type, provider_id: providerId, name, reason: 'blocked from pending' }),
    })
    await act(row.id, 'reject')
  }

  if (rows.length === 0) {
    const sub = mode === 'autopilot'
      ? 'Autopilot is on — guest requests go straight to Up Next without needing your approval.'
      : 'Approved requests show up under Up Next.'
    return <EmptyCard title="Nothing pending." sub={sub} />
  }

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
      {rows.map((r) => (
        <RowCard key={r.id} row={r}>
          <Button variant="secondary" disabled={!!busy} onClick={() => blockAndReject(r, 'track')}>
            {copy.admin.blockTrack}
          </Button>
          <Button variant="secondary" disabled={!!busy} onClick={() => blockAndReject(r, 'artist')}>
            {copy.admin.blockArtist}
          </Button>
          <Button variant="danger" disabled={!!busy} onClick={() => act(r.id, 'reject')}>
            {busy === r.id + ':reject' ? '…' : copy.admin.reject}
          </Button>
          <Button variant="success" disabled={!!busy} onClick={() => act(r.id, 'approve')}>
            {busy === r.id + ':approve' ? '…' : copy.admin.approve}
          </Button>
        </RowCard>
      ))}
    </div>
  )
}

// ── Queue ──────────────────────────────────────────────────────
function QueueTab({
  apiFetch,
  onAction,
}: { apiFetch: (p: string, i?: RequestInit) => Promise<{ ok: boolean; data?: unknown; error?: { message: string } }>; onAction: (m: string) => void }) {
  const [rows, setRows] = useState<ReqRow[]>([])
  const [busy, setBusy] = useState<string | null>(null)

  const load = useCallback(async () => {
    const j = await apiFetch('/api/admin/jukebox/requests?status=approved,queued')
    if (j.ok) setRows((j.data as { requests: ReqRow[] }).requests)
  }, [apiFetch])

  useEffect(() => {
    load()
    const t = setInterval(load, 7_000)
    return () => clearInterval(t)
  }, [load])

  async function act(id: string, action: 'remove' | 'skip' | 'mark-played' | 'hide-nickname') {
    setBusy(id + ':' + action)
    const j = await apiFetch(`/api/admin/jukebox/requests/${id}/${action}`, { method: 'POST', body: '{}' })
    setBusy(null)
    if (j.ok) {
      onAction(action.replace('-', ' '))
      if (action !== 'hide-nickname') setRows((r) => r.filter((x) => x.id !== id))
      else load()
    } else {
      onAction(j.error?.message || 'Action failed')
    }
  }

  async function addToSpotify(id: string) {
    setBusy(id + ':spotify')
    const j = await apiFetch(`/api/admin/jukebox/requests/${id}/add-to-provider-queue`, {
      method: 'POST',
      body: '{}',
    })
    setBusy(null)
    if (j.ok) {
      onAction('Added to Spotify queue')
      // Reload so the row's status flips to 'queued' and the position recomputes.
      load()
    } else {
      const code = (j.error as { code?: string } | undefined)?.code || ''
      const friendly =
        code === 'no_active_device'
          ? 'No active Spotify device. Open Spotify and hit play, then try again.'
          : code === 'token_invalid' || code === 'token_expired'
            ? 'Spotify connection expired. Reconnect on the Spotify tab.'
            : code === 'not_premium'
              ? 'Connected Spotify account is not Premium.'
              : code === 'rate_limited'
                ? 'Spotify is throttling — try again in a moment.'
                : j.error?.message || 'Add to Spotify failed'
      onAction(friendly)
    }
  }

  if (rows.length === 0) {
    return <EmptyCard title="Queue is empty." sub="Approved and queued requests appear here in order." />
  }

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
      {rows.map((r, i) => (
        <RowCard key={r.id} row={r} position={i + 1}>
          <Button variant="secondary" disabled={!!busy} onClick={() => act(r.id, 'hide-nickname')}>
            {copy.admin.hideName}
          </Button>
          <Button variant="danger" disabled={!!busy} onClick={() => act(r.id, 'skip')}>
            {copy.admin.skip}
          </Button>
          <Button variant="danger" disabled={!!busy} onClick={() => act(r.id, 'remove')}>
            {copy.admin.remove}
          </Button>
          {r.status === 'queued' || r.provider_queue_status === 'queued' ? (
            <span className="badge badge-green" style={{ alignSelf: 'center', fontSize: 11 }}>✓ Queued</span>
          ) : r.status === 'approved' ? (
            <Button
              variant="secondary"
              disabled={!!busy}
              onClick={() => addToSpotify(r.id)}
              title="Push this song into the venue's Spotify queue"
            >
              {busy === r.id + ':spotify' ? '…' : copy.admin.addToSpotify}
            </Button>
          ) : null}
          <Button variant="success" disabled={!!busy} onClick={() => act(r.id, 'mark-played')}>
            {copy.admin.markPlayed}
          </Button>
        </RowCard>
      ))}
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
          <div style={{ width: 44, height: 44, flexShrink: 0, borderRadius: 6, overflow: 'hidden', background: 'var(--bg-input)' }}>
            {r.album_art_url
              // eslint-disable-next-line @next/next/no-img-element
              ? <img src={r.album_art_url} alt="" width={44} height={44} style={{ display: 'block', objectFit: 'cover' }} />
              : null}
          </div>
          <div style={{ flex: 1, minWidth: 0 }}>
            <div style={{ fontSize: 14, fontWeight: 600, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
              {r.track_name}{r.explicit ? <span className="badge badge-gray" style={{ marginLeft: 6, fontSize: 10 }}>E</span> : null}
            </div>
            <div style={{ fontSize: 12, color: 'var(--text-secondary)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
              {r.artist_name}
              {r.requested_by && !r.requested_by_hidden && (
                <span style={{ color: 'var(--text-muted)' }}> · {r.requested_by}</span>
              )}
            </div>
          </div>
          <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'flex-end', gap: 4, flexShrink: 0 }}>
            <span className={`badge ${badgeFor(r.status)}`}>{r.status}</span>
            <span style={{ fontSize: 11, color: 'var(--text-muted)' }}>
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
              <tr style={{ background: 'var(--bg-subtle)' }}>
                <Th>Type</Th><Th>Name</Th><Th>Spotify ID</Th><Th>Added</Th><Th></Th>
              </tr>
            </thead>
            <tbody>
              {rows.map((r) => (
                <tr key={r.id} style={{ borderTop: '1px solid var(--border)' }}>
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
        <div style={{ fontSize: 12, color: 'var(--text-muted)', marginBottom: 12 }}>
          Substring match — e.g. &ldquo;metal&rdquo; blocks &ldquo;death metal&rdquo;, &ldquo;heavy metal&rdquo;, etc. Case-insensitive. Genres come from Spotify&apos;s artist data. Leave empty to allow all genres.
        </div>
        {genreLoaded && (
          <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6, marginBottom: 12 }}>
            {blockedGenres.length === 0 && (
              <span style={{ fontSize: 13, color: 'var(--text-muted)' }}>No genres blocked.</span>
            )}
            {blockedGenres.map((g) => (
              <span
                key={g}
                style={{
                  display: 'inline-flex', alignItems: 'center', gap: 6,
                  padding: '4px 10px', borderRadius: 100,
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
    const j = await apiFetch('/api/admin/jukebox/settings', {
      method: 'PATCH',
      body: JSON.stringify(patchBody),
    })
    setSaving(false)
    if (j.ok) { setSettings(j.data as Settings); onAction('Saved') }
    else onAction(j.error?.message || 'Save failed')
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
        <div style={{ display: 'flex', flexDirection: 'column', gap: 20 }}>
          <div style={{ display: 'flex', gap: 14, alignItems: 'flex-start' }}>
            <Toggle on={s.is_active} onChange={(v) => patch({ is_active: v })} disabled={saving} />
            <div>
              <div style={{ fontWeight: 700, fontSize: 14, color: 'var(--text)' }}>
                Jukebox{' '}
                <span style={{ color: s.is_active ? '#16a34a' : '#dc2626', fontWeight: 600 }}>
                  {s.is_active ? 'Active' : 'Paused'}
                </span>
              </div>
              <div style={{ fontSize: 12, color: 'var(--text-muted)', marginTop: 3, lineHeight: 1.5, maxWidth: 420 }}>
                When paused, guests can see the queue but can&apos;t request anything.
              </div>
            </div>
          </div>

          <div style={{ display: 'flex', gap: 14, alignItems: 'flex-start', opacity: s.is_active ? 1 : 0.4 }}>
            <Toggle
              on={s.mode === 'approval'}
              onChange={(v) => patch({ is_active: true, mode: v ? 'approval' : 'autopilot' })}
              disabled={saving || !s.is_active}
            />
            <div>
              <div style={{ fontWeight: 700, fontSize: 14, color: 'var(--text)' }}>
                {s.mode === 'approval' ? 'Staff approval required' : 'Autopilot'}
              </div>
              <div style={{ fontSize: 12, color: 'var(--text-muted)', marginTop: 3, lineHeight: 1.5, maxWidth: 420 }}>
                {s.mode === 'approval'
                  ? 'Each request lands in the Pending tab. You manually approve or reject before it joins the queue.'
                  : 'Guest requests go straight to the Spotify queue automatically. No staff input needed.'}
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
        <div style={{ marginTop: 14, display: 'flex', gap: 10, alignItems: 'center' }}>
          <ToggleChip on={s.allow_explicit} label="Allow explicit" onClick={() => patch({ allow_explicit: !s.allow_explicit })} disabled={saving} />
        </div>
      </Card>

      <Card>
        <div className="section-title" style={{ marginBottom: 12 }}>Display URL</div>
        <div style={{ fontSize: 12, color: 'var(--text-muted)', marginBottom: 6 }}>
          Open this on the venue TV/kiosk. Rotate the token to invalidate old links.
        </div>
        <div style={{ display: 'flex', gap: 8 }}>
          <input className="input" readOnly value={displayUrl} style={{ fontFamily: 'monospace', fontSize: 12 }} />
          <Button variant="secondary" onClick={() => navigator.clipboard?.writeText(displayUrl).then(() => onAction('Copied'))}>Copy</Button>
          <Button variant="danger" onClick={rotateToken}>{copy.admin.rotateDisplayToken}</Button>
        </div>
      </Card>

      <Card>
        <div className="section-title" style={{ marginBottom: 4 }}>Display info</div>
        <div style={{ fontSize: 12, color: 'var(--text-muted)', marginBottom: 12 }}>
          WiFi credentials shown on the kiosk header strip. Leave blank to hide the pill.
        </div>
        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12 }}>
          <WifiField label="Network name (SSID)" field="wifi_network" settings={s} patch={patch} />
          <WifiField label="Password" field="wifi_password" settings={s} patch={patch} />
        </div>
      </Card>

      <Card>
        <div className="section-title" style={{ marginBottom: 4 }}>Branding</div>
        <div style={{ fontSize: 12, color: 'var(--text-muted)', marginBottom: 12 }}>
          Venue logo shown in the kiosk display header and admin page. PNG or JPG, max 500 KB. Leave blank to use the default BBB logo.
        </div>
        <LogoField
          logoUrl={s.logo_url ?? null}
          apiFetch={apiFetch}
          onAction={onAction}
          onSaved={(url) => setSettings({ ...s, logo_url: url })}
        />
      </Card>
    </div>
  )
}

// ── Bits ───────────────────────────────────────────────────────
function RowCard({
  row,
  position,
  children,
}: {
  row: ReqRow
  position?: number
  children: React.ReactNode
}) {
  return (
    <div className="card" style={{ display: 'flex', gap: 14, alignItems: 'center', padding: 12 }}>
      {typeof position === 'number' && (
        <div style={{ fontFamily: 'Bebas Neue, sans-serif', fontSize: 24, color: 'var(--accent)', width: 28, textAlign: 'center', flexShrink: 0 }}>
          {position}
        </div>
      )}
      <div style={{ width: 48, height: 48, flexShrink: 0, borderRadius: 6, overflow: 'hidden', background: 'var(--bg-input)' }}>
        {row.album_art_url ? (
          // eslint-disable-next-line @next/next/no-img-element
          <img src={row.album_art_url} alt="" width={48} height={48} style={{ display: 'block', objectFit: 'cover' }} />
        ) : null}
      </div>
      <div style={{ flex: 1, minWidth: 0 }}>
        <div style={{ fontSize: 14, fontWeight: 600, color: 'var(--text)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
          {row.track_name}{row.explicit ? <span className="badge badge-gray" style={{ marginLeft: 8, fontSize: 10 }}>E</span> : null}
        </div>
        <div style={{ fontSize: 12, color: 'var(--text-secondary)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
          {row.artist_name} · <span style={{ color: row.requested_by_hidden ? 'var(--text-muted)' : 'var(--text-secondary)' }}>{row.requested_by_hidden ? 'anonymous' : row.requested_by}</span>
        </div>
      </div>
      <div style={{ display: 'flex', gap: 6, flexShrink: 0, flexWrap: 'wrap', justifyContent: 'flex-end' }}>
        {children}
      </div>
    </div>
  )
}

function ToggleChip({ on, label, onClick, disabled }: { on: boolean; label: string; onClick: () => void; disabled?: boolean }) {
  return (
    <button
      onClick={onClick}
      disabled={disabled}
      style={{
        cursor: disabled ? 'not-allowed' : 'pointer',
        padding: '6px 14px',
        border: `1px solid ${on ? 'var(--accent)' : 'var(--border)'}`,
        background: on ? 'var(--accent)' : 'transparent',
        color: on ? '#fff' : 'var(--text-secondary)',
        borderRadius: 100,
        fontSize: 13, fontWeight: 500,
        opacity: disabled ? 0.6 : 1,
        fontFamily: 'inherit',
      }}
    >
      {label}
    </button>
  )
}

function NumberField({ label, help, value, onSave }: { label: string; help?: string; value: number; onSave: (n: number) => void }) {
  const [v, setV] = useState(String(value))
  useEffect(() => { setV(String(value)) }, [value])
  return (
    <div>
      <label className="label">{label}</label>
      {help && <div style={{ fontSize: 11, color: 'var(--text-muted)', marginBottom: 4, lineHeight: 1.4 }}>{help}</div>}
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

function Toggle({ on, onChange, disabled }: { on: boolean; onChange: (v: boolean) => void; disabled?: boolean }) {
  return (
    <div
      className={`admin-toggle-track ${on ? 'is-on' : ''} ${disabled ? 'is-disabled' : ''}`}
      onClick={() => !disabled && onChange(!on)}
      role="switch"
      aria-checked={on}
      tabIndex={disabled ? -1 : 0}
      onKeyDown={(e) => { if (!disabled && (e.key === 'Enter' || e.key === ' ')) { e.preventDefault(); onChange(!on) } }}
      style={{ userSelect: 'none' }}
    >
      <div className="admin-toggle-thumb" />
    </div>
  )
}

function WifiField({ label, field, settings, patch }: {
  label: string
  field: 'wifi_network' | 'wifi_password'
  settings: Settings
  patch: (b: Partial<Settings>) => void
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
        <img src={logoUrl} alt="Venue logo" style={{ height: 48, width: 'auto', borderRadius: 6, border: '1px solid var(--border)' }} />
      ) : (
        <div style={{ width: 48, height: 48, borderRadius: 6, background: 'var(--bg-input)', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 18, color: 'var(--text-muted)' }}>
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
        <button className="btn-outline" disabled={uploading} onClick={() => fileRef.current?.click()}>
          {uploading ? 'Uploading…' : logoUrl ? 'Replace logo' : 'Upload logo'}
        </button>
        {logoUrl && (
          <button className="btn-red" onClick={removeLogo}>Remove</button>
        )}
      </div>
    </div>
  )
}

function EmptyCard({ title, sub }: { title: string; sub: string }) {
  return (
    <div className="card" style={{ padding: 32, textAlign: 'center' }}>
      <div style={{ fontSize: 16, fontWeight: 600, color: 'var(--text)', marginBottom: 6 }}>{title}</div>
      <div style={{ fontSize: 13, color: 'var(--text-muted)' }}>{sub}</div>
    </div>
  )
}

// Skeleton placeholder shown while settings + presets are still in flight.
// Mimics the real layout (4 cards) so the click-to-Settings transition feels
// instant instead of "blank page → loading text → content".
function SettingsSkeleton() {
  const bar = (w: string, h = 14) => (
    <div style={{
      width: w, height: h, borderRadius: 4,
      background: 'rgba(0,0,0,0.08)',
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
  return <th style={{ textAlign: 'left', padding: '10px 14px', fontSize: 11, fontWeight: 600, letterSpacing: '0.04em', textTransform: 'uppercase', color: 'var(--text-muted)' }}>{children}</th>
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
        <div style={{ color: 'var(--text-muted)', fontSize: 13, lineHeight: 1.5 }}>
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
            <div style={{ color: 'var(--text-muted)', fontSize: 12, marginTop: 4 }}>
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
              background: 'rgba(255,180,80,0.12)',
              border: '1px solid rgba(255,180,80,0.4)',
              color: 'var(--text)',
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
            <span style={{ color: 'var(--bbb-bamboo)' }}>●</span>{' '}
            <strong>{status.active_device!.name}</strong>
            {status.all_devices.length > 1 && (
              <span style={{ color: 'var(--text-muted)', marginLeft: 8, fontSize: 12 }}>
                ({status.all_devices.length} devices total)
              </span>
            )}
          </div>
        )}
        {status.devices_error && (
          <div style={{ color: 'var(--bbb-flame)', fontSize: 12 }}>
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
              <div style={{ color: 'var(--text-muted)', fontSize: 13 }}>
                {nowPlaying.track.artists.map((a) => a.name).join(', ')}
              </div>
              <div style={{ color: 'var(--text-muted)', fontSize: 11, marginTop: 4 }}>
                {nowPlaying.isPlaying ? '▶ Playing' : '❚❚ Paused'} ·{' '}
                {Math.floor(nowPlaying.progressMs / 1000)}s of{' '}
                {Math.floor(nowPlaying.track.durationMs / 1000)}s
              </div>
            </div>
          </div>
        ) : (
          <div style={{ color: 'var(--text-muted)', fontSize: 13 }}>
            Nothing playing right now.
          </div>
        )}
      </div>
    </div>
  )
}

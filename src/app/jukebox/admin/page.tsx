'use client'
// ═══════════════════════════════════════════════════════════════
//  /jukebox/admin — Staff admin (auth required)
//  Tabs: Pending · Up Next · History · Blocklist · Settings
// ═══════════════════════════════════════════════════════════════

import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { useRouter } from 'next/navigation'
import { supabase } from '@/lib/supabase'
import { copy } from '@/lib/jukebox/copy'

interface Settings {
  id: string
  venue_id: string
  is_active: boolean
  mode: 'approval' | 'open' | 'locked' | 'event'
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
}

interface BlockEntry {
  id: string
  type: 'track' | 'artist'
  provider_id: string
  name: string
  reason: string | null
  created_at: string
}

type Tab = 'pending' | 'queue' | 'history' | 'blocklist' | 'settings'

export default function JukeboxAdminPage() {
  const router = useRouter()
  const [staff, setStaff] = useState<{ id: string; role: string } | null>(null)
  const [loading, setLoading] = useState(true)
  const [tab, setTab] = useState<Tab>('pending')
  const [toast, setToast] = useState('')
  const tokenRef = useRef<string | null>(null)

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
    const headers: Record<string, string> = {
      'Content-Type': 'application/json',
      ...(init?.headers as Record<string, string> | undefined),
    }
    if (tokenRef.current) headers.Authorization = `Bearer ${tokenRef.current}`
    const res = await fetch(path, { ...init, headers, cache: 'no-store' })
    return res.json()
  }, [])

  function showToast(msg: string) {
    setToast(msg)
    setTimeout(() => setToast(''), 2400)
  }

  if (loading) {
    return (
      <div style={{ padding: 40, textAlign: 'center', color: 'var(--text-muted)' }}>
        Loading…
      </div>
    )
  }

  return (
    <div style={{ maxWidth: 960, margin: '0 auto', padding: '24px 24px 60px' }}>
      <header style={{ display: 'flex', alignItems: 'baseline', justifyContent: 'space-between', marginBottom: 18 }}>
        <div>
          <div className="page-title">Jukebox</div>
          <div style={{ fontSize: 13, color: 'var(--text-muted)', marginTop: 4 }}>
            Approve, queue, and tune the room.
          </div>
        </div>
        <button className="btn-outline" onClick={() => router.push('/dashboard')}>← Dashboard</button>
      </header>

      <Tabs tab={tab} onChange={setTab} />

      {tab === 'pending' && <PendingTab apiFetch={apiFetch} onAction={showToast} />}
      {tab === 'queue' && <QueueTab apiFetch={apiFetch} onAction={showToast} />}
      {tab === 'history' && <HistoryTab apiFetch={apiFetch} />}
      {tab === 'blocklist' && <BlocklistTab apiFetch={apiFetch} onAction={showToast} />}
      {tab === 'settings' && <SettingsTab apiFetch={apiFetch} onAction={showToast} />}

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
    { id: 'settings', label: copy.admin.settingsTab },
  ]
  return (
    <nav style={{
      display: 'flex', gap: 6, marginBottom: 18,
      borderBottom: '1px solid var(--border)', paddingBottom: 6, overflowX: 'auto',
    }}>
      {items.map((i) => (
        <button
          key={i.id}
          onClick={() => onChange(i.id)}
          style={{
            border: 'none', cursor: 'pointer',
            padding: '8px 14px', borderRadius: 8,
            fontSize: 14,
            fontWeight: tab === i.id ? 600 : 500,
            color: tab === i.id ? 'var(--accent)' : 'var(--text-secondary)',
            background: tab === i.id ? 'var(--bg-active)' : 'transparent',
          }}
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
}: { apiFetch: (p: string, i?: RequestInit) => Promise<{ ok: boolean; data?: unknown; error?: { message: string } }>; onAction: (m: string) => void }) {
  const [rows, setRows] = useState<ReqRow[]>([])
  const [busy, setBusy] = useState<string | null>(null)

  const load = useCallback(async () => {
    const j = await apiFetch('/api/admin/jukebox/requests?status=pending')
    if (j.ok) setRows((j.data as { requests: ReqRow[] }).requests)
  }, [apiFetch])

  useEffect(() => { load() }, [load])

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
    return <EmptyCard title="Nothing pending." sub="Approved requests show up under Up Next." />
  }

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
      {rows.map((r) => (
        <RowCard key={r.id} row={r}>
          <button className="btn-outline" disabled={!!busy} onClick={() => blockAndReject(r, 'track')}>
            {copy.admin.blockTrack}
          </button>
          <button className="btn-outline" disabled={!!busy} onClick={() => blockAndReject(r, 'artist')}>
            {copy.admin.blockArtist}
          </button>
          <button className="btn-red" disabled={!!busy} onClick={() => act(r.id, 'reject')}>
            {busy === r.id + ':reject' ? '…' : copy.admin.reject}
          </button>
          <button className="btn-green" disabled={!!busy} onClick={() => act(r.id, 'approve')}>
            {busy === r.id + ':approve' ? '…' : copy.admin.approve}
          </button>
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

  useEffect(() => { load() }, [load])

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

  if (rows.length === 0) {
    return <EmptyCard title="Queue is empty." sub="Approved and queued requests appear here in order." />
  }

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
      {rows.map((r, i) => (
        <RowCard key={r.id} row={r} position={i + 1}>
          <button className="btn-outline" disabled={!!busy} onClick={() => act(r.id, 'hide-nickname')}>
            {copy.admin.hideName}
          </button>
          <button className="btn-outline" disabled={!!busy} onClick={() => act(r.id, 'skip')}>
            {copy.admin.skip}
          </button>
          <button className="btn-red" disabled={!!busy} onClick={() => act(r.id, 'remove')}>
            {copy.admin.remove}
          </button>
          <button className="btn-green" disabled={!!busy} onClick={() => act(r.id, 'mark-played')}>
            {copy.admin.markPlayed}
          </button>
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
    <div className="card" style={{ padding: 0, overflow: 'hidden' }}>
      <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 13 }}>
        <thead>
          <tr style={{ background: 'var(--bg-subtle)' }}>
            <Th>Status</Th><Th>Track</Th><Th>Artist</Th><Th>Nickname</Th><Th>When</Th>
          </tr>
        </thead>
        <tbody>
          {rows.map((r) => (
            <tr key={r.id} style={{ borderTop: '1px solid var(--border)' }}>
              <Td><span className={`badge ${badgeFor(r.status)}`}>{r.status}</span></Td>
              <Td>{r.track_name}</Td>
              <Td>{r.artist_name}</Td>
              <Td style={{ color: r.requested_by_hidden ? 'var(--text-muted)' : 'var(--text)' }}>
                {r.requested_by_hidden ? 'anonymous' : r.requested_by}
              </Td>
              <Td>{new Date(r.played_at || r.created_at).toLocaleString()}</Td>
            </tr>
          ))}
        </tbody>
      </table>
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

  const load = useCallback(async () => {
    const j = await apiFetch('/api/admin/jukebox/blocklist')
    if (j.ok) setRows((j.data as { entries: BlockEntry[] }).entries)
  }, [apiFetch])
  useEffect(() => { load() }, [load])

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
          <button className="btn-accent" onClick={add}>Block</button>
        </div>
      </div>

      {rows.length === 0 ? (
        <EmptyCard title="Nothing blocked." sub="Block a track or artist from the Pending tab." />
      ) : (
        <div className="card" style={{ padding: 0, overflow: 'hidden' }}>
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
                  <Td><button className="btn-outline" onClick={() => remove(r.id)}>Unblock</button></Td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </>
  )
}

// ── Settings ───────────────────────────────────────────────────
function SettingsTab({
  apiFetch,
  onAction,
}: { apiFetch: (p: string, i?: RequestInit) => Promise<{ ok: boolean; data?: unknown; error?: { message: string } }>; onAction: (m: string) => void }) {
  const [s, setS] = useState<Settings | null>(null)
  const [saving, setSaving] = useState(false)

  const load = useCallback(async () => {
    const j = await apiFetch('/api/admin/jukebox/settings')
    if (j.ok) setS(j.data as Settings)
  }, [apiFetch])
  useEffect(() => { load() }, [load])

  async function patch(patchBody: Partial<Settings>) {
    setSaving(true)
    const j = await apiFetch('/api/admin/jukebox/settings', {
      method: 'PATCH',
      body: JSON.stringify(patchBody),
    })
    setSaving(false)
    if (j.ok) { setS(j.data as Settings); onAction('Saved') }
    else onAction(j.error?.message || 'Save failed')
  }

  async function rotateToken() {
    const j = await apiFetch('/api/admin/jukebox/settings/rotate-display-token', { method: 'POST', body: '{}' })
    if (j.ok) { onAction('Display token rotated'); load() }
    else onAction(j.error?.message || 'Rotate failed')
  }

  if (!s) return <div style={{ color: 'var(--text-muted)', padding: 16 }}>Loading…</div>

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
      <div className="card" style={{ padding: 18 }}>
        <div className="section-title" style={{ marginBottom: 12 }}>State</div>
        <div style={{ display: 'flex', gap: 10, marginBottom: 16, flexWrap: 'wrap' }}>
          <ToggleChip
            on={s.is_active}
            label={s.is_active ? copy.admin.statusActive : copy.admin.statusPaused}
            onClick={() => patch({ is_active: !s.is_active })}
            disabled={saving}
          />
          {(['approval', 'open', 'locked'] as const).map((m) => (
            <ToggleChip
              key={m}
              on={s.mode === m}
              label={m.charAt(0).toUpperCase() + m.slice(1)}
              onClick={() => patch({ mode: m })}
              disabled={saving}
            />
          ))}
        </div>
      </div>

      <div className="card" style={{ padding: 18 }}>
        <div className="section-title" style={{ marginBottom: 12 }}>Cooldowns &amp; rules</div>
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(2, 1fr)', gap: 12 }}>
          <NumberField label="Guest cooldown (min)" value={s.guest_cooldown_minutes} onSave={(v) => patch({ guest_cooldown_minutes: v })} />
          <NumberField label="Member cooldown (min)" value={s.member_cooldown_minutes} onSave={(v) => patch({ member_cooldown_minutes: v })} />
          <NumberField label="Max song length (s)" value={s.max_song_length_seconds} onSave={(v) => patch({ max_song_length_seconds: v })} />
          <NumberField label="Duplicate window (min)" value={s.duplicate_cooldown_minutes} onSave={(v) => patch({ duplicate_cooldown_minutes: v })} />
          <NumberField label="Same-artist window (min)" value={s.same_artist_cooldown_minutes} onSave={(v) => patch({ same_artist_cooldown_minutes: v })} />
          <NumberField label="Max queue length" value={s.max_queue_length} onSave={(v) => patch({ max_queue_length: v })} />
          <NumberField label="Pending TTL (min)" value={s.pending_request_ttl_minutes} onSave={(v) => patch({ pending_request_ttl_minutes: v })} />
        </div>
        <div style={{ marginTop: 14, display: 'flex', gap: 10, alignItems: 'center' }}>
          <ToggleChip on={s.allow_explicit} label="Allow explicit" onClick={() => patch({ allow_explicit: !s.allow_explicit })} disabled={saving} />
          <ToggleChip on={s.auto_add_to_provider} label="Auto-add to Spotify (Phase 2)" onClick={() => patch({ auto_add_to_provider: !s.auto_add_to_provider })} disabled={saving} />
        </div>
      </div>

      <div className="card" style={{ padding: 18 }}>
        <div className="section-title" style={{ marginBottom: 12 }}>Display URL</div>
        <div style={{ fontSize: 12, color: 'var(--text-muted)', marginBottom: 6 }}>
          Open this on the venue TV/kiosk. Rotate the token to invalidate old links.
        </div>
        <div style={{ display: 'flex', gap: 8 }}>
          <input className="input" readOnly value={displayUrl} style={{ fontFamily: 'monospace', fontSize: 12 }} />
          <button className="btn-outline" onClick={() => navigator.clipboard?.writeText(displayUrl).then(() => onAction('Copied'))}>Copy</button>
          <button className="btn-red" onClick={rotateToken}>{copy.admin.rotateDisplayToken}</button>
        </div>
      </div>
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

function NumberField({ label, value, onSave }: { label: string; value: number; onSave: (n: number) => void }) {
  const [v, setV] = useState(String(value))
  useEffect(() => { setV(String(value)) }, [value])
  return (
    <div>
      <label className="label">{label}</label>
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

function EmptyCard({ title, sub }: { title: string; sub: string }) {
  return (
    <div className="card" style={{ padding: 32, textAlign: 'center' }}>
      <div style={{ fontSize: 16, fontWeight: 600, color: 'var(--text)', marginBottom: 6 }}>{title}</div>
      <div style={{ fontSize: 13, color: 'var(--text-muted)' }}>{sub}</div>
    </div>
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

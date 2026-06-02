'use client'
import { useEffect, useState } from 'react'
import { useSearchParams } from 'next/navigation'
import { ops, vnd, canLockPeriods, type StaffRole } from '@/lib/ops/api'
import { supabase } from '@/lib/supabase'

type Conn = {
  square_merchant_id: string
  environment: string
  expires_at: string
  created_at: string
}
type Loc = { square_location_id: string; name: string; is_default: boolean; active: boolean }
type SyncLog = {
  id: string; kind: string; status: string;
  started_at: string; finished_at: string | null;
  items_synced: number; items_failed: number; error_message: string | null;
  metadata: any
}

export default function SquarePage() {
  const search = useSearchParams()
  const [role, setRole] = useState<StaffRole | null>(null)
  const [conn, setConn] = useState<Conn | null>(null)
  const [locs, setLocs] = useState<Loc[]>([])
  const [logs, setLogs] = useState<SyncLog[]>([])
  const [days, setDays] = useState('7')
  const [syncing, setSyncing] = useState(false)
  const [msg, setMsg] = useState<string | null>(
    search.get('connected') ? '✓ Square connected.' :
    search.get('error') ? `Error: ${search.get('error')}` : null
  )

  useEffect(() => { load() }, [])

  async function load() {
    const { data: { session } } = await supabase.auth.getSession()

    const user = session?.user
    if (!user) return
    const { data: su } = await supabase.from('staff_users').select('role').eq('email', user.email).single()
    setRole(su?.role || 'staff')
    const [c, l, lg] = await Promise.all([
      ops().from('square_connections').select('square_merchant_id, environment, expires_at, created_at').maybeSingle(),
      ops().from('square_locations').select('*').order('is_default', { ascending: false }),
      ops().from('square_sync_log').select('*').order('started_at', { ascending: false }).limit(10),
    ])
    setConn(c.data as Conn)
    setLocs((l.data as Loc[]) || [])
    setLogs((lg.data as SyncLog[]) || [])
  }

  async function runSync() {
    setSyncing(true); setMsg(null)
    try {
      const r = await fetch(`/api/admin/ops/square/sync?days=${days}`, { method: 'POST' })
      const j = await r.json()
      setMsg(r.ok ? `✓ Synced ${j.items_synced} items across ${j.days} days (${j.orders} orders).` : `Error: ${j.error}`)
      await load()
    } catch (e: any) { setMsg('Error: ' + e.message) }
    setSyncing(false)
  }

  const canManage = role && canLockPeriods(role) // super_admin only for Square setup

  return (
    <div style={{ maxWidth: 720 }}>
      <h2 style={{ fontSize: 22, fontWeight: 600 }}>Square POS</h2>
      <div style={{ fontSize: 12, color: 'var(--text-muted, #999)', marginTop: 2, marginBottom: 24 }}>
        Connect Square to auto-sync sales, items, and tips into the dashboard.
      </div>

      {msg && (
        <div style={{ padding: 10, background: msg.startsWith('✓') ? '#e8f5e9' : '#ffebee', borderRadius: 6, fontSize: 13, marginBottom: 16 }}>{msg}</div>
      )}

      {!conn ? (
        <div style={{ padding: 20, border: '1px solid var(--border, #e5e5e5)', borderRadius: 8 }}>
          <div style={{ fontWeight: 600, marginBottom: 4 }}>Not connected</div>
          <div style={{ fontSize: 13, color: 'var(--text-muted, #666)', marginBottom: 16 }}>
            Click to authorize Square. You'll be redirected to Square's login, grant permissions, and bounce back here.
          </div>
          {canManage ? (
            <a href="/api/admin/ops/square/connect" style={btnPrimary as any}>Connect Square →</a>
          ) : (
            <div style={{ fontSize: 12, color: 'var(--text-muted, #999)' }}>Only Super Admin can connect Square.</div>
          )}
        </div>
      ) : (
        <>
          <div style={{ padding: 16, border: '1px solid var(--border, #e5e5e5)', borderRadius: 8, marginBottom: 16 }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 12, marginBottom: 8 }}>
              <div style={{ width: 8, height: 8, borderRadius: 4, background: '#548235' }} />
              <strong>Connected · {conn.environment}</strong>
              <span style={{ fontSize: 11, color: 'var(--text-muted, #999)' }}>merchant: {conn.square_merchant_id}</span>
            </div>
            <div style={{ fontSize: 12, color: 'var(--text-muted, #999)' }}>Token expires {new Date(conn.expires_at).toLocaleString()}</div>
          </div>

          <div style={{ padding: 16, border: '1px solid var(--border, #e5e5e5)', borderRadius: 8, marginBottom: 16 }}>
            <div style={{ fontWeight: 600, marginBottom: 8 }}>Locations</div>
            {locs.length === 0 && <div style={{ fontSize: 13, color: 'var(--text-muted, #999)' }}>No locations found.</div>}
            {locs.map(l => (
              <div key={l.square_location_id} style={{ display: 'flex', alignItems: 'center', gap: 8, fontSize: 13, padding: '6px 0' }}>
                {l.is_default && <span style={{ fontSize: 10, padding: '2px 6px', background: 'var(--accent, #e87830)', color: '#fff', borderRadius: 3 }}>DEFAULT</span>}
                <span>{l.name || l.square_location_id}</span>
                {!l.active && <span style={{ fontSize: 11, color: 'var(--text-muted, #999)' }}>(inactive)</span>}
              </div>
            ))}
          </div>

          <div style={{ padding: 16, border: '1px solid var(--border, #e5e5e5)', borderRadius: 8, marginBottom: 16 }}>
            <div style={{ fontWeight: 600, marginBottom: 8 }}>Sync now</div>
            <div style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
              <label style={{ fontSize: 12, color: 'var(--text-muted, #666)' }}>Last</label>
              <input type="number" min="1" max="31" value={days} onChange={e => setDays(e.target.value)} style={{ width: 60, padding: '6px 10px', fontSize: 13, border: '1px solid var(--border, #e5e5e5)', borderRadius: 6 }} />
              <label style={{ fontSize: 12, color: 'var(--text-muted, #666)' }}>days</label>
              <button onClick={runSync} disabled={syncing} style={{ ...btnPrimary, marginLeft: 8 }}>{syncing ? 'Syncing…' : 'Sync orders'}</button>
            </div>
            <div style={{ fontSize: 11, color: 'var(--text-muted, #999)', marginTop: 8 }}>
              Nightly auto-sync via Vercel Cron pulls the last 24 hours. Use this for backfills or manual catch-up.
            </div>
          </div>

          <div style={{ padding: 16, border: '1px solid var(--border, #e5e5e5)', borderRadius: 8 }}>
            <div style={{ fontWeight: 600, marginBottom: 8 }}>Sync history</div>
            {logs.length === 0 && <div style={{ fontSize: 13, color: 'var(--text-muted, #999)' }}>No syncs yet.</div>}
            <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 12 }}>
              {logs.map(l => (
                <tr key={l.id} style={{ borderTop: '1px solid var(--border, #eee)' }}>
                  <td style={{ padding: '6px 0', width: 80, color: 'var(--text-muted, #666)' }}>{l.kind}</td>
                  <td style={{ padding: '6px 0', width: 80 }}>
                    <span style={{
                      fontSize: 10, padding: '2px 6px', borderRadius: 3, color: '#fff',
                      background: l.status === 'success' ? '#548235' : l.status === 'partial' ? '#C65911' : l.status === 'failed' ? '#C00000' : '#666',
                    }}>{l.status}</span>
                  </td>
                  <td style={{ padding: '6px 0', color: 'var(--text-muted, #666)' }}>{new Date(l.started_at).toLocaleString()}</td>
                  <td style={{ padding: '6px 0', textAlign: 'right' }}>{l.items_synced} synced</td>
                  {l.items_failed > 0 && <td style={{ padding: '6px 0', textAlign: 'right', color: '#C00000' }}>{l.items_failed} failed</td>}
                </tr>
              ))}
            </table>
          </div>
        </>
      )}

      <div style={{ marginTop: 32, padding: 16, background: 'var(--bg-sidebar, #fafafa)', borderRadius: 8, fontSize: 12, color: 'var(--text-muted, #666)' }}>
        <strong style={{ color: 'var(--text, #333)' }}>Required env vars (Vercel):</strong>
        <pre style={{ fontFamily: 'monospace', marginTop: 6, fontSize: 11 }}>
SQUARE_APP_ID
SQUARE_APP_SECRET
SQUARE_ENVIRONMENT=production
SQUARE_OAUTH_REDIRECT=https://admin.bigbamboo.app/api/admin/ops/square/callback
CRON_SECRET=&lt;random string for Vercel Cron auth&gt;
        </pre>
      </div>
    </div>
  )
}

const btnPrimary = { padding: '10px 16px', background: 'var(--accent, #e87830)', color: '#fff', border: 'none', borderRadius: 6, fontSize: 14, fontWeight: 600, cursor: 'pointer', textDecoration: 'none', display: 'inline-block' }

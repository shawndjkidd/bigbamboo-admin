'use client'
import { useEffect, useState, useCallback } from 'react'
import { supabase } from '@/lib/supabase'

/*
 * ════════════════════════════════════════════════════════════════
 *  CLAIMS & CONTACTS
 *  View all game claims, contact info, statuses, and export data
 * ════════════════════════════════════════════════════════════════
 */

interface Claim {
  id: string
  claim_code: string
  source_code: string
  contact_type: string
  contact_value: string
  marketing_opt_in: boolean
  prize_type: string
  prize_label: string
  prize_item_ref: string
  discount_percent: number | null
  max_discount_vnd: number | null
  status: string
  issued_at: string
  expires_at: string
  redeemed_at: string | null
  redeemed_by: string | null
}

type FilterStatus = 'all' | 'active' | 'redeemed' | 'expired'
type FilterContact = 'all' | 'phone' | 'email' | 'anonymous'

export default function ClaimsPage() {
  const [claims, setClaims] = useState<Claim[]>([])
  const [loading, setLoading] = useState(true)
  const [search, setSearch] = useState('')
  const [filterStatus, setFilterStatus] = useState<FilterStatus>('all')
  const [filterContact, setFilterContact] = useState<FilterContact>('all')
  const [stats, setStats] = useState({ total: 0, active: 0, redeemed: 0, contacts: 0, optIns: 0 })
  const [page, setPage] = useState(0)
  const PAGE_SIZE = 50

  const loadClaims = useCallback(async () => {
    setLoading(true)
    let query = supabase
      .from('promo_claims')
      .select('*', { count: 'exact' })
      .eq('source_code', 'SCAN_TAP_WIN')
      .order('issued_at', { ascending: false })
      .range(page * PAGE_SIZE, (page + 1) * PAGE_SIZE - 1)

    if (filterStatus === 'active') query = query.eq('status', 'active')
    else if (filterStatus === 'redeemed') query = query.eq('status', 'redeemed')

    if (filterContact === 'phone') query = query.eq('contact_type', 'phone')
    else if (filterContact === 'email') query = query.eq('contact_type', 'email')
    else if (filterContact === 'anonymous') query = query.eq('contact_type', 'anonymous')

    if (search.trim()) {
      const s = search.trim()
      if (s.startsWith('BB-')) {
        query = query.ilike('claim_code', `%${s}%`)
      } else {
        query = query.or(`contact_value.ilike.%${s}%,prize_label.ilike.%${s}%`)
      }
    }

    const { data, count } = await query
    setClaims(data || [])

    // Load stats separately (unfiltered)
    const [allRes, redeemedRes, contactsRes, optInsRes] = await Promise.all([
      supabase.from('promo_claims').select('id', { count: 'exact', head: true }).eq('source_code', 'SCAN_TAP_WIN'),
      supabase.from('promo_claims').select('id', { count: 'exact', head: true }).eq('source_code', 'SCAN_TAP_WIN').eq('status', 'redeemed'),
      supabase.from('promo_claims').select('id', { count: 'exact', head: true }).eq('source_code', 'SCAN_TAP_WIN').neq('contact_type', 'anonymous'),
      supabase.from('promo_claims').select('id', { count: 'exact', head: true }).eq('source_code', 'SCAN_TAP_WIN').eq('marketing_opt_in', true),
    ])

    setStats({
      total: allRes.count || 0,
      active: (allRes.count || 0) - (redeemedRes.count || 0),
      redeemed: redeemedRes.count || 0,
      contacts: contactsRes.count || 0,
      optIns: optInsRes.count || 0,
    })

    setLoading(false)
  }, [page, filterStatus, filterContact, search])

  useEffect(() => { loadClaims() }, [loadClaims])

  // ─── Export CSV ───
  async function exportCSV() {
    // Fetch ALL claims (not paginated) for export
    const { data } = await supabase
      .from('promo_claims')
      .select('*')
      .eq('source_code', 'SCAN_TAP_WIN')
      .neq('contact_type', 'anonymous')
      .order('issued_at', { ascending: false })

    if (!data || data.length === 0) { alert('No contacts to export'); return }

    const headers = ['Contact Type', 'Contact', 'Marketing Opt-In', 'Prize', 'Status', 'Claim Code', 'Issued', 'Redeemed', 'Redeemed By']
    const rows = data.map(c => [
      c.contact_type,
      c.contact_value,
      c.marketing_opt_in ? 'Yes' : 'No',
      c.prize_label,
      c.status,
      c.claim_code,
      fmtDate(c.issued_at),
      c.redeemed_at ? fmtDate(c.redeemed_at) : '',
      c.redeemed_by || '',
    ])

    const csv = [headers, ...rows].map(r => r.map(v => `"${String(v).replace(/"/g, '""')}"`).join(',')).join('\n')
    const blob = new Blob([csv], { type: 'text/csv' })
    const url = URL.createObjectURL(blob)
    const a = document.createElement('a')
    a.href = url
    a.download = `bigbamboo-game-contacts-${new Date().toISOString().split('T')[0]}.csv`
    a.click()
    URL.revokeObjectURL(url)
  }

  // ─── Export Marketing Opt-Ins Only ───
  async function exportOptIns() {
    const { data } = await supabase
      .from('promo_claims')
      .select('*')
      .eq('source_code', 'SCAN_TAP_WIN')
      .eq('marketing_opt_in', true)
      .neq('contact_type', 'anonymous')
      .order('issued_at', { ascending: false })

    if (!data || data.length === 0) { alert('No opt-in contacts to export'); return }

    const headers = ['Contact Type', 'Contact', 'Prize', 'Issued']
    const rows = data.map(c => [c.contact_type, c.contact_value, c.prize_label, fmtDate(c.issued_at)])

    const csv = [headers, ...rows].map(r => r.map(v => `"${String(v).replace(/"/g, '""')}"`).join(',')).join('\n')
    const blob = new Blob([csv], { type: 'text/csv' })
    const url = URL.createObjectURL(blob)
    const a = document.createElement('a')
    a.href = url
    a.download = `bigbamboo-marketing-list-${new Date().toISOString().split('T')[0]}.csv`
    a.click()
    URL.revokeObjectURL(url)
  }

  function fmtDate(d: string) {
    return new Date(d).toLocaleDateString('en-US', { day: 'numeric', month: 'short', year: 'numeric', hour: '2-digit', minute: '2-digit' })
  }

  function getStatusBadge(c: Claim) {
    const expired = new Date(c.expires_at) < new Date()
    if (c.status === 'redeemed') return { label: 'Redeemed', color: '#00b14f', bg: 'rgba(0,177,79,0.1)', border: 'rgba(0,177,79,0.25)' }
    if (expired) return { label: 'Expired', color: '#ef4444', bg: 'rgba(239,68,68,0.1)', border: 'rgba(239,68,68,0.25)' }
    return { label: 'Active', color: '#e8a820', bg: 'rgba(232,168,32,0.1)', border: 'rgba(232,168,32,0.25)' }
  }

  if (loading && claims.length === 0) return (
    <div style={{ padding: 40, color: 'var(--text-muted)' }}>Loading claims...</div>
  )

  return (
    <div>
      {/* Header */}
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: 28, flexWrap: 'wrap', gap: 12 }}>
        <div>
          <div className="page-title">Claims & Contacts</div>
          <div style={{ fontSize: 13, color: 'var(--text-muted)', marginTop: 4 }}>
            All Scan.Tap.Win game claims and collected contacts
          </div>
        </div>
        <div style={{ display: 'flex', gap: 8 }}>
          <button onClick={exportOptIns} style={exportBtn}>
            Export Opt-Ins
          </button>
          <button onClick={exportCSV} style={{ ...exportBtn, background: 'var(--accent)', color: '#fff', border: 'none' }}>
            Export All CSV
          </button>
        </div>
      </div>

      {/* Stats */}
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(140px, 1fr))', gap: 14, marginBottom: 24 }}>
        {[
          { label: 'Total Claims', value: stats.total },
          { label: 'Active', value: stats.active },
          { label: 'Redeemed', value: stats.redeemed },
          { label: 'Contacts Captured', value: stats.contacts },
          { label: 'Marketing Opt-Ins', value: stats.optIns },
        ].map(s => (
          <div key={s.label} className="card kpi-card">
            <div className="kpi-label">{s.label}</div>
            <div className="kpi-value">{s.value}</div>
          </div>
        ))}
      </div>

      {/* Filters */}
      <div className="card" style={{ marginBottom: 20, padding: '14px 18px' }}>
        <div style={{ display: 'flex', gap: 12, flexWrap: 'wrap', alignItems: 'center' }}>
          <input
            type="text"
            value={search}
            onChange={e => { setSearch(e.target.value); setPage(0) }}
            placeholder="Search by contact, prize, or claim code..."
            style={searchInput}
          />
          <select value={filterStatus} onChange={e => { setFilterStatus(e.target.value as FilterStatus); setPage(0) }} style={selectStyle}>
            <option value="all">All statuses</option>
            <option value="active">Active</option>
            <option value="redeemed">Redeemed</option>
          </select>
          <select value={filterContact} onChange={e => { setFilterContact(e.target.value as FilterContact); setPage(0) }} style={selectStyle}>
            <option value="all">All contacts</option>
            <option value="phone">Phone</option>
            <option value="email">Email</option>
            <option value="anonymous">Anonymous</option>
          </select>
        </div>
      </div>

      {/* Claims Table */}
      <div className="card" style={{ padding: 0, overflow: 'hidden' }}>
        <div style={{ overflowX: 'auto' }}>
          <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 13 }}>
            <thead>
              <tr style={{ borderBottom: '1px solid var(--border)' }}>
                <th style={thStyle}>Contact</th>
                <th style={thStyle}>Prize</th>
                <th style={thStyle}>Status</th>
                <th style={thStyle}>Code</th>
                <th style={thStyle}>Issued</th>
                <th style={thStyle}>Redeemed</th>
                <th style={thStyle}>Opt-In</th>
              </tr>
            </thead>
            <tbody>
              {claims.length === 0 ? (
                <tr>
                  <td colSpan={7} style={{ padding: 40, textAlign: 'center', color: 'var(--text-muted)' }}>
                    {search ? 'No claims match your search' : 'No claims yet'}
                  </td>
                </tr>
              ) : claims.map(c => {
                const badge = getStatusBadge(c)
                return (
                  <tr key={c.id} style={{ borderBottom: '1px solid var(--border)' }}>
                    <td style={tdStyle}>
                      <div style={{ fontWeight: 500, color: 'var(--text)' }}>
                        {c.contact_type === 'anonymous' ? (
                          <span style={{ color: 'var(--text-muted)', fontStyle: 'italic' }}>Anonymous</span>
                        ) : c.contact_value}
                      </div>
                      <div style={{ fontSize: 11, color: 'var(--text-muted)', marginTop: 1 }}>
                        {c.contact_type === 'anonymous' ? '' : c.contact_type}
                      </div>
                    </td>
                    <td style={tdStyle}>
                      <span style={{ fontWeight: 500, color: 'var(--text)' }}>{c.prize_label}</span>
                      {c.discount_percent && (
                        <span style={{ fontSize: 11, color: 'var(--text-muted)', marginLeft: 4 }}>({c.discount_percent}%)</span>
                      )}
                    </td>
                    <td style={tdStyle}>
                      <span style={{
                        display: 'inline-block', padding: '2px 10px', borderRadius: 100, fontSize: 11,
                        fontWeight: 600, letterSpacing: '0.04em',
                        background: badge.bg, color: badge.color, border: `1px solid ${badge.border}`,
                      }}>
                        {badge.label}
                      </span>
                    </td>
                    <td style={tdStyle}>
                      <span style={{ fontFamily: 'DM Mono, monospace', fontSize: 12, color: 'var(--text-secondary)' }}>
                        {c.claim_code}
                      </span>
                    </td>
                    <td style={tdStyle}>
                      <span style={{ color: 'var(--text-secondary)', fontSize: 12 }}>{fmtDate(c.issued_at)}</span>
                    </td>
                    <td style={tdStyle}>
                      {c.redeemed_at ? (
                        <div>
                          <div style={{ color: 'var(--text-secondary)', fontSize: 12 }}>{fmtDate(c.redeemed_at)}</div>
                          {c.redeemed_by && <div style={{ fontSize: 11, color: 'var(--text-muted)' }}>by {c.redeemed_by}</div>}
                        </div>
                      ) : (
                        <span style={{ color: 'var(--text-muted)' }}>&mdash;</span>
                      )}
                    </td>
                    <td style={tdStyle}>
                      {c.marketing_opt_in ? (
                        <span style={{ color: '#00b14f', fontWeight: 600, fontSize: 12 }}>Yes</span>
                      ) : (
                        <span style={{ color: 'var(--text-muted)', fontSize: 12 }}>No</span>
                      )}
                    </td>
                  </tr>
                )
              })}
            </tbody>
          </table>
        </div>

        {/* Pagination */}
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '12px 18px', borderTop: '1px solid var(--border)' }}>
          <button onClick={() => setPage(p => Math.max(0, p - 1))} disabled={page === 0}
            style={{ ...pagBtn, opacity: page === 0 ? 0.3 : 1 }}>
            Previous
          </button>
          <span style={{ fontSize: 12, color: 'var(--text-muted)' }}>
            Page {page + 1} &middot; {claims.length} results
          </span>
          <button onClick={() => setPage(p => p + 1)} disabled={claims.length < PAGE_SIZE}
            style={{ ...pagBtn, opacity: claims.length < PAGE_SIZE ? 0.3 : 1 }}>
            Next
          </button>
        </div>
      </div>
    </div>
  )
}

// ─── Styles ───
const thStyle: React.CSSProperties = {
  textAlign: 'left', padding: '10px 14px', fontSize: 11, fontWeight: 600,
  color: 'var(--text-muted)', textTransform: 'uppercase', letterSpacing: '0.06em',
  whiteSpace: 'nowrap',
}
const tdStyle: React.CSSProperties = {
  padding: '10px 14px', verticalAlign: 'middle',
}
const searchInput: React.CSSProperties = {
  flex: 1, minWidth: 200, padding: '8px 12px', borderRadius: 8, fontSize: 13,
  border: '1px solid var(--border)', background: 'var(--bg)',
  color: 'var(--text)', outline: 'none', fontFamily: 'DM Sans, sans-serif',
}
const selectStyle: React.CSSProperties = {
  padding: '8px 12px', borderRadius: 8, fontSize: 13,
  border: '1px solid var(--border)', background: 'var(--bg)',
  color: 'var(--text)', outline: 'none', fontFamily: 'DM Sans, sans-serif',
  cursor: 'pointer',
}
const exportBtn: React.CSSProperties = {
  padding: '8px 16px', borderRadius: 8, fontSize: 12, fontWeight: 600,
  border: '1px solid var(--border)', background: 'transparent',
  color: 'var(--text-secondary)', cursor: 'pointer', fontFamily: 'DM Sans, sans-serif',
  whiteSpace: 'nowrap',
}
const pagBtn: React.CSSProperties = {
  padding: '6px 14px', borderRadius: 6, fontSize: 12, fontWeight: 500,
  border: '1px solid var(--border)', background: 'transparent',
  color: 'var(--text-secondary)', cursor: 'pointer', fontFamily: 'DM Sans, sans-serif',
}

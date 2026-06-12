'use client'
import { useEffect, useState } from 'react'
import { canManageRecipes, type StaffRole } from '@/lib/ops/api'
import { supabase } from '@/lib/supabase'

const EXAMPLES = [
  'Top 5 selling items in the last 30 days',
  'How much did we spend on food this month?',
  'Which ingredients are below their par level?',
  'Which menu items have the worst food cost %?',
  'Revenue, COGS and net income last month',
]

export default function AskPage() {
  const [role, setRole] = useState<StaffRole | null>(null)
  const [q, setQ] = useState('')
  const [busy, setBusy] = useState(false)
  const [answer, setAnswer] = useState('')
  const [sql, setSql] = useState('')
  const [rows, setRows] = useState<any[]>([])
  const [err, setErr] = useState('')
  const [showData, setShowData] = useState(false)
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    (async () => {
      const { data: { user } } = await supabase.auth.getUser()
      if (user) {
        const { data: su } = await supabase.from('staff_users').select('role').eq('email', user.email).maybeSingle()
        setRole((su?.role || 'staff') as StaffRole)
      }
      setLoading(false)
    })()
  }, [])

  async function ask(question?: string) {
    const qq = (question ?? q).trim(); if (!qq) return
    if (question) setQ(question)
    setBusy(true); setErr(''); setAnswer(''); setSql(''); setRows([]); setShowData(false)
    try {
      const { data: { session } } = await supabase.auth.getSession()
      const res = await fetch('/api/admin/ops/ask', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${session?.access_token || ''}` },
        body: JSON.stringify({ question: qq }),
      })
      const j = await res.json().catch(() => ({}))
      if (!res.ok) { setErr(j.error || 'Something went wrong'); if (j.sql) setSql(j.sql) }
      else { setAnswer(j.answer || ''); setSql(j.sql || ''); setRows(Array.isArray(j.rows) ? j.rows : []) }
    } catch (e: any) { setErr('Error: ' + (e?.message || e)) }
    setBusy(false)
  }

  if (loading) return <div style={{ color: 'var(--text-muted, #999)', fontSize: 14 }}>Loading…</div>
  if (!(role && canManageRecipes(role))) return <div style={{ color: 'var(--text-muted, #999)', fontSize: 14 }}>Ask-your-data is available to managers.</div>

  const cols = rows.length ? Object.keys(rows[0]) : []

  return (
    <div style={{ maxWidth: 760 }}>
      <h2 style={{ fontSize: 22, fontWeight: 600 }}>Ask your data</h2>
      <div style={{ fontSize: 13, color: 'var(--text-muted, #999)', marginTop: 2, marginBottom: 18 }}>
        Ask about sales, spend, stock, costs and P&amp;L in plain English. Read-only — it can&apos;t change anything.
      </div>

      <div style={{ display: 'flex', gap: 8, marginBottom: 12 }}>
        <input value={q} onChange={e => setQ(e.target.value)} onKeyDown={e => { if (e.key === 'Enter') ask() }} placeholder="e.g. Top sellers last week" style={{ ...inp, flex: 1 }} />
        <button onClick={() => ask()} disabled={busy} style={{ ...btnPrimary, opacity: busy ? 0.6 : 1 }}>{busy ? 'Thinking…' : 'Ask'}</button>
      </div>

      <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap', marginBottom: 20 }}>
        {EXAMPLES.map(ex => (
          <button key={ex} onClick={() => ask(ex)} disabled={busy} style={chip}>{ex}</button>
        ))}
      </div>

      {err && <div style={{ fontSize: 13, color: 'var(--burgundy, #7b2d3a)', marginBottom: 12 }}>{err}</div>}

      {answer && (
        <div style={{ fontSize: 15, lineHeight: 1.55, color: 'var(--text, #333)', background: 'var(--bg-sidebar, #fafafa)', border: '1px solid var(--border, #eee)', borderRadius: 10, padding: '14px 16px', whiteSpace: 'pre-wrap' }}>{answer}</div>
      )}

      {(sql || rows.length > 0) && (
        <div style={{ marginTop: 12 }}>
          <button onClick={() => setShowData(s => !s)} style={{ ...btnLink, color: 'var(--text-muted, #999)' }}>{showData ? '▲ Hide' : '▼ Show'} the query &amp; data</button>
          {showData && (
            <div style={{ marginTop: 8 }}>
              {sql && <pre style={{ fontSize: 12, background: 'var(--bg-sidebar, #fafafa)', border: '1px solid var(--border, #eee)', borderRadius: 8, padding: 12, overflowX: 'auto', color: 'var(--text-secondary, #555)' }}>{sql}</pre>}
              {rows.length > 0 && (
                <div style={{ overflowX: 'auto', marginTop: 8 }}>
                  <table style={{ borderCollapse: 'collapse', fontSize: 12, width: '100%' }}>
                    <thead><tr>{cols.map(c => <th key={c} style={dth}>{c}</th>)}</tr></thead>
                    <tbody>
                      {rows.slice(0, 50).map((r, i) => (
                        <tr key={i} style={{ borderTop: '1px solid var(--border, #eee)' }}>
                          {cols.map(c => <td key={c} style={dtd}>{r[c] == null ? '' : String(r[c])}</td>)}
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              )}
            </div>
          )}
        </div>
      )}
    </div>
  )
}

const inp = { padding: '10px 12px', fontSize: 14, border: '1px solid var(--border, #e5e5e5)', borderRadius: 8, background: 'var(--bg-input, #fff)', color: 'var(--text, #333)', boxSizing: 'border-box' as const }
const btnPrimary = { padding: '10px 18px', background: 'var(--accent, #e87830)', color: '#fff', border: 'none', borderRadius: 8, fontSize: 14, fontWeight: 600, cursor: 'pointer' }
const btnLink = { padding: '4px 0', background: 'transparent', border: 'none', cursor: 'pointer', fontSize: 12 }
const chip = { padding: '6px 12px', fontSize: 12, borderRadius: 100, border: '1px solid var(--border, #e5e5e5)', background: 'var(--bg-input, #fff)', color: 'var(--text-secondary, #555)', cursor: 'pointer' }
const dth = { padding: '6px 8px', textAlign: 'left' as const, fontWeight: 600, fontSize: 11, color: 'var(--text-muted, #999)', whiteSpace: 'nowrap' as const }
const dtd = { padding: '6px 8px', color: 'var(--text, #333)', whiteSpace: 'nowrap' as const }

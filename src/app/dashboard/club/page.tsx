'use client'
import { useEffect, useMemo, useState } from 'react'
import { supabase } from '@/lib/supabase'

// Drinks Club sign-ups from the public homepage.
//
// These are not customers. They are addresses somebody typed into a box, so nothing here
// is in the loyalty tables and nothing gets stamped. When the stamp card is real, work
// down this list and create the customer deliberately — "Mark done" records that you did,
// so the list can be worked through without keeping a second one somewhere else.

type Signup = {
  id: string
  email: string
  created_at: string
  source: string
  lang: string
  converted_at: string | null
  notes: string | null
}

export default function ClubSignupsPage() {
  const [rows, setRows] = useState<Signup[]>([])
  const [loading, setLoading] = useState(true)
  const [msg, setMsg] = useState('')
  const [q, setQ] = useState('')
  const [showDone, setShowDone] = useState(false)

  useEffect(() => { load() }, [])

  async function load() {
    setLoading(true)
    const { data, error } = await supabase
      .from('club_signups')
      .select('id, email, created_at, source, lang, converted_at, notes')
      .order('created_at', { ascending: false })
    setLoading(false)
    if (error) {
      // Until the migration is applied this table does not exist; say so plainly rather
      // than showing an empty list, which reads as "nobody has signed up".
      setMsg(
        /does not exist|schema cache/i.test(error.message)
          ? 'The club_signups table is not there yet. Apply supabase/migrations/20260913000000_club_signups.sql and reload.'
          : error.message
      )
      return
    }
    setMsg('')
    setRows((data || []) as Signup[])
  }

  async function toggleDone(r: Signup) {
    const converted_at = r.converted_at ? null : new Date().toISOString()
    const { error } = await supabase.from('club_signups').update({ converted_at }).eq('id', r.id)
    if (error) { setMsg(error.message); return }
    setRows(prev => prev.map(x => (x.id === r.id ? { ...x, converted_at } : x)))
  }

  const shown = useMemo(() => {
    const needle = q.trim().toLowerCase()
    return rows.filter(r => {
      if (!showDone && r.converted_at) return false
      return !needle || r.email.toLowerCase().includes(needle)
    })
  }, [rows, q, showDone])

  const waiting = rows.filter(r => !r.converted_at).length

  function copyAll() {
    const list = shown.map(r => r.email).join(', ')
    navigator.clipboard?.writeText(list).then(
      () => setMsg(`Copied ${shown.length} address${shown.length === 1 ? '' : 'es'}.`),
      () => setMsg('Could not copy — select the column by hand.')
    )
  }

  if (loading) return <div className="keg-wrap"><div className="card" style={{ padding: 24, color: 'var(--text-muted)' }}>Loading…</div></div>

  return (
    <div className="keg-wrap">
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', gap: 16, flexWrap: 'wrap' }}>
        <div>
          <div className="page-title">Drinks Club</div>
          <p style={{ color: 'var(--text-muted)', fontSize: 13, margin: '6px 0 0', maxWidth: 620, lineHeight: 1.55 }}>
            People who asked to hear when the stamp card launches. {waiting} waiting
            {rows.length !== waiting && `, ${rows.length - waiting} already done`}.
            The page promises no spam — this list is the whole promise.
          </p>
        </div>
        <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
          <button className="btn-outline" onClick={copyAll} disabled={!shown.length} style={{ fontSize: 13 }}>
            Copy addresses
          </button>
          <button className="btn-outline" onClick={load} style={{ fontSize: 13 }}>Refresh</button>
        </div>
      </div>

      {msg && <div className="card" style={{ padding: '10px 14px', marginTop: 14, fontSize: 13, color: 'var(--text-secondary)' }}>{msg}</div>}

      <div className="card" style={{ padding: 14, marginTop: 18, display: 'flex', gap: 10, flexWrap: 'wrap', alignItems: 'center' }}>
        <input
          className="input" value={q} onChange={e => setQ(e.target.value)}
          placeholder="Search an address" style={{ flex: 1, minWidth: 200 }}
        />
        <label style={{ display: 'flex', alignItems: 'center', gap: 7, fontSize: 13, color: 'var(--text-secondary)' }}>
          <input type="checkbox" checked={showDone} onChange={e => setShowDone(e.target.checked)} />
          Show ones already done
        </label>
      </div>

      <div className="card" style={{ padding: 0, marginTop: 18, overflowX: 'auto' }}>
        {shown.length === 0 ? (
          <div style={{ padding: 24, color: 'var(--text-muted)', fontSize: 14 }}>
            {rows.length === 0 ? 'No sign-ups yet.' : 'Nothing matches that.'}
          </div>
        ) : (
          <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 13.5 }}>
            <thead>
              <tr style={{ textAlign: 'left', color: 'var(--text-muted)', fontSize: 12 }}>
                <th style={{ padding: '10px 14px', fontWeight: 600 }}>Email</th>
                <th style={{ padding: '10px 14px', fontWeight: 600 }}>Signed up</th>
                <th style={{ padding: '10px 14px', fontWeight: 600 }}>Language</th>
                <th style={{ padding: '10px 14px', fontWeight: 600 }}>From</th>
                <th style={{ padding: '10px 14px', fontWeight: 600 }}></th>
              </tr>
            </thead>
            <tbody>
              {shown.map(r => (
                <tr key={r.id} style={{ borderTop: '1px solid var(--border-light)', opacity: r.converted_at ? 0.55 : 1 }}>
                  <td style={{ padding: '11px 14px', fontWeight: 600 }}>{r.email}</td>
                  <td style={{ padding: '11px 14px', color: 'var(--text-secondary)' }}>{fmt(r.created_at)}</td>
                  <td style={{ padding: '11px 14px', color: 'var(--text-secondary)' }}>{r.lang === 'vi' ? 'Tiếng Việt' : 'English'}</td>
                  <td style={{ padding: '11px 14px', color: 'var(--text-muted)' }}>{r.source}</td>
                  <td style={{ padding: '11px 14px', textAlign: 'right' }}>
                    <button className="btn-outline" style={{ fontSize: 12 }} onClick={() => toggleDone(r)}>
                      {r.converted_at ? 'Undo' : 'Mark done'}
                    </button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </div>
    </div>
  )
}

function fmt(iso: string) {
  const d = new Date(iso)
  if (isNaN(d.getTime())) return iso
  return d.toLocaleDateString('en-GB', { day: 'numeric', month: 'short', year: 'numeric' })
}

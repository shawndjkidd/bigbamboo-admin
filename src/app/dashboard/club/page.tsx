'use client'
import { useEffect, useMemo, useState } from 'react'
import { supabase } from '@/lib/supabase'

// Drinks Club sign-ups from the public homepage.
//
// These are not customers. They are details somebody typed into a box, so nothing here is
// in the loyalty tables and nothing gets stamped. When the stamp card is real, export this
// list and create the customers deliberately.
//
// The page promises we'll only ever message people about the Drinks Club. This list is
// that promise: one table to export, one table to delete from.

type Signup = {
  id: string
  created_at: string
  email: string
  zalo: string | null
  name: string | null
  source: string
  lang: string
}

export default function ClubSignupsPage() {
  const [rows, setRows] = useState<Signup[]>([])
  const [loading, setLoading] = useState(true)
  const [msg, setMsg] = useState('')
  const [q, setQ] = useState('')

  useEffect(() => { load() }, [])

  async function load() {
    setLoading(true)
    const { data, error } = await supabase
      .from('club_signups')
      .select('id, created_at, email, zalo, name, source, lang')
      .order('created_at', { ascending: false })
    setLoading(false)
    if (error) {
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

  const shown = useMemo(() => {
    const needle = q.trim().toLowerCase()
    if (!needle) return rows
    return rows.filter(r =>
      r.email.toLowerCase().includes(needle) ||
      (r.name || '').toLowerCase().includes(needle) ||
      (r.zalo || '').includes(needle)
    )
  }, [rows, q])

  const withZalo = rows.filter(r => r.zalo).length

  // Somebody asking to come off the list has to be able to come off it — that is the
  // other half of "we'll only ever message you about the Drinks Club". Also how a test
  // sign-up gets tidied away.
  async function remove(r: Signup) {
    if (!confirm(`Remove ${r.email} from the Drinks Club list?`)) return
    const { error } = await supabase.from('club_signups').delete().eq('id', r.id)
    if (error) { setMsg(error.message); return }
    setRows(prev => prev.filter(x => x.id !== r.id))
    setMsg(`Removed ${r.email}.`)
  }

  // A spreadsheet is what this list is for, so give people the file rather than a column
  // to drag-select. Excel opens UTF-8 CSV correctly only with a BOM, and Vietnamese names
  // are the whole reason that matters here.
  function exportCsv() {
    const cell = (v: string | null) => {
      const s = String(v ?? '')
      return /[",\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s
    }
    const header = ['Email', 'Name', 'Zalo', 'Language', 'Source', 'Signed up']
    const lines = [
      header.join(','),
      ...shown.map(r => [
        cell(r.email), cell(r.name), cell(r.zalo),
        cell(r.lang === 'vi' ? 'Vietnamese' : 'English'),
        cell(r.source), cell(new Date(r.created_at).toISOString().slice(0, 10)),
      ].join(',')),
    ]
    const blob = new Blob(['﻿' + lines.join('\r\n')], { type: 'text/csv;charset=utf-8' })
    const url = URL.createObjectURL(blob)
    const a = document.createElement('a')
    a.href = url
    a.download = `drinks-club-${new Date().toISOString().slice(0, 10)}.csv`
    document.body.appendChild(a)
    a.click()
    a.remove()
    URL.revokeObjectURL(url)
    setMsg(`Exported ${shown.length} sign-up${shown.length === 1 ? '' : 's'}.`)
  }

  if (loading) return <div className="keg-wrap"><div className="card" style={{ padding: 24, color: 'var(--text-muted)' }}>Loading…</div></div>

  return (
    <div className="keg-wrap">
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', gap: 16, flexWrap: 'wrap' }}>
        <div>
          <div className="page-title">Drinks Club</div>
          <p style={{ color: 'var(--text-muted)', fontSize: 13, margin: '6px 0 0', maxWidth: 620, lineHeight: 1.55 }}>
            {rows.length} {rows.length === 1 ? 'person has' : 'people have'} asked to hear when the stamp card
            launches{withZalo > 0 && `, ${withZalo} with a Zalo number`}. The homepage promises we’ll only
            message them about the Drinks Club — this list is that promise.
          </p>
        </div>
        <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
          <button className="btn-accent" onClick={exportCsv} disabled={!shown.length}>Export CSV</button>
          <button className="btn-outline" onClick={load} style={{ fontSize: 13 }}>Refresh</button>
        </div>
      </div>

      {msg && <div className="card" style={{ padding: '10px 14px', marginTop: 14, fontSize: 13, color: 'var(--text-secondary)' }}>{msg}</div>}

      {rows.length > 0 && (
        <div className="card" style={{ padding: 14, marginTop: 18 }}>
          <input
            className="input" value={q} onChange={e => setQ(e.target.value)}
            placeholder="Search a name, address or number" style={{ width: '100%' }}
          />
        </div>
      )}

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
                <th style={{ padding: '10px 14px', fontWeight: 600 }}>Name</th>
                <th style={{ padding: '10px 14px', fontWeight: 600 }}>Zalo</th>
                <th style={{ padding: '10px 14px', fontWeight: 600 }}>Language</th>
                <th style={{ padding: '10px 14px', fontWeight: 600 }}>Signed up</th>
                <th style={{ padding: '10px 14px', fontWeight: 600 }}></th>
              </tr>
            </thead>
            <tbody>
              {shown.map(r => (
                <tr key={r.id} style={{ borderTop: '1px solid var(--border-light)' }}>
                  <td style={{ padding: '11px 14px', fontWeight: 600 }}>{r.email}</td>
                  <td style={{ padding: '11px 14px', color: 'var(--text-secondary)' }}>{r.name || '—'}</td>
                  <td style={{ padding: '11px 14px', color: 'var(--text-secondary)' }}>{r.zalo || '—'}</td>
                  <td style={{ padding: '11px 14px', color: 'var(--text-secondary)' }}>{r.lang === 'vi' ? 'Tiếng Việt' : 'English'}</td>
                  <td style={{ padding: '11px 14px', color: 'var(--text-muted)' }}>{fmt(r.created_at)}</td>
                  <td style={{ padding: '11px 14px', textAlign: 'right' }}>
                    <button className="btn-outline" style={{ fontSize: 12 }} onClick={() => remove(r)}>Remove</button>
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

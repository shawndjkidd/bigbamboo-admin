'use client'
import { useEffect, useState, useCallback } from 'react'
import { supabase } from '@/lib/supabase'

/*
 * ════════════════════════════════════════════════════════════════
 *  GAME CONTROL PANEL
 *  Manage prizes, win rates, and game settings for Scan.Tap.Win
 * ════════════════════════════════════════════════════════════════
 */

interface Prize {
  id: string
  prize_id: string
  label: string
  emoji: string
  tier: 'big' | 'medium' | 'small'
  weight: number
  prize_type: string
  discount_pct: number | null
  max_discount: number | null
  active: boolean
}

interface DecayRow {
  big: number
  medium: number
  small: number
  none: number
}

const DEFAULT_DECAY: DecayRow[] = [
  { big: 5, medium: 25, small: 40, none: 30 },
  { big: 2, medium: 15, small: 33, none: 50 },
  { big: 0, medium: 5, small: 25, none: 70 },
  { big: 0, medium: 2, small: 13, none: 85 },
]

const TIER_COLORS: Record<string, string> = {
  big: '#e8a820',
  medium: '#3aa8a4',
  small: '#8a9ba8',
}

const TIER_LABELS: Record<string, string> = {
  big: 'Rare',
  medium: 'Medium',
  small: 'Common',
}

export default function GameControlPage() {
  const [prizes, setPrizes] = useState<Prize[]>([])
  const [decay, setDecay] = useState<DecayRow[]>(DEFAULT_DECAY)
  const [loading, setLoading] = useState(true)
  const [saving, setSaving] = useState(false)
  const [saveMsg, setSaveMsg] = useState('')
  const [editingPrize, setEditingPrize] = useState<Prize | null>(null)
  const [showAddForm, setShowAddForm] = useState(false)
  const [gameStats, setGameStats] = useState({ totalPlays: 0, totalWins: 0, activeClaims: 0 })

  // ─── Load data ───
  useEffect(() => {
    async function load() {
      const [prizesRes, configRes, playsRes, claimsRes] = await Promise.all([
        supabase.from('game_prizes').select('*').order('tier').order('weight', { ascending: false }),
        supabase.from('site_settings').select('value').eq('key', 'game_config').single(),
        supabase.from('game_plays').select('id, won', { count: 'exact', head: false }),
        supabase.from('promo_claims').select('id', { count: 'exact', head: true }).eq('source_code', 'SCAN_TAP_WIN').eq('status', 'active'),
      ])

      if (prizesRes.data) setPrizes(prizesRes.data)

      if (configRes.data?.value) {
        try {
          const cfg = JSON.parse(configRes.data.value)
          if (cfg.decay && Array.isArray(cfg.decay)) setDecay(cfg.decay)
        } catch (e) { console.error('Bad game_config JSON:', e) }
      }

      const plays = playsRes.data || []
      setGameStats({
        totalPlays: plays.length,
        totalWins: plays.filter((p: any) => p.won).length,
        activeClaims: claimsRes.count || 0,
      })

      setLoading(false)
    }
    load()
  }, [])

  // ─── Save decay to site_settings ───
  async function saveDecay() {
    setSaving(true)
    setSaveMsg('')
    const value = JSON.stringify({ decay })

    // Upsert into site_settings
    const { error: checkErr, data: existing } = await supabase
      .from('site_settings').select('key').eq('key', 'game_config').single()

    let error
    if (existing) {
      const res = await supabase.from('site_settings').update({ value }).eq('key', 'game_config')
      error = res.error
    } else {
      const res = await supabase.from('site_settings').insert({ key: 'game_config', value })
      error = res.error
    }

    setSaving(false)
    if (error) {
      setSaveMsg('Error saving: ' + error.message)
    } else {
      setSaveMsg('Win rates saved')
      setTimeout(() => setSaveMsg(''), 3000)
    }
  }

  // ─── Toggle prize active ───
  async function togglePrize(id: string, active: boolean) {
    const { error } = await supabase.from('game_prizes').update({ active: !active }).eq('id', id)
    if (!error) {
      setPrizes(prev => prev.map(p => p.id === id ? { ...p, active: !active } : p))
    }
  }

  // ─── Save edited prize ───
  async function savePrize(prize: Prize) {
    setSaving(true)
    const { id, ...data } = prize
    const { error } = await supabase.from('game_prizes').update(data).eq('id', id)
    setSaving(false)
    if (!error) {
      setPrizes(prev => prev.map(p => p.id === id ? prize : p))
      setEditingPrize(null)
      setSaveMsg('Prize updated')
      setTimeout(() => setSaveMsg(''), 3000)
    } else {
      setSaveMsg('Error: ' + error.message)
    }
  }

  // ─── Add new prize ───
  async function addPrize(prize: Omit<Prize, 'id'>) {
    setSaving(true)
    const { data, error } = await supabase.from('game_prizes').insert(prize).select().single()
    setSaving(false)
    if (!error && data) {
      setPrizes(prev => [...prev, data])
      setShowAddForm(false)
      setSaveMsg('Prize added')
      setTimeout(() => setSaveMsg(''), 3000)
    } else {
      setSaveMsg('Error: ' + (error?.message || 'Unknown'))
    }
  }

  // ─── Delete prize ───
  async function deletePrize(id: string) {
    if (!confirm('Delete this prize permanently?')) return
    const { error } = await supabase.from('game_prizes').delete().eq('id', id)
    if (!error) {
      setPrizes(prev => prev.filter(p => p.id !== id))
      setEditingPrize(null)
    }
  }

  // ─── Update decay row ───
  function updateDecay(rowIdx: number, field: keyof DecayRow, val: number) {
    setDecay(prev => {
      const next = [...prev]
      next[rowIdx] = { ...next[rowIdx], [field]: val }
      // Auto-calc "none" = 100 - big - medium - small
      if (field !== 'none') {
        const row = next[rowIdx]
        next[rowIdx] = { ...row, none: Math.max(0, 100 - row.big - row.medium - row.small) }
      }
      return next
    })
  }

  if (loading) return (
    <div style={{ padding: 40, color: 'var(--text-muted)', fontFamily: 'DM Sans' }}>Loading game data...</div>
  )

  const winRate = gameStats.totalPlays > 0
    ? Math.round((gameStats.totalWins / gameStats.totalPlays) * 100)
    : 0

  return (
    <div>
      {/* Header */}
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: 28 }}>
        <div>
          <div className="page-title">Game Control</div>
          <div style={{ fontSize: 13, color: 'var(--text-muted)', marginTop: 4 }}>
            Scan. Tap. Win. &mdash; manage prizes and win rates
          </div>
        </div>
        <a href="/play" target="_blank" rel="noopener noreferrer" style={{
          fontSize: 13, color: 'var(--accent)', textDecoration: 'none', fontWeight: 500,
        }}>
          Open game &#8599;
        </a>
      </div>

      {/* Stats bar */}
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(160px, 1fr))', gap: 14, marginBottom: 28 }}>
        {[
          { label: 'Total Plays', value: gameStats.totalPlays },
          { label: 'Total Wins', value: gameStats.totalWins },
          { label: 'Win Rate', value: winRate + '%' },
          { label: 'Active Claims', value: gameStats.activeClaims },
        ].map(s => (
          <div key={s.label} className="card kpi-card">
            <div className="kpi-label">{s.label}</div>
            <div className="kpi-value">{s.value}</div>
          </div>
        ))}
      </div>

      {/* Save message */}
      {saveMsg && (
        <div style={{
          padding: '10px 16px', marginBottom: 16, borderRadius: 8, fontSize: 13, fontWeight: 500,
          background: saveMsg.startsWith('Error') ? 'rgba(232,68,48,0.1)' : 'rgba(74,170,144,0.1)',
          color: saveMsg.startsWith('Error') ? '#e84430' : '#4aaa90',
          border: `1px solid ${saveMsg.startsWith('Error') ? 'rgba(232,68,48,0.2)' : 'rgba(74,170,144,0.2)'}`,
        }}>
          {saveMsg}
        </div>
      )}

      {/* ═══ PRIZES ═══ */}
      <div className="card" style={{ marginBottom: 24 }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 20 }}>
          <div>
            <div style={{ fontSize: 16, fontWeight: 600, color: 'var(--text)' }}>Prizes</div>
            <div style={{ fontSize: 12, color: 'var(--text-muted)', marginTop: 2 }}>
              {prizes.filter(p => p.active).length} active prizes on the wheel
            </div>
          </div>
          <button onClick={() => setShowAddForm(true)} style={btnStyle}>
            + Add Prize
          </button>
        </div>

        {/* Prize table */}
        <div style={{ overflowX: 'auto' }}>
          <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 13 }}>
            <thead>
              <tr style={{ borderBottom: '1px solid var(--border)' }}>
                <th style={thStyle}>Prize</th>
                <th style={thStyle}>Tier</th>
                <th style={thStyle}>Type</th>
                <th style={thStyle}>Weight</th>
                <th style={thStyle}>Active</th>
                <th style={{ ...thStyle, textAlign: 'right' }}>Actions</th>
              </tr>
            </thead>
            <tbody>
              {prizes.map(p => (
                <tr key={p.id} style={{
                  borderBottom: '1px solid var(--border)',
                  opacity: p.active ? 1 : 0.4,
                  transition: 'opacity 0.2s',
                }}>
                  <td style={tdStyle}>
                    <span style={{ fontWeight: 500, color: 'var(--text)' }}>{p.label}</span>
                    {p.prize_type === 'discount' && p.discount_pct && (
                      <span style={{ fontSize: 11, color: 'var(--text-muted)', marginLeft: 6 }}>
                        ({p.discount_pct}%)
                      </span>
                    )}
                  </td>
                  <td style={tdStyle}>
                    <span style={{
                      display: 'inline-block', padding: '2px 10px', borderRadius: 100, fontSize: 11,
                      fontWeight: 600, letterSpacing: '0.04em',
                      background: `${TIER_COLORS[p.tier]}18`,
                      color: TIER_COLORS[p.tier],
                      border: `1px solid ${TIER_COLORS[p.tier]}30`,
                    }}>
                      {TIER_LABELS[p.tier] || p.tier}
                    </span>
                  </td>
                  <td style={tdStyle}>
                    <span style={{ color: 'var(--text-secondary)', fontSize: 12 }}>
                      {p.prize_type === 'discount' ? 'Discount' : 'Free item'}
                    </span>
                  </td>
                  <td style={tdStyle}>
                    <span style={{ fontFamily: 'DM Mono, monospace', color: 'var(--text-secondary)' }}>
                      {p.weight}
                    </span>
                  </td>
                  <td style={tdStyle}>
                    <button
                      onClick={() => togglePrize(p.id, p.active)}
                      style={{
                        width: 40, height: 22, borderRadius: 11, border: 'none', cursor: 'pointer',
                        background: p.active ? '#4aaa90' : 'var(--border)',
                        position: 'relative', transition: 'background 0.2s',
                      }}
                    >
                      <div style={{
                        width: 16, height: 16, borderRadius: '50%', background: '#fff',
                        position: 'absolute', top: 3,
                        left: p.active ? 21 : 3,
                        transition: 'left 0.2s',
                        boxShadow: '0 1px 3px rgba(0,0,0,0.15)',
                      }} />
                    </button>
                  </td>
                  <td style={{ ...tdStyle, textAlign: 'right' }}>
                    <button onClick={() => setEditingPrize(p)} style={actionBtn}>Edit</button>
                    <button onClick={() => deletePrize(p.id)} style={{ ...actionBtn, color: '#e84430' }}>Delete</button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>

      {/* ═══ WIN RATES ═══ */}
      <div className="card" style={{ marginBottom: 24 }}>
        <div style={{ marginBottom: 20 }}>
          <div style={{ fontSize: 16, fontWeight: 600, color: 'var(--text)' }}>Win Rate Decay</div>
          <div style={{ fontSize: 12, color: 'var(--text-muted)', marginTop: 2 }}>
            Controls how likely players are to win on each consecutive play. &ldquo;No prize&rdquo; is calculated automatically.
          </div>
        </div>

        <div style={{ overflowX: 'auto' }}>
          <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 13 }}>
            <thead>
              <tr style={{ borderBottom: '1px solid var(--border)' }}>
                <th style={thStyle}>Play #</th>
                <th style={thStyle}>
                  <span style={{ color: TIER_COLORS.big }}>Rare %</span>
                </th>
                <th style={thStyle}>
                  <span style={{ color: TIER_COLORS.medium }}>Medium %</span>
                </th>
                <th style={thStyle}>
                  <span style={{ color: TIER_COLORS.small }}>Common %</span>
                </th>
                <th style={thStyle}>No Prize %</th>
                <th style={thStyle}>Win Rate</th>
              </tr>
            </thead>
            <tbody>
              {decay.map((row, i) => {
                const winPct = row.big + row.medium + row.small
                return (
                  <tr key={i} style={{ borderBottom: '1px solid var(--border)' }}>
                    <td style={tdStyle}>
                      <span style={{ fontWeight: 600, color: 'var(--text)' }}>
                        {i < 3 ? `${i + 1}${['st', 'nd', 'rd'][i]}` : `${i + 1}th+`}
                      </span>
                    </td>
                    <td style={tdStyle}>
                      <input type="number" min={0} max={100} value={row.big}
                        onChange={e => updateDecay(i, 'big', Number(e.target.value))}
                        style={numInput} />
                    </td>
                    <td style={tdStyle}>
                      <input type="number" min={0} max={100} value={row.medium}
                        onChange={e => updateDecay(i, 'medium', Number(e.target.value))}
                        style={numInput} />
                    </td>
                    <td style={tdStyle}>
                      <input type="number" min={0} max={100} value={row.small}
                        onChange={e => updateDecay(i, 'small', Number(e.target.value))}
                        style={numInput} />
                    </td>
                    <td style={tdStyle}>
                      <span style={{
                        fontFamily: 'DM Mono, monospace', fontWeight: 600,
                        color: row.none > 50 ? '#e84430' : 'var(--text-secondary)',
                      }}>
                        {row.none}%
                      </span>
                    </td>
                    <td style={tdStyle}>
                      <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                        <div style={{
                          width: 60, height: 6, borderRadius: 3, background: 'var(--border)',
                          overflow: 'hidden',
                        }}>
                          <div style={{
                            width: `${winPct}%`, height: '100%', borderRadius: 3,
                            background: winPct > 60 ? '#4aaa90' : winPct > 30 ? '#e8a820' : '#e84430',
                            transition: 'width 0.2s',
                          }} />
                        </div>
                        <span style={{
                          fontFamily: 'DM Mono, monospace', fontSize: 12, fontWeight: 600,
                          color: winPct > 60 ? '#4aaa90' : winPct > 30 ? '#e8a820' : '#e84430',
                        }}>
                          {winPct}%
                        </span>
                      </div>
                    </td>
                  </tr>
                )
              })}
            </tbody>
          </table>
        </div>

        <div style={{ marginTop: 16, display: 'flex', gap: 10, alignItems: 'center' }}>
          <button onClick={saveDecay} disabled={saving} style={btnStyle}>
            {saving ? 'Saving...' : 'Save Win Rates'}
          </button>
          <button onClick={() => setDecay(DEFAULT_DECAY)} style={btnGhostStyle}>
            Reset to defaults
          </button>
        </div>
      </div>

      {/* ═══ EDIT PRIZE MODAL ═══ */}
      {editingPrize && (
        <PrizeModal
          prize={editingPrize}
          onSave={savePrize}
          onClose={() => setEditingPrize(null)}
          saving={saving}
        />
      )}

      {/* ═══ ADD PRIZE MODAL ═══ */}
      {showAddForm && (
        <PrizeModal
          prize={null}
          onSave={(p) => addPrize(p as any)}
          onClose={() => setShowAddForm(false)}
          saving={saving}
        />
      )}
    </div>
  )
}

// ─── Prize Edit/Add Modal ───
function PrizeModal({ prize, onSave, onClose, saving }: {
  prize: Prize | null
  onSave: (p: any) => void
  onClose: () => void
  saving: boolean
}) {
  const isNew = !prize
  const [form, setForm] = useState({
    prize_id: prize?.prize_id || '',
    label: prize?.label || '',
    emoji: '',
    tier: prize?.tier || 'small',
    weight: prize?.weight || 10,
    prize_type: prize?.prize_type || 'item',
    discount_pct: prize?.discount_pct || null as number | null,
    max_discount: prize?.max_discount || null as number | null,
    active: prize?.active ?? true,
  })

  function handleSave() {
    if (!form.prize_id || !form.label) return
    if (isNew) {
      onSave(form)
    } else {
      onSave({ ...form, id: prize!.id })
    }
  }

  return (
    <div style={{
      position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.5)',
      display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 100,
    }} onClick={e => e.target === e.currentTarget && onClose()}>
      <div style={{
        background: 'var(--bg-card)', borderRadius: 16, padding: 28,
        maxWidth: 440, width: '90%', border: '1px solid var(--border)',
        boxShadow: '0 20px 60px rgba(0,0,0,0.3)',
      }}>
        <div style={{ fontSize: 18, fontWeight: 600, color: 'var(--text)', marginBottom: 20 }}>
          {isNew ? 'Add Prize' : 'Edit Prize'}
        </div>

        <div style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
          <FormField label="Prize ID (slug)" value={form.prize_id}
            onChange={v => setForm(f => ({ ...f, prize_id: v }))}
            placeholder="e.g. free_huda" disabled={!isNew} />

          <FormField label="Display Name" value={form.label}
            onChange={v => setForm(f => ({ ...f, label: v }))}
            placeholder="e.g. Free Huda Draft" />

          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 14 }}>
            <div>
              <label style={labelStyle}>Tier</label>
              <select value={form.tier}
                onChange={e => setForm(f => ({ ...f, tier: e.target.value as any }))}
                style={inputStyle}>
                <option value="big">Rare</option>
                <option value="medium">Medium</option>
                <option value="small">Common</option>
              </select>
            </div>
            <div>
              <label style={labelStyle}>Weight</label>
              <input type="number" min={1} max={100} value={form.weight}
                onChange={e => setForm(f => ({ ...f, weight: Number(e.target.value) }))}
                style={inputStyle} />
            </div>
          </div>

          <div>
            <label style={labelStyle}>Type</label>
            <select value={form.prize_type}
              onChange={e => setForm(f => ({ ...f, prize_type: e.target.value }))}
              style={inputStyle}>
              <option value="item">Free item</option>
              <option value="discount">Discount</option>
            </select>
          </div>

          {form.prize_type === 'discount' && (
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 14 }}>
              <FormField label="Discount %" value={String(form.discount_pct || '')}
                onChange={v => setForm(f => ({ ...f, discount_pct: v ? Number(v) : null }))}
                placeholder="e.g. 15" />
              <FormField label="Max discount (VND)" value={String(form.max_discount || '')}
                onChange={v => setForm(f => ({ ...f, max_discount: v ? Number(v) : null }))}
                placeholder="e.g. 200000" />
            </div>
          )}
        </div>

        <div style={{ display: 'flex', justifyContent: 'flex-end', gap: 10, marginTop: 24 }}>
          <button onClick={onClose} style={btnGhostStyle}>Cancel</button>
          <button onClick={handleSave} disabled={saving || !form.prize_id || !form.label}
            style={{ ...btnStyle, opacity: (!form.prize_id || !form.label) ? 0.5 : 1 }}>
            {saving ? 'Saving...' : isNew ? 'Add Prize' : 'Save Changes'}
          </button>
        </div>
      </div>
    </div>
  )
}

// ─── Form Field ───
function FormField({ label, value, onChange, placeholder, disabled }: {
  label: string; value: string; onChange: (v: string) => void; placeholder?: string; disabled?: boolean
}) {
  return (
    <div>
      <label style={labelStyle}>{label}</label>
      <input value={value} onChange={e => onChange(e.target.value)}
        placeholder={placeholder} disabled={disabled}
        style={{ ...inputStyle, opacity: disabled ? 0.5 : 1 }} />
    </div>
  )
}

// ─── Shared Styles ───
const thStyle: React.CSSProperties = {
  textAlign: 'left', padding: '8px 12px', fontSize: 11, fontWeight: 600,
  color: 'var(--text-muted)', textTransform: 'uppercase', letterSpacing: '0.06em',
}
const tdStyle: React.CSSProperties = {
  padding: '10px 12px', verticalAlign: 'middle',
}
const numInput: React.CSSProperties = {
  width: 60, padding: '6px 8px', borderRadius: 6, fontSize: 13,
  fontFamily: 'DM Mono, monospace', textAlign: 'center',
  border: '1px solid var(--border)', background: 'var(--bg)',
  color: 'var(--text)', outline: 'none',
}
const inputStyle: React.CSSProperties = {
  width: '100%', padding: '10px 12px', borderRadius: 8, fontSize: 13,
  border: '1px solid var(--border)', background: 'var(--bg)',
  color: 'var(--text)', outline: 'none', fontFamily: 'DM Sans, sans-serif',
  boxSizing: 'border-box',
}
const labelStyle: React.CSSProperties = {
  display: 'block', fontSize: 11, fontWeight: 600, color: 'var(--text-muted)',
  textTransform: 'uppercase', letterSpacing: '0.06em', marginBottom: 6,
}
const btnStyle: React.CSSProperties = {
  padding: '8px 18px', borderRadius: 8, fontSize: 13, fontWeight: 600,
  background: 'var(--accent)', color: '#fff', border: 'none',
  cursor: 'pointer', fontFamily: 'DM Sans, sans-serif',
}
const btnGhostStyle: React.CSSProperties = {
  padding: '8px 18px', borderRadius: 8, fontSize: 13, fontWeight: 500,
  background: 'transparent', color: 'var(--text-secondary)',
  border: '1px solid var(--border)', cursor: 'pointer',
  fontFamily: 'DM Sans, sans-serif',
}
const actionBtn: React.CSSProperties = {
  background: 'none', border: 'none', fontSize: 12, fontWeight: 500,
  color: 'var(--accent)', cursor: 'pointer', padding: '4px 8px',
  fontFamily: 'DM Sans, sans-serif',
}

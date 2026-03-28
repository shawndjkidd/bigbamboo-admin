'use client'
import { useEffect, useState } from 'react'
import { supabase } from '@/lib/supabase'

export default function LoyaltyPage() {
  const [search, setSearch] = useState('')
  const [members, setMembers] = useState<any[]>([])
  const [loading, setLoading] = useState(false)
  const [toast, setToast] = useState('')
  const [stampTarget, setStampTarget] = useState<string | null>(null)
  const [stampNote, setStampNote] = useState('')
  const [totalMembers, setTotalMembers] = useState(0)
  const [todayStamps, setTodayStamps] = useState(0)
  const [totalRewards, setTotalRewards] = useState(0)

  useEffect(() => {
    loadStats()
  }, [])

  async function loadStats() {
    const today = new Date().toISOString().split('T')[0]
    const [membersRes, stampsRes, rewardsRes] = await Promise.all([
      supabase.from('customers').select('id', { count: 'exact', head: true }),
      supabase.from('loyalty_stamps').select('id', { count: 'exact', head: true }).gte('created_at', today),
      supabase.from('loyalty_memberships').select('rewards_redeemed').gt('rewards_redeemed', 0),
    ])
    setTotalMembers(membersRes.count || 0)
    setTodayStamps(stampsRes.count || 0)
    setTotalRewards((rewardsRes.data || []).reduce((a: number, r: any) => a + (r.rewards_redeemed || 0), 0))
  }

  async function searchMembers(q: string) {
    if (!q.trim()) { setMembers([]); return }
    setLoading(true)
    const { data } = await supabase
      .from('customers')
      .select('*, loyalty_memberships(*)')
      .or(`email.ilike.%${q}%,name.ilike.%${q}%,phone.ilike.%${q}%`)
      .limit(10)
    setMembers(data || [])
    setLoading(false)
  }

  async function issueStamp(customerId: string, membershipId: string) {
    const { data: { user } } = await supabase.auth.getUser()
    const { data: staff } = await supabase.from('staff_users').select('id').eq('email', user?.email).single()
    await supabase.from('loyalty_stamps').insert({ membership_id: membershipId, issued_by: staff?.id, stamp_count: 1, note: stampNote })

    const membership = members.find(m => m.id === customerId)?.loyalty_memberships?.[0]
    if (membership) {
      const newStamps = (membership.current_stamps || 0) + 1
      const goal = membership.stamp_goal || 10
      if (newStamps >= goal) {
        await supabase.from('loyalty_memberships').update({ current_stamps: 0, lifetime_stamps: (membership.lifetime_stamps || 0) + newStamps, rewards_redeemed: (membership.rewards_redeemed || 0) + 1 }).eq('id', membershipId)
        showToast('Reward unlocked! Card reset.')
      } else {
        await supabase.from('loyalty_memberships').update({ current_stamps: newStamps, lifetime_stamps: (membership.lifetime_stamps || 0) + 1 }).eq('id', membershipId)
        showToast(`Stamp issued (${newStamps}/${goal})`)
      }
    }
    setStampTarget(null)
    setStampNote('')
    searchMembers(search)
    loadStats()
  }

  async function redeemReward(membershipId: string) {
    if (!confirm('Mark reward as redeemed and reset stamp count?')) return
    await supabase.from('loyalty_memberships').update({ current_stamps: 0, rewards_redeemed: supabase.rpc('increment', { row_id: membershipId }) }).eq('id', membershipId)
    showToast('Reward redeemed')
    searchMembers(search)
    loadStats()
  }

  function showToast(msg: string) { setToast(msg); setTimeout(() => setToast(''), 3000) }

  return (
    <div style={{ maxWidth: 800 }}>
      <div className="page-title" style={{ marginBottom: 6 }}>Drinks Club</div>
      <div style={{ fontSize: 14, color: 'var(--text-muted)', marginBottom: 28 }}>Search members, issue stamps & track rewards</div>

      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: 14, marginBottom: 28 }}>
        {[
          { label: 'Total Members', value: totalMembers },
          { label: 'Stamps Today', value: todayStamps },
          { label: 'Rewards Redeemed', value: totalRewards },
        ].map(s => (
          <div key={s.label} className="card kpi-card">
            <div className="kpi-label">{s.label}</div>
            <div className="kpi-value" style={{ color: 'var(--accent)' }}>{s.value}</div>
          </div>
        ))}
      </div>

      <div className="card" style={{ padding: 24 }}>
        <div className="section-title" style={{ marginBottom: 14 }}>Find Member</div>
        <input className="input" value={search} onChange={e => { setSearch(e.target.value); searchMembers(e.target.value) }} placeholder="Search by name, email or phone..." style={{ marginBottom: 20, fontSize: 15, padding: '12px 16px' }} />
        {loading && <div style={{ color: 'var(--text-muted)', fontSize: 14 }}>Searching...</div>}
        {members.map(member => {
          const membership = member.loyalty_memberships?.[0]
          const stamps = membership?.current_stamps || 0
          const goal = membership?.stamp_goal || 10
          const pct = Math.min(stamps / goal, 1)
          return (
            <div key={member.id} style={{ borderTop: '1px solid var(--border)', paddingTop: 18, marginTop: 18 }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: 14 }}>
                <div>
                  <div style={{ fontSize: 16, fontWeight: 600, color: 'var(--text)' }}>{member.name || 'Unknown'}</div>
                  <div style={{ fontSize: 13, color: 'var(--text-muted)', marginTop: 2 }}>{member.email} {member.phone && `\u00b7 ${member.phone}`}</div>
                </div>
                {membership && (
                  <div>
                    {stampTarget === member.id ? (
                      <div style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
                        <input className="input" value={stampNote} onChange={e => setStampNote(e.target.value)} placeholder="Note (optional)" style={{ width: 180, padding: '8px 12px', fontSize: 13 }} />
                        <button className="btn-accent" onClick={() => issueStamp(member.id, membership.id)} style={{ padding: '8px 14px', fontSize: 13 }}>Confirm</button>
                        <button className="btn-outline" onClick={() => setStampTarget(null)} style={{ padding: '8px 12px', fontSize: 13 }}>Cancel</button>
                      </div>
                    ) : (
                      <button className="btn-accent" onClick={() => setStampTarget(member.id)} style={{ fontSize: 14, padding: '8px 18px' }}>+ Issue Stamp</button>
                    )}
                  </div>
                )}
              </div>
              {membership ? (
                <div>
                  <div style={{ display: 'flex', alignItems: 'center', gap: 12, marginBottom: 10 }}>
                    <div style={{ flex: 1, height: 8, background: 'var(--bg-input)', borderRadius: 100, overflow: 'hidden' }}>
                      <div style={{ height: '100%', width: `${pct * 100}%`, background: 'var(--accent)', borderRadius: 100, transition: 'width 0.3s' }} />
                    </div>
                    <div style={{ fontFamily: 'DM Mono, monospace', fontSize: 14, color: 'var(--accent)', whiteSpace: 'nowrap', fontWeight: 600 }}>{stamps}/{goal}</div>
                  </div>
                  <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap', marginBottom: 12 }}>
                    {Array.from({ length: goal }).map((_, i) => (
                      <div key={i} style={{ width: 22, height: 22, borderRadius: '50%', background: i < stamps ? 'var(--accent)' : 'var(--bg-input)', border: `2px solid ${i < stamps ? 'var(--accent-hover)' : 'var(--border)'}`, transition: 'all 0.2s' }} />
                    ))}
                  </div>
                  <div style={{ display: 'flex', gap: 16, alignItems: 'center' }}>
                    <div style={{ fontSize: 13, color: 'var(--text-muted)' }}>Lifetime: {membership.lifetime_stamps || 0} stamps \u00b7 {membership.rewards_redeemed || 0} rewards</div>
                    {stamps >= goal && <button className="btn-accent" style={{ fontSize: 13, padding: '6px 14px' }} onClick={() => redeemReward(membership.id)}>Redeem Reward</button>}
                  </div>
                </div>
              ) : (
                <div style={{ fontSize: 14, color: 'var(--text-muted)' }}>No stamp card yet</div>
              )}
            </div>
          )
        })}
        {!loading && search && members.length === 0 && (
          <div style={{ fontSize: 14, color: 'var(--text-muted)', padding: '8px 0' }}>No members found</div>
        )}
      </div>
      {toast && <div className="toast">{toast}</div>}
    </div>
  )
}

'use client'
import { useEffect, useState } from 'react'
import { supabase } from '@/lib/supabase'

export default function LoyaltyPage() {
  const [search, setSearch] = useState('')
  const [members, setMembers] = useState<any[]>([])
  const [loading, setLoading] = useState(false)
  const [toast, setToast] = useState('')
  const [stampTarget, setStampTarget] = useState<string|null>(null)
  const [stampNote, setStampNote] = useState('')

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

    // Add stamp
    await supabase.from('loyalty_stamps').insert({ membership_id: membershipId, issued_by: staff?.id, stamp_count: 1, note: stampNote })

    // Update membership current_stamps and lifetime_stamps
    const membership = members.find(m => m.id === customerId)?.loyalty_memberships?.[0]
    if (membership) {
      const newStamps = (membership.current_stamps || 0) + 1
      const goal = membership.stamp_goal || 10
      // Check if reward unlocked
      if (newStamps >= goal) {
        await supabase.from('loyalty_memberships').update({ current_stamps: 0, lifetime_stamps: (membership.lifetime_stamps||0)+newStamps, rewards_redeemed: (membership.rewards_redeemed||0)+1 }).eq('id', membershipId)
        showToast('🎉 Reward unlocked! Stamp card reset.')
      } else {
        await supabase.from('loyalty_memberships').update({ current_stamps: newStamps, lifetime_stamps: (membership.lifetime_stamps||0)+1 }).eq('id', membershipId)
        showToast(`Stamp issued! ${newStamps}/${goal}`)
      }
    }
    setStampTarget(null)
    setStampNote('')
    searchMembers(search)
  }

  async function redeemReward(membershipId: string) {
    if (!confirm('Mark reward as redeemed and reset stamp count?')) return
    await supabase.from('loyalty_memberships').update({ current_stamps: 0, rewards_redeemed: supabase.rpc('increment', { row_id: membershipId }) }).eq('id', membershipId)
    showToast('Reward redeemed!')
    searchMembers(search)
  }

  function showToast(msg: string) { setToast(msg); setTimeout(() => setToast(''), 3000) }

  return (
    <div>
      <div style={{fontFamily:'Bebas Neue',fontSize:32,letterSpacing:'0.06em',marginBottom:6}}>Drinks Club</div>
      <div style={{fontSize:13,color:'rgba(255,255,255,0.4)',marginBottom:24}}>Search members · Issue stamps · Track rewards</div>

      {/* Stats */}
      <div style={{display:'grid',gridTemplateColumns:'repeat(3,1fr)',gap:10,marginBottom:24}}>
        {[
          { label:'Total Members', query: () => supabase.from('customers').select('id',{count:'exact',head:true}) },
          { label:'Stamps Today', query: () => supabase.from('loyalty_stamps').select('id',{count:'exact',head:true}).gte('created_at', new Date().toISOString().split('T')[0]) },
          { label:'Rewards Redeemed', query: () => supabase.from('loyalty_memberships').select('rewards_redeemed').gt('rewards_redeemed',0) },
        ].map((s,i) => {
          const [count, setCount] = useState<number|string>('—')
          useEffect(() => { s.query().then(({ count: c, data: d }: any) => setCount(i===2 ? (d?.reduce((a:number,r:any)=>a+r.rewards_redeemed,0)||0) : (c||0))) }, [])
          return (
            <div key={s.label} className="card" style={{padding:16}}>
              <div style={{fontFamily:'DM Mono',fontSize:9,letterSpacing:'0.18em',textTransform:'uppercase',color:'rgba(255,255,255,0.35)',marginBottom:6}}>{s.label}</div>
              <div style={{fontFamily:'Bebas Neue',fontSize:36,letterSpacing:'0.04em',color:'#E8A820'}}>{count}</div>
            </div>
          )
        })}
      </div>

      {/* Search */}
      <div className="card" style={{padding:20}}>
        <div style={{fontFamily:'DM Mono',fontSize:10,letterSpacing:'0.18em',textTransform:'uppercase',color:'#3AA8A4',marginBottom:12}}>Find Member</div>
        <input className="input" value={search} onChange={e=>{setSearch(e.target.value);searchMembers(e.target.value)}} placeholder="Search by name, email or phone..." style={{marginBottom:16}} />

        {loading && <div style={{color:'rgba(255,255,255,0.4)',fontSize:13}}>Searching...</div>}

        {members.map(member => {
          const membership = member.loyalty_memberships?.[0]
          const stamps = membership?.current_stamps || 0
          const goal = membership?.stamp_goal || 10
          const pct = Math.min(stamps/goal, 1)

          return (
            <div key={member.id} style={{borderTop:'1px solid rgba(255,255,255,0.07)',paddingTop:14,marginTop:14}}>
              <div style={{display:'flex',justifyContent:'space-between',alignItems:'flex-start',marginBottom:10}}>
                <div>
                  <div style={{fontSize:15,fontWeight:600,color:'#F5EED8'}}>{member.name || 'Unknown'}</div>
                  <div style={{fontSize:12,color:'rgba(255,255,255,0.4)'}}>{member.email} {member.phone && `· ${member.phone}`}</div>
                </div>
                {membership && (
                  <div style={{display:'flex',gap:6}}>
                    {stampTarget === member.id ? (
                      <div style={{display:'flex',gap:6,alignItems:'center'}}>
                        <input className="input" value={stampNote} onChange={e=>setStampNote(e.target.value)} placeholder="Note (optional)" style={{width:160,padding:'7px 12px',fontSize:12}} />
                        <button className="btn-green" onClick={() => issueStamp(member.id, membership.id)}>✓ Confirm</button>
                        <button className="btn-outline" onClick={() => setStampTarget(null)} style={{padding:'7px 12px',fontSize:12}}>✕</button>
                      </div>
                    ) : (
                      <button className="btn-yellow" onClick={() => setStampTarget(member.id)} style={{fontFamily:'Bebas Neue',fontSize:14,letterSpacing:'0.08em',padding:'8px 16px'}}>+ Issue Stamp</button>
                    )}
                  </div>
                )}
              </div>

              {membership ? (
                <div>
                  {/* Stamp progress */}
                  <div style={{display:'flex',alignItems:'center',gap:10,marginBottom:8}}>
                    <div style={{flex:1,height:6,background:'rgba(255,255,255,0.08)',borderRadius:100,overflow:'hidden'}}>
                      <div style={{height:'100%',width:`${pct*100}%`,background:'#E8A820',borderRadius:100,transition:'width 0.3s'}} />
                    </div>
                    <div style={{fontFamily:'DM Mono',fontSize:11,color:'#E8A820',whiteSpace:'nowrap'}}>{stamps}/{goal}</div>
                  </div>
                  {/* Stamp dots */}
                  <div style={{display:'flex',gap:4,flexWrap:'wrap',marginBottom:8}}>
                    {Array.from({length:goal}).map((_,i) => (
                      <div key={i} style={{width:20,height:20,borderRadius:'50%',background:i<stamps?'#E8A820':'rgba(255,255,255,0.08)',border:`1px solid ${i<stamps?'#F5C030':'rgba(255,255,255,0.1)'}`,transition:'all 0.2s'}} />
                    ))}
                  </div>
                  <div style={{display:'flex',gap:12,alignItems:'center'}}>
                    <div style={{fontSize:11,color:'rgba(255,255,255,0.35)'}}>Lifetime stamps: {membership.lifetime_stamps || 0} · Rewards redeemed: {membership.rewards_redeemed || 0}</div>
                    {stamps >= goal && <button className="btn-green" style={{fontSize:11,padding:'5px 12px'}} onClick={() => redeemReward(membership.id)}>🎁 Redeem Reward</button>}
                  </div>
                </div>
              ) : (
                <div style={{fontSize:12,color:'rgba(255,255,255,0.3)'}}>No stamp card yet</div>
              )}
            </div>
          )
        })}

        {!loading && search && members.length === 0 && (
          <div style={{fontSize:13,color:'rgba(255,255,255,0.3)'}}>No members found for "{search}"</div>
        )}
      </div>

      {toast && <div style={{position:'fixed',bottom:24,right:24,background:'#00B14F',color:'#fff',padding:'11px 20px',borderRadius:8,fontFamily:'DM Mono',fontSize:11,letterSpacing:'0.1em',zIndex:9999}}>{toast}</div>}
    </div>
  )
}

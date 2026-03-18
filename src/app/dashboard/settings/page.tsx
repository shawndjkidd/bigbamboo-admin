'use client'
import { useEffect, useState } from 'react'
import { supabase } from '@/lib/supabase'

export default function SettingsPage() {
  const [staff, setStaff] = useState<any[]>([])
  const [currentUser, setCurrentUser] = useState<any>(null)
  const [toast, setToast] = useState('')
  const [showAdd, setShowAdd] = useState(false)
  const [newStaff, setNewStaff] = useState({ name:'', email:'', role:'manager', password:'' })

  useEffect(() => {
    loadData()
  }, [])

  async function loadData() {
    const { data: { user } } = await supabase.auth.getUser()
    const { data: me } = await supabase.from('staff_users').select('*').eq('email', user?.email).single()
    setCurrentUser(me)

    if (me?.role !== 'super_admin') return
    const { data } = await supabase.from('staff_users').select('*').order('created_at')
    setStaff(data || [])
  }

  async function addStaff() {
    if (!newStaff.name || !newStaff.email || !newStaff.password) return
    // Create Supabase Auth user
    const { data: authData, error: authError } = await supabase.auth.signUp({ email: newStaff.email, password: newStaff.password })
    if (authError) { showToast('Error: ' + authError.message); return }
    // Create staff record
    await supabase.from('staff_users').insert({ name: newStaff.name, email: newStaff.email, role: newStaff.role })
    setNewStaff({ name:'', email:'', role:'manager', password:'' })
    setShowAdd(false)
    showToast('Staff member added!')
    loadData()
  }

  async function toggleActive(id: string, active: boolean) {
    await supabase.from('staff_users').update({ active: !active }).eq('id', id)
    setStaff(prev => prev.map(s => s.id === id ? {...s, active: !active} : s))
    showToast(active ? 'Account deactivated' : 'Account activated')
  }

  function showToast(msg: string) { setToast(msg); setTimeout(() => setToast(''), 3000) }

  if (currentUser?.role !== 'super_admin') {
    return (
      <div style={{display:'flex',flexDirection:'column',alignItems:'center',justifyContent:'center',minHeight:300,color:'rgba(255,255,255,0.4)'}}>
        <div style={{fontSize:40,marginBottom:12}}>🔒</div>
        <div style={{fontFamily:'Bebas Neue',fontSize:24,letterSpacing:'0.06em'}}>Super Admin Only</div>
        <div style={{fontSize:13,marginTop:6}}>You need Super Admin access to view settings.</div>
      </div>
    )
  }

  return (
    <div style={{maxWidth:640}}>
      <div style={{fontFamily:'Bebas Neue',fontSize:32,letterSpacing:'0.06em',marginBottom:24}}>Settings</div>

      {/* Staff Management */}
      <div className="card" style={{padding:20,marginBottom:16}}>
        <div style={{display:'flex',justifyContent:'space-between',alignItems:'center',marginBottom:16}}>
          <div style={{fontFamily:'DM Mono',fontSize:10,letterSpacing:'0.18em',textTransform:'uppercase',color:'#3AA8A4'}}>Staff Accounts</div>
          <button className="btn-yellow" onClick={() => setShowAdd(!showAdd)} style={{fontFamily:'Bebas Neue',fontSize:14,letterSpacing:'0.08em',padding:'7px 16px'}}>+ Add Staff</button>
        </div>

        {showAdd && (
          <div style={{background:'rgba(255,255,255,0.03)',border:'1px dashed rgba(58,168,164,0.3)',borderRadius:8,padding:16,marginBottom:16}}>
            <div style={{display:'grid',gridTemplateColumns:'1fr 1fr',gap:10,marginBottom:10}}>
              <div><label className="label">Name</label><input className="input" value={newStaff.name} onChange={e=>setNewStaff(p=>({...p,name:e.target.value}))} placeholder="Full name" /></div>
              <div><label className="label">Email</label><input className="input" type="email" value={newStaff.email} onChange={e=>setNewStaff(p=>({...p,email:e.target.value}))} placeholder="staff@bigbamboo.app" /></div>
            </div>
            <div style={{display:'grid',gridTemplateColumns:'1fr 1fr',gap:10,marginBottom:12}}>
              <div>
                <label className="label">Role</label>
                <select className="input" value={newStaff.role} onChange={e=>setNewStaff(p=>({...p,role:e.target.value}))} style={{cursor:'pointer'}}>
                  <option value="manager">Manager</option>
                  <option value="super_admin">Super Admin</option>
                </select>
              </div>
              <div><label className="label">Temporary Password</label><input className="input" type="password" value={newStaff.password} onChange={e=>setNewStaff(p=>({...p,password:e.target.value}))} placeholder="They can change it later" /></div>
            </div>
            <div style={{display:'flex',gap:8}}>
              <button className="btn-green" onClick={addStaff}>+ Create Account</button>
              <button className="btn-outline" onClick={() => setShowAdd(false)}>Cancel</button>
            </div>
          </div>
        )}

        <div style={{display:'flex',flexDirection:'column',gap:8}}>
          {staff.map(s => (
            <div key={s.id} style={{display:'flex',justifyContent:'space-between',alignItems:'center',padding:'10px 0',borderBottom:'1px solid rgba(255,255,255,0.06)'}}>
              <div>
                <div style={{fontSize:13,fontWeight:600,color:s.active?'#F5EED8':'rgba(255,255,255,0.3)'}}>{s.name}</div>
                <div style={{fontSize:11,color:'rgba(255,255,255,0.35)'}}>{s.email}</div>
              </div>
              <div style={{display:'flex',gap:8,alignItems:'center'}}>
                <span className={`badge ${s.role==='super_admin'?'badge-yellow':'badge-teal'}`}>{s.role==='super_admin'?'Super Admin':'Manager'}</span>
                {s.id !== currentUser.id && (
                  <button onClick={() => toggleActive(s.id, s.active)} style={{fontSize:11,padding:'5px 12px',borderRadius:6,border:'none',cursor:'pointer',background:s.active?'rgba(192,48,32,0.15)':'rgba(0,177,79,0.15)',color:s.active?'#E06060':'#00C858'}}>
                    {s.active ? 'Deactivate' : 'Activate'}
                  </button>
                )}
              </div>
            </div>
          ))}
        </div>
      </div>

      {/* Loyalty Config */}
      <div className="card" style={{padding:20}}>
        <div style={{fontFamily:'DM Mono',fontSize:10,letterSpacing:'0.18em',textTransform:'uppercase',color:'#3AA8A4',marginBottom:16}}>Loyalty Program Config</div>
        <LoyaltySetting />
      </div>

      {toast && <div style={{position:'fixed',bottom:24,right:24,background:'#00B14F',color:'#fff',padding:'11px 20px',borderRadius:8,fontFamily:'DM Mono',fontSize:11,letterSpacing:'0.1em',zIndex:9999}}>{toast}</div>}
    </div>
  )
}

function LoyaltySetting() {
  const [goal, setGoal] = useState('10')
  const [saved, setSaved] = useState(false)
  useEffect(() => {
    supabase.from('site_settings').select('value').eq('key','loyalty_stamp_goal').single().then(({data}:any) => { if (data) setGoal(data.value) })
  }, [])
  async function save() {
    await supabase.from('site_settings').upsert({ key:'loyalty_stamp_goal', value: goal, updated_at: new Date().toISOString() }, { onConflict:'key' })
    setSaved(true); setTimeout(() => setSaved(false), 2000)
  }
  return (
    <div style={{display:'flex',alignItems:'center',gap:12}}>
      <div style={{flex:1}}>
        <label className="label">Stamps required for reward</label>
        <input className="input" type="number" min={1} max={50} value={goal} onChange={e=>setGoal(e.target.value)} style={{width:100,fontFamily:'DM Mono',fontSize:18,textAlign:'center'}} />
      </div>
      <div style={{paddingTop:18}}>
        <button className="btn-yellow" onClick={save} style={{fontFamily:'Bebas Neue',fontSize:16,letterSpacing:'0.08em'}}>{saved?'Saved!':'Save'}</button>
      </div>
      <div style={{paddingTop:18,fontSize:13,color:'rgba(255,255,255,0.4)'}}>Buy {goal} · Get 1 Free</div>
    </div>
  )
}

'use client'
import { useEffect, useState } from 'react'
import { supabase } from '@/lib/supabase'
import Link from 'next/link'

export default function DashboardPage() {
  const [stats, setStats] = useState({ menu: 0, events: 0, customers: 0, stamps: 0 })

  useEffect(() => {
    async function loadStats() {
      const [menu, events, customers, stamps] = await Promise.all([
        supabase.from('menu_items').select('id', {count:'exact',head:true}),
        supabase.from('events').select('id', {count:'exact',head:true}).eq('is_published',true),
        supabase.from('customers').select('id', {count:'exact',head:true}),
        supabase.from('loyalty_stamps').select('id', {count:'exact',head:true}).eq('is_void',false),
      ])
      setStats({
        menu: menu.count || 0,
        events: events.count || 0,
        customers: customers.count || 0,
        stamps: stamps.count || 0,
      })
    }
    loadStats()
  }, [])

  const statCards = [
    { label: 'Menu Items', value: stats.menu, color: '#E8A820', href: '/dashboard/menu' },
    { label: 'Active Events', value: stats.events, color: '#3AA8A4', href: '/dashboard/events' },
    { label: 'Club Members', value: stats.customers, color: '#00B14F', href: '/dashboard/loyalty' },
    { label: 'Stamps Issued', value: stats.stamps, color: '#D45820', href: '/dashboard/loyalty' },
  ]

  const quickActions = [
    { label: 'Edit Menu', desc: 'Update items, prices, availability', href: '/dashboard/menu', icon: '🍹' },
    { label: 'Add Event', desc: 'Create a new event listing', href: '/dashboard/events', icon: '📅' },
    { label: 'Update Hours', desc: 'Change opening hours & location', href: '/dashboard/hours', icon: '🕐' },
    { label: 'Issue Stamp', desc: 'Add stamps to a member card', href: '/dashboard/loyalty', icon: '✦' },
  ]

  return (
    <div>
      <div style={{marginBottom:28}}>
        <div style={{fontFamily:'Bebas Neue',fontSize:36,letterSpacing:'0.06em',color:'#F5EED8',lineHeight:1}}>Dashboard</div>
        <div style={{fontSize:13,color:'rgba(255,255,255,0.4)',marginTop:4}}>bigbamboo.app · An Phú, Saigon</div>
      </div>

      {/* Stats */}
      <div style={{display:'grid',gridTemplateColumns:'repeat(auto-fill,minmax(160px,1fr))',gap:12,marginBottom:28}}>
        {statCards.map(s => (
          <Link key={s.label} href={s.href} style={{textDecoration:'none'}}>
            <div className="card" style={{padding:18,transition:'border-color 0.15s'}} onMouseEnter={e=>(e.currentTarget.style.borderColor='rgba(255,255,255,0.18)')} onMouseLeave={e=>(e.currentTarget.style.borderColor='rgba(255,255,255,0.08)')}>
              <div style={{fontFamily:'DM Mono',fontSize:9,letterSpacing:'0.18em',textTransform:'uppercase',color:'rgba(255,255,255,0.35)',marginBottom:8}}>{s.label}</div>
              <div style={{fontFamily:'Bebas Neue',fontSize:40,letterSpacing:'0.04em',color:s.color,lineHeight:1}}>{s.value}</div>
            </div>
          </Link>
        ))}
      </div>

      {/* Quick Actions */}
      <div style={{marginBottom:10,fontFamily:'DM Mono',fontSize:10,letterSpacing:'0.2em',textTransform:'uppercase',color:'rgba(255,255,255,0.3)'}}>Quick Actions</div>
      <div style={{display:'grid',gridTemplateColumns:'repeat(auto-fill,minmax(220px,1fr))',gap:10}}>
        {quickActions.map(a => (
          <Link key={a.label} href={a.href} style={{textDecoration:'none'}}>
            <div className="card" style={{padding:16,display:'flex',gap:12,alignItems:'center',transition:'border-color 0.15s'}} onMouseEnter={e=>(e.currentTarget.style.borderColor='rgba(58,168,164,0.3)')} onMouseLeave={e=>(e.currentTarget.style.borderColor='rgba(255,255,255,0.08)')}>
              <div style={{fontSize:24,width:36,textAlign:'center'}}>{a.icon}</div>
              <div>
                <div style={{fontSize:13,fontWeight:600,color:'#F5EED8',marginBottom:2}}>{a.label}</div>
                <div style={{fontSize:11,color:'rgba(255,255,255,0.4)'}}>{a.desc}</div>
              </div>
            </div>
          </Link>
        ))}
      </div>

      {/* Live site link */}
      <div className="card" style={{marginTop:24,padding:16,display:'flex',alignItems:'center',justifyContent:'space-between'}}>
        <div>
          <div style={{fontSize:13,fontWeight:600,color:'#F5EED8'}}>Live site</div>
          <div style={{fontSize:11,color:'rgba(255,255,255,0.4)'}}>bigbamboo.app</div>
        </div>
        <a href="https://bigbamboo.app" target="_blank" style={{background:'#3AA8A4',color:'#fff',padding:'8px 16px',borderRadius:6,fontSize:12,fontWeight:600,textDecoration:'none'}}>
          Open ↗
        </a>
      </div>
    </div>
  )
}

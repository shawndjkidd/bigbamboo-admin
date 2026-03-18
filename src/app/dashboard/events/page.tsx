'use client'
import { useEffect, useState } from 'react'
import { supabase, Event } from '@/lib/supabase'

export default function EventsPage() {
  const [events, setEvents] = useState<Event[]>([])
  const [loading, setLoading] = useState(true)
  const [showAdd, setShowAdd] = useState(false)
  const [toast, setToast] = useState('')
  const [newEvent, setNewEvent] = useState({ title:'', type:'', description:'', event_date:'', start_time:'', end_time:'', facebook_link:'', is_free:true })

  useEffect(() => { loadEvents() }, [])

  async function loadEvents() {
    const { data } = await supabase.from('events').select('*').order('event_date', { ascending: true })
    setEvents(data || [])
    setLoading(false)
  }

  async function addEvent() {
    if (!newEvent.title) return
    const { data } = await supabase.from('events').insert({ ...newEvent, is_published: true }).select().single()
    if (data) { setEvents(prev => [...prev, data]); setNewEvent({ title:'', type:'', description:'', event_date:'', start_time:'', end_time:'', facebook_link:'', is_free:true }); setShowAdd(false); showToast('Event added!') }
  }

  async function updateEvent(id: string, changes: Partial<Event>) {
    await supabase.from('events').update({ ...changes, updated_at: new Date().toISOString() }).eq('id', id)
    setEvents(prev => prev.map(e => e.id === id ? { ...e, ...changes } : e))
    showToast('Saved!')
  }

  async function deleteEvent(id: string) {
    if (!confirm('Remove this event?')) return
    await supabase.from('events').delete().eq('id', id)
    setEvents(prev => prev.filter(e => e.id !== id))
    showToast('Removed')
  }

  function showToast(msg: string) { setToast(msg); setTimeout(() => setToast(''), 2500) }

  return (
    <div>
      <div style={{display:'flex',justifyContent:'space-between',alignItems:'center',marginBottom:20}}>
        <div style={{fontFamily:'Bebas Neue',fontSize:32,letterSpacing:'0.06em'}}>Events</div>
        <button className="btn-yellow" onClick={() => setShowAdd(!showAdd)} style={{fontFamily:'Bebas Neue',fontSize:16,letterSpacing:'0.1em'}}>+ Add Event</button>
      </div>

      {/* Add event form */}
      {showAdd && (
        <div className="card" style={{padding:20,marginBottom:20,border:'1px dashed rgba(58,168,164,0.4)'}}>
          <div style={{fontFamily:'DM Mono',fontSize:10,letterSpacing:'0.15em',textTransform:'uppercase',color:'#3AA8A4',marginBottom:14}}>+ New Event</div>
          <div style={{display:'grid',gridTemplateColumns:'1fr 1fr',gap:10,marginBottom:10}}>
            <div><label className="label">Event Title</label><input className="input" value={newEvent.title} onChange={e=>setNewEvent(p=>({...p,title:e.target.value}))} placeholder="BigBamBoo Sunday Market" /></div>
            <div><label className="label">Type</label><input className="input" value={newEvent.type} onChange={e=>setNewEvent(p=>({...p,type:e.target.value}))} placeholder="Sunday Market / Live Music / Special Event" /></div>
          </div>
          <div style={{display:'grid',gridTemplateColumns:'1fr 1fr 1fr',gap:10,marginBottom:10}}>
            <div><label className="label">Date</label><input className="input" type="date" value={newEvent.event_date} onChange={e=>setNewEvent(p=>({...p,event_date:e.target.value}))} /></div>
            <div><label className="label">Start Time</label><input className="input" type="time" value={newEvent.start_time} onChange={e=>setNewEvent(p=>({...p,start_time:e.target.value}))} /></div>
            <div><label className="label">End Time</label><input className="input" type="time" value={newEvent.end_time} onChange={e=>setNewEvent(p=>({...p,end_time:e.target.value}))} /></div>
          </div>
          <div style={{marginBottom:10}}>
            <label className="label">Description</label>
            <input className="input" value={newEvent.description} onChange={e=>setNewEvent(p=>({...p,description:e.target.value}))} placeholder="Short event description" />
          </div>
          <div style={{marginBottom:12}}>
            <label className="label">Facebook Event Link (optional)</label>
            <input className="input" value={newEvent.facebook_link} onChange={e=>setNewEvent(p=>({...p,facebook_link:e.target.value}))} placeholder="https://facebook.com/events/..." />
          </div>
          <div style={{display:'flex',gap:12,alignItems:'center'}}>
            <label style={{display:'flex',alignItems:'center',gap:6,fontSize:13,color:'rgba(255,255,255,0.6)',cursor:'pointer'}}>
              <input type="checkbox" checked={newEvent.is_free} onChange={e=>setNewEvent(p=>({...p,is_free:e.target.checked}))} style={{accentColor:'#E8A820'}} />
              Free entry
            </label>
            <button className="btn-green" onClick={addEvent}>+ Add Event</button>
            <button className="btn-outline" onClick={() => setShowAdd(false)}>Cancel</button>
          </div>
        </div>
      )}

      {loading ? <div style={{color:'rgba(255,255,255,0.4)',padding:20}}>Loading...</div> : (
        <div style={{display:'flex',flexDirection:'column',gap:10}}>
          {events.length === 0 && <div style={{color:'rgba(255,255,255,0.3)',fontSize:13,padding:'20px 0'}}>No events yet. Add one above.</div>}
          {events.map(event => (
            <div key={event.id} className="card" style={{padding:18}}>
              <div style={{display:'flex',justifyContent:'space-between',alignItems:'flex-start',marginBottom:14}}>
                <div>
                  <div style={{fontFamily:'Bebas Neue',fontSize:20,letterSpacing:'0.06em',color:'#F5EED8',marginBottom:4}}>{event.title}</div>
                  <span style={{background:'rgba(58,168,164,0.12)',color:'#3AA8A4',border:'1px solid rgba(58,168,164,0.25)',padding:'2px 8px',borderRadius:100,fontSize:9,letterSpacing:'0.12em',textTransform:'uppercase'}}>{event.type}</span>
                </div>
                <div style={{display:'flex',gap:6,alignItems:'center'}}>
                  <label style={{display:'flex',alignItems:'center',gap:5,fontSize:11,color:'rgba(255,255,255,0.5)',cursor:'pointer'}}>
                    <input type="checkbox" checked={event.is_published} onChange={e => updateEvent(event.id, {is_published: e.target.checked})} style={{accentColor:'#00B14F'}} />
                    Published
                  </label>
                  <button className="btn-red" onClick={() => deleteEvent(event.id)}>✕ Remove</button>
                </div>
              </div>
              <div style={{display:'grid',gridTemplateColumns:'1fr 1fr 1fr',gap:10,marginBottom:10}}>
                <div><label className="label">Date</label><input className="input" type="date" defaultValue={event.event_date||''} onBlur={e => updateEvent(event.id, {event_date: e.target.value})} /></div>
                <div><label className="label">Start</label><input className="input" type="time" defaultValue={event.start_time||''} onBlur={e => updateEvent(event.id, {start_time: e.target.value})} /></div>
                <div><label className="label">End</label><input className="input" type="time" defaultValue={event.end_time||''} onBlur={e => updateEvent(event.id, {end_time: e.target.value})} /></div>
              </div>
              <div style={{marginBottom:10}}>
                <label className="label">Description</label>
                <input className="input" defaultValue={event.description||''} onBlur={e => updateEvent(event.id, {description: e.target.value})} style={{fontStyle:'italic',fontSize:13}} />
              </div>
              <div>
                <label className="label">Facebook Event Link</label>
                <input className="input" defaultValue={event.facebook_link||''} onBlur={e => updateEvent(event.id, {facebook_link: e.target.value})} placeholder="https://facebook.com/events/..." />
              </div>
            </div>
          ))}
        </div>
      )}

      {toast && <div style={{position:'fixed',bottom:24,right:24,background:'#00B14F',color:'#fff',padding:'11px 20px',borderRadius:8,fontFamily:'DM Mono',fontSize:11,letterSpacing:'0.1em',zIndex:9999}}>{toast}</div>}
    </div>
  )
}

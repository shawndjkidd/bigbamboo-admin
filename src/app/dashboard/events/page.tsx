'use client'
import { useEffect, useState } from 'react'
import { supabase } from '@/lib/supabase'

const BLANK_EVENT = {
  title:'', type:'', description:'', event_date:'', start_time:'', end_time:'',
  facebook_link:'', is_free:true, ticket_price:'', ticket_link:'', capacity:'', rsvp_enabled:true
}

export default function EventsPage() {
  const [events, setEvents] = useState<any[]>([])
  const [loading, setLoading] = useState(true)
  const [showAdd, setShowAdd] = useState(false)
  const [toast, setToast] = useState('')
  const [expandedOrders, setExpandedOrders] = useState<string|null>(null)
  const [orders, setOrders] = useState<any[]>([])
  const [newEvent, setNewEvent] = useState<any>({...BLANK_EVENT})

  useEffect(() => { loadEvents() }, [])

  async function loadEvents() {
    const { data } = await supabase.from('events').select('*').order('event_date', { ascending: true })
    setEvents(data || [])
    setLoading(false)
  }

  async function loadOrders(eventId: string) {
    if (expandedOrders === eventId) { setExpandedOrders(null); return }
    const { data } = await supabase.from('ticket_orders').select('*').eq('event_id', eventId).order('created_at', { ascending: false })
    setOrders(data || [])
    setExpandedOrders(eventId)
  }

  async function addEvent() {
    if (!newEvent.title) return
    const { data } = await supabase.from('events').insert({
      title: newEvent.title,
      type: newEvent.type,
      description: newEvent.description,
      event_date: newEvent.event_date || null,
      start_time: newEvent.start_time || null,
      end_time: newEvent.end_time || null,
      facebook_link: newEvent.facebook_link || null,
      is_free: newEvent.is_free,
      ticket_price: newEvent.is_free ? 0 : (parseInt(newEvent.ticket_price) || 0),
      ticket_link: newEvent.ticket_link || null,
      capacity: newEvent.capacity ? parseInt(newEvent.capacity) : null,
      rsvp_enabled: newEvent.rsvp_enabled,
      is_published: true
    }).select().single()
    if (data) {
      setEvents(prev => [...prev, data])
      setNewEvent({...BLANK_EVENT})
      setShowAdd(false)
      showToast('Event added!')
    }
  }

  async function updateEvent(id: string, changes: any) {
    await supabase.from('events').update({ ...changes, updated_at: new Date().toISOString() }).eq('id', id)
    setEvents(prev => prev.map(e => e.id === id ? { ...e, ...changes } : e))
    showToast('Saved!')
  }

  async function deleteEvent(id: string) {
    if (!confirm('Remove this event?')) return
    await supabase.from('events').delete().eq('id', id)
    setEvents(prev => prev.filter(e => e.id !== id))
    if (expandedOrders === id) setExpandedOrders(null)
    showToast('Removed')
  }

  async function checkIn(orderId: string, checked: boolean) {
    await supabase.from('ticket_orders').update({
      checked_in: !checked,
      checked_in_at: !checked ? new Date().toISOString() : null
    }).eq('id', orderId)
    setOrders(prev => prev.map(o => o.id === orderId ? { ...o, checked_in: !checked } : o))
    showToast(!checked ? 'Checked in ✓' : 'Unchecked')
  }

  function showToast(msg: string) { setToast(msg); setTimeout(() => setToast(''), 2500) }

  return (
    <div>
      <div style={{display:'flex',justifyContent:'space-between',alignItems:'center',marginBottom:20}}>
        <div style={{fontFamily:'Bebas Neue',fontSize:32,letterSpacing:'0.06em'}}>Events</div>
        <button className="btn-yellow" onClick={() => setShowAdd(!showAdd)}
          style={{fontFamily:'Bebas Neue',fontSize:16,letterSpacing:'0.1em'}}>+ Add Event</button>
      </div>

      {/* ── ADD EVENT FORM ── */}
      {showAdd && (
        <div className="card" style={{padding:20,marginBottom:20,border:'1px dashed rgba(58,168,164,0.4)'}}>
          <div style={{fontFamily:'DM Mono',fontSize:10,letterSpacing:'0.15em',textTransform:'uppercase',color:'#3AA8A4',marginBottom:14}}>+ New Event</div>
          <div style={{display:'grid',gridTemplateColumns:'1fr 1fr',gap:10,marginBottom:10}}>
            <div><label className="label">Event Title</label>
              <input className="input" value={newEvent.title} onChange={e=>setNewEvent((p:any)=>({...p,title:e.target.value}))} placeholder="BigBamBoo Sunday Market" /></div>
            <div><label className="label">Type</label>
              <input className="input" value={newEvent.type} onChange={e=>setNewEvent((p:any)=>({...p,type:e.target.value}))} placeholder="Sunday Market / Live Music / Party" /></div>
          </div>
          <div style={{display:'grid',gridTemplateColumns:'1fr 1fr 1fr',gap:10,marginBottom:10}}>
            <div><label className="label">Date</label>
              <input className="input" type="date" value={newEvent.event_date} onChange={e=>setNewEvent((p:any)=>({...p,event_date:e.target.value}))} /></div>
            <div><label className="label">Start Time</label>
              <input className="input" type="time" value={newEvent.start_time} onChange={e=>setNewEvent((p:any)=>({...p,start_time:e.target.value}))} /></div>
            <div><label className="label">End Time</label>
              <input className="input" type="time" value={newEvent.end_time} onChange={e=>setNewEvent((p:any)=>({...p,end_time:e.target.value}))} /></div>
          </div>
          <div style={{marginBottom:10}}>
            <label className="label">Description</label>
            <input className="input" value={newEvent.description} onChange={e=>setNewEvent((p:any)=>({...p,description:e.target.value}))} placeholder="Short event description" />
          </div>
          <div style={{marginBottom:10}}>
            <label className="label">Facebook Event Link</label>
            <input className="input" value={newEvent.facebook_link} onChange={e=>setNewEvent((p:any)=>({...p,facebook_link:e.target.value}))} placeholder="https://facebook.com/events/..." />
          </div>

          {/* Ticketing section */}
          <div style={{background:'rgba(255,255,255,0.03)',border:'1px solid rgba(255,255,255,0.07)',borderRadius:8,padding:14,marginBottom:12}}>
            <div style={{fontFamily:'DM Mono',fontSize:9,letterSpacing:'0.15em',textTransform:'uppercase',color:'rgba(255,255,255,0.35)',marginBottom:12}}>Ticketing</div>
            <div style={{display:'flex',gap:20,marginBottom:12}}>
              <label style={{display:'flex',alignItems:'center',gap:6,fontSize:13,color:'rgba(255,255,255,0.7)',cursor:'pointer'}}>
                <input type="radio" checked={newEvent.is_free} onChange={()=>setNewEvent((p:any)=>({...p,is_free:true}))} style={{accentColor:'#E8A820'}} />
                Free entry
              </label>
              <label style={{display:'flex',alignItems:'center',gap:6,fontSize:13,color:'rgba(255,255,255,0.7)',cursor:'pointer'}}>
                <input type="radio" checked={!newEvent.is_free} onChange={()=>setNewEvent((p:any)=>({...p,is_free:false}))} style={{accentColor:'#E8A820'}} />
                Paid tickets
              </label>
            </div>
            {!newEvent.is_free && (
              <div style={{display:'grid',gridTemplateColumns:'1fr 1fr',gap:10,marginBottom:10}}>
                <div>
                  <label className="label">Ticket Price (VND)</label>
                  <input className="input" type="number" value={newEvent.ticket_price}
                    onChange={e=>setNewEvent((p:any)=>({...p,ticket_price:e.target.value}))} placeholder="e.g. 150000" />
                </div>
                <div>
                  <label className="label">Buy Tickets Link (optional)</label>
                  <input className="input" value={newEvent.ticket_link}
                    onChange={e=>setNewEvent((p:any)=>({...p,ticket_link:e.target.value}))} placeholder="Momo / bank link / Eventbrite URL" />
                </div>
              </div>
            )}
            <div style={{display:'grid',gridTemplateColumns:'1fr 1fr',gap:10}}>
              <div>
                <label className="label">Capacity (optional)</label>
                <input className="input" type="number" value={newEvent.capacity}
                  onChange={e=>setNewEvent((p:any)=>({...p,capacity:e.target.value}))} placeholder="Leave blank = unlimited" />
              </div>
              <div style={{display:'flex',alignItems:'flex-end',paddingBottom:2}}>
                <label style={{display:'flex',alignItems:'center',gap:6,fontSize:13,color:'rgba(255,255,255,0.6)',cursor:'pointer'}}>
                  <input type="checkbox" checked={newEvent.rsvp_enabled}
                    onChange={e=>setNewEvent((p:any)=>({...p,rsvp_enabled:e.target.checked}))} style={{accentColor:'#3AA8A4'}} />
                  Show RSVP form on site
                </label>
              </div>
            </div>
          </div>

          <div style={{display:'flex',gap:8}}>
            <button className="btn-green" onClick={addEvent}>+ Add Event</button>
            <button className="btn-outline" onClick={() => setShowAdd(false)}>Cancel</button>
          </div>
        </div>
      )}

      {/* ── EVENT LIST ── */}
      {loading ? <div style={{color:'rgba(255,255,255,0.4)',padding:20}}>Loading...</div> : (
        <div style={{display:'flex',flexDirection:'column',gap:10}}>
          {events.length === 0 && <div style={{color:'rgba(255,255,255,0.3)',fontSize:13,padding:'20px 0'}}>No events yet.</div>}
          {events.map(event => {
            const isExpanded = expandedOrders === event.id
            return (
              <div key={event.id} className="card" style={{padding:18}}>
                {/* Header */}
                <div style={{display:'flex',justifyContent:'space-between',alignItems:'flex-start',marginBottom:14}}>
                  <div>
                    <div style={{fontFamily:'Bebas Neue',fontSize:20,letterSpacing:'0.06em',color:'#F5EED8',marginBottom:5}}>{event.title}</div>
                    <div style={{display:'flex',gap:6,flexWrap:'wrap'}}>
                      <span className="badge badge-teal">{event.type}</span>
                      {event.is_free
                        ? <span className="badge" style={{background:'rgba(0,177,79,0.1)',color:'#00C858',border:'1px solid rgba(0,177,79,0.25)'}}>Free</span>
                        : <span className="badge badge-yellow">{event.ticket_price?.toLocaleString()}đ</span>}
                      {event.rsvp_enabled && <span className="badge" style={{background:'rgba(255,255,255,0.05)',color:'rgba(255,255,255,0.4)',border:'1px solid rgba(255,255,255,0.1)'}}>RSVP on</span>}
                    </div>
                  </div>
                  <div style={{display:'flex',gap:6,alignItems:'center'}}>
                    <label style={{display:'flex',alignItems:'center',gap:5,fontSize:11,color:'rgba(255,255,255,0.5)',cursor:'pointer'}}>
                      <input type="checkbox" checked={!!event.is_published}
                        onChange={e => updateEvent(event.id, {is_published: e.target.checked})} style={{accentColor:'#00B14F'}} />
                      Published
                    </label>
                    <button onClick={() => loadOrders(event.id)}
                      style={{background:'rgba(58,168,164,0.1)',border:'1px solid rgba(58,168,164,0.25)',color:'#3AA8A4',padding:'6px 12px',borderRadius:6,fontSize:11,cursor:'pointer',fontFamily:'DM Mono'}}>
                      {isExpanded ? '▲ Hide' : '▼ Attendees'}
                    </button>
                    <button className="btn-red" onClick={() => deleteEvent(event.id)}>✕</button>
                  </div>
                </div>

                {/* Editable fields */}
                <div style={{display:'grid',gridTemplateColumns:'1fr 1fr 1fr',gap:10,marginBottom:10}}>
                  <div><label className="label">Date</label>
                    <input className="input" type="date" defaultValue={event.event_date||''} onBlur={e => updateEvent(event.id, {event_date: e.target.value})} /></div>
                  <div><label className="label">Start</label>
                    <input className="input" type="time" defaultValue={event.start_time||''} onBlur={e => updateEvent(event.id, {start_time: e.target.value})} /></div>
                  <div><label className="label">End</label>
                    <input className="input" type="time" defaultValue={event.end_time||''} onBlur={e => updateEvent(event.id, {end_time: e.target.value})} /></div>
                </div>
                <div style={{marginBottom:10}}>
                  <label className="label">Description</label>
                  <input className="input" defaultValue={event.description||''} onBlur={e => updateEvent(event.id, {description: e.target.value})} />
                </div>
                <div style={{marginBottom:10}}>
                  <label className="label">Facebook Event Link</label>
                  <input className="input" defaultValue={event.facebook_link||''} onBlur={e => updateEvent(event.id, {facebook_link: e.target.value})} placeholder="https://facebook.com/events/..." />
                </div>

                {/* Ticketing box */}
                <div style={{background:'rgba(255,255,255,0.03)',border:'1px solid rgba(255,255,255,0.07)',borderRadius:8,padding:14}}>
                  <div style={{fontFamily:'DM Mono',fontSize:9,letterSpacing:'0.15em',textTransform:'uppercase',color:'rgba(255,255,255,0.3)',marginBottom:12}}>Ticketing</div>
                  <div style={{display:'flex',gap:20,marginBottom:12}}>
                    <label style={{display:'flex',alignItems:'center',gap:6,fontSize:13,color:'rgba(255,255,255,0.7)',cursor:'pointer'}}>
                      <input type="radio" checked={!!event.is_free}
                        onChange={() => updateEvent(event.id, {is_free: true, ticket_price: 0})} style={{accentColor:'#E8A820'}} />
                      Free entry
                    </label>
                    <label style={{display:'flex',alignItems:'center',gap:6,fontSize:13,color:'rgba(255,255,255,0.7)',cursor:'pointer'}}>
                      <input type="radio" checked={!event.is_free}
                        onChange={() => updateEvent(event.id, {is_free: false})} style={{accentColor:'#E8A820'}} />
                      Paid tickets
                    </label>
                  </div>

                  {/* Only show price fields when paid */}
                  {!event.is_free && (
                    <div style={{display:'grid',gridTemplateColumns:'1fr 1fr',gap:10,marginBottom:10}}>
                      <div>
                        <label className="label">Ticket Price (VND)</label>
                        <input className="input" type="number"
                          defaultValue={event.ticket_price||''}
                          onBlur={e => updateEvent(event.id, {ticket_price: parseInt(e.target.value)||0})}
                          placeholder="e.g. 150000" />
                      </div>
                      <div>
                        <label className="label">Buy Tickets Link</label>
                        <input className="input"
                          defaultValue={event.ticket_link||''}
                          onBlur={e => updateEvent(event.id, {ticket_link: e.target.value})}
                          placeholder="Momo / bank link / Eventbrite URL" />
                        <div style={{fontSize:10,color:'rgba(255,255,255,0.3)',marginTop:4}}>If set, guests are sent here to pay. Leave blank to collect at door.</div>
                      </div>
                    </div>
                  )}

                  <div style={{display:'grid',gridTemplateColumns:'1fr 1fr',gap:10}}>
                    <div>
                      <label className="label">Capacity</label>
                      <input className="input" type="number"
                        defaultValue={event.capacity||''}
                        onBlur={e => updateEvent(event.id, {capacity: e.target.value ? parseInt(e.target.value) : null})}
                        placeholder="Unlimited" />
                    </div>
                    <div style={{display:'flex',alignItems:'flex-end',paddingBottom:2}}>
                      <label style={{display:'flex',alignItems:'center',gap:6,fontSize:13,color:'rgba(255,255,255,0.6)',cursor:'pointer'}}>
                        <input type="checkbox" checked={!!event.rsvp_enabled}
                          onChange={e => updateEvent(event.id, {rsvp_enabled: e.target.checked})} style={{accentColor:'#3AA8A4'}} />
                        Show RSVP form on site
                      </label>
                    </div>
                  </div>
                </div>

                {/* Attendees panel */}
                {isExpanded && (
                  <div style={{marginTop:16,borderTop:'1px solid rgba(255,255,255,0.07)',paddingTop:16}}>
                    <div style={{fontFamily:'DM Mono',fontSize:10,letterSpacing:'0.15em',textTransform:'uppercase',color:'rgba(255,255,255,0.4)',marginBottom:12}}>
                      Attendees — {orders.length} registered
                    </div>
                    {orders.length === 0
                      ? <div style={{fontSize:12,color:'rgba(255,255,255,0.3)'}}>No RSVPs yet</div>
                      : <div style={{display:'flex',flexDirection:'column',gap:6}}>
                          {orders.map(o => (
                            <div key={o.id} style={{display:'flex',justifyContent:'space-between',alignItems:'center',padding:'8px 12px',background:o.checked_in?'rgba(0,177,79,0.08)':'rgba(255,255,255,0.03)',borderRadius:6,border:`1px solid ${o.checked_in?'rgba(0,177,79,0.2)':'rgba(255,255,255,0.06)'}`}}>
                              <div>
                                <div style={{fontSize:13,fontWeight:600,color:o.checked_in?'#00C858':'#F5EED8'}}>{o.name}</div>
                                <div style={{fontSize:11,color:'rgba(255,255,255,0.4)'}}>{o.email}{o.phone&&` · ${o.phone}`} · {o.quantity} ticket{o.quantity>1?'s':''}</div>
                              </div>
                              <button onClick={() => checkIn(o.id, o.checked_in)} style={{background:o.checked_in?'rgba(0,177,79,0.15)':'rgba(255,255,255,0.06)',border:`1px solid ${o.checked_in?'rgba(0,177,79,0.3)':'rgba(255,255,255,0.12)'}`,color:o.checked_in?'#00C858':'rgba(255,255,255,0.5)',padding:'5px 12px',borderRadius:6,fontSize:11,cursor:'pointer',fontFamily:'DM Mono'}}>
                                {o.checked_in ? '✓ In' : 'Check in'}
                              </button>
                            </div>
                          ))}
                        </div>
                    }
                  </div>
                )}
              </div>
            )
          })}
        </div>
      )}

      {toast && <div style={{position:'fixed',bottom:24,right:24,background:'#00B14F',color:'#fff',padding:'11px 20px',borderRadius:8,fontFamily:'DM Mono',fontSize:11,letterSpacing:'0.1em',zIndex:9999}}>{toast}</div>}
    </div>
  )
}

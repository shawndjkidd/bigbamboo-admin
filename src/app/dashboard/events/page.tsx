'use client'
import { useEffect, useState } from 'react'
import { supabase } from '@/lib/supabase'

const BLANK_EVENT = {
  title: '', type: '', description: '', event_date: '', start_time: '', end_time: '',
  facebook_link: '', image_url: '', is_free: true, ticket_price: '', ticket_link: '', capacity: '', rsvp_enabled: true,
  is_recurring: false, recurrence_pattern: 'weekly'
}

function getNextOccurrence(dateStr: string, pattern: string): string {
  const today = new Date()
  today.setHours(0,0,0,0)
  let d = new Date(dateStr + 'T00:00:00')
  const msDay = 86400000
  const interval = pattern === 'monthly' ? 0 : pattern === 'biweekly' ? 14 : 7
  while (d < today) {
    if (pattern === 'monthly') {
      d.setMonth(d.getMonth() + 1)
    } else {
      d = new Date(d.getTime() + interval * msDay)
    }
  }
  return d.toISOString().split('T')[0]
}

export default function EventsPage() {
  const [events, setEvents] = useState<any[]>([])
  const [loading, setLoading] = useState(true)
  const [showAdd, setShowAdd] = useState(false)
  const [toast, setToast] = useState('')
  const [expandedOrders, setExpandedOrders] = useState<string | null>(null)
  const [orders, setOrders] = useState<any[]>([])
  const [newEvent, setNewEvent] = useState<any>({ ...BLANK_EVENT })
  const [editingId, setEditingId] = useState<string | null>(null)

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
      title: newEvent.title, type: newEvent.type, description: newEvent.description,
      event_date: newEvent.event_date || null, start_time: newEvent.start_time || null,
      end_time: newEvent.end_time || null, facebook_link: newEvent.facebook_link || null,
      image_url: newEvent.image_url || null, is_free: newEvent.is_free,
      ticket_price: newEvent.is_free ? 0 : (parseInt(newEvent.ticket_price) || 0),
      ticket_link: newEvent.ticket_link || null,
      capacity: newEvent.capacity ? parseInt(newEvent.capacity) : null,
      rsvp_enabled: newEvent.rsvp_enabled, is_published: true,
      is_recurring: newEvent.is_recurring,
      recurrence_pattern: newEvent.is_recurring ? newEvent.recurrence_pattern : null,
    }).select().single()
    if (data) {
      setEvents(prev => [...prev, data])
      setNewEvent({ ...BLANK_EVENT })
      setShowAdd(false)
      showToast('Event created')
    }
  }

  async function updateEvent(id: string, changes: any) {
    await supabase.from('events').update({ ...changes, updated_at: new Date().toISOString() }).eq('id', id)
    setEvents(prev => prev.map(e => e.id === id ? { ...e, ...changes } : e))
    showToast('Saved')
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
      checked_in: !checked, checked_in_at: !checked ? new Date().toISOString() : null
    }).eq('id', orderId)
    setOrders(prev => prev.map(o => o.id === orderId ? { ...o, checked_in: !checked } : o))
    showToast(!checked ? 'Checked in' : 'Unchecked')
  }

  function showToast(msg: string) { setToast(msg); setTimeout(() => setToast(''), 2500) }

  function formatDate(dateStr: string) {
    if (!dateStr) return '\u2014'
    return new Date(dateStr + 'T00:00:00').toLocaleDateString('en', { weekday: 'short', day: 'numeric', month: 'short' })
  }

  const upcomingEvents = events.filter(e => {
    if (!e.event_date) return true
    if (e.is_recurring) return true
    return new Date(e.event_date) >= new Date(new Date().toISOString().split('T')[0])
  })
  const pastEvents = events.filter(e => {
    if (e.is_recurring) return false
    return e.event_date && new Date(e.event_date) < new Date(new Date().toISOString().split('T')[0])
  })

  return (
    <div style={{ maxWidth: 900 }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 28 }}>
        <div>
          <div className="page-title">Events</div>
          <div style={{ fontSize: 14, color: 'var(--text-muted)', marginTop: 4 }}>{events.length} event{events.length !== 1 ? 's' : ''} total</div>
        </div>
        <button className="btn-accent" onClick={() => setShowAdd(!showAdd)} style={{ fontSize: 14, padding: '10px 20px' }}>
          + Create Event
        </button>
      </div>

      {showAdd && (
        <div className="card" style={{ padding: 24, marginBottom: 24, borderColor: 'var(--accent)', borderStyle: 'dashed' }}>
          <div className="section-title" style={{ color: 'var(--accent)', marginBottom: 18 }}>New Event</div>
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 14, marginBottom: 14 }}>
            <div><label className="label">Event Title</label><input className="input" value={newEvent.title} onChange={e => setNewEvent((p: any) => ({ ...p, title: e.target.value }))} placeholder="BigBamBoo Sunday Market" /></div>
            <div><label className="label">Type</label><input className="input" value={newEvent.type} onChange={e => setNewEvent((p: any) => ({ ...p, type: e.target.value }))} placeholder="Sunday Market / Live Music / Party" /></div>
          </div>
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', gap: 14, marginBottom: 14 }}>
            <div><label className="label">Date</label><input className="input" type="date" value={newEvent.event_date} onChange={e => setNewEvent((p: any) => ({ ...p, event_date: e.target.value }))} /></div>
            <div><label className="label">Start Time</label><input className="input" type="time" value={newEvent.start_time} onChange={e => setNewEvent((p: any) => ({ ...p, start_time: e.target.value }))} /></div>
            <div><label className="label">End Time</label><input className="input" type="time" value={newEvent.end_time} onChange={e => setNewEvent((p: any) => ({ ...p, end_time: e.target.value }))} /></div>
          </div>
          <div style={{ marginBottom: 14 }}><label className="label">Description</label><input className="input" value={newEvent.description} onChange={e => setNewEvent((p: any) => ({ ...p, description: e.target.value }))} placeholder="Short event description" /></div>
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 14, marginBottom: 14 }}>
            <div><label className="label">Facebook Event Link</label><input className="input" value={newEvent.facebook_link} onChange={e => setNewEvent((p: any) => ({ ...p, facebook_link: e.target.value }))} placeholder="https://facebook.com/events/..." /></div>
            <div><label className="label">Event Photo URL</label><input className="input" value={newEvent.image_url} onChange={e => setNewEvent((p: any) => ({ ...p, image_url: e.target.value }))} placeholder="https://... or /images/event.jpg" /></div>
          </div>
          <div className="card" style={{ padding: 18, marginBottom: 18, background: 'var(--bg-subtle)' }}>
            <div className="section-title" style={{ marginBottom: 14 }}>Ticketing</div>
            <div style={{ display: 'flex', gap: 20, marginBottom: 14 }}>
              <label style={{ display: 'flex', alignItems: 'center', gap: 8, fontSize: 14, color: 'var(--text-secondary)', cursor: 'pointer' }}><input type="radio" checked={newEvent.is_free} onChange={() => setNewEvent((p: any) => ({ ...p, is_free: true }))} style={{ accentColor: 'var(--accent)' }} /> Free entry</label>
              <label style={{ display: 'flex', alignItems: 'center', gap: 8, fontSize: 14, color: 'var(--text-secondary)', cursor: 'pointer' }}><input type="radio" checked={!newEvent.is_free} onChange={() => setNewEvent((p: any) => ({ ...p, is_free: false }))} style={{ accentColor: 'var(--accent)' }} /> Paid tickets</label>
            </div>
            {!newEvent.is_free && (
              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 14, marginBottom: 14 }}>
                <div><label className="label">Ticket Price (VND)</label><input className="input" type="number" value={newEvent.ticket_price} onChange={e => setNewEvent((p: any) => ({ ...p, ticket_price: e.target.value }))} placeholder="150000" /></div>
                <div><label className="label">Buy Tickets Link</label><input className="input" value={newEvent.ticket_link} onChange={e => setNewEvent((p: any) => ({ ...p, ticket_link: e.target.value }))} placeholder="Momo / bank link" /></div>
              </div>
            )}
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 14 }}>
              <div><label className="label">Capacity</label><input className="input" type="number" value={newEvent.capacity} onChange={e => setNewEvent((p: any) => ({ ...p, capacity: e.target.value }))} placeholder="Leave blank = unlimited" /></div>
              <div style={{ display: 'flex', alignItems: 'flex-end', paddingBottom: 4 }}><label style={{ display: 'flex', alignItems: 'center', gap: 8, fontSize: 14, color: 'var(--text-secondary)', cursor: 'pointer' }}><input type="checkbox" checked={newEvent.rsvp_enabled} onChange={e => setNewEvent((p: any) => ({ ...p, rsvp_enabled: e.target.checked }))} style={{ accentColor: 'var(--accent)' }} /> Show RSVP form on site</label></div>
            </div>
          </div>
          <div className="card" style={{ padding: 18, marginBottom: 18, background: 'var(--bg-subtle)' }}>
            <div className="section-title" style={{ marginBottom: 14 }}>Recurring</div>
            <div style={{ display: 'flex', gap: 20, alignItems: 'center' }}>
              <label style={{ display: 'flex', alignItems: 'center', gap: 8, fontSize: 14, color: 'var(--text-secondary)', cursor: 'pointer' }}>
                <input type="checkbox" checked={newEvent.is_recurring} onChange={e => setNewEvent((p: any) => ({ ...p, is_recurring: e.target.checked }))} style={{ accentColor: 'var(--accent)' }} />
                This is a recurring event
              </label>
              {newEvent.is_recurring && (
                <select className="input" value={newEvent.recurrence_pattern} onChange={e => setNewEvent((p: any) => ({ ...p, recurrence_pattern: e.target.value }))} style={{ width: 'auto', minWidth: 140 }}>
                  <option value="weekly">Every week</option>
                  <option value="biweekly">Every 2 weeks</option>
                  <option value="monthly">Every month</option>
                </select>
              )}
            </div>
          </div>
          <div style={{ display: 'flex', gap: 10 }}>
            <button className="btn-accent" onClick={addEvent}>Create Event</button>
            <button className="btn-outline" onClick={() => setShowAdd(false)}>Cancel</button>
          </div>
        </div>
      )}

      {loading ? (
        <div style={{ padding: 40, textAlign: 'center', color: 'var(--text-muted)' }}>Loading events...</div>
      ) : events.length === 0 ? (
        <div className="card" style={{ padding: 40, textAlign: 'center', color: 'var(--text-muted)' }}>No events yet. Create your first event above.</div>
      ) : (
        <>
          {upcomingEvents.length > 0 && (
            <div style={{ marginBottom: 32 }}>
              <div className="section-title" style={{ marginBottom: 14 }}>Upcoming & Active</div>
              <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
                {upcomingEvents.map(event => (
                  <EventCard key={event.id} event={event} isExpanded={expandedOrders === event.id}
                    orders={orders} editingId={editingId}
                    onToggleEdit={(id: string) => setEditingId(editingId === id ? null : id)}
                    onLoadOrders={loadOrders} onUpdate={updateEvent} onDelete={deleteEvent} onCheckIn={checkIn}
                    formatDate={formatDate} />
                ))}
              </div>
            </div>
          )}
          {pastEvents.length > 0 && (
            <div>
              <div className="section-title" style={{ marginBottom: 14, color: 'var(--text-muted)' }}>Past Events</div>
              <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
                {pastEvents.map(event => (
                  <EventCard key={event.id} event={event} isExpanded={expandedOrders === event.id}
                    orders={orders} editingId={editingId}
                    onToggleEdit={(id: string) => setEditingId(editingId === id ? null : id)}
                    onLoadOrders={loadOrders} onUpdate={updateEvent} onDelete={deleteEvent} onCheckIn={checkIn}
                    formatDate={formatDate} isPast />
                ))}
              </div>
            </div>
          )}
        </>
      )}

      {toast && <div className="toast">{toast}</div>}
    </div>
  )
}

function EventCard({ event, isExpanded, orders, editingId, onToggleEdit, onLoadOrders, onUpdate, onDelete, onCheckIn, formatDate, isPast }: any) {
  const isEditing = editingId === event.id
  return (
    <div className="card" style={{ padding: 22, opacity: isPast ? 0.7 : 1 }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: isEditing ? 18 : 0 }}>
        <div>
          <div style={{ fontFamily: 'Bebas Neue', fontSize: 22, letterSpacing: '0.04em', color: 'var(--text)', marginBottom: 6 }}>{event.title}</div>
          <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap', alignItems: 'center' }}>
            {event.type && <span className="badge badge-gray">{event.type}</span>}
            <span className="badge badge-blue">{formatDate(event.is_recurring && event.event_date ? getNextOccurrence(event.event_date, event.recurrence_pattern) : event.event_date)}</span>
            {event.start_time && <span style={{ fontSize: 13, color: 'var(--text-muted)' }}>{event.start_time}{event.end_time && ` \u2013 ${event.end_time}`}</span>}
            {event.is_free ? <span className="badge badge-green">Free</span> : <span className="badge badge-orange">{event.ticket_price?.toLocaleString()}d</span>}
            {!event.is_published && <span className="badge badge-red">Draft</span>}
            {event.is_recurring && <span className="badge badge-blue" style={{ background: 'var(--accent)', color: '#fff' }}>🔄 {event.recurrence_pattern === 'monthly' ? 'Monthly' : event.recurrence_pattern === 'biweekly' ? 'Biweekly' : 'Weekly'}</span>}
          </div>
        </div>
        <div style={{ display: 'flex', gap: 8, alignItems: 'center', flexShrink: 0 }}>
          <label style={{ display: 'flex', alignItems: 'center', gap: 6, fontSize: 13, color: 'var(--text-secondary)', cursor: 'pointer' }}><input type="checkbox" checked={!!event.is_published} onChange={e => onUpdate(event.id, { is_published: e.target.checked })} style={{ accentColor: 'var(--green)' }} /> Published</label>
          <button className="btn-outline" onClick={() => onToggleEdit(event.id)} style={{ padding: '6px 12px', fontSize: 12 }}>{isEditing ? 'Done' : 'Edit'}</button>
          <button className="btn-outline" onClick={() => onLoadOrders(event.id)} style={{ padding: '6px 12px', fontSize: 12 }}>{isExpanded ? 'Hide' : 'Attendees'}</button>
          <button className="btn-red" onClick={() => onDelete(event.id)} style={{ padding: '6px 10px', fontSize: 12 }}>Remove</button>
        </div>
      </div>
      {isEditing && (
        <div>
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', gap: 12, marginBottom: 12 }}>
            <div><label className="label">Date</label><input className="input" type="date" defaultValue={event.event_date || ''} onBlur={e => onUpdate(event.id, { event_date: e.target.value })} /></div>
            <div><label className="label">Start</label><input className="input" type="time" defaultValue={event.start_time || ''} onBlur={e => onUpdate(event.id, { start_time: e.target.value })} /></div>
            <div><label className="label">End</label><input className="input" type="time" defaultValue={event.end_time || ''} onBlur={e => onUpdate(event.id, { end_time: e.target.value })} /></div>
          </div>
          <div style={{ marginBottom: 12 }}><label className="label">Description</label><input className="input" defaultValue={event.description || ''} onBlur={e => onUpdate(event.id, { description: e.target.value })} /></div>
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12, marginBottom: 12 }}>
            <div><label className="label">Facebook Link</label><input className="input" defaultValue={event.facebook_link || ''} onBlur={e => onUpdate(event.id, { facebook_link: e.target.value })} /></div>
            <div><label className="label">Photo URL</label><input className="input" defaultValue={event.image_url || ''} onBlur={e => onUpdate(event.id, { image_url: e.target.value || null })} /></div>
          </div>
          <div className="card" style={{ padding: 16, marginBottom: 12, background: 'var(--bg-subtle)' }}>
            <div className="section-title" style={{ marginBottom: 12 }}>Ticketing</div>
            <div style={{ display: 'flex', gap: 20, marginBottom: 12 }}>
              <label style={{ display: 'flex', alignItems: 'center', gap: 8, fontSize: 14, color: 'var(--text-secondary)', cursor: 'pointer' }}><input type="radio" checked={!!event.is_free} onChange={() => onUpdate(event.id, { is_free: true, ticket_price: 0 })} style={{ accentColor: 'var(--accent)' }} /> Free</label>
              <label style={{ display: 'flex', alignItems: 'center', gap: 8, fontSize: 14, color: 'var(--text-secondary)', cursor: 'pointer' }}><input type="radio" checked={!event.is_free} onChange={() => onUpdate(event.id, { is_free: false })} style={{ accentColor: 'var(--accent)' }} /> Paid</label>
            </div>
            {!event.is_free && (
              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12, marginBottom: 12 }}>
                <div><label className="label">Price (VND)</label><input className="input" type="number" defaultValue={event.ticket_price || ''} onBlur={e => onUpdate(event.id, { ticket_price: parseInt(e.target.value) || 0 })} /></div>
                <div><label className="label">Ticket Link</label><input className="input" defaultValue={event.ticket_link || ''} onBlur={e => onUpdate(event.id, { ticket_link: e.target.value })} /></div>
              </div>
            )}
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12 }}>
              <div><label className="label">Capacity</label><input className="input" type="number" defaultValue={event.capacity || ''} onBlur={e => onUpdate(event.id, { capacity: e.target.value ? parseInt(e.target.value) : null })} placeholder="Unlimited" /></div>
              <div style={{ display: 'flex', alignItems: 'flex-end', paddingBottom: 4 }}><label style={{ display: 'flex', alignItems: 'center', gap: 8, fontSize: 14, color: 'var(--text-secondary)', cursor: 'pointer' }}><input type="checkbox" checked={!!event.rsvp_enabled} onChange={e => onUpdate(event.id, { rsvp_enabled: e.target.checked })} style={{ accentColor: 'var(--accent)' }} /> RSVP on site</label></div>
            </div>
          </div>
          <div className="card" style={{ padding: 16, marginTop: 12, background: 'var(--bg-subtle)' }}>
            <div className="section-title" style={{ marginBottom: 12 }}>Recurring</div>
            <div style={{ display: 'flex', gap: 20, alignItems: 'center' }}>
              <label style={{ display: 'flex', alignItems: 'center', gap: 8, fontSize: 14, color: 'var(--text-secondary)', cursor: 'pointer' }}>
                <input type="checkbox" checked={!!event.is_recurring} onChange={e => onUpdate(event.id, { is_recurring: e.target.checked, recurrence_pattern: e.target.checked ? (event.recurrence_pattern || 'weekly') : null })} style={{ accentColor: 'var(--accent)' }} />
                Recurring event
              </label>
              {event.is_recurring && (
                <select className="input" value={event.recurrence_pattern || 'weekly'} onChange={e => onUpdate(event.id, { recurrence_pattern: e.target.value })} style={{ width: 'auto', minWidth: 140 }}>
                  <option value="weekly">Every week</option>
                  <option value="biweekly">Every 2 weeks</option>
                  <option value="monthly">Every month</option>
                </select>
              )}
            </div>
          </div>
        </div>
      )}
      {isExpanded && (
        <div style={{ marginTop: 18, borderTop: '1px solid var(--border)', paddingTop: 18 }}>
          <div className="section-title" style={{ marginBottom: 14 }}>Attendees \u2014 {orders.length} registered</div>
          {orders.length === 0 ? (
            <div style={{ fontSize: 14, color: 'var(--text-muted)' }}>No RSVPs yet</div>
          ) : (
            <table className="data-table">
              <thead><tr><th>Name</th><th>Contact</th><th>Qty</th><th>Status</th><th style={{ textAlign: 'right' }}>Check In</th></tr></thead>
              <tbody>
                {orders.map((o: any) => (
                  <tr key={o.id}>
                    <td style={{ fontWeight: 500 }}>{o.name}</td>
                    <td style={{ fontSize: 13, color: 'var(--text-muted)' }}>{o.email}{o.phone && ` \u00b7 ${o.phone}`}</td>
                    <td>{o.quantity || 1}</td>
                    <td><span className={`badge ${o.checked_in ? 'badge-green' : 'badge-gray'}`}>{o.checked_in ? 'Checked In' : 'Not yet'}</span></td>
                    <td style={{ textAlign: 'right' }}><button className={o.checked_in ? 'btn-green' : 'btn-outline'} onClick={() => onCheckIn(o.id, o.checked_in)} style={{ padding: '5px 12px', fontSize: 12 }}>{o.checked_in ? 'Undo' : 'Check In'}</button></td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </div>
      )}
    </div>
  )
}

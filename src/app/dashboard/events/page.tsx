'use client'
import { useEffect, useState } from 'react'
import { supabase } from '@/lib/supabase'

const BLANK_EVENT = {
  title: '', type: '', description: '', event_date: '', start_time: '', end_time: '',
  facebook_link: '', image_url: '', is_free: true, ticket_price: '', ticket_link: '', capacity: '', rsvp_enabled: true
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
      rsvp_enabled: newEvent.rsvp_enabled, is_published: true
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
    if (!dateStr) return '—'
    return new Date(dateStr + 'T00:00:00').toLocaleDateString('en', { weekday: 'short', day: 'numeric', month: 'short' })
  }

  const upcomingEvents = events.filter(e => {
    if (!e.event_date) return true
    return new Date(e.event_date) >= new Date(new Date().toISOString().split('T')[0])
  })

  const pastEvents = events.filter(e => e.event_date && new Date(e.event_date) < new Date(new Date().toISOString().split('T')[0]))

  return (
    <div style={{ maxWidth: 900 }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 28 }}>
        <div>
          <div className="page-title">Events</div>
          <div style={{ fontSize: 14, color: 'var(--text-muted)', marginTop: 4 }}>{events.length} event{events.length !== 1 ? 's' : ''} total</div>
        </div>
        <button className="btn-accent" onClick={() => setShowAdd(!showAdd)} style={{ fontSize: 14 }}>+ Create Event</button>
      </div>

      {loading ? (
        <div style={{ padding: 40, textAlign: 'center', color: 'var(--text-muted)' }}>Loading events...</div>
      ) : events.length === 0 ? (
        <div className="card" style={{ padding: 40, textAlign: 'center', color: 'var(--text-muted)' }}>No events yet. Create your first event above.</div>
      ) : (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
          {events.map(event => (
            <div key={event.id} className="card" style={{ padding: 22 }}>
              <div style={{ fontFamily: 'Bebas Neue', fontSize: 22, letterSpacing: '0.04em', color: 'var(--text)', marginBottom: 8 }}>{event.title}</div>
              <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap', marginBottom: 12 }}>
                {event.type && <span className="badge badge-gray">{event.type}</span>}
                {event.event_date && <span className="badge badge-blue">{formatDate(event.event_date)}</span>}
                {event.start_time && <span style={{ fontSize: 13, color: 'var(--text-muted)' }}>{event.start_time}</span>}
                {event.is_free ? <span className="badge badge-green">Free</span> : <span className="badge badge-orange">Paid</span>}
              </div>
              <div style={{ display: 'flex', gap: 8 }}>
                <button className="btn-outline" onClick={() => setShowAdd(!showAdd)} style={{ fontSize: 12, padding: '6px 12px' }}>Edit</button>
                <button className="btn-red" onClick={() => deleteEvent(event.id)} style={{ fontSize: 12, padding: '6px 12px' }}>Remove</button>
              </div>
            </div>
          ))}
        </div>
      )}

      {toast && <div className="toast">{toast}</div>}
    </div>
  )
}

'use client'
import { useEffect, useState } from 'react'
import { supabase } from '@/lib/supabase'

export default function TicketsPage() {
  const [orders, setOrders] = useState<any[]>([])
  const [events, setEvents] = useState<any[]>([])
  const [selectedEvent, setSelectedEvent] = useState('all')
  const [selectedStatus, setSelectedStatus] = useState('all')
  const [loading, setLoading] = useState(true)
  const [toast, setToast] = useState('')

  useEffect(() => { loadData() }, [])

  async function loadData() {
    setLoading(true)
    const [{ data: evData }, { data: ordData }] = await Promise.all([
      supabase.from('events').select('id, title').order('event_date', { ascending: false }),
      supabase.from('ticket_orders').select('*').order('created_at', { ascending: false })
    ])
    setEvents(evData || [])
    setOrders(ordData || [])
    setLoading(false)
  }

  async function updateStatus(id: string, status: string) {
    await supabase.from('ticket_orders').update({ status }).eq('id', id)
    setOrders(prev => prev.map(o => o.id === id ? { ...o, status } : o))
    if (status === 'confirmed') {
      const order = orders.find(o => o.id === id)
      if (order?.email) {
        try {
          const ev = events.find(e => e.id === order.event_id)
          await fetch('https://hodqpckslglxuyhitlgh.supabase.co/functions/v1/send-ticket-email', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ order: { id: order.id, name: order.name, email: order.email, event_title: ev?.title || 'BigBamBoo Event', quantity: order.quantity } })
          })
          showToast('✓ Confirmed & ticket emailed')
        } catch { showToast('✓ Confirmed (email failed)') }
      } else { showToast('✓ Confirmed') }
    } else { showToast('Updated') }
  }

  async function checkIn(id: string, checked: boolean) {
    await supabase.from('ticket_orders').update({
      checked_in: !checked,
      checked_in_at: !checked ? new Date().toISOString() : null
    }).eq('id', id)
    setOrders(prev => prev.map(o => o.id === id ? { ...o, checked_in: !checked } : o))
    showToast(!checked ? '✓ Checked in' : 'Unchecked')
  }

  function showToast(msg: string) { setToast(msg); setTimeout(() => setToast(''), 2500) }

  const filtered = orders.filter(o => {
    if (selectedEvent !== 'all' && o.event_id !== selectedEvent) return false
    if (selectedStatus !== 'all' && o.status !== selectedStatus) return false
    return true
  })

  const totalTickets = filtered.reduce((sum, o) => sum + (o.quantity || 1), 0)
  const pending = filtered.filter(o => o.status === 'pending_payment').length
  const checkedIn = filtered.filter(o => o.checked_in).length

  function statusBadge(status: string) {
    const styles: any = {
      confirmed: { background: 'rgba(0,177,79,0.12)', color: '#00C858', border: '1px solid rgba(0,177,79,0.25)' },
      pending_payment: { background: 'rgba(232,168,32,0.12)', color: '#E8A820', border: '1px solid rgba(232,168,32,0.25)' },
      cancelled: { background: 'rgba(192,48,32,0.12)', color: '#E06060', border: '1px solid rgba(192,48,32,0.25)' },
    }
    const labels: any = { confirmed: 'Confirmed', pending_payment: 'Pending Payment', cancelled: 'Cancelled' }
    return <span style={{ ...(styles[status] || styles.confirmed), padding: '2px 9px', borderRadius: 100, fontSize: 9, letterSpacing: '0.1em', textTransform: 'uppercase' as const, fontFamily: 'DM Mono' }}>{labels[status] || status}</span>
  }

  return (
    <div>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 20 }}>
        <div style={{ fontFamily: 'Bebas Neue', fontSize: 32, letterSpacing: '0.06em' }}>Ticket Sales</div>
        <button className="btn-outline" onClick={loadData} style={{ fontFamily: 'DM Mono', fontSize: 11 }}>↻ Refresh</button>
      </div>
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4,1fr)', gap: 10, marginBottom: 20 }}>
        {[
          { label: 'Total Orders', value: filtered.length, color: '#F5EED8' },
          { label: 'Total Tickets', value: totalTickets, color: '#E8A820' },
          { label: 'Pending Payment', value: pending, color: '#E8A820' },
          { label: 'Checked In', value: checkedIn, color: '#00C858' },
        ].map(s => (
          <div key={s.label} className="card" style={{ padding: '14px 16px', textAlign: 'center' }}>
            <div style={{ fontFamily: 'Bebas Neue', fontSize: 32, color: s.color, letterSpacing: '0.04em' }}>{s.value}</div>
            <div style={{ fontFamily: 'DM Mono', fontSize: 9, letterSpacing: '0.12em', textTransform: 'uppercase', color: 'rgba(255,255,255,0.4)', marginTop: 2 }}>{s.label}</div>
          </div>
        ))}
      </div>
      <div style={{ display: 'flex', gap: 10, marginBottom: 16, flexWrap: 'wrap' }}>
        <select value={selectedEvent} onChange={e => setSelectedEvent(e.target.value)}
          style={{ background: '#1C2A28', border: '1px solid rgba(255,255,255,0.12)', color: '#F5EED8', padding: '8px 12px', borderRadius: 7, fontFamily: 'DM Mono', fontSize: 11, cursor: 'pointer' }}>
          <option value="all">All Events</option>
          {events.map(ev => <option key={ev.id} value={ev.id}>{ev.title}</option>)}
        </select>
        <select value={selectedStatus} onChange={e => setSelectedStatus(e.target.value)}
          style={{ background: '#1C2A28', border: '1px solid rgba(255,255,255,0.12)', color: '#F5EED8', padding: '8px 12px', borderRadius: 7, fontFamily: 'DM Mono', fontSize: 11, cursor: 'pointer' }}>
          <option value="all">All Statuses</option>
          <option value="pending_payment">Pending Payment</option>
          <option value="confirmed">Confirmed</option>
          <option value="cancelled">Cancelled</option>
        </select>
      </div>
      {loading ? <div style={{ color: 'rgba(255,255,255,0.4)', padding: 20 }}>Loading...</div> : (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
          {filtered.length === 0 && <div style={{ color: 'rgba(255,255,255,0.3)', fontSize: 13, padding: '20px 0' }}>No orders yet.</div>}
          {filtered.map(order => (
            <div key={order.id} className="card" style={{ padding: 16, borderLeft: `3px solid ${order.checked_in ? '#00C858' : order.status === 'pending_payment' ? '#E8A820' : 'rgba(255,255,255,0.08)'}` }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', flexWrap: 'wrap', gap: 10 }}>
                <div>
                  <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 4, flexWrap: 'wrap' }}>
                    <span style={{ fontWeight: 600, fontSize: 15, color: '#F5EED8' }}>{order.name}</span>
                    {statusBadge(order.status)}
                    {order.checked_in && <span style={{ background: 'rgba(0,177,79,0.12)', color: '#00C858', border: '1px solid rgba(0,177,79,0.25)', padding: '2px 9px', borderRadius: 100, fontSize: 9, letterSpacing: '0.1em', textTransform: 'uppercase', fontFamily: 'DM Mono' }}>✓ In</span>}
                  </div>
                  <div style={{ fontSize: 12, color: 'rgba(255,255,255,0.45)', fontFamily: 'DM Mono' }}>{order.email}{order.phone && ` · ${order.phone}`}</div>
                  <div style={{ fontSize: 12, color: 'rgba(255,255,255,0.3)', marginTop: 3 }}>
                    {order.event_title} · {order.quantity} ticket{order.quantity > 1 ? 's' : ''} · {new Date(order.created_at).toLocaleDateString('en', { day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit' })}
                  </div>
                </div>
                <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap' }}>
                  {order.status === 'pending_payment' && (
                    <button onClick={() => updateStatus(order.id, 'confirmed')}
                      style={{ background: 'rgba(0,177,79,0.12)', border: '1px solid rgba(0,177,79,0.3)', color: '#00C858', padding: '6px 14px', borderRadius: 6, fontSize: 11, cursor: 'pointer', fontFamily: 'DM Mono' }}>
                      ✓ Confirm Payment
                    </button>
                  )}
                  <button onClick={() => checkIn(order.id, order.checked_in)}
                    style={{ background: order.checked_in ? 'rgba(0,177,79,0.12)' : 'rgba(255,255,255,0.06)', border: `1px solid ${order.checked_in ? 'rgba(0,177,79,0.3)' : 'rgba(255,255,255,0.12)'}`, color: order.checked_in ? '#00C858' : 'rgba(255,255,255,0.5)', padding: '6px 14px', borderRadius: 6, fontSize: 11, cursor: 'pointer', fontFamily: 'DM Mono' }}>
                    {order.checked_in ? '✓ Checked In' : 'Check In'}
                  </button>
                  {order.status !== 'cancelled' && (
                    <button onClick={() => updateStatus(order.id, 'cancelled')}
                      style={{ background: 'rgba(192,48,32,0.08)', border: '1px solid rgba(192,48,32,0.2)', color: '#E06060', padding: '6px 14px', borderRadius: 6, fontSize: 11, cursor: 'pointer', fontFamily: 'DM Mono' }}>
                      Cancel
                    </button>
                  )}
                </div>
              </div>
            </div>
          ))}
        </div>
      )}
      {toast && <div style={{ position: 'fixed', bottom: 24, right: 24, background: '#00B14F', color: '#fff', padding: '11px 20px', borderRadius: 8, fontFamily: 'DM Mono', fontSize: 11, letterSpacing: '0.1em', zIndex: 9999 }}>{toast}</div>}
    </div>
  )
}

'use client'
import { useEffect, useState } from 'react'
import { supabase } from '@/lib/supabase'

export default function TicketsPage() {
  const [orders, setOrders] = useState<any[]>([])
  const [events, setEvents] = useState<any[]>([])
  const [selectedEvent, setSelectedEvent] = useState('all')
  const [selectedStatus, setSelectedStatus] = useState('all')
  const [searchQuery, setSearchQuery] = useState('')
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
          showToast('Confirmed & ticket emailed')
        } catch { showToast('Confirmed (email failed)') }
      } else { showToast('Confirmed') }
    } else { showToast('Status updated') }
  }

  async function checkIn(id: string, checked: boolean) {
    await supabase.from('ticket_orders').update({
      checked_in: !checked,
      checked_in_at: !checked ? new Date().toISOString() : null
    }).eq('id', id)
    setOrders(prev => prev.map(o => o.id === id ? { ...o, checked_in: !checked } : o))
    showToast(!checked ? 'Checked in' : 'Unchecked')
  }

  function showToast(msg: string) { setToast(msg); setTimeout(() => setToast(''), 2500) }

  function exportCSV() {
    const headers = ['Name', 'Email', 'Phone', 'Event', 'Quantity', 'Status', 'Checked In', 'Date']
    const rows = filtered.map(o => [
      o.name, o.email || '', o.phone || '', o.event_title || '', o.quantity || 1,
      o.status, o.checked_in ? 'Yes' : 'No',
      new Date(o.created_at).toLocaleDateString()
    ])
    const csv = [headers.join(','), ...rows.map(r => r.map((c: any) => `"${c}"`).join(','))].join('\n')
    const blob = new Blob([csv], { type: 'text/csv' })
    const url = URL.createObjectURL(blob)
    const a = document.createElement('a')
    a.href = url
    a.download = `tickets-${new Date().toISOString().split('T')[0]}.csv`
    a.click()
    URL.revokeObjectURL(url)
    showToast('CSV exported')
  }

  const filtered = orders.filter(o => {
    if (selectedEvent !== 'all' && o.event_id !== selectedEvent) return false
    if (selectedStatus !== 'all' && o.status !== selectedStatus) return false
    if (searchQuery) {
      const q = searchQuery.toLowerCase()
      if (!o.name?.toLowerCase().includes(q) && !o.email?.toLowerCase().includes(q) && !o.phone?.toLowerCase().includes(q)) return false
    }
    return true
  })

  const totalTickets = filtered.reduce((sum, o) => sum + (o.quantity || 1), 0)
  const pending = filtered.filter(o => o.status === 'pending_payment').length
  const confirmed = filtered.filter(o => o.status === 'confirmed').length
  const checkedIn = filtered.filter(o => o.checked_in).length

  return (
    <div style={{ maxWidth: 1100 }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 28 }}>
        <div>
          <div className="page-title">Ticket Sales</div>
          <div style={{ fontSize: 14, color: 'var(--text-muted)', marginTop: 4 }}>Manage orders, confirm payments & check in guests</div>
        </div>
        <div style={{ display: 'flex', gap: 8 }}>
          <button className="btn-outline" onClick={exportCSV} style={{ fontSize: 13 }}>Export CSV</button>
          <button className="btn-outline" onClick={loadData} style={{ fontSize: 13 }}>Refresh</button>
        </div>
      </div>

      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', gap: 14, marginBottom: 24 }}>
        {[
          { label: 'Total Orders', value: filtered.length },
          { label: 'Total Tickets', value: totalTickets },
          { label: 'Pending Payment', value: pending, highlight: pending > 0 },
          { label: 'Checked In', value: checkedIn },
        ].map(s => (
          <div key={s.label} className="card kpi-card">
            <div className="kpi-label">{s.label}</div>
            <div className="kpi-value" style={{ color: s.highlight ? 'var(--accent)' : 'var(--text)' }}>{s.value}</div>
          </div>
        ))}
      </div>

      <div style={{ display: 'flex', gap: 10, marginBottom: 20, flexWrap: 'wrap', alignItems: 'center' }}>
        <input className="input" value={searchQuery} onChange={e => setSearchQuery(e.target.value)} placeholder="Search by name, email, or phone..." style={{ width: 280, fontSize: 14 }} />
        <select className="input" value={selectedEvent} onChange={e => setSelectedEvent(e.target.value)} style={{ width: 200 }}>
          <option value="all">All Events</option>
          {events.map(ev => <option key={ev.id} value={ev.id}>{ev.title}</option>)}
        </select>
        <select className="input" value={selectedStatus} onChange={e => setSelectedStatus(e.target.value)} style={{ width: 180 }}>
          <option value="all">All Statuses</option>
          <option value="pending_payment">Pending Payment</option>
          <option value="confirmed">Confirmed</option>
          <option value="cancelled">Cancelled</option>
        </select>
        <div style={{ fontSize: 13, color: 'var(--text-muted)', marginLeft: 'auto' }}>{filtered.length} order{filtered.length !== 1 ? 's' : ''}</div>
      </div>

      {loading ? (
        <div style={{ padding: 40, textAlign: 'center', color: 'var(--text-muted)' }}>Loading orders...</div>
      ) : filtered.length === 0 ? (
        <div className="card" style={{ padding: 40, textAlign: 'center', color: 'var(--text-muted)', fontSize: 14 }}>
          {searchQuery || selectedEvent !== 'all' || selectedStatus !== 'all' ? 'No orders match your filters' : 'No ticket orders yet'}
        </div>
      ) : (
        <div className="card" style={{ overflow: 'hidden' }}>
          <table className="data-table">
            <thead>
              <tr><th>Guest</th><th>Event</th><th>Qty</th><th>Status</th><th>Date</th><th style={{ textAlign: 'right' }}>Actions</th></tr>
            </thead>
            <tbody>
              {filtered.map(order => (
                <tr key={order.id}>
                  <td>
                    <div style={{ fontWeight: 600, fontSize: 14 }}>{order.name}</div>
                    <div style={{ fontSize: 12, color: 'var(--text-muted)' }}>{order.email}{order.phone && ` \u00b7 ${order.phone}`}</div>
                  </td>
                  <td style={{ fontSize: 13, color: 'var(--text-secondary)' }}>{order.event_title || '\u2014'}</td>
                  <td style={{ fontWeight: 500 }}>{order.quantity || 1}</td>
                  <td>
                    <span className={`badge ${order.status === 'confirmed' ? 'badge-green' : order.status === 'pending_payment' ? 'badge-orange' : 'badge-red'}`}>
                      {order.status === 'pending_payment' ? 'Pending' : order.status === 'confirmed' ? 'Confirmed' : 'Cancelled'}
                    </span>
                    {order.checked_in && <span className="badge badge-green" style={{ marginLeft: 6 }}>In</span>}
                  </td>
                  <td style={{ fontSize: 13, color: 'var(--text-muted)' }}>
                    {new Date(order.created_at).toLocaleDateString('en', { day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit' })}
                  </td>
                  <td style={{ textAlign: 'right' }}>
                    <div style={{ display: 'flex', gap: 6, justifyContent: 'flex-end' }}>
                      {order.status === 'pending_payment' && (
                        <button className="btn-green" onClick={() => updateStatus(order.id, 'confirmed')} style={{ padding: '6px 12px', fontSize: 12 }}>Confirm</button>
                      )}
                      {order.status === 'cancelled' && (
                        <button className="btn-green" onClick={() => updateStatus(order.id, 'confirmed')} style={{ padding: '6px 12px', fontSize: 12 }}>Re-confirm</button>
                      )}
                      <button className={order.checked_in ? 'btn-green' : 'btn-outline'} onClick={() => checkIn(order.id, order.checked_in)} style={{ padding: '6px 12px', fontSize: 12 }}>
                        {order.checked_in ? 'Checked In' : 'Check In'}
                      </button>
                      {order.status !== 'cancelled' && (
                        <button className="btn-red" onClick={() => updateStatus(order.id, 'cancelled')} style={{ padding: '6px 12px', fontSize: 12 }}>Cancel</button>
                      )}
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      {toast && <div className="toast">{toast}</div>}
    </div>
  )
}

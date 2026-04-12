'use client'
import { useEffect, useState } from 'react'
import { supabase } from '@/lib/supabase'

const BLANK_TICKET = { name: '', email: '', phone: '', event_id: '', quantity: 1, status: 'confirmed', is_free: false }

export default function TicketsPage() {
  const [orders, setOrders] = useState<any[]>([])
  const [events, setEvents] = useState<any[]>([])
  const [selectedEvent, setSelectedEvent] = useState('all')
  const [selectedStatus, setSelectedStatus] = useState('all')
  const [searchQuery, setSearchQuery] = useState('')
  const [loading, setLoading] = useState(true)
  const [toast, setToast] = useState('')
  const [showAdd, setShowAdd] = useState(false)
  const [newTicket, setNewTicket] = useState<any>({ ...BLANK_TICKET })
  const [editingId, setEditingId] = useState<string | null>(null)

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
    const { error } = await supabase.from('ticket_orders').update({ status }).eq('id', id)
    if (error) { showToast('Error: ' + error.message); return }
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

  async function deleteOrder(id: string) {
    if (!confirm('Permanently delete this ticket order?')) return
    const { error } = await supabase.from('ticket_orders').delete().eq('id', id)
    if (error) { showToast('Error: ' + error.message); return }
    setOrders(prev => prev.filter(o => o.id !== id))
    showToast('Ticket deleted')
  }

  async function updateOrder(id: string, changes: any) {
    const { error } = await supabase.from('ticket_orders').update(changes).eq('id', id)
    if (error) { showToast('Error: ' + error.message); return }
    setOrders(prev => prev.map(o => o.id === id ? { ...o, ...changes } : o))
    showToast('Updated')
  }

  async function createTicket() {
    if (!newTicket.name) { showToast('Name is required'); return }
    if (!newTicket.event_id) { showToast('Please select an event'); return }
    const ev = events.find(e => e.id === newTicket.event_id)
    const { data, error } = await supabase.from('ticket_orders').insert({
      name: newTicket.name,
      email: newTicket.email || null,
      phone: newTicket.phone || null,
      event_id: newTicket.event_id,
      event_title: ev?.title || '',
      quantity: parseInt(newTicket.quantity) || 1,
      status: newTicket.status,
      is_free: newTicket.is_free,
    }).select().single()
    if (error) { showToast('Error: ' + error.message); return }
    if (data) {
      setOrders(prev => [data, ...prev])
      setNewTicket({ ...BLANK_TICKET })
      setShowAdd(false)
      if (newTicket.status === 'confirmed' && newTicket.email) {
        try {
          await fetch('https://hodqpckslglxuyhitlgh.supabase.co/functions/v1/send-ticket-email', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
              order: {
                id: data.id,
                name: newTicket.name,
                email: newTicket.email,
                event_title: ev?.title || 'BigBamBoo Event',
                quantity: parseInt(newTicket.quantity) || 1
              }
            })
          })
          showToast('Ticket created & emailed')
        } catch {
          showToast('Ticket created (email failed)')
        }
      } else {
        showToast('Ticket created')
      }
    }
  }

  async function checkIn(id: string, checked: boolean) {
    const { error } = await supabase.from('ticket_orders').update({
      checked_in: !checked,
      checked_in_at: !checked ? new Date().toISOString() : null
    }).eq('id', id)
    if (error) { showToast('Error: ' + error.message); return }
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
      {/* Header */}
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 28 }}>
        <div>
          <div className="page-title">Ticket Sales</div>
          <div style={{ fontSize: 14, color: 'var(--text-muted)', marginTop: 4 }}>Manage orders, confirm payments & check in guests</div>
        </div>
        <div style={{ display: 'flex', gap: 8 }}>
          <button className="btn-accent" onClick={() => setShowAdd(!showAdd)} style={{ fontSize: 13, padding: '9px 18px' }}>+ Add Ticket</button>
          <button className="btn-outline" onClick={exportCSV} style={{ fontSize: 13 }}>Export CSV</button>
          <button className="btn-outline" onClick={loadData} style={{ fontSize: 13 }}>Refresh</button>
        </div>
      </div>

      {/* Add Ticket Form */}
      {showAdd && (
        <div className="card" style={{ padding: 24, marginBottom: 24, borderColor: 'var(--accent)', borderStyle: 'dashed' }}>
          <div className="section-title" style={{ color: 'var(--accent)', marginBottom: 18 }}>New Ticket Order</div>
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 14, marginBottom: 14 }}>
            <div><label className="label">Guest Name *</label>
              <input className="input" value={newTicket.name} onChange={e => setNewTicket((p: any) => ({ ...p, name: e.target.value }))} placeholder="Full name" /></div>
            <div><label className="label">Event *</label>
              <select className="input" value={newTicket.event_id} onChange={e => setNewTicket((p: any) => ({ ...p, event_id: e.target.value }))}>
                <option value="">Select event</option>
                {events.map(ev => <option key={ev.id} value={ev.id}>{ev.title}</option>)}
              </select></div>
          </div>
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', gap: 14, marginBottom: 14 }}>
            <div><label className="label">Email</label>
              <input className="input" type="email" value={newTicket.email} onChange={e => setNewTicket((p: any) => ({ ...p, email: e.target.value }))} placeholder="guest@email.com" /></div>
            <div><label className="label">Phone</label>
              <input className="input" value={newTicket.phone} onChange={e => setNewTicket((p: any) => ({ ...p, phone: e.target.value }))} placeholder="+84 ..." /></div>
            <div><label className="label">Quantity</label>
              <input className="input" type="number" min="1" value={newTicket.quantity} onChange={e => setNewTicket((p: any) => ({ ...p, quantity: e.target.value }))} /></div>
          </div>
          <div style={{ display: 'flex', gap: 14, alignItems: 'center', marginBottom: 14 }}>
            <label className="label" style={{ marginBottom: 0 }}>Ticket Type:</label>
            <label style={{ display: 'flex', alignItems: 'center', gap: 6, fontSize: 14, color: 'var(--text-secondary)', cursor: 'pointer' }}>
              <input type="radio" checked={!newTicket.is_free} onChange={() => setNewTicket((p: any) => ({ ...p, is_free: false }))} style={{ accentColor: 'var(--accent)' }} /> Paid
            </label>
            <label style={{ display: 'flex', alignItems: 'center', gap: 6, fontSize: 14, color: 'var(--text-secondary)', cursor: 'pointer' }}>
              <input type="radio" checked={newTicket.is_free} onChange={() => setNewTicket((p: any) => ({ ...p, is_free: true }))} style={{ accentColor: 'var(--green)' }} /> Free
            </label>
          </div>
          <div style={{ display: 'flex', gap: 14, alignItems: 'center', marginBottom: 18 }}>
            <label className="label" style={{ marginBottom: 0 }}>Status:</label>
            <label style={{ display: 'flex', alignItems: 'center', gap: 6, fontSize: 14, color: 'var(--text-secondary)', cursor: 'pointer' }}>
              <input type="radio" checked={newTicket.status === 'confirmed'} onChange={() => setNewTicket((p: any) => ({ ...p, status: 'confirmed' }))} style={{ accentColor: 'var(--green)' }} /> Confirmed
            </label>
            <label style={{ display: 'flex', alignItems: 'center', gap: 6, fontSize: 14, color: 'var(--text-secondary)', cursor: 'pointer' }}>
              <input type="radio" checked={newTicket.status === 'pending_payment'} onChange={() => setNewTicket((p: any) => ({ ...p, status: 'pending_payment' }))} style={{ accentColor: 'var(--accent)' }} /> Pending Payment
            </label>
          </div>
          <div style={{ display: 'flex', gap: 10 }}>
            <button className="btn-accent" onClick={createTicket}>Create Ticket</button>
            <button className="btn-outline" onClick={() => setShowAdd(false)}>Cancel</button>
          </div>
        </div>
      )}

      {/* Stats */}
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', gap: 14, marginBottom: 24 }}>
        {[
          { label: 'Total Orders', value: filtered.length },
          { label: 'Total Tickets', value: totalTickets },
          { label: 'Pending Payment', value: pending, highlight: pending > 0 },
          { label: 'Checked In', value: checkedIn },
        ].map(s => (
          <div key={s.label} className="card" style={{ padding: '18px 20px' }}>
            <div style={{ fontFamily: 'Bebas Neue', fontSize: 36, color: s.highlight ? 'var(--accent)' : 'var(--text)', letterSpacing: '0.02em', lineHeight: 1 }}>{s.value}</div>
            <div style={{ fontSize: 13, color: 'var(--text-muted)', marginTop: 6 }}>{s.label}</div>
          </div>
        ))}
      </div>

      {/* Filters */}
      <div style={{ display: 'flex', gap: 10, marginBottom: 20, flexWrap: 'wrap', alignItems: 'center' }}>
        <input
          className="input"
          value={searchQuery}
          onChange={e => setSearchQuery(e.target.value)}
          placeholder="Search by name, email, or phone..."
          style={{ width: 280, fontSize: 14 }}
        />
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

      {/* Table */}
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
              <tr>
                <th>Guest</th>
                <th>Event</th>
                <th>Qty</th>
                <th>Type</th>
                <th>Status</th>
                <th>Date</th>
                <th style={{ textAlign: 'right' }}>Actions</th>
              </tr>
            </thead>
            <tbody>
              {filtered.map(order => (
                <tr key={order.id}>
                  <td>
                    {editingId === order.id ? (
                      <div>
                        <input className="input" defaultValue={order.name} onBlur={e => e.target.value !== order.name && updateOrder(order.id, { name: e.target.value })} style={{ fontSize: 13, marginBottom: 4 }} />
                        <input className="input" defaultValue={order.email || ''} onBlur={e => updateOrder(order.id, { email: e.target.value || null })} placeholder="email" style={{ fontSize: 12 }} />
                      </div>
                    ) : (
                      <div>
                        <div style={{ fontWeight: 600, fontSize: 14 }}>{order.name}</div>
                        <div style={{ fontSize: 12, color: 'var(--text-muted)' }}>{order.email}{order.phone && ` · ${order.phone}`}</div>
                      </div>
                    )}
                  </td>
                  <td style={{ fontSize: 13, color: 'var(--text-secondary)' }}>{order.event_title || '—'}</td>
                  <td>
                    {editingId === order.id ? (
                      <input className="input" type="number" min="1" defaultValue={order.quantity || 1} onBlur={e => updateOrder(order.id, { quantity: parseInt(e.target.value) || 1 })} style={{ width: 60, fontSize: 13, padding: '4px 8px' }} />
                    ) : (
                      <span style={{ fontWeight: 500 }}>{order.quantity || 1}</span>
                    )}
                  </td>
                  <td>
                    {editingId === order.id ? (
                      <select className="input" value={order.is_free ? 'free' : 'paid'} onChange={e => updateOrder(order.id, { is_free: e.target.value === 'free' })} style={{ width: 80, fontSize: 12, padding: '4px 8px' }}>
                        <option value="paid">Paid</option>
                        <option value="free">Free</option>
                      </select>
                    ) : (
                      order.is_free ? <span className="badge badge-blue">Free</span> : <span className="badge badge-gray">Paid</span>
                    )}
                  </td>
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
                      <button className="btn-outline" onClick={() => setEditingId(editingId === order.id ? null : order.id)} style={{ padding: '6px 12px', fontSize: 12 }}>
                        {editingId === order.id ? 'Done' : 'Edit'}
                      </button>
                      {order.status === 'pending_payment' && (
                        <button className="btn-green" onClick={() => updateStatus(order.id, 'confirmed')} style={{ padding: '6px 12px', fontSize: 12 }}>
                          Confirm
                        </button>
                      )}
                      {order.status === 'cancelled' && (
                        <button className="btn-green" onClick={() => updateStatus(order.id, 'confirmed')} style={{ padding: '6px 12px', fontSize: 12 }}>
                          Re-confirm
                        </button>
                      )}
                      <button
                        className={order.checked_in ? 'btn-green' : 'btn-outline'}
                        onClick={() => checkIn(order.id, order.checked_in)}
                        style={{ padding: '6px 12px', fontSize: 12 }}
                      >
                        {order.checked_in ? 'Checked In' : 'Check In'}
                      </button>
                      {order.status !== 'cancelled' && (
                        <button className="btn-red" onClick={() => updateStatus(order.id, 'cancelled')} style={{ padding: '6px 12px', fontSize: 12 }}>
                          Cancel
                        </button>
                      )}
                      <button className="btn-outline" onClick={() => deleteOrder(order.id)} style={{ padding: '6px 10px', fontSize: 12, color: 'var(--badge-red-text)' }}>
                        Delete
                      </button>
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

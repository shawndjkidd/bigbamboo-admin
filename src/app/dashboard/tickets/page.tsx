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
  const [showCreateModal, setShowCreateModal] = useState(false)
  const [form, setForm] = useState({ name: '', email: '', phone: '', event_id: '', quantity: '1', payment_method: 'cash', send_email: true, notes: '' })
  const [creating, setCreating] = useState(false)

  useEffect(() => { loadData() }, [])

  async function loadData() {
    setLoading(true)
    const [{ data: evData }, { data: ordData }] = await Promise.all([
      supabase.from('events').select('id, title, ticket_price').order('event_date', { ascending: false }),
      supabase.from('ticket_orders').select('*').order('created_at', { ascending: false })
    ])
    setEvents(evData || [])
    setOrders(ordData || [])
    setLoading(false)
  }

  async function createManualTicket() {
    if (!form.name.trim()) return showToast('Name is required')
    if (!form.event_id) return showToast('Select an event')
    setCreating(true)
    const selectedEv = events.find(e => e.id === form.event_id)
    const orderData = {
      name: form.name.trim(),
      email: form.email.trim() || null,
      phone: form.phone.trim() || null,
      event_id: form.event_id,
      event_title: selectedEv?.title || '',
      quantity: parseInt(form.quantity) || 1,
      payment_method: form.payment_method,
      status: 'confirmed',
    }
    const { data: newOrder, error } = await supabase.from('ticket_orders').insert(orderData).select().single()
    if (error || !newOrder) { setCreating(false); return showToast('Failed to create ticket') }
    if (form.send_email && form.email.trim()) {
      try {
        const res = await fetch(process.env.NEXT_PUBLIC_SUPABASE_URL + '/functions/v1/send-ticket-email', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ order: newOrder })
        })
        const result = await res.json()
        showToast(result.success ? '✓ Ticket created & emailed! 🎟' : '✓ Ticket created (email failed)')
      } catch { showToast('✓ Ticket created (email not sent)') }
    } else { showToast('✓ Ticket created manually') }
    setOrders(prev => [newOrder, ...prev])
    setShowCreateModal(false)
    setForm({ name: '', email: '', phone: '', event_id: '', quantity: '1', payment_method: 'cash', send_email: true, notes: '' })
    setCreating(false)
  }

  async function updateStatus(id: string, status: string) {
    await supabase.from('ticket_orders').update({ status }).eq('id', id)
    setOrders(prev => prev.map(o => o.id === id ? { ...o, status } : o))
    if (status === 'confirmed') {
      const order = orders.find(o => o.id === id)
      if (order?.email) {
        try {
          const res = await fetch(process.env.NEXT_PUBLIC_SUPABASE_URL + '/functions/v1/send-ticket-email', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json', 'Authorization': 'Bearer ' + process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY },
            body: JSON.stringify({ order: { ...order, status: 'confirmed' } })
          })
          const data = await res.json()
          showToast(data.success ? '✓ Confirmed · Ticket emailed! 🎟' : '✓ Confirmed (email failed)')
        } catch { showToast('✓ Confirmed (email not sent)') }
      } else { showToast('✓ Confirmed (no email on order)') }
    } else { showToast('Updated') }
  }

  async function checkIn(id: string, checked: boolean) {
    await supabase.from('ticket_orders').update({ checked_in: !checked, checked_in_at: !checked ? new Date().toISOString() : null }).eq('id', id)
    setOrders(prev => prev.map(o => o.id === id ? { ...o, checked_in: !checked } : o))
    showToast(!checked ? '✓ Checked in' : 'Unchecked')
  }

  function showToast(msg: string) { setToast(msg); setTimeout(() => setToast(''), 3000) }

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

  const inputStyle = { width: '100%', background: 'rgba(255,255,255,0.06)', border: '1px solid rgba(255,255,255,0.12)', borderRadius: 8, padding: '10px 12px', color: '#F5EED8', fontSize: 14, outline: 'none', fontFamily: 'inherit', boxSizing: 'border-box' as const }
  const labelStyle = { fontFamily: 'DM Mono', fontSize: 10, letterSpacing: '0.12em', textTransform: 'uppercase' as const, color: 'rgba(255,255,255,0.4)', marginBottom: 5, display: 'block' }

  return (
    <div>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 20 }}>
        <div style={{ fontFamily: 'Bebas Neue', fontSize: 32, letterSpacing: '0.06em' }}>Ticket Sales</div>
        <div style={{ display: 'flex', gap: 8 }}>
          <button className="btn-outline" onClick={loadData} style={{ fontFamily: 'DM Mono', fontSize: 11 }}>↻ Refresh</button>
          <button onClick={() => setShowCreateModal(true)} style={{ background: '#E8A820', color: '#1a0800', border: 'none', borderRadius: 8, padding: '8px 18px', fontFamily: 'Bebas Neue', fontSize: 16, letterSpacing: '0.08em', cursor: 'pointer' }}>
            + Create Ticket
          </button>
        </div>
      </div>

      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4,1fr)', gap: 10, marginBottom: 20 }}>
        {[{ label: 'Total Orders', value: filtered.length, color: '#F5EED8' }, { label: 'Total Tickets', value: totalTickets, color: '#E8A820' }, { label: 'Pending Payment', value: pending, color: '#E8A820' }, { label: 'Checked In', value: checkedIn, color: '#00C858' }].map(s => (
          <div key={s.label} className="card" style={{ padding: '14px 16px', textAlign: 'center' as const }}>
            <div style={{ fontFamily: 'Bebas Neue', fontSize: 32, color: s.color, letterSpacing: '0.04em' }}>{s.value}</div>
            <div style={{ fontFamily: 'DM Mono', fontSize: 9, letterSpacing: '0.12em', textTransform: 'uppercase' as const, color: 'rgba(255,255,255,0.4)', marginTop: 2 }}>{s.label}</div>
          </div>
        ))}
      </div>

      <div style={{ display: 'flex', gap: 10, marginBottom: 16, flexWrap: 'wrap' as const }}>
        <select value={selectedEvent} onChange={e => setSelectedEvent(e.target.value)} style={{ background: '#1C2A28', border: '1px solid rgba(255,255,255,0.12)', color: '#F5EED8', padding: '8px 12px', borderRadius: 7, fontFamily: 'DM Mono', fontSize: 11, cursor: 'pointer' }}>
          <option value="all">All Events</option>
          {events.map(ev => <option key={ev.id} value={ev.id}>{ev.title}</option>)}
        </select>
        <select value={selectedStatus} onChange={e => setSelectedStatus(e.target.value)} style={{ background: '#1C2A28', border: '1px solid rgba(255,255,255,0.12)', color: '#F5EED8', padding: '8px 12px', borderRadius: 7, fontFamily: 'DM Mono', fontSize: 11, cursor: 'pointer' }}>
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
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', flexWrap: 'wrap' as const, gap: 10 }}>
                <div>
                  <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 4, flexWrap: 'wrap' as const }}>
                    <span style={{ fontWeight: 600, fontSize: 15, color: '#F5EED8' }}>{order.name}</span>
                    {statusBadge(order.status)}
                    {order.checked_in && <span style={{ background: 'rgba(0,177,79,0.12)', color: '#00C858', border: '1px solid rgba(0,177,79,0.25)', padding: '2px 9px', borderRadius: 100, fontSize: 9, letterSpacing: '0.1em', textTransform: 'uppercase' as const, fontFamily: 'DM Mono' }}>✓ In</span>}
                    {order.payment_method === 'cash' && <span style={{ background: 'rgba(255,255,255,0.06)', color: 'rgba(255,255,255,0.4)', border: '1px solid rgba(255,255,255,0.1)', padding: '2px 9px', borderRadius: 100, fontSize: 9, letterSpacing: '0.1em', textTransform: 'uppercase' as const, fontFamily: 'DM Mono' }}>Cash</span>}
                    {order.payment_method === 'comp' && <span style={{ background: 'rgba(147,51,234,0.12)', color: '#C084FC', border: '1px solid rgba(147,51,234,0.25)', padding: '2px 9px', borderRadius: 100, fontSize: 9, letterSpacing: '0.1em', textTransform: 'uppercase' as const, fontFamily: 'DM Mono' }}>Comp</span>}
                  </div>
                  <div style={{ fontSize: 12, color: 'rgba(255,255,255,0.45)', fontFamily: 'DM Mono' }}>{order.email || '—'}{order.phone && ` · ${order.phone}`}</div>
                  <div style={{ fontSize: 12, color: 'rgba(255,255,255,0.3)', marginTop: 3 }}>{order.event_title} · {order.quantity} ticket{order.quantity > 1 ? 's' : ''} · {new Date(order.created_at).toLocaleDateString('en', { day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit' })}</div>
                </div>
                <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap' as const }}>
                  {order.status === 'pending_payment' && (
                    <button onClick={() => updateStatus(order.id, 'confirmed')} style={{ background: 'rgba(0,177,79,0.12)', border: '1px solid rgba(0,177,79,0.3)', color: '#00C858', padding: '6px 14px', borderRadius: 6, fontSize: 11, cursor: 'pointer', fontFamily: 'DM Mono' }}>✓ Confirm Payment</button>
                  )}
                  {order.status === 'confirmed' && order.email && (
                    <button onClick={() => updateStatus(order.id, 'confirmed')} style={{ background: 'rgba(232,168,32,0.08)', border: '1px solid rgba(232,168,32,0.2)', color: '#E8A820', padding: '6px 14px', borderRadius: 6, fontSize: 11, cursor: 'pointer', fontFamily: 'DM Mono' }}>✉ Resend Email</button>
                  )}
                  <button onClick={() => checkIn(order.id, order.checked_in)} style={{ background: order.checked_in ? 'rgba(0,177,79,0.12)' : 'rgba(255,255,255,0.06)', border: `1px solid ${order.checked_in ? 'rgba(0,177,79,0.3)' : 'rgba(255,255,255,0.12)'}`, color: order.checked_in ? '#00C858' : 'rgba(255,255,255,0.5)', padding: '6px 14px', borderRadius: 6, fontSize: 11, cursor: 'pointer', fontFamily: 'DM Mono' }}>
                    {order.checked_in ? '✓ Checked In' : 'Check In'}
                  </button>
                  {order.status !== 'cancelled' && (
                    <button onClick={() => updateStatus(order.id, 'cancelled')} style={{ background: 'rgba(192,48,32,0.08)', border: '1px solid rgba(192,48,32,0.2)', color: '#E06060', padding: '6px 14px', borderRadius: 6, fontSize: 11, cursor: 'pointer', fontFamily: 'DM Mono' }}>Cancel</button>
                  )}
                </div>
              </div>
            </div>
          ))}
        </div>
      )}

      {showCreateModal && (
        <div style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.75)', zIndex: 9000, display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 20 }}>
          <div style={{ background: '#1A3A38', border: '1px solid rgba(255,255,255,0.12)', borderRadius: 16, padding: 28, width: '100%', maxWidth: 480, maxHeight: '90vh', overflowY: 'auto' as const }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 24 }}>
              <div>
                <div style={{ fontFamily: 'Bebas Neue', fontSize: 26, letterSpacing: '0.06em', color: '#F5EED8' }}>Create Manual Ticket</div>
                <div style={{ fontFamily: 'DM Mono', fontSize: 10, color: 'rgba(255,255,255,0.35)', letterSpacing: '0.1em', textTransform: 'uppercase' as const, marginTop: 2 }}>Cash · Comp · Walk-in · Staff Guest</div>
              </div>
              <button onClick={() => setShowCreateModal(false)} style={{ background: 'rgba(255,255,255,0.08)', border: 'none', color: 'rgba(255,255,255,0.5)', width: 32, height: 32, borderRadius: '50%', cursor: 'pointer', fontSize: 16 }}>✕</button>
            </div>
            <div style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
              <div>
                <label style={labelStyle}>Guest Name *</label>
                <input style={inputStyle} placeholder="Full name" value={form.name} onChange={e => setForm(f => ({ ...f, name: e.target.value }))} />
              </div>
              <div>
                <label style={labelStyle}>Email (for ticket delivery)</label>
                <input style={inputStyle} type="email" placeholder="guest@email.com" value={form.email} onChange={e => setForm(f => ({ ...f, email: e.target.value }))} />
              </div>
              <div>
                <label style={labelStyle}>Phone (optional)</label>
                <input style={inputStyle} type="tel" placeholder="+84 ..." value={form.phone} onChange={e => setForm(f => ({ ...f, phone: e.target.value }))} />
              </div>
              <div>
                <label style={labelStyle}>Event *</label>
                <select style={{ ...inputStyle, cursor: 'pointer' }} value={form.event_id} onChange={e => setForm(f => ({ ...f, event_id: e.target.value }))}>
                  <option value="">Select event...</option>
                  {events.map(ev => <option key={ev.id} value={ev.id}>{ev.title}</option>)}
                </select>
              </div>
              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 10 }}>
                <div>
                  <label style={labelStyle}>Quantity</label>
                  <select style={{ ...inputStyle, cursor: 'pointer' }} value={form.quantity} onChange={e => setForm(f => ({ ...f, quantity: e.target.value }))}>
                    {[1,2,3,4,5,6,8,10].map(n => <option key={n} value={n}>{n} ticket{n > 1 ? 's' : ''}</option>)}
                  </select>
                </div>
                <div>
                  <label style={labelStyle}>Payment Type</label>
                  <select style={{ ...inputStyle, cursor: 'pointer' }} value={form.payment_method} onChange={e => setForm(f => ({ ...f, payment_method: e.target.value }))}>
                    <option value="cash">💵 Cash</option>
                    <option value="comp">🎁 Comp / Free</option>
                    <option value="bank_transfer">🏦 Bank Transfer</option>
                    <option value="card">💳 Card</option>
                    <option value="other">Other</option>
                  </select>
                </div>
              </div>
              <div style={{ background: 'rgba(255,255,255,0.04)', border: '1px solid rgba(255,255,255,0.08)', borderRadius: 10, padding: '12px 14px', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                <div>
                  <div style={{ fontSize: 13, color: '#F5EED8', marginBottom: 2 }}>Send ticket email</div>
                  <div style={{ fontFamily: 'DM Mono', fontSize: 10, color: 'rgba(255,255,255,0.35)' }}>{form.email ? `Will send to ${form.email}` : 'Enter email above to enable'}</div>
                </div>
                <button onClick={() => form.email && setForm(f => ({ ...f, send_email: !f.send_email }))} style={{ width: 44, height: 24, borderRadius: 12, border: 'none', cursor: form.email ? 'pointer' : 'not-allowed', background: form.send_email && form.email ? '#E8A820' : 'rgba(255,255,255,0.12)', transition: 'background 0.2s', position: 'relative' as const, flexShrink: 0 }}>
                  <div style={{ width: 18, height: 18, borderRadius: '50%', background: '#fff', position: 'absolute' as const, top: 3, transition: 'left 0.2s', left: form.send_email && form.email ? 23 : 3 }} />
                </button>
              </div>
              <div>
                <label style={labelStyle}>Notes (optional)</label>
                <input style={inputStyle} placeholder="e.g. VIP guest, paid at door..." value={form.notes} onChange={e => setForm(f => ({ ...f, notes: e.target.value }))} />
              </div>
              <button onClick={createManualTicket} disabled={creating} style={{ background: creating ? 'rgba(232,168,32,0.4)' : '#E8A820', color: '#1a0800', border: 'none', borderRadius: 10, padding: '14px', fontFamily: 'Bebas Neue', fontSize: 20, letterSpacing: '0.08em', cursor: creating ? 'not-allowed' : 'pointer', marginTop: 4 }}>
                {creating ? 'Creating...' : form.send_email && form.email ? '🎟 Create & Send Ticket' : '✓ Create Ticket'}
              </button>
            </div>
          </div>
        </div>
      )}

      {toast && <div style={{ position: 'fixed', bottom: 24, right: 24, background: '#00B14F', color: '#fff', padding: '11px 20px', borderRadius: 8, fontFamily: 'DM Mono', fontSize: 11, letterSpacing: '0.1em', zIndex: 9999 }}>{toast}</div>}
    </div>
  )
}

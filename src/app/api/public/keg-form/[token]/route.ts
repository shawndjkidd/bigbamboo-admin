// Public BrewAsia conference keg donation form — no login. Each brewery gets its own
// secret link (brewasia_producers.form_token). GET returns the brewery and what it has
// already submitted; POST saves. Submissions go straight into brewasia_kegs as
// Donated / Promised / Conference with from_form = true. A brewery can change its
// kegs until BigBamBoo marks them as anything other than Promised; after that those
// rows are locked and shown read-only.
import { NextRequest, NextResponse } from 'next/server'
import { getServiceClient } from '@/lib/supabase'

export const dynamic = 'force-dynamic'

const TOKEN_RE = /^[A-Za-z0-9_-]{20,64}$/
const COUPLERS = ['S', 'D', 'A', 'G', 'U']
const KEG_FIELDS = 'id, beer_name, beer_style, abv, ibu, size_litres, coupler, qty, status, returnable, notes'

const str = (v: unknown, max: number) => {
  const s = typeof v === 'string' ? v.trim() : ''
  return s ? s.slice(0, max) : null
}
const num = (v: unknown, lo: number, hi: number) => {
  const n = typeof v === 'number' ? v : parseFloat(String(v ?? '').replace(',', '.'))
  return Number.isFinite(n) && n >= lo && n <= hi ? Math.round(n * 10) / 10 : null
}

async function producerFor(token: string) {
  if (!TOKEN_RE.test(token)) return null
  const svc = getServiceClient()
  const { data } = await svc
    .from('brewasia_producers')
    .select('id, name, country, contact_name, contact_phone, contact_email, form_submitted_at')
    .eq('form_token', token)
    .maybeSingle()
  return data
}

export async function GET(_req: NextRequest, { params }: { params: { token: string } }) {
  const producer = await producerFor(params.token)
  if (!producer) return NextResponse.json({ error: 'This link isn’t valid. Ask BigBamBoo for a new one.' }, { status: 404 })
  const svc = getServiceClient()
  const { data: kegs } = await svc
    .from('brewasia_kegs')
    .select(KEG_FIELDS)
    .eq('producer_id', producer.id)
    .eq('from_form', true)
    .order('created_at', { ascending: true })
  return NextResponse.json({
    ok: true,
    brewery: {
      name: producer.name,
      contact_name: producer.contact_name,
      contact_phone: producer.contact_phone,
      contact_email: producer.contact_email,
    },
    submitted_at: producer.form_submitted_at,
    kegs: kegs || [],
  })
}

export async function POST(req: NextRequest, { params }: { params: { token: string } }) {
  const producer = await producerFor(params.token)
  if (!producer) return NextResponse.json({ error: 'This link isn’t valid. Ask BigBamBoo for a new one.' }, { status: 404 })

  let body: any
  try { body = await req.json() } catch { return NextResponse.json({ error: 'bad request' }, { status: 400 }) }

  const contact_name = str(body?.contact_name, 120)
  const contact_phone = str(body?.contact_phone, 60)
  const contact_email = str(body?.contact_email, 160)
  // Donated kegs always go back to the brewery after the event (Shawn, 2026-09-11).
  const returnable = true
  const notes = str(body?.notes, 1000)
  if (!contact_name || (!contact_phone && !contact_email)) {
    return NextResponse.json({ error: 'contact' }, { status: 422 })
  }

  const lines = (Array.isArray(body?.lines) ? body.lines : []).slice(0, 30).map((l: any) => {
    const coupler = str(l?.coupler, 2)?.toUpperCase() || null
    return {
      id: typeof l?.id === 'string' ? l.id : null,
      beer_name: str(l?.beer_name, 160),
      beer_style: str(l?.beer_style, 80),
      abv: num(l?.abv, 0, 30),
      ibu: (() => { const n = Math.round(Number(String(l?.ibu ?? '').replace(',', '.'))); return String(l?.ibu ?? '').trim() !== '' && Number.isFinite(n) && n >= 0 && n <= 200 ? n : null })(),
      size_litres: num(l?.size_litres, 1, 200),
      coupler: coupler && COUPLERS.includes(coupler) ? coupler : null,
      qty: Math.max(1, Math.min(100, Math.round(Number(l?.qty) || 1))),
    }
  }).filter((l: any) => l.beer_name)
  if (!lines.length) return NextResponse.json({ error: 'lines' }, { status: 422 })

  const svc = getServiceClient()
  const { data: existing, error: exErr } = await svc
    .from('brewasia_kegs')
    .select('id, status')
    .eq('producer_id', producer.id)
    .eq('from_form', true)
  if (exErr) return NextResponse.json({ error: 'save' }, { status: 500 })

  // Only rows still Promised can be changed by the brewery.
  const editable = new Set((existing || []).filter(r => r.status === 'promised').map(r => r.id))
  const keep = new Set<string>()
  const shared = {
    brewery: producer.name,
    contact_name, contact_phone, contact_email,
    returnable,
    notes: notes ? `From brewery form: ${notes}` : null,
  }

  for (const l of lines) {
    const { id, ...fields } = l
    if (id && editable.has(id)) {
      keep.add(id)
      const { error } = await svc.from('brewasia_kegs').update({ ...fields, ...shared }).eq('id', id)
      if (error) return NextResponse.json({ error: 'save' }, { status: 500 })
    } else if (!id || !(existing || []).some(r => r.id === id)) {
      const { error } = await svc.from('brewasia_kegs').insert({
        ...fields, ...shared,
        producer_id: producer.id,
        from_form: true,
        source: 'donated',
        status: 'promised',
        destination: 'conference',
      })
      if (error) return NextResponse.json({ error: 'save' }, { status: 500 })
    }
  }
  const removed = Array.from(editable).filter(id => !keep.has(id))
  if (removed.length) {
    const { error } = await svc.from('brewasia_kegs').delete().in('id', removed).eq('status', 'promised').eq('from_form', true)
    if (error) return NextResponse.json({ error: 'save' }, { status: 500 })
  }

  await svc.from('brewasia_producers').update({
    form_submitted_at: new Date().toISOString(),
    contact_name, contact_phone: contact_phone || producer.contact_phone, contact_email: contact_email || producer.contact_email,
  }).eq('id', producer.id)

  const { data: kegs } = await svc
    .from('brewasia_kegs')
    .select(KEG_FIELDS)
    .eq('producer_id', producer.id)
    .eq('from_form', true)
    .order('created_at', { ascending: true })
  return NextResponse.json({ ok: true, kegs: kegs || [] })
}

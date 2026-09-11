// Shared BrewAsia conference keg sign-up — one public link for every brewery, no login.
// The brewery types its name; we match it to the Producers list (or add it), save the
// kegs as Donated / Promised / Conference with from_form = true, and — the first time we
// hear from that brewery — hand back a private edit link (/brewasia/donate/<token>).
// This route only ever ADDS kegs. Changing or removing kegs needs the private link, so
// someone typing another brewery's name can't touch what that brewery already sent.
import { randomBytes } from 'crypto'
import { NextRequest, NextResponse } from 'next/server'
import { getServiceClient } from '@/lib/supabase'

export const dynamic = 'force-dynamic'

const COUPLERS = ['S', 'D', 'A', 'G', 'U']
const KEG_FIELDS = 'id, beer_name, beer_style, abv, size_litres, coupler, qty, status, returnable, notes'

const str = (v: unknown, max: number) => {
  const s = typeof v === 'string' ? v.trim().replace(/\s+/g, ' ') : ''
  return s ? s.slice(0, max) : null
}
const num = (v: unknown, lo: number, hi: number) => {
  const n = typeof v === 'number' ? v : parseFloat(String(v ?? '').replace(',', '.'))
  return Number.isFinite(n) && n >= lo && n <= hi ? Math.round(n * 10) / 10 : null
}
// "Heart of Darkness Brewery" and "heart of darkness" are the same brewery.
const breweryKey = (v: string) =>
  v.toLowerCase().replace(/\([^)]*\)/g, '').normalize('NFD').replace(/[\u0300-\u036f]/g, '').replace(/đ/g, 'd')
    .replace(/\b(the|brewery|brewing|brewers?|brewhouse|beer|beers|company|co|ltd)\b/g, '').replace(/[^a-z0-9]/g, '')

export async function POST(req: NextRequest) {
  let body: any
  try { body = await req.json() } catch { return NextResponse.json({ error: 'bad request' }, { status: 400 }) }

  // Spam trap: a hidden field real people never fill.
  if (typeof body?.website === 'string' && body.website.trim()) return NextResponse.json({ ok: true, brewery: null, kegs: [], edit_token: null })

  const breweryName = str(body?.brewery, 120)
  if (!breweryName || breweryName.length < 2 || !breweryKey(breweryName)) return NextResponse.json({ error: 'brewery' }, { status: 422 })

  const contact_name = str(body?.contact_name, 120)
  const contact_phone = str(body?.contact_phone, 60)
  const contact_email = str(body?.contact_email, 160)
  if (!contact_name || (!contact_phone && !contact_email)) return NextResponse.json({ error: 'contact' }, { status: 422 })
  const returnable = !!body?.returnable
  const notes = str(body?.notes, 1000)

  const lines = (Array.isArray(body?.lines) ? body.lines : []).slice(0, 30).map((l: any) => {
    const coupler = str(l?.coupler, 2)?.toUpperCase() || null
    return {
      beer_name: str(l?.beer_name, 160),
      beer_style: str(l?.beer_style, 80),
      abv: num(l?.abv, 0, 30),
      size_litres: num(l?.size_litres, 1, 200),
      coupler: coupler && COUPLERS.includes(coupler) ? coupler : null,
      qty: Math.max(1, Math.min(100, Math.round(Number(l?.qty) || 1))),
    }
  }).filter((l: any) => l.beer_name)
  if (!lines.length) return NextResponse.json({ error: 'lines' }, { status: 422 })

  const svc = getServiceClient()

  // Find the brewery on the Producers list by name, or add it.
  const key = breweryKey(breweryName)
  const { data: all, error: pErr } = await svc
    .from('brewasia_producers')
    .select('id, name, kind, form_token, contact_name, contact_phone, contact_email')
  if (pErr) return NextResponse.json({ error: 'save' }, { status: 500 })
  let producer = (all || []).find(p => breweryKey(p.name) === key) || null
  let editToken: string | null = null

  if (!producer) {
    editToken = randomBytes(18).toString('base64url')
    const { data, error } = await svc.from('brewasia_producers').insert({
      name: breweryName, kind: 'brewery', interest: 'confirmed',
      contact_name, contact_phone, contact_email,
      form_token: editToken,
      notes: 'Added from the shared keg sign-up form.',
    }).select('id, name, kind, form_token, contact_name, contact_phone, contact_email').single()
    if (error || !data) return NextResponse.json({ error: 'save' }, { status: 500 })
    producer = data
  } else if (!producer.form_token) {
    editToken = randomBytes(18).toString('base64url')
    await svc.from('brewasia_producers').update({ form_token: editToken }).eq('id', producer.id)
  }

  const rows = lines.map((l: any) => ({
    ...l,
    brewery: producer!.name,
    contact_name, contact_phone, contact_email,
    returnable,
    notes: notes ? `From brewery form: ${notes}` : null,
    producer_id: producer!.id,
    from_form: true,
    source: 'donated',
    status: 'promised',
    destination: 'conference',
  }))
  const { data: created, error: kErr } = await svc.from('brewasia_kegs').insert(rows).select(KEG_FIELDS)
  if (kErr) return NextResponse.json({ error: 'save' }, { status: 500 })

  // Fill in contact details we didn't have; never overwrite ones we already know.
  await svc.from('brewasia_producers').update({
    form_submitted_at: new Date().toISOString(),
    contact_name: producer.contact_name || contact_name,
    contact_phone: producer.contact_phone || contact_phone,
    contact_email: producer.contact_email || contact_email,
  }).eq('id', producer.id)

  return NextResponse.json({ ok: true, brewery: producer.name, kegs: created || [], edit_token: editToken })
}

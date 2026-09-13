// Shared BrewAsia collab sign-up: one public link, no login. A brewery tells us who it's
// brewing with, the beer, and how many kegs go to the Friday Ale Trail or the Halloween
// Collab Fest. Saved straight onto the Collabs page (from_form = true) for the team to check.
// Only ever ADDS a collab. Unknown breweries are added to Producers.
import { NextRequest, NextResponse } from 'next/server'
import { getServiceClient } from '@/lib/supabase'
import { addInboxItem } from '@/lib/inbox'
import { prepareLogo, storeLogo, logoRejected } from '@/lib/logoUpload'

export const dynamic = 'force-dynamic'

const USES = ['friday_ale_trail', 'halloween', 'unassigned']

const str = (v: unknown, max: number) => {
  const s = typeof v === 'string' ? v.trim().replace(/\s+/g, ' ') : ''
  return s ? s.slice(0, max) : null
}
const num = (v: unknown, lo: number, hi: number) => {
  const n = typeof v === 'number' ? v : parseFloat(String(v ?? '').replace(',', '.'))
  return Number.isFinite(n) && n >= lo && n <= hi ? Math.round(n * 10) / 10 : null
}
const breweryKey = (v: string) =>
  v.toLowerCase().replace(/\([^)]*\)/g, '').normalize('NFD').replace(/[\u0300-\u036f]/g, '').replace(/đ/g, 'd')
    .replace(/\b(the|brewery|brewing|brewers?|brewhouse|beer|beers|company|co|ltd)\b/g, '').replace(/[^a-z0-9]/g, '')

export async function POST(req: NextRequest) {
  let body: any
  // Logos arrive as files, so the form posts multipart with the rest of the answers in a
  // `payload` field. Plain JSON still works exactly as before — the logo half is the only
  // thing that needs the other encoding.
  let logoFiles: { brewery: string; file: File }[] = []
  const ctype = req.headers.get('content-type') || ''
  if (ctype.includes('multipart/form-data')) {
    let form: FormData
    try { form = await req.formData() } catch { return NextResponse.json({ error: 'bad request' }, { status: 400 }) }
    try { body = JSON.parse(String(form.get('payload') ?? '')) } catch { return NextResponse.json({ error: 'bad request' }, { status: 400 }) }
    for (const [key, value] of form.entries()) {
      const m = /^logo\[(.+)\]$/.exec(key)
      if (m && value instanceof File && value.size > 0) logoFiles.push({ brewery: m[1], file: value })
    }
    logoFiles = logoFiles.slice(0, 8)
  } else {
    try { body = await req.json() } catch { return NextResponse.json({ error: 'bad request' }, { status: 400 }) }
  }
  if (typeof body?.website === 'string' && body.website.trim()) return NextResponse.json({ ok: true, code: null })

  const brewery = str(body?.brewery, 120)
  if (!brewery || brewery.length < 2 || !breweryKey(brewery)) return NextResponse.json({ error: 'brewery' }, { status: 422 })
  const contact_name = str(body?.contact_name, 120)
  const contact_phone = str(body?.contact_phone, 60)
  const contact_email = str(body?.contact_email, 160)
  if (!contact_name || (!contact_phone && !contact_email)) return NextResponse.json({ error: 'contact' }, { status: 422 })

  // Required on the public form. 0 is a real answer — plenty of sours — so the test is
  // "did they answer", not "is it truthy".
  const ibu = num(body?.ibu, 0, 200)
  if (ibu == null) return NextResponse.json({ error: 'ibu' }, { status: 422 })

  const partnerNames = (Array.isArray(body?.partners) ? body.partners : []).slice(0, 8)
    .map((p: unknown) => str(p, 120)).filter((p: string | null): p is string => !!p && !!breweryKey(p))
  const all = [brewery, ...partnerNames].filter((n, i, a) => a.findIndex(x => breweryKey(x) === breweryKey(n)) === i)

  const kegs = (Array.isArray(body?.kegs) ? body.kegs : []).slice(0, 10).map((l: any) => {
    const q = Math.round(Number(l?.qty))
    return {
      use: USES.includes(l?.use) ? l.use : 'unassigned',
      qty: String(l?.qty ?? '').trim() !== '' && Number.isFinite(q) && q >= 0 && q <= 200 ? q : null,
      size_litres: num(l?.size_litres, 1, 200),
      venue: null,
    }
  }).filter((l: any) => l.qty != null || l.size_litres != null || l.use !== 'unassigned')

  const svc = getServiceClient()
  const { data: producers, error: pErr } = await svc.from('brewasia_producers').select('id, name, country, contact_name, contact_phone, contact_email')
  if (pErr) return NextResponse.json({ error: 'save' }, { status: 500 })

  // Use the Producers spelling for names we already know; add new breweries.
  const names: { name: string; country: string | null }[] = []
  for (const n of all) {
    const hit = (producers || []).find(p => breweryKey(p.name) === breweryKey(n))
    if (hit) { names.push({ name: hit.name, country: hit.country }); continue }
    const isSender = breweryKey(n) === breweryKey(brewery)
    const { error } = await svc.from('brewasia_producers').insert({
      name: n, kind: 'brewery', interest: 'interested',
      ...(isSender ? { contact_name, contact_phone, contact_email } : {}),
      notes: isSender ? 'Added from the collab sign-up form.' : `Named as a collab partner by ${brewery} on the collab sign-up form.`,
    })
    if (error) return NextResponse.json({ error: 'save' }, { status: 500 })
    names.push({ name: n, country: null })
  }
  const sender = names[0]
  const senderRow = (producers || []).find(p => breweryKey(p.name) === breweryKey(brewery))
  if (senderRow) {
    await svc.from('brewasia_producers').update({
      contact_name: senderRow.contact_name || contact_name,
      contact_phone: senderRow.contact_phone || contact_phone,
      contact_email: senderRow.contact_email || contact_email,
    }).eq('id', (senderRow as any).id)
  }

  // The first Vietnam brewery is the Vietnam partner; if no country is known, the sender is.
  const vnIdx = names.findIndex(n => (n.country || '').toLowerCase() === 'vietnam')
  const vIdx = vnIdx >= 0 ? vnIdx : body?.in_vietnam ? 0 : -1
  const vn_partner = vIdx >= 0 ? names[vIdx].name : null
  const partners = names.filter((_, i) => i !== vIdx).map(n => n.name)

  const readyRaw = str(body?.ready_by, 10)
  const ready_by = readyRaw && /^\d{4}-\d{2}-\d{2}$/.test(readyRaw) ? readyRaw : null
  const notes = str(body?.notes, 1000)

  const collabRow = {
    vn_partner, partners, ibu,
    beer_name: str(body?.beer_name, 160),
    beer_style: str(body?.beer_style, 80),
    abv: num(body?.abv, 0, 30),
    status: names.length > 1 ? 'matched' : 'interested',
    ready_by, kegs,
    notes: notes ? `From collab form: ${notes}` : null,
    fest_pour: ['own_setup', 'main_taps', 'unsure'].includes(body?.fest_pour) ? body.fest_pour : null,
    from_form: true, submitted_by: sender.name, contact_name, contact_phone, contact_email,
  }

  const { data, error } = await svc.from('brewasia_collabs').insert(collabRow).select('id, code').single()
  if (error || !data) {
    console.error('[collab-form] insert failed', error)
    return NextResponse.json({ error: 'save' }, { status: 500 })
  }

  const logosSaved = await attachLogos(svc, logoFiles, names.map(n => n.name))

  await addInboxItem(svc, {
    kind: 'collab_signup',
    title: `${sender.name} signed up a collab`,
    summary: [
      names.length > 1 ? `with ${names.slice(1).map(n => n.name).join(', ')}` : 'partner not named yet',
      str(body?.beer_name, 160),
      kegs.length ? `${kegs.length} keg line${kegs.length === 1 ? '' : 's'}` : null,
      contact_name,
      logosSaved ? `${logosSaved} logo${logosSaved === 1 ? '' : 's'}` : null,
    ].filter(Boolean).join(' · '),
    ref_table: 'brewasia_collabs',
    ref_id: data.id ?? data.code,
  })

  return NextResponse.json({ ok: true, code: data.code, brewery: sender.name, partners: names.slice(1).map(n => n.name) })
}

// Stores each uploaded logo against the brewery it was labelled with, and writes the URL
// onto that producer row. Returns how many stuck.
//
// Everything here is best-effort by design. The collab is already saved by the time this
// runs, so a rejected file, a missing bucket or a name that matches nothing costs the
// brewery a logo and nothing else. Staff can fix a logo from the Producers page.
async function attachLogos(
  svc: any,
  files: { brewery: string; file: File }[],
  knownNames: string[],
): Promise<number> {
  if (!files.length) return 0
  let saved = 0
  for (const { brewery, file } of files) {
    // Match against the names this submission actually resolved to, using the same
    // fuzzy key as the rest of the route — no second matching path.
    const target = knownNames.find(n => breweryKey(n) === breweryKey(brewery))
    if (!target) continue

    const prepared = await prepareLogo(file, target)
    if (logoRejected(prepared)) { console.warn('[logo] %s rejected: %s', brewery, prepared.reason); continue }

    const url = await storeLogo(svc, prepared)
    if (!url) continue

    const { error } = await svc.from('brewasia_producers').update({ logo_url: url }).eq('name', target)
    if (error) { console.warn('[logo] could not set logo_url for %s: %s', target, error.message); continue }
    saved++
  }
  return saved
}

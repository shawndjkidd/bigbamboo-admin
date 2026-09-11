// Keg scanner — reads screenshots / photos / pasted text (an email, a Zalo or WhatsApp
// message, a brewery's list) with Gemini and returns keg lines grouped by brewery, ready
// to drop into the "Add kegs" form. Nothing is saved here; the person checks and saves.
// Requires env var GEMINI_API_KEY. Optional GEMINI_MODEL (default 'gemini-2.5-flash').
import { NextRequest, NextResponse } from 'next/server'
import { getServiceClient } from '@/lib/supabase'

export const dynamic = 'force-dynamic'
export const maxDuration = 60

const MODEL = process.env.GEMINI_MODEL || 'gemini-2.5-flash'
const DESTS = ['conference', 'ale_trail', 'collab_fest', 'sold', 'unassigned']
const COUPLERS = ['S', 'D', 'A', 'G', 'U']

const PROMPT = `You are reading material about beer kegs for BrewAsia, a craft beer event in Ho Chi Minh City.
It may be a screenshot of an email, a chat message (Zalo, WhatsApp, Messenger), a spreadsheet, an invoice or a handwritten/printed list. Text may be English or Vietnamese.
Extract every keg mentioned. Group them by brewery.

Return ONLY valid JSON of this shape:
{"groups":[{"brewery":string|null,"contact_name":string|null,"contact_phone":string|null,"contact_email":string|null,"source":"donated"|"purchased"|null,
  "lines":[{"beer_name":string|null,"beer_style":string|null,"abv":number|null,"size_litres":number|null,"coupler":"S"|"D"|"A"|"G"|"U"|null,"qty":number,"destination":"conference"|"ale_trail"|"collab_fest"|"sold"|"unassigned","destination_venue":string|null}]}]}

Rules:
- One line per distinct beer AND size AND destination. "2x 30L Hazy IPA" = one line with qty 2. The same beer in two sizes = two lines.
- brewery: the brewery that makes or gives the beer, written as they write it. Leave out words like "Co., Ltd". The sender's company is usually the brewery.
- contact_*: only if clearly shown for that brewery (email signature, phone, name of the person writing).
- abv: plain number, e.g. 6.5 for "6.5%".
- size_litres: litres as a number. Convert: 1/6 bbl = 19.5, 1/4 bbl = 29.3, 1/2 bbl = 58.7, 5 gal = 18.9. "lít" = litres. "thùng"/"bom"/"keg" = keg.
- coupler: S for Sankey S / European / KeyKeg-with-S; D for US Sankey D; A for flat/A-type; G for G-type; U for U-type. Otherwise null.
- qty: whole number of kegs, at least 1.
- source: "donated" if the kegs are donated, sponsored or free; "purchased" if there is a price, invoice, order or quote; otherwise null.
- destination: only if the text clearly says where the keg is going: the BrewAsia conference → "conference"; the Ale Trail (bars around the city) → "ale_trail" with the bar name in destination_venue if given; Collab Fest / collaboration festival → "collab_fest"; sold to someone → "sold" with the buyer in destination_venue. Otherwise "unassigned".
- Never invent beers, numbers or contacts. Unknown = null.
- If there are no kegs in the material, return {"groups":[]}.`

const str = (v: unknown, max = 200) => {
  const s = typeof v === 'string' ? v.trim() : v == null ? '' : String(v).trim()
  return s ? s.slice(0, max) : null
}
const numOrNull = (v: unknown, lo: number, hi: number) => {
  const n = typeof v === 'number' ? v : parseFloat(String(v ?? '').replace(',', '.'))
  return Number.isFinite(n) && n >= lo && n <= hi ? Math.round(n * 10) / 10 : null
}

export async function POST(req: NextRequest) {
  const key = process.env.GEMINI_API_KEY
  if (!key) return NextResponse.json({ error: 'GEMINI_API_KEY is not set in the environment.' }, { status: 500 })

  // Signed-in, active admin staff only (the page itself is behind the same login).
  const token = (req.headers.get('authorization') || '').replace(/^Bearer\s+/i, '').trim()
  if (!token) return NextResponse.json({ error: 'Not signed in.' }, { status: 401 })
  const svc = getServiceClient()
  const { data: ures } = await svc.auth.getUser(token)
  const email = ures?.user?.email
  if (!email) return NextResponse.json({ error: 'Session expired — sign in again.' }, { status: 401 })
  const { data: su } = await svc.from('staff_users').select('role, active').eq('email', email).maybeSingle()
  if (!su || !su.active || ['kitchen', 'cashier'].includes(String(su.role))) {
    return NextResponse.json({ error: 'Not allowed.' }, { status: 403 })
  }

  let images: { data: string; mimeType: string }[] = []
  let text = ''
  try {
    const b = await req.json()
    images = (Array.isArray(b.images) ? b.images : [])
      .slice(0, 6)
      .map((i: any) => ({ data: String(i?.data || '').replace(/^data:[^,]+,/, ''), mimeType: String(i?.mimeType || 'image/jpeg') }))
      .filter((i: { data: string; mimeType: string }) => i.data && /^(image\/|application\/pdf$)/.test(i.mimeType))
    text = String(b.text || '').trim().slice(0, 20000)
  } catch { return NextResponse.json({ error: 'bad request body' }, { status: 400 }) }
  if (!images.length && !text) return NextResponse.json({ error: 'Nothing to read — drop a screenshot or paste some text.' }, { status: 400 })

  const parts: any[] = [{ text: PROMPT + (text ? '\n\nTEXT:\n' + text : '') }]
  for (const img of images) parts.push({ inline_data: { mime_type: img.mimeType, data: img.data } })
  const body = { contents: [{ parts }], generationConfig: { temperature: 0, responseMimeType: 'application/json' } }

  const url = `https://generativelanguage.googleapis.com/v1beta/models/${MODEL}:generateContent?key=${key}`
  let r: Response | null = null
  for (let attempt = 0; attempt < 4; attempt++) {
    try {
      r = await fetch(url, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) })
    } catch (e: any) {
      if (attempt === 3) return NextResponse.json({ error: 'Could not reach the AI service: ' + (e?.message || e) }, { status: 502 })
      await new Promise(s => setTimeout(s, 1500 * (attempt + 1))); continue
    }
    if ((r.status === 503 || r.status === 429) && attempt < 3) { await new Promise(s => setTimeout(s, 1500 * (attempt + 1))); continue }
    break
  }
  if (!r || !r.ok) {
    const s = r?.status
    const friendly = (s === 503 || s === 429)
      ? 'The AI is busy right now — give it a few seconds and drop it again.'
      : `Gemini error ${s}: ${r ? (await r.text()).slice(0, 300) : 'no response'}`
    return NextResponse.json({ error: friendly }, { status: 502 })
  }

  const j: any = await r.json()
  const raw = j?.candidates?.[0]?.content?.parts?.[0]?.text || ''
  let p: any
  try { p = JSON.parse(raw) } catch { return NextResponse.json({ error: 'Could not read that — try a clearer screenshot.' }, { status: 422 }) }

  const groups = (Array.isArray(p?.groups) ? p.groups : []).slice(0, 30).map((g: any) => ({
    brewery: str(g?.brewery, 120),
    contact_name: str(g?.contact_name, 120),
    contact_phone: str(g?.contact_phone, 60),
    contact_email: str(g?.contact_email, 160),
    source: g?.source === 'donated' || g?.source === 'purchased' ? g.source : null,
    lines: (Array.isArray(g?.lines) ? g.lines : []).slice(0, 50).map((l: any) => {
      const coupler = str(l?.coupler, 2)?.toUpperCase() || null
      const destination = DESTS.includes(l?.destination) ? l.destination : 'unassigned'
      return {
        beer_name: str(l?.beer_name, 160),
        beer_style: str(l?.beer_style, 80),
        abv: numOrNull(l?.abv, 0, 30),
        size_litres: numOrNull(l?.size_litres, 1, 200),
        coupler: coupler && COUPLERS.includes(coupler) ? coupler : null,
        qty: Math.max(1, Math.min(500, Math.round(Number(l?.qty) || 1))),
        destination,
        destination_venue: destination === 'ale_trail' || destination === 'sold' ? str(l?.destination_venue, 120) : null,
      }
    }).filter((l: any) => l.beer_name || l.beer_style || l.size_litres),
  })).filter((g: any) => g.lines.length)

  return NextResponse.json({ ok: true, groups })
}

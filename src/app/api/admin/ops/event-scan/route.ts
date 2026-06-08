// Event scanner — sends a Facebook/event screenshot to Gemini Flash and returns structured event details.
// Requires env var GEMINI_API_KEY. Optional GEMINI_MODEL (default 'gemini-2.5-flash').
import { NextRequest, NextResponse } from 'next/server'

export const dynamic = 'force-dynamic'
export const maxDuration = 60

const MODEL = process.env.GEMINI_MODEL || 'gemini-2.5-flash'

export async function POST(req: NextRequest) {
  const key = process.env.GEMINI_API_KEY
  if (!key) return NextResponse.json({ error: 'GEMINI_API_KEY is not set in the environment.' }, { status: 500 })

  let imageBase64 = '', mimeType = 'image/jpeg'
  try {
    const b = await req.json()
    imageBase64 = (b.imageBase64 || '').replace(/^data:[^,]+,/, '')
    mimeType = b.mimeType || 'image/jpeg'
  } catch { return NextResponse.json({ error: 'bad request body' }, { status: 400 }) }
  if (!imageBase64) return NextResponse.json({ error: 'no image provided' }, { status: 400 })

  const prompt = `You are reading a screenshot of a Facebook (or similar) event listing for a bar/venue in Vietnam. Extract the event details.
Return ONLY valid JSON of this shape:
{"title": string|null, "date": string|null, "start_time": string|null, "end_time": string|null, "location": string|null, "ticket_price": number|null, "is_free": boolean, "description": string|null}
Rules:
- date in YYYY-MM-DD format. If the year is not shown, assume the next upcoming occurrence (current or next year).
- start_time / end_time in 24-hour HH:MM. Null if not shown.
- ticket_price as a plain number in Vietnamese Dong (no thousands separators). If the event is clearly free, set is_free=true and ticket_price=0. If a price is shown, is_free=false.
- description = a concise 1–2 sentence summary of what the event is (the vibe, music, theme).
- If the image is not a readable event, return {"title":null,"date":null,"start_time":null,"end_time":null,"location":null,"ticket_price":null,"is_free":false,"description":null}.`

  const body = {
    contents: [{ parts: [{ text: prompt }, { inline_data: { mime_type: mimeType, data: imageBase64 } }] }],
    generationConfig: { temperature: 0, responseMimeType: 'application/json' },
  }

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
      ? 'The AI is busy right now — give it a few seconds and tap Upload again.'
      : `Gemini error ${s}: ${r ? await r.text() : 'no response'}`
    return NextResponse.json({ error: friendly }, { status: 502 })
  }

  const j: any = await r.json()
  const text = j?.candidates?.[0]?.content?.parts?.[0]?.text || ''
  let p: any
  try { p = JSON.parse(text) } catch { return NextResponse.json({ error: 'Could not read the event — try a clearer screenshot.', raw: text }, { status: 422 }) }

  return NextResponse.json({
    ok: true,
    title: p?.title ? String(p.title).trim() : null,
    date: p?.date || null,
    start_time: p?.start_time || null,
    end_time: p?.end_time || null,
    location: p?.location ? String(p.location).trim() : null,
    ticket_price: p?.ticket_price == null ? null : Math.round(Number(p.ticket_price) || 0),
    is_free: !!p?.is_free,
    description: p?.description ? String(p.description).trim() : null,
  })
}

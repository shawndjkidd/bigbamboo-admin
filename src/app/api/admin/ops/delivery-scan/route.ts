// Delivery report scanner — reads a Grab/Capichi merchant payout/sales report (image or PDF page)
// and returns the period totals. Requires env GEMINI_API_KEY. Optional GEMINI_MODEL (default gemini-2.5-flash).
import { NextRequest, NextResponse } from 'next/server'

export const dynamic = 'force-dynamic'
export const maxDuration = 60

const MODEL = process.env.GEMINI_MODEL || 'gemini-2.5-flash'

export async function POST(req: NextRequest) {
  const key = process.env.GEMINI_API_KEY
  if (!key) return NextResponse.json({ error: 'GEMINI_API_KEY is not set in the environment.' }, { status: 500 })

  let imageBase64 = '', mimeType = 'image/jpeg', platform = ''
  try {
    const b = await req.json()
    imageBase64 = (b.imageBase64 || '').replace(/^data:[^,]+,/, '')
    mimeType = b.mimeType || 'image/jpeg'
    platform = (b.platform || '').toString()
  } catch { return NextResponse.json({ error: 'bad request body' }, { status: 400 }) }
  if (!imageBase64) return NextResponse.json({ error: 'no file provided' }, { status: 400 })

  const prompt = `You are reading a food-delivery merchant payout / sales statement${platform ? ` from ${platform}` : ' (e.g. GrabFood or Capichi)'} for a bar/restaurant in Vietnam.
Extract the period totals. Return ONLY valid JSON of this shape:
{"platform": string|null, "period_start": string|null, "period_end": string|null, "currency": string, "gross_sales": number, "commission": number, "other_fees": number, "net_payout": number}
Rules:
- gross_sales = total customer order value / total food sales BEFORE the platform's commission is taken out.
- commission = the platform commission / service fee the platform charged you (a positive number).
- other_fees = any other deductions (ad fees, payment fees, adjustments) as a positive number. 0 if none.
- net_payout = the amount actually paid out to the merchant after deductions.
- All amounts plain numbers, no thousands separators. Vietnamese Dong, whole numbers.
- Dates as YYYY-MM-DD if shown (period the statement covers). null if unclear.
- If sanity allows, gross_sales - commission - other_fees should ≈ net_payout. If only some figures are shown, fill what you can and put 0 for the rest.
- If the file is not a readable delivery statement, return {"platform":null,"period_start":null,"period_end":null,"currency":"VND","gross_sales":0,"commission":0,"other_fees":0,"net_payout":0}.`

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
  try { p = JSON.parse(text) } catch { return NextResponse.json({ error: 'Could not read the report — try a clearer file.', raw: text }, { status: 422 }) }

  const num = (x: any) => Math.round(Number(x) || 0)
  return NextResponse.json({
    ok: true,
    platform: p?.platform || platform || null,
    period_start: p?.period_start || null,
    period_end: p?.period_end || null,
    currency: p?.currency || 'VND',
    gross_sales: num(p?.gross_sales),
    commission: num(p?.commission),
    other_fees: num(p?.other_fees),
    net_payout: num(p?.net_payout),
  })
}

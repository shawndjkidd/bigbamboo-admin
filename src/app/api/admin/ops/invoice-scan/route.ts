// Invoice scanner — sends an invoice image to Gemini Flash and returns structured line items.
// Requires env var GEMINI_API_KEY (free key from https://aistudio.google.com/apikey).
// Optional GEMINI_MODEL (default 'gemini-2.5-flash').
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
    imageBase64 = (b.imageBase64 || '').replace(/^data:[^,]+,/, '') // strip data URL prefix if present
    mimeType = b.mimeType || 'image/jpeg'
  } catch { return NextResponse.json({ error: 'bad request body' }, { status: 400 }) }
  if (!imageBase64) return NextResponse.json({ error: 'no image provided' }, { status: 400 })

  const prompt = `You are reading a supplier purchase invoice for a bar/restaurant in Vietnam. Extract every product line item.
Return ONLY valid JSON of this shape:
{"vendor": string|null, "date": string|null, "currency": string, "items": [{"name": string, "qty": number, "unit": string|null, "total_price": number}]}
Rules:
- total_price = the line's total amount as a plain number (no thousands separators). Amounts are usually Vietnamese Dong (whole numbers, no decimals).
- qty = how many purchase units were bought (bottles, cans, kg, bags, packs). If you can't tell, use 1.
- unit = the purchase unit if shown (e.g. "bottle", "can", "kg").
- Skip subtotals, tax, discounts, shipping and grand totals — only real products.
- If the image is not a readable invoice, return {"vendor":null,"date":null,"currency":"VND","items":[]}.`

  const body = {
    contents: [{ parts: [{ text: prompt }, { inline_data: { mime_type: mimeType, data: imageBase64 } }] }],
    generationConfig: { temperature: 0, responseMimeType: 'application/json' },
  }

  let r: Response
  try {
    r = await fetch(`https://generativelanguage.googleapis.com/v1beta/models/${MODEL}:generateContent?key=${key}`, {
      method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body),
    })
  } catch (e: any) { return NextResponse.json({ error: 'Gemini request failed: ' + (e?.message || e) }, { status: 502 }) }

  if (!r.ok) return NextResponse.json({ error: `Gemini error ${r.status}: ${await r.text()}` }, { status: 502 })

  const j: any = await r.json()
  const text = j?.candidates?.[0]?.content?.parts?.[0]?.text || ''
  let parsed: any
  try { parsed = JSON.parse(text) } catch { return NextResponse.json({ error: 'Could not read the invoice — try a clearer photo.', raw: text }, { status: 422 }) }

  const items = Array.isArray(parsed?.items) ? parsed.items.map((it: any) => ({
    name: String(it.name || '').trim(),
    qty: Number(it.qty) > 0 ? Number(it.qty) : 1,
    unit: it.unit ? String(it.unit) : null,
    total_price: Math.round(Number(it.total_price) || 0),
  })).filter((it: any) => it.name) : []

  return NextResponse.json({ ok: true, vendor: parsed?.vendor || null, date: parsed?.date || null, currency: parsed?.currency || 'VND', items })
}

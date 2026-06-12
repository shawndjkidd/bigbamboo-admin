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
  let ingredients: string[] = []
  try {
    const b = await req.json()
    imageBase64 = (b.imageBase64 || '').replace(/^data:[^,]+,/, '') // strip data URL prefix if present
    mimeType = b.mimeType || 'image/jpeg'
    if (Array.isArray(b.ingredients)) ingredients = b.ingredients.map((s: any) => String(s)).filter(Boolean).slice(0, 400)
  } catch { return NextResponse.json({ error: 'bad request body' }, { status: 400 }) }
  if (!imageBase64) return NextResponse.json({ error: 'no image provided' }, { status: 400 })

  const matchBlock = ingredients.length
    ? `\n- match = the EXACT ingredient name from the list below that refers to the SAME product, ignoring brand, size and packaging (e.g. "ỨC PHI LE GA CN CP 1KG" → "Chicken breast"; "HANH TAY T.HANG 1KG" → "Yellow onions"). Match by meaning, not spelling. Set match ONLY when you are confident it is the same product — if unsure, use null. Never force a match to an unrelated ingredient.\nIngredients we already track:\n${ingredients.map(n => '- ' + n).join('\n')}`
    : '\n- match = null (no ingredient list provided).'
  const prompt = `You are reading a supplier purchase invoice for a bar/restaurant in Vietnam. Extract the product line items AND the invoice totals.
Return ONLY valid JSON of this shape:
{"vendor": string|null, "date": string|null, "currency": string, "items": [{"name": string, "qty": number, "unit": string|null, "total_price": number, "match": string|null}], "tax": number, "fees": number, "grand_total": number}
Rules:
- items = ONLY product lines actually printed on this invoice. NEVER invent, add, or guess a product that is not clearly printed. If a line is unreadable, omit it rather than guessing.
- name = copy the product text EXACTLY as printed (keep the original Vietnamese and any abbreviations; do NOT translate, expand or rewrite it). Do NOT put subtotal/tax/discount/shipping rows in items.
- total_price = the line's total as a plain number (no thousands separators). Amounts are usually Vietnamese Dong (whole numbers).
- qty = how many purchase units were bought (bottles, cans, kg, bags, packs). If unclear use 1. unit = the purchase unit if shown.
- tax = total VAT/tax amount on the invoice (0 if none). fees = total delivery/shipping/service charge (0 if none). grand_total = the final amount payable.${matchBlock}
- If the image is not a readable invoice, return {"vendor":null,"date":null,"currency":"VND","items":[],"tax":0,"fees":0,"grand_total":0}.`

  const body = {
    contents: [{ parts: [{ text: prompt }, { inline_data: { mime_type: mimeType, data: imageBase64 } }] }],
    generationConfig: { temperature: 0, responseMimeType: 'application/json' },
  }

  const url = `https://generativelanguage.googleapis.com/v1beta/models/${MODEL}:generateContent?key=${key}`
  // Gemini can return 503/429 when busy — retry a few times with backoff before giving up.
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
  let parsed: any
  try { parsed = JSON.parse(text) } catch { return NextResponse.json({ error: 'Could not read the invoice — try a clearer photo.', raw: text }, { status: 422 }) }

  const items = Array.isArray(parsed?.items) ? parsed.items.map((it: any) => ({
    name: String(it.name || '').trim(),
    qty: Number(it.qty) > 0 ? Number(it.qty) : 1,
    unit: it.unit ? String(it.unit) : null,
    total_price: Math.round(Number(it.total_price) || 0),
    match: it.match ? String(it.match).trim() : null,
  })).filter((it: any) => it.name) : []

  return NextResponse.json({ ok: true, vendor: parsed?.vendor || null, date: parsed?.date || null, currency: parsed?.currency || 'VND', items, tax: Math.round(Number(parsed?.tax) || 0), fees: Math.round(Number(parsed?.fees) || 0), grand_total: Math.round(Number(parsed?.grand_total) || 0) })
}

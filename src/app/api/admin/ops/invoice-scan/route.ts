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
  let categories: { key: string; label: string }[] = []
  try {
    const b = await req.json()
    imageBase64 = (b.imageBase64 || '').replace(/^data:[^,]+,/, '') // strip data URL prefix if present
    mimeType = b.mimeType || 'image/jpeg'
    if (Array.isArray(b.ingredients)) ingredients = b.ingredients.map((s: any) => String(s)).filter(Boolean).slice(0, 400)
    if (Array.isArray(b.categories)) categories = b.categories.filter((c: any) => c && c.key).map((c: any) => ({ key: String(c.key), label: String(c.label || c.key) })).slice(0, 40)
  } catch { return NextResponse.json({ error: 'bad request body' }, { status: 400 }) }
  if (!imageBase64) return NextResponse.json({ error: 'no image provided' }, { status: 400 })

  const catList = categories.length ? categories : [{ key: 'food', label: 'Food' }, { key: 'consumable', label: 'Consumables' }, { key: 'capex', label: 'Equipment (CapEx)' }, { key: 'other_opex', label: 'Other operating' }]
  const ingBlock = ingredients.length ? `\nINGREDIENTS WE ALREADY TRACK (food & drink only — match against these):\n${ingredients.map(n => '- ' + n).join('\n')}` : ''
  const prompt = `You are reading a supplier purchase invoice for a bar/restaurant in Vietnam. Extract every product line item and the invoice totals.
Return ONLY valid JSON of this shape:
{"vendor": string|null, "date": string|null, "currency": string, "items": [{"name": string, "english": string, "qty": number, "unit": string|null, "total_price": number, "is_ingredient": boolean, "match": string|null, "suggested_name": string|null, "base_unit": string|null, "pack_size": number|null, "category": string}], "tax": number, "fees": number, "grand_total": number}
Rules:
- items = ONLY product lines actually printed on this invoice. NEVER invent or guess a product that is not printed. Omit unreadable lines.
- name = copy the product text EXACTLY as printed (keep the Vietnamese and abbreviations; do NOT translate or rewrite it). Do NOT include subtotal/tax/discount/shipping rows.
- english = a SHORT plain-English name/translation of the product so a non-Vietnamese reader knows what it is (e.g. "Nhơn Hòa kitchen scale 1kg", "Black nitrile gloves, 100ct", "Distilled vinegar 4L", "Fresh oranges"). This is for the human reviewer; keep "name" itself verbatim.
- total_price = the line total as a plain number (no separators). Usually Vietnamese Dong.
- qty = number of purchase units bought (bottles, cans, kg, bags, packs). If unclear use 1. unit = the purchase unit shown.
- is_ingredient = true ONLY if the line is a FOOD or DRINK ingredient used to make menu items (produce, meat, dairy, sauces, spices, alcohol, mixers, etc.). false for everything else: cleaning supplies, gloves, bags, paper goods, equipment, tools, scales, utilities.
- match = if is_ingredient is true, the EXACT name from the ingredient list that is the SAME product (ignore brand/size/packaging; match by meaning, NOT spelling — never match on shared letters such as "cân" vs "can"). Use null if it is not clearly the same product, or if is_ingredient is false.
- suggested_name = if is_ingredient is true but match is null, a short clean English ingredient name to create (e.g. "Yellow onions"); otherwise null.
- base_unit = for a new ingredient: "g" for solids, "ml" for liquids, "each" for countable items; else null.
- pack_size = for a new ingredient, the size of ONE purchase unit in base_unit ("1KG"→1000, "5L"→5000, "200G"→200, a single item→1); else null.
- category = the best spend-category KEY for this line from: ${catList.map(c => c.key + ' (' + c.label + ')').join(', ')}. Food/drink ingredients → food (or beer/wine/liquor/mixer/garnish if clearly that). Cleaning/gloves/disposables → consumable. Tools/equipment/appliances → capex.
- tax = total VAT (0 if none). fees = delivery/service charge (0 if none). grand_total = final amount payable.
- If the image is not a readable invoice, return {"vendor":null,"date":null,"currency":"VND","items":[],"tax":0,"fees":0,"grand_total":0}.${ingBlock}`

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

  const validCats = new Set(catList.map(c => c.key))
  const items = Array.isArray(parsed?.items) ? parsed.items.map((it: any) => {
    const isIng = it.is_ingredient === true
    return {
      name: String(it.name || '').trim(),
      english: it.english ? String(it.english).trim() : null,
      qty: Number(it.qty) > 0 ? Number(it.qty) : 1,
      unit: it.unit ? String(it.unit) : null,
      total_price: Math.round(Number(it.total_price) || 0),
      is_ingredient: isIng,
      match: isIng && it.match ? String(it.match).trim() : null,
      suggested_name: isIng && it.suggested_name ? String(it.suggested_name).trim() : null,
      base_unit: it.base_unit ? String(it.base_unit).trim() : null,
      pack_size: Number(it.pack_size) > 0 ? Number(it.pack_size) : null,
      category: it.category && validCats.has(String(it.category)) ? String(it.category) : (isIng ? 'food' : 'other_opex'),
    }
  }).filter((it: any) => it.name) : []

  return NextResponse.json({ ok: true, vendor: parsed?.vendor || null, date: parsed?.date || null, currency: parsed?.currency || 'VND', items, tax: Math.round(Number(parsed?.tax) || 0), fees: Math.round(Number(parsed?.fees) || 0), grand_total: Math.round(Number(parsed?.grand_total) || 0) })
}

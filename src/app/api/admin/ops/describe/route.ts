// Draft a short customer-facing menu description from a recipe's name + ingredients — Gemini Flash.
import { NextRequest, NextResponse } from 'next/server'

export const dynamic = 'force-dynamic'
export const maxDuration = 30

const MODEL = process.env.GEMINI_MODEL || 'gemini-2.5-flash'

export async function POST(req: NextRequest) {
  const key = process.env.GEMINI_API_KEY
  if (!key) return NextResponse.json({ error: 'GEMINI_API_KEY is not set in the environment.' }, { status: 500 })

  let name = '', category = '', ingredients: string[] = []
  try {
    const b = await req.json()
    name = String(b.name || '').trim()
    category = String(b.category || '').trim()
    if (Array.isArray(b.ingredients)) ingredients = b.ingredients.map((s: any) => String(s)).filter(Boolean).slice(0, 60)
  } catch { return NextResponse.json({ error: 'bad request body' }, { status: 400 }) }
  if (!name) return NextResponse.json({ error: 'no item name' }, { status: 400 })

  const prompt = `Write ONE short, appetizing customer-facing menu description for an item at a tropical bar/kitchen in Ho Chi Minh City.
Item: ${name}${category ? ` (${category})` : ''}
Key ingredients: ${ingredients.length ? ingredients.join(', ') : 'n/a'}
Rules:
- One sentence, about 10–18 words. Appealing but natural; no emojis, no price, no quotation marks.
- Describe it to a customer. Do NOT start with "Made with" or repeat the item name.
- Return ONLY the description text.`

  const body = { contents: [{ parts: [{ text: prompt }] }], generationConfig: { temperature: 0.6 } }
  const url = `https://generativelanguage.googleapis.com/v1beta/models/${MODEL}:generateContent?key=${key}`

  let r: Response | null = null
  for (let attempt = 0; attempt < 4; attempt++) {
    try {
      r = await fetch(url, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) })
    } catch (e: any) {
      if (attempt === 3) return NextResponse.json({ error: 'Could not reach the AI service: ' + (e?.message || e) }, { status: 502 })
      await new Promise(s => setTimeout(s, 1200 * (attempt + 1))); continue
    }
    if ((r.status === 503 || r.status === 429) && attempt < 3) { await new Promise(s => setTimeout(s, 1200 * (attempt + 1))); continue }
    break
  }
  if (!r || !r.ok) return NextResponse.json({ error: `The AI is busy (${r?.status ?? 'no response'}) — try again in a moment.` }, { status: 502 })

  const j: any = await r.json()
  const text = (j?.candidates?.[0]?.content?.parts?.[0]?.text || '').trim().replace(/^["']+|["']+$/g, '')
  return NextResponse.json({ description: text })
}

// English → Vietnamese translation for recipes — uses Gemini Flash (same GEMINI_API_KEY as the scanners).
import { NextRequest, NextResponse } from 'next/server'

export const dynamic = 'force-dynamic'
export const maxDuration = 30

const MODEL = process.env.GEMINI_MODEL || 'gemini-2.5-flash'

export async function POST(req: NextRequest) {
  const key = process.env.GEMINI_API_KEY
  if (!key) return NextResponse.json({ error: 'GEMINI_API_KEY is not set in the environment.' }, { status: 500 })

  let text = ''
  try { text = String((await req.json()).text || '') } catch { return NextResponse.json({ error: 'bad request body' }, { status: 400 }) }
  text = text.trim()
  if (!text) return NextResponse.json({ vi: '' })

  const prompt = `Translate the following restaurant recipe text from English into natural Vietnamese (Vietnam, Southern style), for a bar/kitchen in Ho Chi Minh City.
Rules:
- Concise and practical for kitchen staff.
- Keep brand/proper names (e.g. Kewpie, Heinz, Gochujang, Tartine, jalapeño, Frank's), units (g, ml, kg, °C) and numbers exactly as-is.
- Preserve line breaks exactly — each input line stays its own output line.
- Return ONLY the Vietnamese translation. No quotes, labels, notes, or explanations.

English:
${text}`

  const body = { contents: [{ parts: [{ text: prompt }] }], generationConfig: { temperature: 0.2 } }
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
  if (!r || !r.ok) return NextResponse.json({ error: `Translation failed (${r?.status ?? 'no response'}).` }, { status: 502 })

  const j: any = await r.json()
  const vi = (j?.candidates?.[0]?.content?.parts?.[0]?.text || '').trim()
  return NextResponse.json({ vi })
}

// Short manager advice on which over-target menu items to reprice/fix — Gemini Flash.
import { NextRequest, NextResponse } from 'next/server'

export const dynamic = 'force-dynamic'
export const maxDuration = 30

const MODEL = process.env.GEMINI_MODEL || 'gemini-2.5-flash'

export async function POST(req: NextRequest) {
  const key = process.env.GEMINI_API_KEY
  if (!key) return NextResponse.json({ error: 'GEMINI_API_KEY is not set in the environment.' }, { status: 500 })

  let target = 30, items: string[] = []
  try {
    const b = await req.json()
    target = Number(b.target) || 30
    if (Array.isArray(b.items)) items = b.items.map((s: any) => String(s)).filter(Boolean).slice(0, 30)
  } catch { return NextResponse.json({ error: 'bad request body' }, { status: 400 }) }
  if (!items.length) return NextResponse.json({ advice: 'Nothing is over target — margins look healthy.' })

  const prompt = `You are a restaurant cost consultant for a tropical bar/kitchen in Ho Chi Minh City. The target food cost is ${target}%. These menu items are OVER target (name, current cost, current price, food-cost %):
${items.join('\n')}
Give the owner a short, practical plan (about 100 words max). Prioritise the worst offenders first. For each, give ONE specific action: raise the price to a clean round number, trim the portion, swap a costly ingredient, or consider dropping it. Plain text, a few short lines each starting with "- ". No preamble, no closing remarks.`

  const body = { contents: [{ parts: [{ text: prompt }] }], generationConfig: { temperature: 0.5 } }
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
  const advice = (j?.candidates?.[0]?.content?.parts?.[0]?.text || '').trim()
  return NextResponse.json({ advice })
}

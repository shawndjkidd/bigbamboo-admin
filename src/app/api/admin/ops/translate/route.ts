// English → Vietnamese for anything on the public site: page wording, menu items,
// event blurbs. Uses the same Gemini key as the keg scanner. Staff only; the answer is
// a suggestion the person edits, nothing is saved here.
import { NextRequest, NextResponse } from 'next/server'
import { getServiceClient } from '@/lib/supabase'

export const dynamic = 'force-dynamic'
const MODEL = process.env.GEMINI_MODEL || 'gemini-2.5-flash'

const PROMPT = `Translate the given English text into Vietnamese for a craft beer bar in Ho Chi Minh City called BigBamBoo.
Rules:
- Keep it short and natural, the way a Saigon bar writes to its customers. Not formal, not machine-stiff.
- Keep brand names, beer names, brewery names, styles (IPA, Lager, Stout), and numbers exactly as they are.
- Keep any punctuation marks that separate parts of the line, like · or ×.
- Return ONLY valid JSON: {"items":[{"i":number,"vi":string}]} with one entry per input item, same order.`

export async function POST(req: NextRequest) {
  const key = process.env.GEMINI_API_KEY
  if (!key) return NextResponse.json({ error: 'GEMINI_API_KEY is not set.' }, { status: 500 })

  const token = (req.headers.get('authorization') || '').replace(/^Bearer\s+/i, '').trim()
  if (!token) return NextResponse.json({ error: 'Not signed in.' }, { status: 401 })
  const svc = getServiceClient()
  const { data: ures } = await svc.auth.getUser(token)
  const email = ures?.user?.email
  if (!email) return NextResponse.json({ error: 'Session expired — sign in again.' }, { status: 401 })
  const { data: su } = await svc.from('staff_users').select('role, active').eq('email', email).maybeSingle()
  if (!su || !su.active) return NextResponse.json({ error: 'Not allowed.' }, { status: 403 })

  let items: string[] = []
  try {
    const b = await req.json()
    items = (Array.isArray(b?.items) ? b.items : []).slice(0, 60).map((v: unknown) => String(v ?? '').slice(0, 2000))
  } catch { return NextResponse.json({ error: 'bad request' }, { status: 400 }) }
  const keep = items.map((t, i) => ({ i, t: t.trim() })).filter(x => x.t)
  if (!keep.length) return NextResponse.json({ ok: true, items: [] })

  const body = {
    contents: [{ parts: [{ text: `${PROMPT}\n\nITEMS:\n${JSON.stringify(keep.map(k => ({ i: k.i, en: k.t })))}` }] }],
    generationConfig: { temperature: 0.2, responseMimeType: 'application/json' },
  }
  let r: Response
  try {
    r = await fetch(`https://generativelanguage.googleapis.com/v1beta/models/${MODEL}:generateContent?key=${key}`, {
      method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body),
    })
  } catch (e: any) { return NextResponse.json({ error: 'Could not reach the translator: ' + (e?.message || e) }, { status: 502 }) }
  if (!r.ok) return NextResponse.json({ error: `Translator error ${r.status}` }, { status: 502 })

  const j: any = await r.json()
  let parsed: any
  try { parsed = JSON.parse(j?.candidates?.[0]?.content?.parts?.[0]?.text || '') } catch { return NextResponse.json({ error: 'Could not read the translation.' }, { status: 422 }) }
  const out = (Array.isArray(parsed?.items) ? parsed.items : [])
    .map((x: any) => ({ i: Math.round(Number(x?.i)), vi: String(x?.vi ?? '').trim() }))
    .filter((x: any) => Number.isFinite(x.i) && x.vi)
  return NextResponse.json({ ok: true, items: out })
}

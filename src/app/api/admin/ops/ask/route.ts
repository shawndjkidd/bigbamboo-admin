// Ask-your-data: turns a manager's natural-language question into a read-only SQL SELECT over a
// fixed whitelist of analytics relations, runs it through the guarded public.ask_select() function
// (which executes as a least-privilege read-only role), then has the AI phrase the answer.
// Manager-gated. Never touches staff/auth/sensitive tables (the DB role has no access to them).
import { NextRequest, NextResponse } from 'next/server'
import { getServiceClient } from '@/lib/supabase'

export const dynamic = 'force-dynamic'
export const maxDuration = 45

const MODEL = process.env.GEMINI_MODEL || 'gemini-2.5-flash'

const SCHEMA = `Only these relations may be used (Postgres, schema "ops"). Money is Vietnamese Dong (đ). The venue is single — no venue filter needed. Use CURRENT_DATE for "today".
ops.sales_items(occurred_on date, occurred_at timestamptz, menu_item_name text, recipe_id uuid, qty numeric, unit_price numeric, gross numeric, discount numeric, source text, payment_method text) -- one row per item sold. Revenue = sum(gross).
ops.purchases(occurred_on date, vendor text, category text, amount numeric, ingredient_id uuid) -- money spent. category is an expense key e.g. food, consumable, capex, utilities, rent.
ops.ingredients(name text, category text, current_cost_per_base numeric, base_unit text, par_level_base numeric, on_hand_base numeric, supplier text, active bool) -- stock & costs. Needs reorder when on_hand_base < par_level_base (and par_level_base is not null).
ops.recipes(name text, type text, category text, sale_price numeric, active bool) -- type in (menu_item, add_on, batch).
ops.v_recipe_cost(name text, type text, category text, sale_price numeric, total_cost numeric, cost_per_unit numeric, margin_per_unit numeric) -- per-recipe cost & margin. Food cost % = cost_per_unit/sale_price.
ops.v_pnl_accrual(period_month date, revenue numeric, cogs numeric, labor numeric, opex numeric, depreciation numeric, net_income_accrual numeric) -- monthly P&L, one row per month.
ops.pos_item_map(item_name text, recipe_id uuid, category text).`

async function gemini(prompt: string, key: string, jsonOut = false): Promise<string> {
  const body: any = { contents: [{ parts: [{ text: prompt }] }], generationConfig: { temperature: 0 } }
  if (jsonOut) body.generationConfig.responseMimeType = 'application/json'
  const url = `https://generativelanguage.googleapis.com/v1beta/models/${MODEL}:generateContent?key=${key}`
  let r: Response | null = null
  for (let attempt = 0; attempt < 4; attempt++) {
    try { r = await fetch(url, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) }) }
    catch { if (attempt === 3) throw new Error('Could not reach the AI service.'); await new Promise(s => setTimeout(s, 1200 * (attempt + 1))); continue }
    if ((r.status === 503 || r.status === 429) && attempt < 3) { await new Promise(s => setTimeout(s, 1200 * (attempt + 1))); continue }
    break
  }
  if (!r || !r.ok) throw new Error(`The AI is busy (${r?.status ?? 'no response'}) — try again.`)
  const j: any = await r.json()
  return (j?.candidates?.[0]?.content?.parts?.[0]?.text || '').trim()
}

export async function POST(req: NextRequest) {
  const key = process.env.GEMINI_API_KEY
  if (!key) return NextResponse.json({ error: 'GEMINI_API_KEY is not set in the environment.' }, { status: 500 })

  // Auth gate — managers only.
  const token = (req.headers.get('authorization') || '').replace(/^Bearer\s+/i, '').trim()
  if (!token) return NextResponse.json({ error: 'Not signed in.' }, { status: 401 })
  const svc = getServiceClient()
  const { data: ures } = await svc.auth.getUser(token)
  const email = ures?.user?.email
  if (!email) return NextResponse.json({ error: 'Session expired — sign in again.' }, { status: 401 })
  const { data: su } = await svc.from('staff_users').select('role').eq('email', email).maybeSingle()
  if (!su || !['super_admin', 'admin', 'manager'].includes(String(su.role))) {
    return NextResponse.json({ error: 'Managers only.' }, { status: 403 })
  }

  let question = ''
  try { question = String((await req.json()).question || '').trim() } catch { return NextResponse.json({ error: 'bad request body' }, { status: 400 }) }
  if (!question) return NextResponse.json({ error: 'Ask a question first.' }, { status: 400 })

  // 1. Generate a read-only SELECT.
  let sql = ''
  try {
    sql = await gemini(`You are a Postgres analyst for a bar/restaurant. Write ONE read-only SQL SELECT that answers the question.
${SCHEMA}
Rules: SELECT only (you may use WITH). Schema-qualify every table as ops.<name>. Always add a sensible LIMIT (<= 100). Round money to whole numbers. For "last week/month/N days" use date math on occurred_on or period_month vs CURRENT_DATE. Return ONLY the SQL — no markdown fences, no comments, no explanation.
Question: ${question}`, key)
  } catch (e: any) { return NextResponse.json({ error: e?.message || 'AI error' }, { status: 502 }) }
  sql = sql.replace(/```sql/gi, '').replace(/```/g, '').trim().replace(/;\s*$/, '')
  if (!/^(select|with)\s/i.test(sql)) return NextResponse.json({ error: 'I could only answer that with a read query and the AI returned something else — try rephrasing.' }, { status: 422 })

  // 2. Run it through the guarded read-only function.
  const { data: rows, error: qErr } = await svc.schema('ops').rpc('ask_select', { q: sql })
  if (qErr) return NextResponse.json({ error: 'That question couldn\'t be answered from the available data (' + qErr.message + ').', sql }, { status: 422 })

  // 3. Phrase the answer.
  let answer = ''
  try {
    answer = await gemini(`Question: ${question}
Query result (JSON rows): ${JSON.stringify(rows).slice(0, 6000)}
Write a concise, direct answer for the owner (1–3 sentences). Money is Vietnamese Dong — write amounts with thousands separators and a "đ" suffix. If the result is empty, say no data was found for that. Plain text only.`, key)
  } catch (e: any) { answer = '(Got the data but the AI summary failed: ' + (e?.message || e) + ')' }

  return NextResponse.json({ answer, sql, rowCount: Array.isArray(rows) ? rows.length : 0, rows })
}

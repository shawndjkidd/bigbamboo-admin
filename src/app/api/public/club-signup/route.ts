// Drinks Club sign-up from the public homepage. One email box, no login.
//
// Writes to club_signups, which is deliberately not the loyalty tables — these are
// unverified addresses typed into a website, not people we have served. See the migration
// in supabase/migrations/20260913000000_club_signups.sql.
import { NextRequest, NextResponse } from 'next/server'
import { getServiceClient } from '@/lib/supabase'

export const dynamic = 'force-dynamic'

// Deliberately loose. The job here is to reject obvious rubbish and typos, not to
// adjudicate the email RFCs — a real address that trips a clever regex is a lost customer.
const EMAIL = /^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/

export async function POST(req: NextRequest) {
  let body: any
  try { body = await req.json() } catch { return NextResponse.json({ error: 'bad request' }, { status: 400 }) }

  // Honeypot, same as the other public forms: bots fill every field they find.
  // Answer as though it worked so they have nothing to learn from the response.
  if (typeof body?.website === 'string' && body.website.trim()) return NextResponse.json({ ok: true })

  const email = typeof body?.email === 'string' ? body.email.trim().toLowerCase() : ''
  if (!email || email.length > 254 || !EMAIL.test(email)) {
    return NextResponse.json({ error: 'email' }, { status: 422 })
  }
  const lang = body?.lang === 'vi' ? 'vi' : 'en'
  const source = typeof body?.source === 'string' && body.source.trim()
    ? body.source.trim().slice(0, 40)
    : 'homepage'

  let svc: ReturnType<typeof getServiceClient>
  try { svc = getServiceClient() } catch { return NextResponse.json({ error: 'server' }, { status: 500 }) }

  const { error } = await svc.from('club_signups').insert({ email, lang, source })

  // 23505 is the unique index on lower(email): they are already on the list, which from
  // the visitor's side is exactly the outcome they asked for.
  if (error && (error as any).code !== '23505') {
    return NextResponse.json({ error: 'server' }, { status: 500 })
  }

  return NextResponse.json({ ok: true })
}

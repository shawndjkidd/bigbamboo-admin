// Drinks Club sign-up from the public homepage. No login.
//
// Writes to club_signups — deliberately not the loyalty tables, since these are
// unverified details typed into a website, not people we have served. See
// supabase/migrations/20260913000000_club_signups.sql. Also drops a row in the dashboard
// inbox so it doesn't arrive silently.
import { NextRequest, NextResponse } from 'next/server'
import { getServiceClient } from '@/lib/supabase'
import { addInboxItem } from '@/lib/inbox'

export const dynamic = 'force-dynamic'

// Deliberately loose. The job is to reject obvious rubbish and typos, not to adjudicate
// the email RFCs — a real address that trips a clever regex is a lost customer.
const EMAIL = /^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/

// Vietnamese mobile numbers, give or take how people type them: digits, spaces, dots,
// dashes, brackets and an optional +84.
const ZALO = /^\+?[\d][\d\s.()-]{5,24}$/

export async function POST(req: NextRequest) {
  let body: any
  try { body = await req.json() } catch { return NextResponse.json({ error: 'bad request' }, { status: 400 }) }

  // Honeypot, same as the other public forms: bots fill every field they find. Answer as
  // though it worked so they have nothing to learn from the response.
  if (typeof body?.website === 'string' && body.website.trim()) return NextResponse.json({ ok: true })

  const email = typeof body?.email === 'string' ? body.email.trim().toLowerCase() : ''
  if (!email || email.length > 254 || !EMAIL.test(email)) {
    return NextResponse.json({ error: 'email' }, { status: 422 })
  }

  // Zalo and name are optional. A malformed optional field shouldn't cost someone their
  // sign-up, so a number we can't read is dropped rather than rejected.
  const rawZalo = typeof body?.zalo === 'string' ? body.zalo.trim() : ''
  const zalo = rawZalo && ZALO.test(rawZalo) ? rawZalo.slice(0, 30) : null
  const rawName = typeof body?.name === 'string' ? body.name.trim().replace(/\s+/g, ' ') : ''
  const name = rawName ? rawName.slice(0, 120) : null

  const lang = body?.lang === 'vi' ? 'vi' : 'en'
  const source = typeof body?.source === 'string' && body.source.trim()
    ? body.source.trim().slice(0, 40)
    : 'homepage'

  let svc: ReturnType<typeof getServiceClient>
  try { svc = getServiceClient() } catch { return NextResponse.json({ error: 'server' }, { status: 500 }) }

  const { data, error } = await svc
    .from('club_signups')
    .insert({ email, zalo, name, lang, source })
    .select('id')
    .maybeSingle()

  // 23505 is the unique index on lower(email): they are already on the list, which from
  // the visitor's side is exactly the outcome they asked for. No second inbox row either —
  // signing up twice isn't news.
  if (error) {
    if ((error as any).code === '23505') return NextResponse.json({ ok: true })
    return NextResponse.json({ error: 'server' }, { status: 500 })
  }

  await addInboxItem(svc, {
    kind: 'club_signup',
    title: name ? `${name} joined the Drinks Club` : 'New Drinks Club sign-up',
    summary: [email, zalo ? `Zalo ${zalo}` : null, lang === 'vi' ? 'Tiếng Việt' : null]
      .filter(Boolean).join(' · '),
    ref_table: 'club_signups',
    ref_id: data?.id ?? null,
  })

  return NextResponse.json({ ok: true })
}

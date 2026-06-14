// Create a staff account server-side with the service role so it's created ALREADY
// CONFIRMED (email_confirm: true) — no email-verification step. Super-admin gated.
import { NextRequest, NextResponse } from 'next/server'
import { getServiceClient } from '@/lib/supabase'

export const dynamic = 'force-dynamic'

export async function POST(req: NextRequest) {
  const token = (req.headers.get('authorization') || '').replace(/^Bearer\s+/i, '').trim()
  if (!token) return NextResponse.json({ error: 'Not signed in.' }, { status: 401 })
  const svc = getServiceClient()
  const { data: ures } = await svc.auth.getUser(token)
  const email = ures?.user?.email
  if (!email) return NextResponse.json({ error: 'Session expired — sign in again.' }, { status: 401 })
  const { data: me } = await svc.from('staff_users').select('role').eq('email', email).maybeSingle()
  if (!me || me.role !== 'super_admin') return NextResponse.json({ error: 'Super admin only.' }, { status: 403 })

  let body: any = {}
  try { body = await req.json() } catch { return NextResponse.json({ error: 'bad request body' }, { status: 400 }) }
  const name = String(body.name || '').trim()
  const em = String(body.email || '').trim().toLowerCase()
  const password = String(body.password || '')
  const role = String(body.role || 'staff')
  const department = String(body.department || '') || null
  if (!name || !em || !password) return NextResponse.json({ error: 'Name, email and password are required.' }, { status: 400 })
  if (password.length < 6) return NextResponse.json({ error: 'Password must be at least 6 characters.' }, { status: 400 })

  // Create the auth user pre-confirmed. Tolerate "already registered" so we can still
  // (re)attach the staff row if the auth user exists but the staff row is missing.
  const { error: cErr } = await svc.auth.admin.createUser({ email: em, password, email_confirm: true })
  if (cErr && !/already|exists|registered/i.test(cErr.message)) {
    return NextResponse.json({ error: cErr.message }, { status: 400 })
  }

  const { error: sErr } = await svc.from('staff_users').upsert({ name, email: em, role, department }, { onConflict: 'email' })
  if (sErr) return NextResponse.json({ error: sErr.message }, { status: 400 })
  return NextResponse.json({ ok: true })
}

export async function PATCH(req: NextRequest) {
  const token = (req.headers.get('authorization') || '').replace(/^Bearer\s+/i, '').trim()
  if (!token) return NextResponse.json({ error: 'Not signed in.' }, { status: 401 })
  const svc = getServiceClient()
  const { data: ures } = await svc.auth.getUser(token)
  const meEmail = ures?.user?.email
  if (!meEmail) return NextResponse.json({ error: 'Session expired — sign in again.' }, { status: 401 })
  const { data: me } = await svc.from('staff_users').select('role').eq('email', meEmail).maybeSingle()
  if (!me || me.role !== 'super_admin') return NextResponse.json({ error: 'Super admin only.' }, { status: 403 })

  let body: any = {}
  try { body = await req.json() } catch { return NextResponse.json({ error: 'bad request body' }, { status: 400 }) }
  const em = String(body.email || '').trim().toLowerCase()
  const password = String(body.password || '')
  const logoutOnly = !!body.logout && !password
  if (!em) return NextResponse.json({ error: 'email required' }, { status: 400 })
  if (!logoutOnly && password.length < 6) return NextResponse.json({ error: 'Password must be at least 6 characters.' }, { status: 400 })

  const { data: list } = await svc.auth.admin.listUsers({ page: 1, perPage: 1000 } as any)
  const u = (list?.users || []).find((x: any) => (x.email || '').toLowerCase() === em)
  if (!u) return NextResponse.json({ error: 'No login found for that email.' }, { status: 404 })

  if (!logoutOnly) {
    const { error } = await svc.auth.admin.updateUserById(u.id, { password })
    if (error) return NextResponse.json({ error: error.message }, { status: 400 })
  }
  // Force every active session to sign out (so a password change kicks the old login).
  try { await svc.rpc('admin_force_logout', { p_uid: u.id }) } catch {}
  return NextResponse.json({ ok: true })
}

export async function DELETE(req: NextRequest) {
  const token = (req.headers.get('authorization') || '').replace(/^Bearer\s+/i, '').trim()
  if (!token) return NextResponse.json({ error: 'Not signed in.' }, { status: 401 })
  const svc = getServiceClient()
  const { data: ures } = await svc.auth.getUser(token)
  const meEmail = ures?.user?.email
  if (!meEmail) return NextResponse.json({ error: 'Session expired — sign in again.' }, { status: 401 })
  const { data: me } = await svc.from('staff_users').select('role').eq('email', meEmail).maybeSingle()
  if (!me || me.role !== 'super_admin') return NextResponse.json({ error: 'Super admin only.' }, { status: 403 })

  const em = (new URL(req.url).searchParams.get('email') || '').trim().toLowerCase()
  if (!em) return NextResponse.json({ error: 'email required' }, { status: 400 })
  if (em === meEmail.toLowerCase()) return NextResponse.json({ error: "You can't delete your own account." }, { status: 400 })

  // Remove the staff record (this is what gates access), then the auth login.
  const { error: dErr } = await svc.from('staff_users').delete().eq('email', em)
  if (dErr) return NextResponse.json({ error: dErr.message }, { status: 400 })
  try {
    const { data: list } = await svc.auth.admin.listUsers({ page: 1, perPage: 1000 } as any)
    const u = (list?.users || []).find((x: any) => (x.email || '').toLowerCase() === em)
    if (u) await svc.auth.admin.deleteUser(u.id)
  } catch {}
  return NextResponse.json({ ok: true })
}

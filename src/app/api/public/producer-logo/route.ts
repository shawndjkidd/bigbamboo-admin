// Stores one brewery logo and hands back its public URL.
//
// Used by the Producers page when staff fix a logo that came in wrong. The public collab
// form does its uploads inline with the rest of the answers, but both ends go through the
// same validator and the same bucket — one set of rules, not a staff path and a public
// path that can drift apart.
//
// This does not write to the database. The caller decides which producer row the URL
// belongs on, which keeps an anonymous request from being able to repoint any brewery's
// logo just by naming it.
import { NextRequest, NextResponse } from 'next/server'
import { getServiceClient } from '@/lib/supabase'
import { prepareLogo, storeLogo, logoRejected } from '@/lib/logoUpload'

export const dynamic = 'force-dynamic'

export async function POST(req: NextRequest) {
  const ctype = req.headers.get('content-type') || ''
  if (!ctype.includes('multipart/form-data')) return NextResponse.json({ error: 'bad request' }, { status: 400 })

  let form: FormData
  try { form = await req.formData() } catch { return NextResponse.json({ error: 'bad request' }, { status: 400 }) }

  const file = form.get('logo')
  if (!(file instanceof File)) return NextResponse.json({ error: 'empty' }, { status: 422 })

  // Only ever used to name the stored file, never to look anything up.
  const brewery = typeof form.get('brewery') === 'string' ? String(form.get('brewery')).trim().slice(0, 120) : ''

  const prepared = await prepareLogo(file, brewery)
  if (logoRejected(prepared)) return NextResponse.json({ error: prepared.reason }, { status: 422 })

  let svc: ReturnType<typeof getServiceClient>
  try { svc = getServiceClient() } catch { return NextResponse.json({ error: 'server' }, { status: 500 }) }

  const url = await storeLogo(svc, prepared)
  if (!url) return NextResponse.json({ error: 'server' }, { status: 500 })

  return NextResponse.json({ ok: true, url })
}

import { NextResponse } from 'next/server'
import { getServiceClient } from '@/lib/supabase'

export const dynamic = 'force-dynamic'
export const maxDuration = 60

/*
 * Daily report to Shawn's Command Centre (hq.thatcryptokidd.xyz). Vercel cron, 05:00 Ho Chi Minh
 * time, after the 04:00 Square sync.
 *
 * Reads BigBamBoo's own data (never writes) and posts it through Command Centre's automation API
 * with the "BigBamBoo daily report" key (CC_AUTOMATION_TOKEN), which can only touch the BigBamBoo
 * business there. Money numbers are visible to whoever has "Sees money" for BigBamBoo.
 *
 * Sends: last trading night's net sales and this month's sales (money), unlinked menu items, and
 * the state of the Square sync. Tasks update themselves daily and close when there's nothing left:
 * Square sync failing or not run, Square sign-in about to lapse (it normally renews itself every
 * month, so this only fires if a renewal failed), and menu items not linked to a recipe.
 * Every call carries an Idempotency-Key for the day; ?run=<label> makes a deliberate re-run count.
 */

const CC = 'https://hq.thatcryptokidd.xyz/api/automation/v1'
const OPS = 'Venue Operations', STOCK = 'Inventory & COGS'
const SIGNIN_WARN_DAYS = 7, SYNC_MAX_AGE_H = 26

// Ho Chi Minh City dates (UTC+7).
const hcmDay = (offset = 0) => new Date(Date.now() + 7 * 3600_000 + offset * 86_400_000).toISOString().slice(0, 10)
const vnd = (n: number) => `${Math.round(n).toLocaleString('en-US')} ₫`
const shortDate = (d: string) => new Date(`${d}T12:00:00Z`).toLocaleDateString('en-GB', { day: 'numeric', month: 'short' })

type Call = { endpoint: string; body?: Record<string, unknown>; key?: string }

export async function GET(req: Request) { return run(req) }
export async function POST(req: Request) { return run(req) }

async function run(req: Request) {
  const bearer = (req.headers.get('authorization') || '').replace(/^Bearer\s+/i, '')
  if (!process.env.CRON_SECRET || bearer !== process.env.CRON_SECRET) return NextResponse.json({ error: 'unauthorized' }, { status: 401 })
  const token = process.env.CC_AUTOMATION_TOKEN?.trim()
  if (!token) return NextResponse.json({ error: 'CC_AUTOMATION_TOKEN not set' }, { status: 500 })

  const today = hcmDay()
  const runTag = new URL(req.url).searchParams.get('run')?.replace(/[^a-z0-9-]/gi, '').slice(0, 20)
  const cc = async ({ endpoint, body, key }: Call) => {
    const res = await fetch(`${CC}/${endpoint}`, {
      method: body ? 'POST' : 'GET',
      headers: {
        Authorization: `Bearer ${token}`,
        ...(body ? { 'Content-Type': 'application/json' } : {}),
        ...(key ? { 'Idempotency-Key': `bigbamboo-${today}${runTag ? `-${runTag}` : ''}-${key}` } : {}),
      },
      body: body ? JSON.stringify(body) : undefined,
      cache: 'no-store',
    })
    const json = (await res.json().catch(() => ({}))) as { ok?: boolean; data?: unknown; error?: string }
    return { ok: res.ok && json.ok !== false, data: json.data, error: json.error ?? `HTTP ${res.status}` }
  }

  const ops = () => getServiceClient().schema('ops')
  const [lastR, monthR, syncR, connR, unmappedR] = await Promise.all([
    ops().from('sales_daily').select('occurred_on,net').order('occurred_on', { ascending: false }).limit(1),
    ops().from('sales_daily').select('net').gte('occurred_on', today.slice(0, 8) + '01'),
    ops().from('square_sync_log').select('status,started_at,error_message').order('started_at', { ascending: false }).limit(1),
    ops().from('square_connections').select('expires_at').limit(1),
    ops().from('pos_item_map').select('item_name').is('recipe_id', null).or('ignore.is.null,ignore.eq.false'),
  ])
  const readError = [lastR, monthR, syncR, connR, unmappedR].find(r => r.error)?.error?.message
  if (readError) {
    await cc({ endpoint: 'failures', key: 'read-failed', body: { operation: 'daily report', message: `Couldn't read BigBamBoo data: ${readError}` } })
    return NextResponse.json({ ok: false, error: readError }, { status: 500 })
  }

  const last = (lastR.data as any[])?.[0] as { occurred_on: string; net: number } | undefined
  const monthSales = ((monthR.data as any[]) || []).reduce((s, r) => s + Number(r.net || 0), 0)
  const sync = (syncR.data as any[])?.[0] as { status: string; started_at: string; error_message: string | null } | undefined
  const syncAgeH = sync ? (Date.now() - Date.parse(sync.started_at)) / 3_600_000 : Infinity
  const syncBroken = !sync || sync.status !== 'success' || syncAgeH > SYNC_MAX_AGE_H
  const expires = (connR.data as any[])?.[0]?.expires_at as string | undefined
  const signinDays = expires ? Math.floor((Date.parse(expires) - Date.now()) / 86_400_000) : -1
  const unmapped = ((unmappedR.data as any[]) || []).map(r => String(r.item_name)).sort()
  const daysSinceTrading = last ? Math.round((Date.parse(`${today}T00:00:00Z`) - Date.parse(`${last.occurred_on}T00:00:00Z`)) / 86_400_000) : null

  // Which of this report's tasks are still open, so we only close ones that exist.
  const mine = await cc({ endpoint: 'tasks/mine' })
  const open = new Set(((mine.data as { external_ref: string | null }[] | undefined) ?? []).map(t => t.external_ref))
  const keep = (ref: string, active: boolean, task: Record<string, unknown>): Call | null =>
    active ? { endpoint: 'tasks', key: ref, body: { external_ref: ref, ...task } }
      : open.has(ref) ? { endpoint: 'tasks/update', key: `${ref}-done`, body: { external_ref: ref, status: 'done', note: 'Sorted.' } }
      : null

  const calls: (Call | null)[] = [
    ...(last ? [{ endpoint: 'metrics', key: 'm-last', body: { label: 'Last trading night', value: `${vnd(Number(last.net))} (${shortDate(last.occurred_on)})`, kind: 'num', sensitivity: 'financial' } }] : []),
    { endpoint: 'metrics', key: 'm-month', body: { label: 'Sales this month', value: vnd(monthSales), kind: 'num', sensitivity: 'financial' } },
    { endpoint: 'metrics', key: 'm-sync', body: { label: 'Square sync', value: syncBroken ? (sync ? `Problem (${sync.status})` : 'Never ran') : 'OK', kind: 'stat', tone: syncBroken ? 'bad' : 'ok' } },
    { endpoint: 'metrics', key: 'm-unmapped', body: { label: 'Menu items not linked', value: String(unmapped.length), kind: 'num', tone: unmapped.length ? 'warn' : null } },

    { endpoint: 'progress', key: 'p-ops', body: {
      project: OPS,
      summary: last
        ? `Last trading night ${shortDate(last.occurred_on)}: ${vnd(Number(last.net))}${daysSinceTrading && daysSinceTrading > 7 ? ` (no trading for ${daysSinceTrading} days)` : ''}. This month so far: ${vnd(monthSales)}. Square sync ${syncBroken ? 'has a problem' : 'OK'}.`
        : `No sales recorded yet. Square sync ${syncBroken ? 'has a problem' : 'OK'}.`,
      blocked: syncBroken ? ['Square sync not working'] : [],
      health: syncBroken ? 'at_risk' : 'on_track',
    } },

    keep('square-sync', syncBroken, {
      project: OPS, status: 'blocked', priority: 'urgent', due: today,
      title: 'Square sync is not working: sales are not coming in',
      description: sync ? `Last run ${sync.started_at} (${sync.status})${sync.error_message ? `: ${sync.error_message}` : ''}. Admin → Ops → Square.` : 'The sync has never run. Admin → Ops → Square.',
    }),
    keep('square-signin', signinDays < SIGNIN_WARN_DAYS, {
      project: OPS, priority: 'urgent', due: today,
      title: signinDays < 0 ? 'Reconnect Square: its sign-in has lapsed' : `Reconnect Square within ${signinDays} days`,
      description: 'It normally renews itself every month, so this means a renewal failed. Admin → Ops → Square → Connect.',
    }),
    keep('menu-map', unmapped.length > 0, {
      project: STOCK, priority: 'normal',
      title: `Link ${unmapped.length} menu ${unmapped.length === 1 ? 'item' : 'items'} to recipes`,
      description: `Square items with no recipe, so stock isn't deducted for them (updated ${today}):\n${unmapped.slice(0, 40).map(n => `• ${n}`).join('\n')}${unmapped.length > 40 ? `\n…and ${unmapped.length - 40} more` : ''}\nAdmin → Ops → Menu mapping (or mark items "ignore").`,
    }),
  ]

  const results = []
  for (const call of calls.filter((c): c is Call => !!c)) {
    const r = await cc(call)
    results.push({ key: call.key, ok: r.ok, ...(r.ok ? {} : { error: r.error }) })
  }
  const failed = results.filter(r => !r.ok)
  if (failed.length) {
    await cc({ endpoint: 'failures', key: 'send-failed', body: {
      operation: 'daily report',
      message: `${failed.length} of ${results.length} updates didn't go through: ${failed.map(f => `${f.key} (${f.error})`).join('; ').slice(0, 900)}`,
    } })
  }
  return NextResponse.json({ ok: failed.length === 0, day: today, sent: results.length, failed })
}

import type { Metadata } from 'next'
import { getServiceClient } from '@/lib/supabase'
import SiteHome from './SiteHome'
import type { Settings } from './copy'
import type { SiteEvent, SiteMenuItem } from './types'

// The public BigBamBoo homepage, served at bigbamboo.app (see the rewrites in
// next.config.js). A port of the old Hostinger index.html: same sections, same order,
// same ids (#menu, #events, #club, #visit) so old links still land.
//
// Copy comes from site_settings (home_* keys, with a fallback to the older unprefixed
// keys — see copy.ts); the drinks and the events come from their own tables and are
// edited on their existing dashboard pages. Nothing here is hard-coded that Shawn
// can't change himself.
export const dynamic = 'force-dynamic'
export const revalidate = 0

export const metadata: Metadata = {
  title: 'BigBamBoo — Tropical Bar & Venue, An Phú Saigon',
  description: 'Cold drinks. Breezy nights. No bad vibes. Draft cocktails, craft beer and American comfort food with a Hawaiian twist in An Phú, Thủ Đức.',
  robots: { index: true, follow: true },
}

// The old page's keys, still populated in Supabase. Read so the live links and address
// keep working without a migration.
const LEGACY_KEYS = [
  'slogan', 'address_street', 'address_city',
  'instagram_url', 'facebook_url', 'google_maps_url', 'grab_url',
  'menu_section_order',
]

export default async function PublicHome() {
  let settings: Settings = {}
  let events: SiteEvent[] = []
  let menu: SiteMenuItem[] = []
  // The Drinks Club box only appears once there is somewhere to put the addresses.
  // Probing beats a hard-coded flag: the box turns itself on the moment the migration
  // is applied, with no second deploy, and can never be a form that quietly 500s.
  let clubReady = false

  // Built here rather than at module scope so a missing service-role key degrades this
  // page to its built-in copy instead of taking the whole homepage down with a 500.
  let svc: ReturnType<typeof getServiceClient> | null = null
  try { svc = getServiceClient() } catch { /* no client — defaults below carry the page */ }

  // Yesterday, so an event running tonight doesn't vanish at midnight UTC.
  const today = new Date(Date.now() - 86400000).toISOString().slice(0, 10)

  // Kept apart on purpose: if one query fails the rest of the page still renders.
  try {
    if (!svc) throw new Error('no client')
    const { data: rows } = await svc
      .from('site_settings')
      .select('key, value')
      .or(`key.like.home_%,key.in.(${LEGACY_KEYS.join(',')})`)
    settings = Object.fromEntries((rows || []).map((r: any) => [String(r.key), String(r.value ?? '')]))
  } catch { /* defaults */ }

  try {
    if (!svc) throw new Error('no client')
    const { data: rows } = await svc
      .from('menu_items')
      .select('id, section, name, name_vi, subtitle, description, description_vi, price, price_glass, price_bottle, price_small, price_large, abv, tags, brand, is_draft, sort_order')
      .eq('is_available', true)
      .order('sort_order')
    menu = ((rows || []) as any[]).map(m => ({
      id: String(m.id),
      section: m.section || 'other',
      name: m.name || '',
      name_vi: m.name_vi || null,
      subtitle: m.subtitle || null,
      description: m.description || '',
      description_vi: m.description_vi || null,
      price: m.price || '',
      price_glass: m.price_glass || '',
      price_bottle: m.price_bottle || '',
      price_small: m.price_small || '',
      price_large: m.price_large || '',
      abv: m.abv || '',
      tags: Array.isArray(m.tags) ? m.tags.map(String) : [],
      brand: m.brand || '',
      is_draft: !!m.is_draft,
    }))
  } catch { /* menu section shows its empty line */ }

  try {
    if (!svc) throw new Error('no client')
    const { data: rows } = await svc
      .from('events')
      .select('id, title, title_vi, type, description, teaser, teaser_vi, event_date, start_time, end_time, facebook_link, is_free, ticket_price')
      .eq('is_published', true)
      .gte('event_date', today)
      .order('event_date')
      .limit(8)
    events = ((rows || []) as any[]).map(e => ({
      id: String(e.id),
      title: e.title || '',
      title_vi: e.title_vi || null,
      type: e.type || '',
      description: e.teaser || e.description || '',
      description_vi: e.teaser_vi || null,
      date: e.event_date || '',
      start_time: e.start_time || null,
      end_time: e.end_time || null,
      facebook_link: e.facebook_link || '',
      is_free: e.is_free !== false,
      ticket_price: e.ticket_price ?? null,
    }))
  } catch { /* events section shows its empty state */ }

  try {
    if (!svc) throw new Error('no client')
    const { error } = await svc.from('club_signups').select('id', { head: true, count: 'exact' }).limit(1)
    clubReady = !error
  } catch { /* table not there yet — the sign-up box stays hidden */ }

  return <SiteHome settings={settings} events={events} menu={menu} clubReady={clubReady} />
}

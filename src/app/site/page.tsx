import type { Metadata } from 'next'
import { getServiceClient } from '@/lib/supabase'
import SiteHome, { type SiteEvent, type SiteSettings } from './SiteHome'

// The public BigBamBoo homepage, served at bigbamboo.app (see the rewrites in
// next.config.js). Every word comes from site_settings (home_* keys) edited in the
// dashboard under Website; the events come from the events table. Nothing is hard-coded
// that Shawn can't change himself.
export const dynamic = 'force-dynamic'
export const revalidate = 0

export const metadata: Metadata = {
  title: 'BigBamBoo · An Phú, Saigon',
  description: 'Cold drinks. Breezy nights. No bad vibes. Draft cocktails, craft beer and American comfort food with a Hawaiian twist in An Phú, Thủ Đức.',
  robots: { index: true, follow: true },
}

export default async function PublicHome() {
  let settings: SiteSettings = {}
  let events: SiteEvent[] = []
  const svc = getServiceClient()
  const today = new Date(Date.now() - 86400000).toISOString().slice(0, 10)
  // Kept apart on purpose: if one query fails the rest of the page still renders.
  try {
    const { data: rows } = await svc.from('site_settings').select('key, value').or('key.like.home_%,key.like.fest_%')
    settings = Object.fromEntries((rows || []).map((r: any) => [String(r.key), String(r.value ?? '')]))
  } catch { /* defaults */ }
  try {
    const { data: evs } = await svc.from('events')
      .select('*').eq('is_published', true).gte('event_date', today).order('event_date').limit(6)
    events = ((evs || []) as any[]).map(e => ({
      id: String(e.id),
      title: e.title || '',
      date: e.event_date || '',
      description: e.description || e.summary || e.blurb || null,
    }))
  } catch { /* no events section */ }

  return <SiteHome settings={settings} events={events} />
}

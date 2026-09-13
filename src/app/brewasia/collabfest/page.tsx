import type { Metadata } from 'next'
import { getServiceClient } from '@/lib/supabase'
import FestPage, { type FestBeer, type FestSettings } from './FestPage'

// Public event page for the Halloween Collab Fest.
// - The beer list is built from the Collabs page: any collab with Fest kegs and a status
//   of Matched or further shows here. Lead and Dead stay hidden.
// - Every piece of wording, the poster and the ticket link come from site_settings
//   (fest_*), edited on the admin Collabs page. No code change needed to edit the page.
export const dynamic = 'force-dynamic'
export const revalidate = 0

export const metadata: Metadata = {
  title: 'Halloween Collab Fest · BrewAsia 2026 · BigBamBoo',
  description: 'Saturday 31 October 2026 at BigBamBoo, Ho Chi Minh City. Collab beers brewed for BrewAsia 2026.',
  robots: { index: true, follow: true },
}

const SHOW = ['matched', 'brewing', 'event_ready', 'done']

export default async function CollabFestPage() {
  let beers: FestBeer[] = []
  let settings: FestSettings = {}
  try {
    const svc = getServiceClient()
    const [{ data: collabs }, { data: rows }] = await Promise.all([
      svc.from('brewasia_collabs').select('code, vn_partner, partners, beer_name, beer_style, abv, status, kegs, fest_pour').order('code'),
      svc.from('site_settings').select('key, value').like('key', 'fest_%'),
    ])
    settings = Object.fromEntries((rows || []).map((r: any) => [String(r.key), String(r.value ?? '')]))
    beers = ((collabs || []) as any[])
      .filter(c => SHOW.includes(String(c.status)) && (Array.isArray(c.kegs) ? c.kegs : []).some((l: any) => l?.use === 'halloween'))
      .map(c => ({
        code: c.code,
        breweries: [c.vn_partner, ...(c.partners || [])].filter(Boolean) as string[],
        beer_name: c.beer_name,
        beer_style: c.beer_style,
        abv: c.abv == null ? null : Number(c.abv),
        confirmed: c.status === 'event_ready' || c.status === 'done',
        own_setup: c.fest_pour === 'own_setup',
      }))
  } catch { /* show the page with whatever we have */ }

  return <FestPage beers={beers} settings={settings} />
}

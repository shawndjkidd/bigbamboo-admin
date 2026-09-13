import type { Metadata } from 'next'
import { getServiceClient } from '@/lib/supabase'
import FestPage, { type FestBeer, type FestLive, type FestSettings } from './FestPage'

// Public event page for the Halloween Collab Fest.
// - The beer list is built from the Collabs page: any collab with Fest kegs and a status
//   of Event ready shows here. Everything earlier stays private.
// - Every piece of wording, the poster and the ticket link come from site_settings
//   (fest_*), edited on the admin Collabs page. No code change needed to edit the page.
export const dynamic = 'force-dynamic'
export const revalidate = 0

export const metadata: Metadata = {
  title: 'Halloween Collab Fest · BrewAsia 2026 · BigBamBoo',
  description: 'Saturday 31 October 2026 at BigBamBoo, Ho Chi Minh City. Collab beers brewed for BrewAsia 2026.',
  robots: { index: true, follow: true },
}

// Only beers Shawn has actually put on the Fest show here: a collab appears once its
// status is Event ready (or Done). Matched and Brewing stay private.
const SHOW = ['event_ready', 'done']
// Counted on the page before the beer itself is announced: anything past "interested".
const COUNTED = ['matched', 'brewing', 'event_ready', 'done']

// The display face for the big headings. Chosen in the admin (fest_title_font); the
// stylesheet comes from Google Fonts for whichever one is picked.
const FONTS: Record<string, string> = {
  'Alfa Slab One': 'Alfa+Slab+One',
  'Creepster': 'Creepster',
  'Eater': 'Eater',
  'Nosifer': 'Nosifer',
  'Metal Mania': 'Metal+Mania',
  'Rye': 'Rye',
  'Bowlby One': 'Bowlby+One',
  'Ultra': 'Ultra',
  'Bungee': 'Bungee',
}

export default async function CollabFestPage() {
  let beers: FestBeer[] = []
  let settings: FestSettings = {}
  let live: FestLive = { collabs: 0, countries: 0, countryList: '' }
  try {
    const svc = getServiceClient()
    const [{ data: collabs }, { data: rows }, { data: producers }] = await Promise.all([
      svc.from('brewasia_collabs').select('code, vn_partner, partners, beer_name, beer_style, abv, status, kegs, fest_pour').order('code'),
      svc.from('site_settings').select('key, value').or('key.like.fest_%,key.like.home_%'),
      svc.from('brewasia_producers').select('name, country'),
    ])
    settings = Object.fromEntries((rows || []).map((r: any) => [String(r.key), String(r.value ?? '')]))

    // The headline numbers are counted from the Collabs page rather than typed by hand:
    // every collab with Fest kegs that's matched or further, and the countries its
    // breweries come from. Anything set in the admin still wins.
    const countryOf = new Map<string, string>()
    for (const p of (producers || []) as any[]) {
      const c = String(p.country || '').trim()
      if (c) countryOf.set(String(p.name || '').trim().toLowerCase(), c)
    }
    const festCollabs = ((collabs || []) as any[]).filter(c =>
      COUNTED.includes(String(c.status)) && (Array.isArray(c.kegs) ? c.kegs : []).some((l: any) => l?.use === 'halloween'))
    const countryNames = Array.from(new Set(
      festCollabs.flatMap(c => [c.vn_partner, ...(c.partners || [])])
        .map((n: any) => countryOf.get(String(n || '').trim().toLowerCase()))
        .filter(Boolean) as string[],
    )).sort((a, b) => (a === 'Vietnam' ? -1 : b === 'Vietnam' ? 1 : a.localeCompare(b)))
    live = { collabs: festCollabs.length, countries: countryNames.length, countryList: countryNames.join(' · ') }
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

  const fontName = FONTS[settings.fest_title_font || ''] ? settings.fest_title_font : 'Alfa Slab One'
  // The display face (picked in the admin) plus Archivo, the page's body face.
  const fontHref = `https://fonts.googleapis.com/css2?family=${FONTS[fontName]}&family=Archivo:wght@500;600;700;800&display=swap`

  return (
    <>
      <link rel="stylesheet" href={fontHref} />
      <div style={{ '--fest-display': `'${fontName}'` } as React.CSSProperties}>
        <FestPage beers={beers} settings={settings} live={live} />
      </div>
    </>
  )
}

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
// A beer announced within this window wears the JUST ADDED badge; it drops off by itself.
const JUST_ADDED_MS = 7 * 24 * 60 * 60 * 1000

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

const BREWASIA_FEED = 'https://brewasia.madesmpl.com/api/public/collab-fest'

async function fetchBrewAsia(): Promise<{ collabs: any[]; producers: any[] }> {
  try {
    const res = await fetch(BREWASIA_FEED, { next: { revalidate: 60 } })
    if (!res.ok) return { collabs: [], producers: [] }
    const j = await res.json()
    if (!j?.ok) return { collabs: [], producers: [] }
    return {
      collabs: Array.isArray(j.collabs) ? j.collabs : [],
      producers: Array.isArray(j.producers) ? j.producers : [],
    }
  } catch {
    return { collabs: [], producers: [] }
  }
}

export default async function CollabFestPage() {
  let beers: FestBeer[] = []
  let settings: FestSettings = {}
  let live: FestLive = { collabs: 0, breweries: 0, countries: 0, countryList: '' }
  try {
    const svc = getServiceClient()
    // Until 31 October 2026 the collabs and producers come from Brew Asia, the single
    // source of truth for BrewAsia. It returns them already in tap order (fest_order,
    // then code) with Lead and Dead left out. The page copy stays in site_settings here.
    // If Brew Asia can't be reached the page still renders, just with an empty tap list.
    const [brewAsia, { data: rows }] = await Promise.all([
      fetchBrewAsia(),
      svc.from('site_settings').select('key, value').or('key.like.fest_%,key.like.home_%'),
    ])
    const { collabs, producers } = brewAsia
    settings = Object.fromEntries((rows || []).map((r: any) => [String(r.key), String(r.value ?? '')]))

    // The headline numbers are counted from the Collabs page rather than typed by hand:
    // every collab with Fest kegs that's matched or further, and the countries its
    // breweries come from. Anything set in the admin still wins.
    const countryOf = new Map<string, string>()
    const logoOf = new Map<string, string>()
    const placeOf = new Map<string, string>()
    for (const p of (producers || []) as any[]) {
      const key = String(p.name || '').trim().toLowerCase()
      const c = String(p.country || '').trim()
      if (c) countryOf.set(key, c)
      const place = [String(p.city || '').trim(), c].filter(Boolean).join(' / ')
      if (place) placeOf.set(key, place)
      const l = String(p.logo_url || '').trim()
      if (l) logoOf.set(key, l)
    }
    const festCollabs = ((collabs || []) as any[]).filter(c =>
      COUNTED.includes(String(c.status)) && (Array.isArray(c.kegs) ? c.kegs : []).some((l: any) => l?.use === 'halloween'))
    const breweryKeys = Array.from(new Set(
      festCollabs.flatMap(c => [c.vn_partner, ...(c.partners || [])])
        .map((n: any) => String(n || '').trim().toLowerCase())
        .filter(Boolean),
    ))
    const countryNames = Array.from(new Set(
      breweryKeys.map(k => countryOf.get(k)).filter(Boolean) as string[],
    )).sort((a, b) => (a === 'Vietnam' ? -1 : b === 'Vietnam' ? 1 : a.localeCompare(b)))
    live = { collabs: festCollabs.length, breweries: breweryKeys.length, countries: countryNames.length, countryList: countryNames.join(' · ') }
    beers = ((collabs || []) as any[])
      .filter(c => SHOW.includes(String(c.status)) && (Array.isArray(c.kegs) ? c.kegs : []).some((l: any) => l?.use === 'halloween'))
      .map(c => ({
        code: c.code,
        breweries: [c.vn_partner, ...(c.partners || [])].filter(Boolean) as string[],
        beer_name: c.beer_name,
        beer_style: c.beer_style,
        abv: c.abv == null ? null : Number(c.abv),
        ibu: c.ibu == null ? null : Number(c.ibu),
        // One entry per brewery on the bill, in the same order, '' where there is no
        // logo — so the card can pair each logo with its name by index.
        logos: [c.vn_partner, ...(c.partners || [])].filter(Boolean)
          .map((n: any) => logoOf.get(String(n).trim().toLowerCase()) || ''),
        // "City / Country" per brewery, same indexing as logos.
        places: [c.vn_partner, ...(c.partners || [])].filter(Boolean)
          .map((n: any) => placeOf.get(String(n).trim().toLowerCase()) || ''),
        // Fest kegs only - the card says how many are coming to Halloween.
        kegs: (Array.isArray(c.kegs) ? c.kegs : [])
          .filter((l: any) => l?.use === 'halloween')
          .reduce((n: number, l: any) => n + (Number(l?.qty) || 0), 0) || null,
        confirmed: c.status === 'event_ready' || c.status === 'done',
        // Derived, never stored: kicked once the keg blows, just added for a week after announcing.
        kicked: c.kicked_at != null,
        just_added: c.announced_at != null && Date.now() - Date.parse(c.announced_at) < JUST_ADDED_MS,
        own_setup: c.fest_pour === 'own_setup',
      }))
  } catch { /* show the page with whatever we have */ }

  const fontName = FONTS[settings.fest_title_font || ''] ? settings.fest_title_font : 'Alfa Slab One'
  // The display face (picked in the admin) plus Archivo, the page's body face.
  const fontHref = `https://fonts.googleapis.com/css2?family=${FONTS[fontName]}&family=Special+Elite&family=Courier+Prime:wght@400;700&display=swap`

  return (
    <>
      <link rel="stylesheet" href={fontHref} />
      <div style={{ '--fest-display': `'${fontName}'` } as React.CSSProperties}>
        <FestPage beers={beers} settings={settings} live={live} />
      </div>
    </>
  )
}

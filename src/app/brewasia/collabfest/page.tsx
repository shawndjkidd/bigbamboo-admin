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
  let live: FestLive = { collabs: 0, breweries: 0, countries: 0, countryList: '' }
  try {
    const svc = getServiceClient()
    const [{ data: collabs }, { data: rows }, { data: producers }] = await Promise.all([
      selectCollabs(svc),
      svc.from('site_settings').select('key, value').or('key.like.fest_%,key.like.home_%'),
      selectProducers(svc),
    ])
    settings = Object.fromEntries((rows || []).map((r: any) => [String(r.key), String(r.value ?? '')]))

    // The headline numbers are counted from the Collabs page rather than typed by hand:
    // every collab with Fest kegs that's matched or further, and the countries its
    // breweries come from. Anything set in the admin still wins.
    const countryOf = new Map<string, string>()
    const logoOf = new Map<string, string>()
    for (const p of (producers || []) as any[]) {
      const key = String(p.name || '').trim().toLowerCase()
      const c = String(p.country || '').trim()
      if (c) countryOf.set(key, c)
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
        // Fest kegs only - the card says how many are coming to Halloween.
        kegs: (Array.isArray(c.kegs) ? c.kegs : [])
          .filter((l: any) => l?.use === 'halloween')
          .reduce((n: number, l: any) => n + (Number(l?.qty) || 0), 0) || null,
        confirmed: c.status === 'event_ready' || c.status === 'done',
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

// ibu and logo_url arrive with their migration. Until it is applied, asking for them
// fails the whole select — and losing the tap list is far worse than losing one stat —
// so each falls back to the column list that existed before. Both can go once the
// migration is in.
async function selectCollabs(svc: any) {
  const full = 'code, vn_partner, partners, beer_name, beer_style, abv, ibu, status, kegs, fest_pour'
  const res = await svc.from('brewasia_collabs').select(full).order('code')
  if (!res.error) return res
  console.warn('[fest] brewasia_collabs.ibu missing — reading without it')
  return svc.from('brewasia_collabs').select(full.replace(', ibu', '')).order('code')
}

async function selectProducers(svc: any) {
  const res = await svc.from('brewasia_producers').select('name, country, logo_url')
  if (!res.error) return res
  console.warn('[fest] brewasia_producers.logo_url missing — reading without it')
  return svc.from('brewasia_producers').select('name, country')
}

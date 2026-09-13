'use client'
import { useCallback, useEffect, useRef, useState, Children, Fragment, type ReactNode } from 'react'

// Public Halloween Collab Fest page. EN / VI.
// Built like the poster: screenprinted bands of rust, cream and deep green stacked down
// the page with torn edges between them, BigBamBoo teal for the bar's own voice, and one
// dark band where the neon can actually glow.
// Wording, poster and links come from site_settings (fest_*), edited in the admin.
// The beer list comes from the Collabs page, so it updates itself.

export type FestBeer = {
  code: string
  breweries: string[]
  beer_name: string | null
  beer_style: string | null
  abv: number | null
  kegs: number | null
  ibu?: number | null
  logos?: string[]
  places?: string[]
  confirmed: boolean
  own_setup: boolean
  kicked?: boolean
  just_added?: boolean
}
export type FestSettings = Record<string, string>
// Counted live from the Collabs page.
export type FestLive = { collabs: number; breweries: number; countries: number; countryList: string }
type Lang = 'en' | 'vi'

const MAPS = 'https://www.google.com/maps/search/BigBamBoo+10+An+Ph%C3%BA%2C+An+Kh%C3%A1nh%2C+Ho+Chi+Minh+City'
const CONTACT_FALLBACK = 'https://wa.me/84347393293'
const BANNER = '/collabfest-banner.jpg'
// The poster split in two: the plate with the hand removed, and the hand itself,
// so the skeleton can break out of the ground in front of the moon.
const PLATE = '/images/collabfest-plate.jpg'
const HAND = '/images/hand-beer.png'
// The ground, cut from the plate itself so the torn edge matches exactly. It sits
// above the hand, so the arm comes up from behind it.
const GROUND = '/images/collabfest-ground.png'
// Chunks of earth thrown up as it breaks through.
const DEBRIS = ['/images/debris1.png', '/images/debris2.png', '/images/debris3.png', '/images/debris4.png']

const T = {
  en: {
    eyebrow: 'BrewAsia × CraftCon Saigon × BigBamBoo',
    title: 'Halloween Collab Fest',
    date: 'Saturday 31 October 2026',
    time: '4pm – midnight',
    venue: 'BigBamBoo',
    address: '10 An Phú, An Khánh, Ho Chi Minh City',
    map: 'Open in Maps',
    tickets: 'Tickets at the door',
    soonStamp: 'Coming soon',
    soon: 'Pay at the door on the night. Online sales coming soon — this page will carry them.',
    ticketsOnline: 'Buy online, or pay at the door on the night.',
    countdown: 'Until the first pour',
    days: 'days', hours: 'hours', mins: 'min',
    statCollabs: '20+',
    statCollabsLabel: 'collab beers',
    statBreweries: '10+',
    statBreweriesLabel: 'breweries',
    statDjs: 'DJs',
    statDjsLabel: 'all night',
    statCostumes: 'Costumes',
    statCostumesLabel: 'welcome',
    countriesTitle: 'Collabs from across Asia and beyond',
    plus: '+…',
    oneNight: 'One night only · 31 Oct',
    versus: 'versus',
    abv: 'ABV',
    kegs: 'Kegs',
    pourLabel: 'ml / token',
    countries: 'Vietnam · Japan · China · Singapore · Korea · India · Philippines · Australia · UK',
    draw1: 'Full roasted pig BBQ collab',
    draw2: 'The BZZD collab cocktail bar',
    draw3: 'Live music & DJs',
    lineup: 'On the taps',
    navGetTickets: 'Get tickets',
    navMenu: 'Menu',
    tapsPrev: 'Previous beers',
    tapsNext: 'Next beers',
    lineupSub: 'Announced one by one as they’re locked in. Keep checking back.',
    confirmed: 'Confirmed',
    coming: 'Brewing',
    tbd: 'Beer to be announced',
    justAdded: 'Just added',
    kicked: 'Kicked',
    comingSoon: 'Next collab dropping soon',
    beers: 'beers', breweries: 'breweries',
    priceTitle: 'Tickets',
    step1: 'Get in the door',
    step2: 'Then buy tokens to drink',
    priceDoor: '100k',
    priceDoorText: 'Everyone pays this once. Free with a BrewAsia conference pass. Beer is bought separately, below.',
    priceDoorKicker: 'Entry',
    packTitle: 'Tasting pack',
    pack1: '200k',
    pack1Text: '4 tokens',
    pack2: '500k',
    pack2Text: 'Buy 10, get 2 free',
    packNote: 'One token = one pour of any collab beer, whatever the strength. Your first token purchase comes with a free festival glass. Out of tokens? Top up at the same price all night.',
    howTitle: 'How the night works',
    how1Title: 'Collab taps',
    how1: 'Collab kegs go on the BigBamBoo tap wall, poured all night until they blow.',
    how2Title: 'BZZD bar & BBQ',
    how2: 'The BZZD collab bar pours alongside the taps, with a BBQ collab from Việt Thích Barbecue and a guest pitmaster from India. DJs until close.',
    how3Title: 'Costumes',
    how3: 'It’s Halloween. Dress for it. The best costumes get looked after.',
    ctaTitle: 'Brewing something for the Fest?',
    ctaText: 'Breweries: contact us for more information.',
    cta: 'Contact us',
    partnersLabel: 'Brought to you by',
    partners: 'BrewAsia × CraftCon Saigon × BigBamBoo',
  },
  vi: {
    eyebrow: 'BrewAsia × CraftCon Saigon × BigBamBoo',
    title: 'Halloween Collab Fest',
    date: 'Thứ Bảy 31/10/2026',
    time: '16:00 – nửa đêm',
    venue: 'BigBamBoo',
    address: '10 An Phú, An Khánh, TP. Hồ Chí Minh',
    map: 'Mở bản đồ',
    tickets: 'Mua vé tại cửa',
    soonStamp: 'Sắp mở bán',
    soon: 'Thanh toán tại cửa trong đêm diễn. Vé online sẽ sớm mở bán ngay trên trang này.',
    ticketsOnline: 'Mua vé online, hoặc thanh toán tại cửa trong đêm diễn.',
    countdown: 'Đếm ngược tới ly đầu tiên',
    days: 'ngày', hours: 'giờ', mins: 'phút',
    statCollabs: '20+',
    statCollabsLabel: 'bia collab',
    statBreweries: '10+',
    statBreweriesLabel: 'nhà máy bia',
    statDjs: 'DJ',
    statDjsLabel: 'suốt đêm',
    statCostumes: 'Hóa trang',
    statCostumesLabel: 'khuyến khích',
    countriesTitle: 'Bia collab từ khắp châu Á và xa hơn',
    plus: '+…',
    oneNight: 'Chỉ một đêm · 31/10',
    versus: 'đối đầu',
    abv: 'Nồng độ',
    kegs: 'Keg',
    pourLabel: 'ml / token',
    countries: 'Việt Nam · Nhật Bản · Trung Quốc · Singapore · Hàn Quốc · Ấn Độ · Philippines · Úc · Anh',
    draw1: 'Collab heo quay nguyên con',
    draw2: 'Quầy cocktail collab BZZD',
    draw3: 'Nhạc sống & DJ',
    lineup: 'Trên vòi',
    navGetTickets: 'Mua vé',
    navMenu: 'Menu',
    tapsPrev: 'Bia trước',
    tapsNext: 'Bia tiếp theo',
    lineupSub: 'Công bố dần khi từng mẻ được chốt. Hãy ghé lại nhé.',
    confirmed: 'Đã xác nhận',
    coming: 'Đang nấu',
    tbd: 'Bia sẽ công bố sau',
    justAdded: 'Mới thêm',
    kicked: 'Hết keg',
    comingSoon: 'Collab tiếp theo sắp ra mắt',
    beers: 'loại bia', breweries: 'nhà máy bia',
    priceTitle: 'Vé',
    step1: 'Vào cửa',
    step2: 'Rồi mua token để uống',
    priceDoor: '100k',
    priceDoorText: 'Ai cũng trả một lần. Miễn phí với vé hội nghị BrewAsia. Bia mua riêng, xem bên dưới.',
    priceDoorKicker: 'Vào cửa',
    packTitle: 'Gói nếm thử collab',
    pack1: '200k',
    pack1Text: '4 token',
    pack2: '500k',
    pack2Text: 'Mua 10, tặng 2',
    packNote: '1 token = 1 ly bia collab bất kỳ, không phân biệt nồng độ. Lần mua token đầu tiên được tặng ly lưu niệm. Hết token? Mua thêm với giá như cũ suốt đêm.',
    howTitle: 'Đêm hội diễn ra thế nào',
    how1Title: 'Vòi collab',
    how1: 'Keg collab lên dàn vòi của BigBamBoo, phục vụ cả đêm tới khi hết.',
    how2Title: 'Quầy BZZD & BBQ',
    how2: 'Quầy collab BZZD phục vụ song song dàn vòi, cùng BBQ collab từ Việt Thích Barbecue và đầu bếp khách mời từ Ấn Độ. DJ tới giờ đóng cửa.',
    how3Title: 'Hóa trang',
    how3: 'Halloween mà. Hãy hóa trang. Những bộ đẹp nhất sẽ được ưu ái.',
    ctaTitle: 'Bạn đang nấu bia cho Fest?',
    ctaText: 'Nhà máy bia: liên hệ với chúng tôi để biết thêm thông tin.',
    cta: 'Liên hệ',
    partnersLabel: 'Đồng tổ chức',
    partners: 'BrewAsia × CraftCon Saigon × BigBamBoo',
  },
}

const K = (lang: Lang, name: string) => `fest_${name}_${lang}`
// Tap card colours rotate A B C by position, never by brewery.
const TONES = ['a', 'b', 'c'] as const

// A torn paper edge, as if the band above were ripped off. `fill` is the colour of the
// band the tear belongs to.
function Tear({ fill, flip }: { fill: string; flip?: boolean }) {
  return (
    <svg className="fest-tear" viewBox="0 0 1200 40" preserveAspectRatio="none" aria-hidden="true"
      style={flip ? { transform: 'scaleY(-1)' } : undefined}>
      <path fill={fill} d="M0 40V20c34-7 62-2 92 4s58 9 88 2 56-14 86-11 54 13 84 15 58-6 88-10 58-3 88 3 58 13 88 11 56-11 86-14 56 4 86 10 60 8 92 1v9Z" />
    </svg>
  )
}

// A palm silhouette, straight out of the poster's skyline.
/* The poster's own palms and bats, dropped in behind the content as shadows -
   flattened to ink and kept faint, so they read as wallpaper, not decoration. */
function Shadows({ bats = false }: { bats?: boolean }) {
  return (
    <div className="fest-shadows" aria-hidden="true">
      <img className="fest-shadow fest-shadow--left" src="/images/palms-left.png" alt="" loading="lazy" />
      <img className="fest-shadow fest-shadow--right" src="/images/palms-right.png" alt="" loading="lazy" />
      {bats && <>
        <img className="fest-shadow fest-shadow--bat1" src="/images/bat1.png" alt="" loading="lazy" />
        <img className="fest-shadow fest-shadow--bat2" src="/images/bat2.png" alt="" loading="lazy" />
      </>}
    </div>
  )
}




const pad2 = (n: number) => String(n).padStart(2, '0')

/* The tap list: one continuous carousel. Phones get native scroll-snap with the next
   card peeking in; desktop shows three with arrows either side. Progress is a count,
   "03 / 25" — the last card fully in view — never dots. Arrow keys, Home and End move
   focus card to card and scroll it into view; only the current card is in the tab order. */
function TapCarousel({ label, prev, next, children }: { label: string; prev: string; next: string; children: ReactNode }) {
  const slides = Children.toArray(children)
  const total = slides.length
  const track = useRef<HTMLDivElement | null>(null)
  const [active, setActive] = useState(0)
  const [seen, setSeen] = useState(Math.min(1, total))
  const [atStart, setAtStart] = useState(true)
  const [atEnd, setAtEnd] = useState(false)

  const measure = useCallback(() => {
    const el = track.current
    if (!el) return
    const edge = el.getBoundingClientRect().right - (parseFloat(getComputedStyle(el).paddingRight) || 0)
    let last = 0
    Array.from(el.children).forEach((c, i) => { if (c.getBoundingClientRect().right <= edge + 2) last = i + 1 })
    setSeen(Math.max(Math.min(1, total), last))
    setAtStart(el.scrollLeft <= 2)
    setAtEnd(el.scrollLeft + el.clientWidth >= el.scrollWidth - 2)
  }, [total])

  useEffect(() => {
    const el = track.current
    if (!el) return
    let raf = 0
    const onChange = () => { cancelAnimationFrame(raf); raf = requestAnimationFrame(measure) }
    measure()
    el.addEventListener('scroll', onChange, { passive: true })
    window.addEventListener('resize', onChange)
    return () => { cancelAnimationFrame(raf); el.removeEventListener('scroll', onChange); window.removeEventListener('resize', onChange) }
  }, [measure])

  const behavior = (): ScrollBehavior =>
    window.matchMedia('(prefers-reduced-motion: reduce)').matches ? 'auto' : 'smooth'

  // Arrow buttons: one card along.
  function step(dir: 1 | -1) {
    const el = track.current
    const first = el?.firstElementChild as HTMLElement | null
    if (!el || !first) return
    const gap = parseFloat(getComputedStyle(el).columnGap) || 0
    el.scrollBy({ left: dir * (first.offsetWidth + gap), behavior: behavior() })
  }

  // Focus a card and scroll the track just far enough to show it. Scrolls the track
  // itself: scrollIntoView would also shove the page sideways, since .fest clips overflow.
  function go(i: number) {
    const el = track.current
    const n = Math.max(0, Math.min(total - 1, i))
    const slide = el?.children[n] as HTMLElement | undefined
    if (!el || !slide) return
    setActive(n)
    slide.focus({ preventScroll: true })
    const cs = getComputedStyle(el)
    const padL = parseFloat(cs.paddingLeft) || 0
    const padR = parseFloat(cs.paddingRight) || 0
    const start = slide.offsetLeft - padL
    const end = slide.offsetLeft + slide.offsetWidth + padR - el.clientWidth
    const left = start < el.scrollLeft ? start : end > el.scrollLeft ? end : null
    if (left != null) el.scrollTo({ left, behavior: behavior() })
  }

  function onKey(e: React.KeyboardEvent) {
    const to = e.key === 'ArrowRight' ? active + 1 : e.key === 'ArrowLeft' ? active - 1
      : e.key === 'Home' ? 0 : e.key === 'End' ? total - 1 : null
    if (to == null) return
    e.preventDefault()
    go(to)
  }

  return (
    <div className="fest-taps" role="region" aria-roledescription="carousel" aria-label={label}>
      <button type="button" className="fest-taps__arrow" data-dir="prev" aria-label={prev} disabled={atStart} onClick={() => step(-1)}>
        <svg viewBox="0 0 24 24" width="22" height="22" aria-hidden="true"><path fill="currentColor" d="M15.5 4 7.5 12l8 8 2-2-6-6 6-6Z" /></svg>
      </button>
      <div className="fest-track" ref={track} onKeyDown={onKey}>
        {slides.map((slide, i) => (
          <div key={i} className="fest-slide" role="group" aria-roledescription="slide" aria-label={`${pad2(i + 1)} / ${pad2(total)}`}
            tabIndex={i === active ? 0 : -1} onFocus={() => setActive(i)}>
            {slide}
          </div>
        ))}
      </div>
      <button type="button" className="fest-taps__arrow" data-dir="next" aria-label={next} disabled={atEnd} onClick={() => step(1)}>
        <svg viewBox="0 0 24 24" width="22" height="22" aria-hidden="true"><path fill="currentColor" d="M8.5 4 6.5 6l6 6-6 6 2 2 8-8Z" /></svg>
      </button>
      <div className="fest-taps__count" aria-hidden="true">{pad2(seen)} / {pad2(total)}</div>
    </div>
  )
}

const BAT = 'M20 30c6-10 10-4 14-10 3 6 6 2 10 10-6-2-8 4-10 6-2-2-4-8-14-6Z'

/* Shadow bats. Six of them, each on its own path and its own clock, so they
   drift across the band rather than sitting in the corner as decoration. */
function Bats() {
  return (
    <div className="fest-bats" aria-hidden="true">
      {[0, 1, 2, 3, 4, 5].map(i => (
        <svg key={i} className="fest-bat" data-i={i} viewBox="0 0 64 36">
          <path fill="currentColor" d={BAT} />
        </svg>
      ))}
    </div>
  )
}

export default function FestPage({ beers, settings, live }: { beers: FestBeer[]; settings: FestSettings; live?: FestLive }) {
  const [lang, setLang] = useState<Lang>('en')
  const [now, setNow] = useState<number | null>(null)
  // The rise replays every time the poster scrolls back into view, so coming
  // back to the top of the page shows it again rather than a settled hand.
  const heroRef = useRef<HTMLElement | null>(null)
  const [riseKey, setRiseKey] = useState(0)
  const [menuOpen, setMenuOpen] = useState(false)
  const burgerRef = useRef<HTMLButtonElement | null>(null)
  const base = T[lang]
  const s = (name: keyof (typeof T)['en']) => (settings[K(lang, String(name))] || settings[`fest_${String(name)}`] || base[name]) as string

  useEffect(() => {
    const el = heroRef.current
    if (!el || typeof IntersectionObserver === 'undefined') return
    const io = new IntersectionObserver(
      ([e]) => { if (e.isIntersecting) setRiseKey(k => k + 1) },
      { threshold: 0.45 },
    )
    io.observe(el)
    return () => io.disconnect()
  }, [])

  useEffect(() => {
    try { const v = localStorage.getItem('brewasia_form_lang'); if (v === 'vi' || v === 'en') setLang(v) } catch { /* ignore */ }
    setNow(Date.now())
    const id = setInterval(() => setNow(Date.now()), 60000)
    return () => clearInterval(id)
  }, [])
  function pickLang(l: Lang) { setLang(l); try { localStorage.setItem('brewasia_form_lang', l) } catch { /* ignore */ } }

  // A custom poster from the dashboard replaces the whole hero: we can't know where
  // the hand belongs on someone else's artwork, so the rise only runs on our own plate.
  const customPoster = settings.fest_poster_url || ''
  const poster = customPoster || PLATE
  const ticketUrl = settings.fest_ticket_url || ''
  // One pour size for every beer, set once in the editor.
  const pourMl = settings.fest_pour_ml || '150'
  const startsAt = Date.parse(settings.fest_starts_at || '2026-10-31T16:00:00+07:00')
  const left = now && Number.isFinite(startsAt) ? Math.max(0, startsAt - now) : null
  const d = left == null ? null : Math.floor(left / 86400000)
  const h = left == null ? null : Math.floor((left % 86400000) / 3600000)
  const m = left == null ? null : Math.floor((left % 3600000) / 60000)
  const breweryCount = new Set(beers.flatMap(b => b.breweries)).size
  const fillers = beers.length < 3 ? 3 - beers.length : (3 - (beers.length % 3)) % 3

  // The typed figures ("20+", "10+") are floors: once the live count from Collabs
  // passes one, the real number shows instead.
  const floor = (typed: string, count = 0) => (count > (parseInt(typed, 10) || Infinity) ? `${count}` : typed)
  const statCollabs = floor(s('statCollabs'), live?.collabs)
  const statBreweries = floor(s('statBreweries'), live?.breweries)
  // Socials come from the same settings the homepage uses, so they're set in one place.
  const socials = [
    { label: 'Instagram', href: settings.home_instagram_url || '' },
    { label: 'Facebook', href: settings.home_facebook_url || '' },
    { label: 'Zalo', href: settings.fest_zalo_url || '' },
  ].filter(l => l.href)

  return (
    <div className="fest" data-lang={lang}>
      {/* Flat nav above the poster. Links only to sections on this page. */}
      <nav className="fest-nav" onKeyDown={e => { if (e.key === 'Escape' && menuOpen) { setMenuOpen(false); burgerRef.current?.focus() } }}>
        <span className="fest-nav__mark">BigBamBoo</span>
        <ul id="fest-nav-links" className="fest-nav__links" data-open={menuOpen}>
          <li><a href="#taps" onClick={() => setMenuOpen(false)}>{s('lineup')}</a></li>
          <li><a href="#tickets" onClick={() => setMenuOpen(false)}>{s('priceTitle')}</a></li>
          {ticketUrl && (
            <li><a className="fest-nav__cta" href={ticketUrl} target="_blank" rel="noreferrer">{s('navGetTickets')}</a></li>
          )}
        </ul>
        <div className="fest-nav__tools">
          <div role="group" aria-label="Language" style={{ display: 'flex', gap: 4 }}>
            {(['en', 'vi'] as Lang[]).map(l => (
              <button key={l} className="fest-lang" data-on={lang === l} aria-pressed={lang === l} onClick={() => pickLang(l)}>
                {l === 'en' ? 'EN' : 'VI'}
              </button>
            ))}
          </div>
          <button type="button" ref={burgerRef} className="fest-nav__burger" aria-label={s('navMenu')}
            aria-expanded={menuOpen} aria-controls="fest-nav-links" onClick={() => setMenuOpen(o => !o)}>
            <svg viewBox="0 0 24 24" width="20" height="20" aria-hidden="true">
              <path fill="currentColor" d={menuOpen ? 'm6.4 5 5.6 5.6L17.6 5 19 6.4 13.4 12l5.6 5.6-1.4 1.4-5.6-5.6L6.4 19 5 17.6l5.6-5.6L5 6.4Z' : 'M3 6h18v2.2H3Zm0 4.9h18v2.2H3Zm0 4.9h18V18H3Z'} />
            </svg>
          </button>
        </div>
      </nav>

      {/* Poster, full bleed, doing the job it was drawn for */}
      <header className="fest-hero" ref={heroRef}>
        <div className="fest-haze" aria-hidden="true">
          <span className="fest-haze__fog" data-i="0" />
          <span className="fest-haze__fog" data-i="1" />
          <span className="fest-haze__fire" />
        </div>
        <img className="fest-banner" src={poster} alt={`${s('title')} — ${s('date')}`} />
        {!customPoster && (
          <div className="fest-rise" key={riseKey} aria-hidden="true">
            <span className="fest-rise__dust" />
            <span className="fest-rise__debris" aria-hidden="true">
              {DEBRIS.map((d, i) => (
                <img key={d} className="fest-rise__chunk" data-i={i} src={d} alt="" />
              ))}
            </span>
            <img className="fest-rise__hand" src={HAND} alt="" />
            <img className="fest-rise__ground-img" src={GROUND} alt="" />
          </div>
        )}
        <h1 className="fest-sr">{s('title')}</h1>
      </header>

      {/* Rust band: when, where, how you get in */}
      <section className="fest-band fest-band--pine">
        <Shadows bats />
        <span className="fest-storm" aria-hidden="true" />
        <Bats />
        <div className="fest-inner">
          {d != null && (
            <div className="fest-countdown fest-countdown--top" aria-label={s('countdown')}>
              <div className="fest-count__label">{s('countdown')}</div>
              <div className="fest-count__row">
                {[[d, s('days')], [h, s('hours')], [m, s('mins')]].map(([n, l]) => (
                  <span key={String(l)} className="fest-count__cell">
                    <b className="fest-neon" data-text={String(n).padStart(2, '0')}>{String(n).padStart(2, '0')}</b>
                    <i>{l}</i>
                  </span>
                ))}
              </div>
            </div>
          )}

          <div className="fest-strip">
            <Tear fill="#f3e3c3" />
            <ul className="fest-stats">
              {[
                [statCollabs, s('statCollabsLabel')],
                [statBreweries, s('statBreweriesLabel')],
                [s('statDjs'), s('statDjsLabel')],
                [s('statCostumes'), s('statCostumesLabel')],
              ].map(([n, l], i) => (
                <li key={i} className="fest-stat">
                  <span className="fest-stat__n" data-long={n.length > 4}>{n}</span>
                  <span className="fest-stat__l">{l}</span>
                </li>
              ))}
            </ul>
            <Tear fill="#f3e3c3" flip />
          </div>

          <h2 className="fest-claim">
            {s('countriesTitle')} <span className="fest-claim__plus">{s('plus')}</span>
          </h2>

          <ul className="fest-draws">
            {[s('draw1'), s('draw2'), s('draw3')].map((d, i) => {
              const img = settings[`fest_draw${i + 1}_img`] || ''
              return (
                <li key={d} className="fest-draw" data-i={i}>
                  {img && <img className="fest-draw__art" src={img} alt="" loading="lazy" />}
                  <span className="fest-draw__text">{d}</span>
                </li>
              )
            })}
          </ul>



        </div>
      </section>

      {/* Dark band: the only place neon belongs */}
      <div className="fest-seam"><Tear fill="#14100c" /></div>
      <section id="tickets" className="fest-band fest-band--dark">
        <div className="fest-inner">

          <h2 className="fest-h2 fest-h2--glow">{s('priceTitle')}</h2>
          <p className="fest-ticket__note">{ticketUrl ? s('ticketsOnline') : s('soon')}</p>
          {ticketUrl && (
            <a className="fest-btn" href={ticketUrl} target="_blank" rel="noreferrer">{s('tickets')}</a>
          )}
          {/* Two steps, not three choices: everyone pays to get in, then buys
              tokens to drink. Laid out so that reads at a glance. */}
          <div className="fest-step">
            <span className="fest-step__n">1</span>
            <h3 className="fest-step__title">{s('step1')}</h3>
          </div>
          <div className="fest-money fest-money--one">
            <div className="fest-price" data-door="true">
              <div className="fest-price__kicker">{s('priceDoorKicker')}</div>
              <div className="fest-price__amount">{s('priceDoor')}</div>
              <div className="fest-price__text">{s('priceDoorText')}</div>
            </div>
          </div>

          <div className="fest-step">
            <span className="fest-step__n">2</span>
            <h3 className="fest-step__title">{s('step2')}</h3>
          </div>
          <div className="fest-money fest-money--two">
            {[[s('pack1'), s('pack1Text')], [s('pack2'), s('pack2Text')]].map(([amt, txt]) => (
              <div key={amt} className="fest-price">
                <div className="fest-price__kicker">{s('packTitle')}</div>
                <div className="fest-price__amount">{amt}</div>
                <div className="fest-price__text">{txt}</div>
              </div>
            ))}
          </div>
          <p className="fest-note">{s('packNote')}</p>
        </div>
      </section>

      {/* Cream band: the beer */}
      <div className="fest-seam"><Tear fill="#f3e3c3" /></div>
      <section id="taps" className="fest-band fest-band--cream">
        <Shadows />
        <div className="fest-inner">
          <div className="fest-head">
            <h2 className="fest-h2">{s('lineup')}</h2>
            {beers.length > 0 && <span className="fest-tally">{beers.length} {s('beers')} · {breweryCount} {s('breweries')}</span>}
          </div>
          <p className="fest-sub">{s('lineupSub')}</p>

          <TapCarousel label={s('lineup')} prev={s('tapsPrev')} next={s('tapsNext')}>
            {[...beers.map((b, i) => {
              const state = b.kicked ? 'kicked' : b.just_added ? 'just_added' : 'announced'
              return (
                <article key={b.code} className="fest-card" data-state={state} data-tone={TONES[i % 3]} style={{ transform: `rotate(${(i % 3) - 1}deg)` }}>
                  {state === 'just_added' && <span className="fest-card__badge">{s('justAdded')}</span>}
                  {state === 'kicked' && <span className="fest-card__stamp">{s('kicked')}</span>}
                  <div className="fest-card__top">{s('oneNight')}</div>
                  <div className="fest-card__bill">
                    {b.breweries.length
                      ? b.breweries.map((n, j) => (
                        <Fragment key={n + j}>
                          {j > 0 && <div className="fest-card__vs">{s('versus')}</div>}
                          <div className="fest-card__brewery">
                            {/* Served in an <img>, never inlined — an uploaded SVG can
                                carry script, and this is what makes that inert. */}
                            {b.logos?.[j] ? <img className="fest-card__logo" src={b.logos[j]} alt="" loading="lazy" /> : null}
                            <span>{n}</span>
                            {b.places?.[j] && <span className="fest-card__place">{b.places[j]}</span>}
                          </div>
                        </Fragment>
                      ))
                      : <div className="fest-card__brewery">—</div>}
                  </div>
                  <div className="fest-card__band">
                    <div className="fest-card__beer">{b.beer_name || s('tbd')}</div>
                    {b.beer_style && <div className="fest-card__style">{b.beer_style}</div>}
                  </div>
                  <div className="fest-card__stats">
                    <div><b>{b.abv != null ? b.abv : '—'}</b><span>{s('abv')}</span></div>
                    {b.ibu != null && <div><b>{b.ibu}</b><span>IBU</span></div>}
                    <div className="fest-card__pour"><b>{pourMl}</b><span>{s('pourLabel')}</span></div>
                    <div><b>{b.kegs != null ? b.kegs : '—'}</b><span>{s('kegs')}</span></div>
                  </div>
                </article>
              )
            }),
            // Coming soon: filler, not a database row. Tops the list up to a full row of three.
            ...Array.from({ length: fillers }, (_, k) => {
              const i = beers.length + k
              return (
                <article key={`soon-${k}`} className="fest-card fest-card--ghost" data-state="coming_soon" data-tone={TONES[i % 3]} style={{ transform: `rotate(${(i % 3) - 1}deg)` }}>
                  <div className="fest-card__top">{s('oneNight')}</div>
                  <div className="fest-card__bill">
                    <div className="fest-card__brewery">BigBamBoo</div>
                    <div className="fest-card__vs">{s('versus')}</div>
                    <div className="fest-card__brewery">? ? ?</div>
                  </div>
                  <div className="fest-card__band">
                    <div className="fest-card__beer">{s('comingSoon')}</div>
                  </div>
                  <div className="fest-card__stats">
                    <div><b>?</b><span>{s('abv')}</span></div>
                    <div className="fest-card__pour"><b>{pourMl}</b><span>{s('pourLabel')}</span></div>
                    <div><b>?</b><span>{s('kegs')}</span></div>
                  </div>
                </article>
              )
            })]}
          </TapCarousel>
        </div>
      </section>

      {/* Teal band: BigBamBoo's own colour, for how the night runs */}
      <div className="fest-seam"><Tear fill="#b8391a" /></div>
      <section className="fest-band fest-band--rust">
        <Shadows />
        <div className="fest-inner">
          <h2 className="fest-h2">{s('howTitle')}</h2>
          <div className="fest-how">
            {[['how1Title', 'how1'], ['how2Title', 'how2'], ['how3Title', 'how3']].map(([tk, bk], i) => (
              <div key={tk} className="fest-how__item">
                <span className="fest-how__n" aria-hidden>{String(i + 1).padStart(2, '0')}</span>
                <div className="fest-how__title">{s(tk as keyof (typeof T)['en'])}</div>
                <p className="fest-how__text">{s(bk as keyof (typeof T)['en'])}</p>
              </div>
            ))}
          </div>

          <div className="fest-cta">
            <div>
              <div className="fest-cta__title">{s('ctaTitle')}</div>
              <p className="fest-cta__text">{s('ctaText')}</p>
            </div>
            <a className="fest-btn fest-btn--ember" href={settings.fest_contact_url || CONTACT_FALLBACK} target="_blank" rel="noreferrer">{s('cta')}</a>
          </div>
        </div>
      </section>

      <div className="fest-seam"><Tear fill="#14100c" /></div>
      <footer className="fest-band fest-band--dark fest-footband">
        <div className="fest-inner">
          <div className="fest-partners__label">{s('partnersLabel')}</div>
          <div className="fest-partners__names">{s('partners')}</div>

          {socials.length > 0 && (
            <div className="fest-socials">
              {socials.map(l => <a key={l.label} className="fest-social" href={l.href} target="_blank" rel="noreferrer">{l.label}</a>)}
            </div>
          )}

          <div className="fest-foot">
            <div className="fest-foot__addr"><b>{s('venue')}</b><br />{s('address')}</div>
            <a className="fest-mapbtn fest-mapbtn--dark" href={MAPS} target="_blank" rel="noreferrer">
              <svg viewBox="0 0 24 24" width="17" height="17" aria-hidden="true"><path fill="currentColor" d="M12 2a7 7 0 0 0-7 7c0 5.25 7 13 7 13s7-7.75 7-13a7 7 0 0 0-7-7Zm0 9.5A2.5 2.5 0 1 1 12 6.5a2.5 2.5 0 0 1 0 5Z" /></svg>
              {s('map')}
            </a>
          </div>
          <div className="fest-copy">BigBamBoo · bigbamboo.app</div>
        </div>
      </footer>
    </div>
  )
}

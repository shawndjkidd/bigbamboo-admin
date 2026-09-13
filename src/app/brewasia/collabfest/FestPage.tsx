'use client'
import { useEffect, useState, Fragment } from 'react'

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
  confirmed: boolean
  own_setup: boolean
}
export type FestSettings = Record<string, string>
// Counted live from the Collabs page.
export type FestLive = { collabs: number; countries: number; countryList: string }
type Lang = 'en' | 'vi'

const MAPS = 'https://www.google.com/maps/search/BigBamBoo+10+An+Ph%C3%BA%2C+An+Kh%C3%A1nh%2C+Ho+Chi+Minh+City'
const CONTACT_FALLBACK = 'https://wa.me/84347393293'
const BANNER = '/collabfest-banner.jpg'
// The poster split in two: the plate with the hand removed, and the hand itself,
// so the skeleton can break out of the ground in front of the moon.
const PLATE = '/images/collabfest-plate.jpg'
const HAND = '/images/hand-beer.png'

const T = {
  en: {
    eyebrow: 'BrewAsia × CraftCon Saigon × BigBamBoo',
    title: 'Halloween Collab Fest',
    date: 'Saturday 31 October 2026',
    time: '4pm – midnight',
    venue: 'BigBamBoo',
    address: '10 An Phú, An Khánh, Ho Chi Minh City',
    map: 'Open in Maps',
    blurb: 'One night, one bar, and a wall of collaboration beers brewed for BrewAsia 2026. Breweries from Vietnam, Korea, India, China and the Philippines pour side by side: collab kegs on the BigBamBoo taps, the BZZD collab bar, a BBQ collab with Việt Thích Barbecue and a guest pitmaster from India, DJs until close. Come in costume.',
    tickets: 'Tickets at the door',
    soonStamp: 'Coming soon',
    soon: 'Pay at the door on the night. Online sales coming soon — this page will carry them.',
    ticketsOnline: 'Buy online, or pay at the door on the night.',
    countdown: 'Until the first pour',
    days: 'days', hours: 'hours', mins: 'min',
    statCollabs: '20+',
    statCollabsLabel: 'collab beers',
    statCountries: '10',
    statCountriesLabel: 'countries',
    statHours: '8',
    statHoursLabel: 'hours',
    countriesTitle: 'Collabs from across Asia and beyond',
    plus: 'Plus…',
    oneNight: 'One night only · 31 Oct',
    versus: 'versus',
    abv: 'ABV',
    kegs: 'Kegs',
    countries: 'Vietnam · Japan · China · Singapore · Korea · India · Philippines · Australia · UK',
    draw1: 'Full roasted pig BBQ collab',
    draw2: 'The BZZD collab cocktail bar',
    draw3: 'Live music & DJs',
    lineup: 'On the taps',
    lineupSub: 'Announced one by one as they’re locked in. Keep checking back.',
    confirmed: 'Confirmed',
    coming: 'Brewing',
    tbd: 'Beer to be announced',
    empty: 'The tap list drops soon. Collabs are in the tank right now.',
    beers: 'beers', breweries: 'breweries',
    priceTitle: 'Tickets',
    priceDoor: '100k',
    priceDoorText: 'Free with a BrewAsia conference pass',
    priceDoorKicker: 'Entry',
    packTitle: 'Collab tasting packs',
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
    blurb: 'Một đêm, một quán bar, và cả một dàn bia collab nấu riêng cho BrewAsia 2026. Các nhà máy bia từ Việt Nam, Hàn Quốc, Ấn Độ, Trung Quốc và Philippines cùng góp mặt: keg collab trên dàn vòi BigBamBoo, quầy collab BZZD, BBQ collab cùng Việt Thích Barbecue và đầu bếp BBQ khách mời từ Ấn Độ, DJ tới giờ đóng cửa. Hãy tới trong trang phục hoá trang.',
    tickets: 'Mua vé tại cửa',
    soonStamp: 'Sắp mở bán',
    soon: 'Thanh toán tại cửa trong đêm diễn. Vé online sẽ sớm mở bán ngay trên trang này.',
    ticketsOnline: 'Mua vé online, hoặc thanh toán tại cửa trong đêm diễn.',
    countdown: 'Đếm ngược tới ly đầu tiên',
    days: 'ngày', hours: 'giờ', mins: 'phút',
    statCollabs: '20+',
    statCollabsLabel: 'bia collab',
    statCountries: '10',
    statCountriesLabel: 'quốc gia',
    statHours: '8',
    statHoursLabel: 'giờ',
    countriesTitle: 'Bia collab từ khắp châu Á và xa hơn',
    plus: 'Và còn…',
    oneNight: 'Chỉ một đêm · 31/10',
    versus: 'đối đầu',
    abv: 'Nồng độ',
    kegs: 'Keg',
    countries: 'Việt Nam · Nhật Bản · Trung Quốc · Singapore · Hàn Quốc · Ấn Độ · Philippines · Úc · Anh',
    draw1: 'Collab heo quay nguyên con',
    draw2: 'Quầy cocktail collab BZZD',
    draw3: 'Nhạc sống & DJ',
    lineup: 'Trên vòi',
    lineupSub: 'Công bố dần khi từng mẻ được chốt. Hãy ghé lại nhé.',
    confirmed: 'Đã xác nhận',
    coming: 'Đang nấu',
    tbd: 'Bia sẽ công bố sau',
    empty: 'Danh sách vòi sẽ sớm công bố. Các mẻ collab đang trong tank.',
    beers: 'loại bia', breweries: 'nhà máy bia',
    priceTitle: 'Vé',
    priceDoor: '100k',
    priceDoorText: 'Miễn phí với vé hội nghị BrewAsia',
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
    how3Title: 'Hoá trang',
    how3: 'Halloween mà. Hãy hoá trang. Những bộ đẹp nhất sẽ được ưu ái.',
    ctaTitle: 'Bạn đang nấu bia cho Fest?',
    ctaText: 'Nhà máy bia: liên hệ với chúng tôi để biết thêm thông tin.',
    cta: 'Liên hệ',
    partnersLabel: 'Đồng tổ chức',
    partners: 'BrewAsia × CraftCon Saigon × BigBamBoo',
  },
}

const K = (lang: Lang, name: string) => `fest_${name}_${lang}`

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
function Palms({ side }: { side: 'left' | 'right' }) {
  return (
    <svg className={`fest-palms fest-palms--${side}`} viewBox="0 0 120 150" aria-hidden="true">
      <path fill="currentColor" d="M57 150c1-38 3-63 6-84l6 1c-4 21-6 46-7 83Z" />
      <path fill="currentColor" d="M63 62c-11-11-25-16-40-14 12-7 29-5 41 4-7-13-20-21-35-23 15-5 32 2 41 15-1-15-9-28-22-36 17 2 29 16 30 33 7-13 21-21 37-21-13 6-23 17-26 31 12-8 27-10 41-4-16-1-31 6-40 18Z" />
    </svg>
  )
}

function Moon() {
  return <div className="fest-moon" aria-hidden="true" />
}

function Web({ side }: { side: 'left' | 'right' }) {
  return (
    <svg className={`fest-web fest-web--${side}`} viewBox="0 0 120 120" aria-hidden="true">
      <g fill="none" stroke="currentColor" strokeWidth="1.6">
        <path d="M0 0 120 120M0 0 0 120M0 0 120 0M0 0 60 120M0 0 120 60M0 0 30 120M0 0 120 30" />
        <path d="M22 0a22 22 0 0 1-22 22M44 0a44 44 0 0 1-44 44M70 0a70 70 0 0 1-70 70M98 0a98 98 0 0 1-98 98" />
      </g>
    </svg>
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
  const base = T[lang]
  const s = (name: keyof (typeof T)['en']) => (settings[K(lang, String(name))] || settings[`fest_${String(name)}`] || base[name]) as string

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
  const startsAt = Date.parse(settings.fest_starts_at || '2026-10-31T16:00:00+07:00')
  const left = now && Number.isFinite(startsAt) ? Math.max(0, startsAt - now) : null
  const d = left == null ? null : Math.floor(left / 86400000)
  const h = left == null ? null : Math.floor((left % 86400000) / 3600000)
  const m = left == null ? null : Math.floor((left % 3600000) / 60000)
  const breweryCount = new Set(beers.flatMap(b => b.breweries)).size

  // Admin wording wins; then the live count from Collabs; then the default above.
  const statCollabs = settings[K(lang, 'statCollabs')] || (live && live.collabs > 1 ? `${live.collabs}` : base.statCollabs)
  const statCountries = settings[K(lang, 'statCountries')] || (live && live.countries > 1 ? `${live.countries}` : base.statCountries)
  // Socials come from the same settings the homepage uses, so they're set in one place.
  const socials = [
    { label: 'Instagram', href: settings.home_instagram_url || '' },
    { label: 'Facebook', href: settings.home_facebook_url || '' },
    { label: 'Zalo', href: settings.fest_zalo_url || '' },
  ].filter(l => l.href)

  return (
    <div className="fest" data-lang={lang}>
      {/* Poster, full bleed, doing the job it was drawn for */}
      <header className="fest-hero">
        <div className="fest-haze" aria-hidden="true">
          <span className="fest-haze__fog" data-i="0" />
          <span className="fest-haze__fog" data-i="1" />
          <span className="fest-haze__fire" />
          <span className="fest-haze__sweep" />
        </div>
        <div className="fest-topbar">
          <span className="fest-mark">BigBamBoo</span>
          <div role="group" aria-label="Language" style={{ display: 'flex', gap: 4 }}>
            {(['en', 'vi'] as Lang[]).map(l => (
              <button key={l} className="fest-lang" data-on={lang === l} aria-pressed={lang === l} onClick={() => pickLang(l)}>
                {l === 'en' ? 'EN' : 'VI'}
              </button>
            ))}
          </div>
        </div>
        <img className="fest-banner" src={poster} alt={`${s('title')} — ${s('date')}`} />
        {!customPoster && (
          <div className="fest-rise" aria-hidden="true">
            <span className="fest-rise__dust" />
            <svg className="fest-rise__ground" viewBox="0 0 300 90" preserveAspectRatio="none">
              <path className="fest-rise__mound" d="M6 90c18-26 34-14 46-34 9-15 20-22 33-22 10 0 17 5 24 13 8 9 15 6 24-4 11-12 22-10 32 4 9 13 19 16 30 8 12-9 24-4 34 12 8 13 20 14 33 23H6Z" />
              <g className="fest-rise__shards">
                <path d="M92 56l-16-22 5 26z" data-s="0" />
                <path d="M128 40l-9-26-8 25z" data-s="1" />
                <path d="M170 38l12-24 3 25z" data-s="2" />
                <path d="M206 52l19-19-4 25z" data-s="3" />
                <path d="M74 66l-22-12 14 20z" data-s="4" />
                <path d="M228 68l23-9-13 19z" data-s="5" />
              </g>
            </svg>
            <img className="fest-rise__hand" src={HAND} alt="" />
          </div>
        )}
        <h1 className="fest-sr">{s('title')}</h1>
      </header>

      {/* Rust band: when, where, how you get in */}
      <section className="fest-band fest-band--pine">
        <Moon />
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

          <div className="fest-stats">
            {[[statCollabs, s('statCollabsLabel')], [statCountries, s('statCountriesLabel')], [s('statHours'), s('statHoursLabel')]].map(([n, l]) => (
              <div key={l} className="fest-stat">
                <span className="fest-stat__n">{n}</span>
                <span className="fest-stat__l">{l}</span>
              </div>
            ))}
          </div>

          <h2 className="fest-claim">{s('countriesTitle')}</h2>

          <div className="fest-plus" aria-hidden="true"><span>{s('plus')}</span></div>

          <ul className="fest-draws">
            {[s('draw1'), s('draw2'), s('draw3')].map(d => (
              <li key={d} className="fest-draw">{d}</li>
            ))}
          </ul>

          <p className="fest-blurb">{s('blurb')}</p>


        </div>
      </section>

      {/* Dark band: the only place neon belongs */}
      <div className="fest-seam"><Tear fill="#14100c" /></div>
      <section className="fest-band fest-band--dark">
        <div className="fest-inner">

          <h2 className="fest-h2 fest-h2--glow">{s('priceTitle')}</h2>
          <p className="fest-ticket__note">{ticketUrl ? s('ticketsOnline') : s('soon')}</p>
          {ticketUrl && (
            <a className="fest-btn" href={ticketUrl} target="_blank" rel="noreferrer">{s('tickets')}</a>
          )}
          <div className="fest-money">
            <div className="fest-price" data-door="true">
              <div className="fest-price__kicker">{s('priceDoorKicker')}</div>
              <div className="fest-price__amount">{s('priceDoor')}</div>
              <div className="fest-price__text">{s('priceDoorText')}</div>
            </div>
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
      <section className="fest-band fest-band--cream">
        <Web side="left" />
        <Web side="right" />
        <div className="fest-inner">
          <div className="fest-head">
            <h2 className="fest-h2">{s('lineup')}</h2>
            {beers.length > 0 && <span className="fest-tally">{beers.length} {s('beers')} · {breweryCount} {s('breweries')}</span>}
          </div>
          <p className="fest-sub">{s('lineupSub')}</p>

          {beers.length === 0 ? (
            <div className="fest-grid fest-grid--ghost" aria-label={s('empty')}>
              {[0, 1, 2].map(i => (
                <article key={i} className="fest-card fest-card--ghost" style={{ transform: `rotate(${i - 1}deg)` }}>
                  <div className="fest-card__top">{s('oneNight')}</div>
                  <div className="fest-card__bill">
                    <div className="fest-card__brewery">BigBamBoo</div>
                    <div className="fest-card__vs">{s('versus')}</div>
                    <div className="fest-card__brewery">? ? ?</div>
                  </div>
                  <div className="fest-card__band">
                    <div className="fest-card__beer">{s('tbd')}</div>
                    <div className="fest-card__style">{s('empty')}</div>
                  </div>
                  <div className="fest-card__stats">
                    <div><b>?</b><span>{s('abv')}</span></div>
                    <div><b>?</b><span>{s('kegs')}</span></div>
                  </div>
                </article>
              ))}
            </div>
          ) : (
            <div className="fest-grid">
              {beers.map((b, i) => (
                <article key={b.code} className="fest-card" data-confirmed={b.confirmed} style={{ transform: `rotate(${(i % 3) - 1}deg)` }}>
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
                    <div><b>{b.kegs != null ? b.kegs : '—'}</b><span>{s('kegs')}</span></div>
                  </div>
                </article>
              ))}
            </div>
          )}
        </div>
      </section>

      {/* Teal band: BigBamBoo's own colour, for how the night runs */}
      <div className="fest-seam"><Tear fill="#b8391a" /></div>
      <section className="fest-band fest-band--rust">
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

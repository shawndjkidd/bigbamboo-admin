'use client'
import { useEffect, useState } from 'react'

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
  confirmed: boolean
  own_setup: boolean
}
export type FestSettings = Record<string, string>
type Lang = 'en' | 'vi'

const MAPS = 'https://www.google.com/maps/search/BigBamBoo+An+Ph%C3%BA+Th%E1%BB%A7+%C4%90%E1%BB%A9c'
const CONTACT_FALLBACK = 'https://wa.me/84347393293'
const BANNER = '/collabfest-banner.jpg'

const T = {
  en: {
    eyebrow: 'BrewAsia × CraftCon Saigon × BigBamBoo',
    title: 'Halloween Collab Fest',
    date: 'Saturday 31 October 2026',
    time: '4pm – midnight',
    venue: 'BigBamBoo',
    address: '10 An Phú, An Khánh, Thủ Đức (District 2), Ho Chi Minh City',
    map: 'Open in Maps',
    blurb: 'One night, one bar, and a wall of collaboration beers brewed for BrewAsia 2026. Breweries from Vietnam, Korea, India, China and the Philippines pour side by side: collab kegs on the BigBamBoo taps, the BZZD collab bar, a BBQ collab with Việt Thích Barbecue and a guest pitmaster from India, DJs until close. Come in costume.',
    entry: 'BrewAsia conference pass = free entry, free tasting glass, free tokens.',
    tickets: 'Get tickets',
    soonStamp: 'Coming soon',
    soon: 'Online tickets land on this page soon. Until then, pay at the door.',
    countdown: 'Until the first pour',
    days: 'days', hours: 'hours', mins: 'min',
    lineup: 'On the taps',
    lineupSub: 'Announced one by one as they’re locked in. Keep checking back.',
    confirmed: 'Confirmed',
    coming: 'Brewing',
    tbd: 'Beer to be announced',
    empty: 'The tap list drops soon. Collabs are in the tank right now.',
    beers: 'beers', breweries: 'breweries',
    priceTitle: 'At the door',
    priceDoor: '100k',
    priceDoorText: 'Entry on the night · Free with a BrewAsia conference pass',
    packTitle: 'Collab tasting packs',
    pack1: '200k',
    pack1Text: '4 tokens + a festival glass',
    pack2: '500k',
    pack2Text: '10 tokens + 2 free + a festival glass',
    packNote: 'One token = one pour of any collab beer, whatever the strength. Out of tokens? Top up at the same price all night.',
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
    address: '10 An Phú, An Khánh, Thủ Đức (Quận 2 cũ), TP. Hồ Chí Minh',
    map: 'Mở bản đồ',
    blurb: 'Một đêm, một quán bar, và cả một dàn bia collab nấu riêng cho BrewAsia 2026. Các nhà máy bia từ Việt Nam, Hàn Quốc, Ấn Độ, Trung Quốc và Philippines cùng góp mặt: keg collab trên dàn vòi BigBamBoo, quầy collab BZZD, BBQ collab cùng Việt Thích Barbecue và đầu bếp BBQ khách mời từ Ấn Độ, DJ tới giờ đóng cửa. Hãy tới trong trang phục hoá trang.',
    entry: 'Vé hội nghị BrewAsia = vào cửa miễn phí, ly nếm thử miễn phí, token miễn phí.',
    tickets: 'Mua vé',
    soonStamp: 'Sắp mở bán',
    soon: 'Vé online sẽ sớm có ngay trên trang này. Trong lúc đó, bạn thanh toán tại cửa.',
    countdown: 'Đếm ngược tới ly đầu tiên',
    days: 'ngày', hours: 'giờ', mins: 'phút',
    lineup: 'Trên vòi',
    lineupSub: 'Công bố dần khi từng mẻ được chốt. Hãy ghé lại nhé.',
    confirmed: 'Đã xác nhận',
    coming: 'Đang nấu',
    tbd: 'Bia sẽ công bố sau',
    empty: 'Danh sách vòi sẽ sớm công bố. Các mẻ collab đang trong tank.',
    beers: 'loại bia', breweries: 'nhà máy bia',
    priceTitle: 'Tại cửa',
    priceDoor: '100k',
    priceDoorText: 'Vé vào cửa trong đêm hội · Miễn phí với vé hội nghị BrewAsia',
    packTitle: 'Gói nếm thử collab',
    pack1: '200k',
    pack1Text: '4 token + 1 ly lưu niệm',
    pack2: '500k',
    pack2Text: '10 token + tặng 2 token + 1 ly lưu niệm',
    packNote: '1 token = 1 ly bia collab bất kỳ, không phân biệt nồng độ. Hết token? Mua thêm với giá như cũ suốt đêm.',
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
    <svg className="fest-tear" viewBox="0 0 1200 42" preserveAspectRatio="none" aria-hidden="true"
      style={flip ? { transform: 'scaleY(-1)' } : undefined}>
      <path fill={fill} d="M0 42V14l38 6 41-11 36 13 45-9 39 12 47-14 36 9 42-7 44 13 38-12 46 10 40-13 43 8 39-6 45 12 37-11 44 9 41-13 38 11 45-8 39 10 42-12 36 9 43-6 40 11 38-9 44 8V42Z" />
    </svg>
  )
}

function Bats() {
  return (
    <svg className="fest-bats" viewBox="0 0 220 60" aria-hidden="true">
      <path fill="currentColor" d="M20 30c6-10 10-4 14-10 3 6 6 2 10 10-6-2-8 4-10 6-2-2-4-8-14-6Z" />
      <path fill="currentColor" d="M96 16c7-12 12-5 17-12 4 7 7 2 12 12-7-2-10 5-12 8-3-3-5-10-17-8Z" opacity=".75" />
      <path fill="currentColor" d="M164 38c5-9 9-4 12-9 3 5 5 2 9 9-5-2-7 3-9 5-2-2-3-7-12-5Z" opacity=".6" />
    </svg>
  )
}

export default function FestPage({ beers, settings }: { beers: FestBeer[]; settings: FestSettings }) {
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

  const poster = settings.fest_poster_url || BANNER
  const ticketUrl = settings.fest_ticket_url || ''
  const startsAt = Date.parse(settings.fest_starts_at || '2026-10-31T16:00:00+07:00')
  const left = now && Number.isFinite(startsAt) ? Math.max(0, startsAt - now) : null
  const d = left == null ? null : Math.floor(left / 86400000)
  const h = left == null ? null : Math.floor((left % 86400000) / 3600000)
  const m = left == null ? null : Math.floor((left % 3600000) / 60000)
  const breweryCount = new Set(beers.flatMap(b => b.breweries)).size

  return (
    <div className="fest">
      {/* Poster, full bleed, doing the job it was drawn for */}
      <header className="fest-hero">
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
        <h1 className="fest-sr">{s('title')}</h1>
      </header>

      {/* Rust band: when, where, how you get in */}
      <section className="fest-band fest-band--rust">
        <Bats />
        <div className="fest-inner">
          <div className="fest-strip">
            <span className="fest-strip__date">{s('date')}</span>
            <span className="fest-strip__time">{s('time')}</span>
          </div>

          <div className="fest-where">
            <address className="fest-venue">
              <b>{s('venue')}</b>
              <span>{s('address')}</span>
            </address>
            <a className="fest-mapbtn" href={MAPS} target="_blank" rel="noreferrer">
              <svg viewBox="0 0 24 24" width="17" height="17" aria-hidden="true"><path fill="currentColor" d="M12 2a7 7 0 0 0-7 7c0 5.25 7 13 7 13s7-7.75 7-13a7 7 0 0 0-7-7Zm0 9.5A2.5 2.5 0 1 1 12 6.5a2.5 2.5 0 0 1 0 5Z" /></svg>
              {s('map')}
            </a>
          </div>

          <p className="fest-blurb">{s('blurb')}</p>

          <div className="fest-entry">{s('entry')}</div>

          {ticketUrl
            ? <a className="fest-btn" href={ticketUrl} target="_blank" rel="noreferrer">{s('tickets')}</a>
            : (
              <div className="fest-ticket">
                <span className="fest-ticket__label">{s('tickets')}</span>
                <span className="fest-ticket__stamp">{s('soonStamp')}</span>
                <span className="fest-ticket__note">{s('soon')}</span>
              </div>
            )}
        </div>
      </section>

      {/* Dark band: the only place neon belongs */}
      <div className="fest-seam"><Tear fill="#14100c" /></div>
      <section className="fest-band fest-band--dark">
        <div className="fest-inner">
          {d != null && (
            <div className="fest-countdown" aria-label={s('countdown')}>
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

          <h2 className="fest-h2 fest-h2--glow">{s('priceTitle')}</h2>
          <div className="fest-door">
            <span className="fest-door__amount">{s('priceDoor')}</span>
            <span className="fest-door__text">{s('priceDoorText')}</span>
          </div>
          <div className="fest-packs">
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
        <div className="fest-inner">
          <div className="fest-head">
            <h2 className="fest-h2">{s('lineup')}</h2>
            {beers.length > 0 && <span className="fest-tally">{beers.length} {s('beers')} · {breweryCount} {s('breweries')}</span>}
          </div>
          <p className="fest-sub">{s('lineupSub')}</p>

          {beers.length === 0 ? (
            <div className="fest-empty">{s('empty')}</div>
          ) : (
            <div className="fest-grid">
              {beers.map((b, i) => (
                <article key={b.code} className="fest-card" data-confirmed={b.confirmed} style={{ transform: `rotate(${(i % 3) - 1}deg)` }}>
                  <div className="fest-card__breweries">{b.breweries.join(' × ') || '—'}</div>
                  <h3 className="fest-card__beer">{b.beer_name || s('tbd')}</h3>
                  <div className="fest-card__meta">{[b.beer_style, b.abv != null ? `${b.abv}%` : null].filter(Boolean).join(' · ')}</div>
                  <div className="fest-card__foot">
                    <span className="fest-tag" data-confirmed={b.confirmed}>{b.confirmed ? s('confirmed') : s('coming')}</span>
                  </div>
                </article>
              ))}
            </div>
          )}
        </div>
      </section>

      {/* Teal band: BigBamBoo's own colour, for how the night runs */}
      <div className="fest-seam"><Tear fill="#0f3d38" /></div>
      <section className="fest-band fest-band--teal">
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
          <div className="fest-foot">
            {s('venue')} · {s('address')}
            <a className="fest-link" href={MAPS} target="_blank" rel="noreferrer">{s('map')} ↗</a>
          </div>
        </div>
      </footer>
    </div>
  )
}

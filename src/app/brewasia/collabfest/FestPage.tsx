'use client'
import { useEffect, useState } from 'react'

// Public Halloween Collab Fest page. EN / VI.
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

// Defaults. Anything set in the admin (site_settings key in brackets) wins.
const T = {
  en: {
    eyebrow: 'BrewAsia × CraftCon Saigon × BigBamBoo',
    title: 'Halloween Collab Fest',
    date: 'Saturday 31 October 2026',
    time: '4pm – midnight',
    venue: 'BigBamBoo',
    address: '10 An Phú, An Khánh, Thủ Đức (District 2), Ho Chi Minh City',
    map: 'Open in Google Maps',
    blurb: 'One night, one bar, and a wall of collaboration beers brewed for BrewAsia 2026. Breweries from Vietnam, Korea, India, China and the Philippines pour side by side: collab kegs on the BigBamBoo taps, the BZZD collab bar, a BBQ collab with Việt Thích Barbecue and a guest pitmaster from India, DJs all night. Come in costume.',
    entry: 'BrewAsia conference pass = free entry, free tasting glass, free tokens.',
    tickets: 'Get tickets',
    priceTitle: 'At the door',
    priceDoor: '100k',
    priceDoorText: 'Entry on the night · Free with a BrewAsia conference pass',
    packTitle: 'Collab tasting packs',
    pack1: '200k',
    pack1Text: '4 tokens + a festival glass',
    pack2: '500k',
    soonStamp: 'Coming soon',
    pack2Text: '12 tokens + a festival glass — two pours on us',
    packNote: 'One token = one pour of any collab beer. Out of tokens? Top up at the same price all night.',
    soon: 'Online tickets coming soon on our own site. Until then, pay at the door.',
    countries: 'Vietnam · Korea · India · China · Philippines',
    countdown: 'Until the first pour',
    partnersLabel: 'Brought to you by',
    partners: 'BrewAsia × CraftCon Saigon × BigBamBoo',
    days: 'days', hours: 'hours', mins: 'min',
    lineup: 'On the taps',
    lineupSub: 'Announced one by one as they’re locked in. Keep checking back.',
    confirmed: 'Confirmed',
    coming: 'Brewing',
    contactCta: 'Contact us',
    ownSetup: 'Pouring at their own bar',
    tbd: 'Beer to be announced',
    empty: 'The tap list drops soon. Collabs are in the tank right now.',
    beers: 'beers', breweries: 'breweries',
    howTitle: 'How the night works',
    how1Title: 'Collab taps',
    how1: 'Collab kegs go on the BigBamBoo tap wall, poured all night until they blow.',
    how2Title: 'BZZD collab bar & BBQ',
    how2: 'The BZZD collab bar pours alongside the taps, with a BBQ collab from Việt Thích Barbecue and a guest pitmaster from India. DJs until close.',
    how3Title: 'Costumes',
    how3: 'It’s Halloween. Dress for it. The best costumes get looked after.',
    ctaTitle: 'Brewing something for the Fest?',
    ctaText: 'Breweries: contact us for more information.',
    cta: 'Contact us for more information',
  },
  vi: {
    eyebrow: 'BrewAsia × CraftCon Saigon × BigBamBoo',
    title: 'Halloween Collab Fest',
    date: 'Thứ Bảy 31/10/2026',
    time: '16:00 – nửa đêm',
    venue: 'BigBamBoo',
    address: '10 An Phú, An Khánh, Thủ Đức (Quận 2 cũ), TP. Hồ Chí Minh',
    map: 'Mở Google Maps',
    blurb: 'Một đêm, một quán bar, và cả một dàn bia collab nấu riêng cho BrewAsia 2026. Các nhà máy bia từ Việt Nam, Hàn Quốc, Ấn Độ, Trung Quốc và Philippines cùng góp mặt: keg collab trên dàn vòi BigBamBoo, quầy collab BZZD, BBQ collab cùng Việt Thích Barbecue và đầu bếp BBQ khách mời từ Ấn Độ, DJ suốt đêm. Hãy tới trong trang phục hoá trang.',
    entry: 'Vé hội nghị BrewAsia = vào cửa miễn phí, ly nếm thử miễn phí, token miễn phí.',
    tickets: 'Mua vé',
    priceTitle: 'Tại cửa',
    priceDoor: '100k',
    priceDoorText: 'Vé vào cửa trong đêm hội · Miễn phí với vé hội nghị BrewAsia',
    packTitle: 'Gói nếm thử collab',
    pack1: '200k',
    pack1Text: '4 token + 1 ly lưu niệm',
    pack2: '500k',
    pack2Text: '12 token + 1 ly lưu niệm — tặng thêm 2 ly',
    packNote: '1 token = 1 ly bia collab bất kỳ. Hết token? Mua thêm với giá như cũ suốt đêm.',
    soonStamp: 'Sắp mở bán',
    soon: 'Vé bán online trên website của chúng tôi sẽ sớm có. Trong lúc đó, bạn thanh toán tại cửa.',
    countries: 'Việt Nam · Hàn Quốc · Ấn Độ · Trung Quốc · Philippines',
    countdown: 'Đếm ngược tới ly đầu tiên',
    partnersLabel: 'Đồng tổ chức',
    partners: 'BrewAsia × CraftCon Saigon × BigBamBoo',
    days: 'ngày', hours: 'giờ', mins: 'phút',
    lineup: 'Trên vòi',
    lineupSub: 'Công bố dần khi từng mẻ được chốt. Hãy ghé lại nhé.',
    confirmed: 'Đã xác nhận',
    coming: 'Đang nấu',
    contactCta: 'Liên hệ',
    ownSetup: 'Tự phục vụ tại quầy riêng',
    tbd: 'Bia sẽ công bố sau',
    empty: 'Danh sách vòi sẽ sớm công bố. Các mẻ collab đang trong tank.',
    beers: 'loại bia', breweries: 'nhà máy bia',
    howTitle: 'Đêm hội diễn ra thế nào',
    how1Title: 'Vòi collab',
    how1: 'Keg collab lên dàn vòi của BigBamBoo, phục vụ cả đêm tới khi hết.',
    how2Title: 'Quầy collab BZZD & BBQ',
    how2: 'Quầy collab BZZD phục vụ song song dàn vòi, cùng BBQ collab từ Việt Thích Barbecue và đầu bếp khách mời từ Ấn Độ. DJ suốt đêm.',
    how3Title: 'Hoá trang',
    how3: 'Halloween mà. Hãy hoá trang. Những bộ đẹp nhất sẽ được ưu ái.',
    ctaTitle: 'Bạn đang nấu bia cho Fest?',
    ctaText: 'Nhà máy bia: liên hệ với chúng tôi để biết thêm thông tin.',
    cta: 'Liên hệ để biết thêm',
  },
}

// site_settings keys, per language where it matters.
const K = (lang: Lang, name: string) => `fest_${name}_${lang}`

export default function FestPage({ beers, settings }: { beers: FestBeer[]; settings: FestSettings }) {
  const [lang, setLang] = useState<Lang>('en')
  const [now, setNow] = useState<number | null>(null)
  const base = T[lang]
  // Admin text wins; otherwise the default above.
  const s = (name: keyof (typeof T)['en']) => (settings[K(lang, String(name))] || settings[`fest_${String(name)}`] || base[name]) as string

  useEffect(() => {
    try { const v = localStorage.getItem('brewasia_form_lang'); if (v === 'vi' || v === 'en') setLang(v) } catch { /* ignore */ }
    setNow(Date.now())
    const id = setInterval(() => setNow(Date.now()), 60000)
    return () => clearInterval(id)
  }, [])
  function pickLang(l: Lang) { setLang(l); try { localStorage.setItem('brewasia_form_lang', l) } catch { /* ignore */ } }

  const poster = settings.fest_poster_url || '/collabfest-poster.jpg'
  const ticketUrl = settings.fest_ticket_url || ''
  const startsAt = Date.parse(settings.fest_starts_at || '2026-10-31T16:00:00+07:00')
  const left = now && Number.isFinite(startsAt) ? Math.max(0, startsAt - now) : null
  const d = left == null ? null : Math.floor(left / 86400000)
  const h = left == null ? null : Math.floor((left % 86400000) / 3600000)
  const m = left == null ? null : Math.floor((left % 3600000) / 60000)

  const breweryCount = new Set(beers.flatMap(b => b.breweries)).size

  return (
    <div className="fest">
      <div className="fest-shell">
        <div className="fest-bar">
          <span className="fest-mark">BigBamBoo</span>
          <div role="group" aria-label="Language" style={{ display: 'flex', gap: 4 }}>
            {(['en', 'vi'] as Lang[]).map(l => (
              <button key={l} onClick={() => pickLang(l)} aria-pressed={lang === l} className="fest-lang" data-on={lang === l}>
                {l === 'en' ? 'EN' : 'VI'}
              </button>
            ))}
          </div>
        </div>

        <header className="fest-hero">
          <div className="fest-eyebrow">{s('eyebrow')}</div>
          <h1 className="fest-title">{s('title')}</h1>
          <div className="fest-datebar">
            <span className="fest-date">{s('date')}</span>
            <span className="fest-time">{s('time')}</span>
          </div>
          <address className="fest-venue">
            <b>{s('venue')}</b><br />{s('address')}
            <a className="fest-link" href={MAPS} target="_blank" rel="noreferrer">{s('map')} ↗</a>
          </address>

          {d != null && (
            <div className="fest-countdown" aria-label={s('countdown')}>
              <div className="fest-count__label">{s('countdown')}</div>
              <div className="fest-count__row">
                {[[d, s('days')], [h, s('hours')], [m, s('mins')]].map(([n, l]) => (
                  <span key={String(l)} className="fest-count__cell">
                    <b className="fest-neon" data-text={String(n)}>{String(n).padStart(2, '0')}</b>
                    <i>{l}</i>
                  </span>
                ))}
              </div>
            </div>
          )}

          {poster && <img className="fest-poster" src={poster} alt="" />}
          <p className="fest-blurb">{s('blurb')}</p>
          <div className="fest-entry">{s('entry')}</div>
          {ticketUrl
            ? <a className="fest-btn" href={ticketUrl} target="_blank" rel="noreferrer">{s('tickets')}</a>
            : (
              <div className="fest-ticket">
                <span className="fest-ticket__label">{s('tickets')}</span>
                <span className="fest-ticket__stamp">{s('soonStamp')}</span>
              </div>
            )}
        </header>

        <section className="fest-section">
          <div className="fest-head">
            <h2 className="fest-h2">{s('lineup')}</h2>
            {beers.length > 0 && (
              <span className="fest-tally">{beers.length} {s('beers')} · {breweryCount} {s('breweries')}</span>
            )}
          </div>
          <p className="fest-sub">{s('lineupSub')}</p>

          {beers.length === 0 ? (
            <div className="fest-empty">{s('empty')}</div>
          ) : (
            <div className="fest-grid">
              {beers.map(b => (
                <article key={b.code} className="fest-card" data-confirmed={b.confirmed}>
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
        </section>

        <section className="fest-section">
          <h2 className="fest-h2">{s('priceTitle')}</h2>
          <div className="fest-door">
            <span className="fest-door__amount">{s('priceDoor')}</span>
            <span className="fest-door__text">{s('priceDoorText')}</span>
          </div>
          <div className="fest-packs">
            <div className="fest-price" data-pack="true">
              <div className="fest-price__kicker">{s('packTitle')}</div>
              <div className="fest-price__amount">{s('pack1')}</div>
              <div className="fest-price__text">{s('pack1Text')}</div>
            </div>
            <div className="fest-price" data-pack="true">
              <div className="fest-price__kicker">{s('packTitle')}</div>
              <div className="fest-price__amount">{s('pack2')}</div>
              <div className="fest-price__text">{s('pack2Text')}</div>
            </div>
          </div>
          <p className="fest-sub" style={{ marginTop: 12 }}>{s('packNote')}</p>
        </section>

        <section className="fest-section">
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
        </section>

        <section className="fest-cta">
          <div>
            <div className="fest-cta__title">{s('ctaTitle')}</div>
            <p className="fest-cta__text">{s('ctaText')}</p>
          </div>
          <a className="fest-btn" href={settings.fest_contact_url || CONTACT_FALLBACK} target="_blank" rel="noreferrer">{s('cta')}</a>
        </section>


        <section className="fest-partners">
          <div className="fest-partners__label">{s('partnersLabel')}</div>
          <div className="fest-partners__names">{s('partners')}</div>
        </section>

        <footer className="fest-foot">
          <div>{s('venue')} · {s('address')}</div>
          <a className="fest-link" href={MAPS} target="_blank" rel="noreferrer">{s('map')} ↗</a>
        </footer>
      </div>
    </div>
  )
}

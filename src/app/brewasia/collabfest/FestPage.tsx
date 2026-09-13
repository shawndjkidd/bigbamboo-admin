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
const SIGNUP = '/brewasia/collab'

// Defaults. Anything set in the admin (site_settings key in brackets) wins.
const T = {
  en: {
    eyebrow: 'BrewAsia 2026 · Ho Chi Minh City',
    title: 'Halloween Collab Fest',
    date: 'Saturday 31 October 2026',
    time: 'From 4pm until late',
    venue: 'BigBamBoo',
    address: '10 An Phú, An Khánh, Thủ Đức (District 2), Ho Chi Minh City',
    map: 'Open in Google Maps',
    blurb: 'One night, one bar, and a wall of collaboration beers brewed for BrewAsia 2026. Breweries from across Asia pour side by side: collab kegs on the BigBamBoo taps and brewers pouring their own. Come in costume.',
    entry: 'Free for BrewAsia conference attendees · Tickets at the door for everyone else',
    tickets: 'Get tickets',
    countdown: 'Until the first pour',
    days: 'days', hours: 'hours', mins: 'min',
    lineup: 'What’s pouring',
    lineupSub: 'The list grows as collabs are confirmed. Come back for more.',
    confirmed: 'Confirmed',
    coming: 'Brewing',
    ownSetup: 'Pouring at their own bar',
    tbd: 'Beer to be announced',
    empty: 'The first collabs are in the tank. This list fills up as breweries confirm.',
    beers: 'beers', breweries: 'breweries',
    howTitle: 'How the night works',
    how1Title: 'Collab taps',
    how1: 'Collab kegs go on the BigBamBoo tap wall, poured all night until they blow.',
    how2Title: 'Brewers pouring',
    how2: 'Some breweries bring their own setup and pour their beer themselves. Go and talk to them.',
    how3Title: 'Costumes',
    how3: 'It’s Halloween. Dress for it. The best costumes get looked after.',
    ctaTitle: 'Brewing a collab?',
    ctaText: 'Breweries: tell us what you’re bringing. Pour it yourself, or send kegs for our taps.',
    cta: 'Send us your collab',
    alsoTitle: 'The night before',
    also: 'Friday Ale Trail · Friday 30 October — collab beers pouring at bars across Saigon. Pay as you go, collect a digital stamp at every stop.',
  },
  vi: {
    eyebrow: 'BrewAsia 2026 · TP. Hồ Chí Minh',
    title: 'Halloween Collab Fest',
    date: 'Thứ Bảy 31/10/2026',
    time: 'Từ 16:00 đến khuya',
    venue: 'BigBamBoo',
    address: '10 An Phú, An Khánh, Thủ Đức (Quận 2 cũ), TP. Hồ Chí Minh',
    map: 'Mở Google Maps',
    blurb: 'Một đêm, một quán bar, và cả một dàn bia collab nấu riêng cho BrewAsia 2026. Các nhà máy bia khắp châu Á cùng góp mặt: keg collab trên dàn vòi của BigBamBoo và các nhà nấu bia tự phục vụ. Hãy tới trong trang phục hoá trang.',
    entry: 'Miễn phí cho khách tham dự hội nghị BrewAsia · Khách khác mua vé tại cửa',
    tickets: 'Mua vé',
    countdown: 'Đếm ngược tới ly đầu tiên',
    days: 'ngày', hours: 'giờ', mins: 'phút',
    lineup: 'Bia có mặt',
    lineupSub: 'Danh sách sẽ dài thêm khi các collab được xác nhận. Hãy ghé lại nhé.',
    confirmed: 'Đã xác nhận',
    coming: 'Đang nấu',
    ownSetup: 'Tự phục vụ tại quầy riêng',
    tbd: 'Bia sẽ công bố sau',
    empty: 'Những mẻ collab đầu tiên đang trong tank. Danh sách sẽ cập nhật khi được xác nhận.',
    beers: 'loại bia', breweries: 'nhà máy bia',
    howTitle: 'Đêm hội diễn ra thế nào',
    how1Title: 'Vòi collab',
    how1: 'Keg collab lên dàn vòi của BigBamBoo, phục vụ cả đêm tới khi hết.',
    how2Title: 'Nhà nấu bia phục vụ',
    how2: 'Một số nhà máy mang quầy riêng và tự rót bia của mình. Hãy ghé trò chuyện với họ.',
    how3Title: 'Hoá trang',
    how3: 'Halloween mà. Hãy hoá trang. Những bộ đẹp nhất sẽ được ưu ái.',
    ctaTitle: 'Bạn đang nấu bia collab?',
    ctaText: 'Nhà máy bia: hãy cho chúng tôi biết bạn mang gì tới. Tự phục vụ, hoặc gửi keg cho vòi của chúng tôi.',
    cta: 'Gửi thông tin collab',
    alsoTitle: 'Đêm trước đó',
    also: 'Friday Ale Trail · Thứ Sáu 30/10 — bia collab phục vụ tại các quán khắp Sài Gòn. Trả tiền theo từng ly, nhận dấu điện tử ở mỗi điểm.',
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

  const poster = settings.fest_poster_url || ''
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
            <span className="fest-dot" aria-hidden>•</span>
            <span className="fest-time">{s('time')}</span>
          </div>
          <div className="fest-venue">{s('venue')} · {s('address')}</div>
          <a className="fest-link" href={MAPS} target="_blank" rel="noreferrer">{s('map')} ↗</a>
          {poster && <img className="fest-poster" src={poster} alt="" />}
          <p className="fest-blurb">{s('blurb')}</p>
          <div className="fest-entry">{s('entry')}</div>
          {ticketUrl && <a className="fest-btn" href={ticketUrl} target="_blank" rel="noreferrer">{s('tickets')}</a>}

          {d != null && (
            <div className="fest-countdown" aria-label={s('countdown')}>
              <div className="fest-count__label">{s('countdown')}</div>
              <div className="fest-count__row">
                <span><b>{d}</b>{s('days')}</span>
                <span><b>{h}</b>{s('hours')}</span>
                <span><b>{m}</b>{s('mins')}</span>
              </div>
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
                    {b.own_setup && <span className="fest-tag fest-tag--ghost">{s('ownSetup')}</span>}
                  </div>
                </article>
              ))}
            </div>
          )}
        </section>

        <section className="fest-section">
          <h2 className="fest-h2">{s('howTitle')}</h2>
          <div className="fest-how">
            {[['how1Title', 'how1'], ['how2Title', 'how2'], ['how3Title', 'how3']].map(([tk, bk]) => (
              <div key={tk} className="fest-how__item">
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
          <a className="fest-btn" href={SIGNUP}>{s('cta')}</a>
        </section>

        <section className="fest-also">
          <div className="fest-also__label">{s('alsoTitle')}</div>
          <p className="fest-also__text">{s('also')}</p>
        </section>

        <footer className="fest-foot">
          <div>{s('venue')} · {s('address')}</div>
          <a className="fest-link" href={MAPS} target="_blank" rel="noreferrer">{s('map')} ↗</a>
        </footer>
      </div>
    </div>
  )
}

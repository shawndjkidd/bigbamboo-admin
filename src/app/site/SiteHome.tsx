'use client'
import { useEffect, useState } from 'react'

// Public homepage. English and Vietnamese. Everything here reads from site_settings
// (home_*), so the dashboard can change it; the defaults below are what shows when a
// field is left empty.

export type SiteSettings = Record<string, string>
export type SiteEvent = { id: string; title: string; date: string; description: string | null }
type Lang = 'en' | 'vi'

const D = {
  en: {
    tagline: 'Cold drinks. Breezy nights. No bad vibes.',
    sub: 'Tiki–tropical vibes, draft cocktails, craft beer, American comfort food with a Hawaiian twist… and a little bụi!',
    statusLabel: 'Status', statusValue: 'Open on event nights', statusNote: 'Hours are event-based right now — check what’s on below',
    locLabel: 'Location', locValue: 'An Phú, Saigon', locNote: '10 An Phú, An Khánh, Thủ Đức, TP.HCM',
    nextLabel: 'Coming up', nextNone: 'New events going up soon',
    eventsTitle: 'What’s on',
    eventsNone: 'Nothing on the calendar this week. Follow along for the next one.',
    festTitle: 'Halloween Collab Fest',
    festText: 'Saturday 31 October · 4pm – midnight. Collab beers from Vietnam, Korea, India, China and the Philippines, the BZZD collab bar, BBQ, DJs and costumes.',
    festCta: 'See the lineup',
    visitTitle: 'Pull up.',
    visitAddress: '10 An Phú, An Khánh · Thủ Đức, TP.HCM',
    maps: 'Open in Maps', grab: 'Order on Grab', instagram: 'Instagram', facebook: 'Facebook',
    menuTitle: 'Drink & eat',
    menuText: 'Draft cocktails, craft beer, and food that goes with both.',
    footer: 'An Phú · Ho Chi Minh City',
  },
  vi: {
    tagline: 'Bia lạnh. Đêm mát. Không drama.',
    sub: 'Không khí tiki nhiệt đới, cocktail rót vòi, bia thủ công, món Mỹ pha chút Hawaii… và một chút bụi!',
    statusLabel: 'Tình trạng', statusValue: 'Mở cửa vào đêm sự kiện', statusNote: 'Hiện tại chúng tôi mở theo sự kiện — xem lịch bên dưới',
    locLabel: 'Địa chỉ', locValue: 'An Phú, Sài Gòn', locNote: '10 An Phú, An Khánh, Thủ Đức, TP.HCM',
    nextLabel: 'Sắp diễn ra', nextNone: 'Sự kiện mới sẽ sớm được cập nhật',
    eventsTitle: 'Sự kiện',
    eventsNone: 'Tuần này chưa có sự kiện. Hãy theo dõi để biết sự kiện kế tiếp.',
    festTitle: 'Halloween Collab Fest',
    festText: 'Thứ Bảy 31/10 · 16:00 – nửa đêm. Bia collab từ Việt Nam, Hàn Quốc, Ấn Độ, Trung Quốc và Philippines, quầy collab BZZD, BBQ, DJ và hoá trang.',
    festCta: 'Xem danh sách bia',
    visitTitle: 'Ghé chơi nhé.',
    visitAddress: '10 An Phú, An Khánh · Thủ Đức, TP.HCM',
    maps: 'Mở bản đồ', grab: 'Đặt trên Grab', instagram: 'Instagram', facebook: 'Facebook',
    menuTitle: 'Uống & ăn',
    menuText: 'Cocktail rót vòi, bia thủ công, và đồ ăn hợp với cả hai.',
    footer: 'An Phú · TP. Hồ Chí Minh',
  },
}

const LINKS = {
  maps: 'https://www.google.com/maps/search/BigBamBoo+An+Ph%C3%BA+Th%E1%BB%A7+%C4%90%E1%BB%A9c',
  fest: '/brewasia/collabfest',
}

export default function SiteHome({ settings, events }: { settings: SiteSettings; events: SiteEvent[] }) {
  const [lang, setLang] = useState<Lang>('en')
  const base = D[lang]
  const s = (name: keyof (typeof D)['en']) => settings[`home_${String(name)}_${lang}`] || base[name]

  useEffect(() => {
    try { const v = localStorage.getItem('bb_lang'); if (v === 'vi' || v === 'en') setLang(v) } catch { /* ignore */ }
  }, [])
  function pickLang(l: Lang) { setLang(l); try { localStorage.setItem('bb_lang', l) } catch { /* ignore */ } }

  const instagram = settings.home_instagram_url || ''
  const facebook = settings.home_facebook_url || ''
  const grab = settings.home_grab_url || ''
  const next = events[0]

  return (
    <div className="bb">
      <div className="bb-shell">
        <header className="bb-top">
          <span className="bb-mark">BigBamBoo</span>
          <div style={{ display: 'flex', gap: 4 }} role="group" aria-label="Language">
            {(['en', 'vi'] as Lang[]).map(l => (
              <button key={l} className="bb-lang" data-on={lang === l} onClick={() => pickLang(l)} aria-pressed={lang === l}>
                {l === 'en' ? 'EN' : 'VI'}
              </button>
            ))}
          </div>
        </header>

        <section className="bb-hero">
          <h1 className="bb-tagline">{s('tagline')}</h1>
          <p className="bb-sub">{s('sub')}</p>
          <div className="bb-hero__links">
            <a className="bb-btn" href="#events">{s('eventsTitle')}</a>
            <a className="bb-btn bb-btn--ghost" href={LINKS.fest}>{s('festTitle')}</a>
          </div>
        </section>

        <section className="bb-strip">
          <div className="bb-strip__card">
            <div className="bb-strip__label">{s('statusLabel')}</div>
            <div className="bb-strip__value">{s('statusValue')}</div>
            <div className="bb-strip__note">{s('statusNote')}</div>
          </div>
          <div className="bb-strip__card">
            <div className="bb-strip__label">{s('locLabel')}</div>
            <div className="bb-strip__value">{s('locValue')}</div>
            <div className="bb-strip__note">{s('locNote')}</div>
          </div>
          <div className="bb-strip__card">
            <div className="bb-strip__label">{s('nextLabel')}</div>
            <div className="bb-strip__value">{next ? next.title : s('nextNone')}</div>
            <div className="bb-strip__note">{next ? fmtDate(next.date, lang) : ''}</div>
          </div>
        </section>

        <section className="bb-section" id="events">
          <h2 className="bb-h2">{s('eventsTitle')}</h2>
          {events.length === 0 ? (
            <div className="bb-empty">{s('eventsNone')}</div>
          ) : (
            <div className="bb-events">
              {events.map(e => (
                <article key={e.id} className="bb-event">
                  <div className="bb-event__date">{fmtDate(e.date, lang)}</div>
                  <h3 className="bb-event__title">{e.title}</h3>
                  {e.description && <p className="bb-event__text">{e.description}</p>}
                </article>
              ))}
            </div>
          )}
        </section>

        <section className="bb-fest">
          <div>
            <div className="bb-fest__kicker">BrewAsia 2026</div>
            <h2 className="bb-h2">{s('festTitle')}</h2>
            <p className="bb-fest__text">{s('festText')}</p>
            <a className="bb-btn" href={LINKS.fest}>{s('festCta')}</a>
          </div>
          <img className="bb-fest__poster" src={settings.fest_poster_url || '/collabfest-poster.jpg'} alt="" />
        </section>

        <section className="bb-section" id="visit">
          <h2 className="bb-h2">{s('visitTitle')}</h2>
          <p className="bb-address">{s('visitAddress')}</p>
          <div className="bb-hero__links">
            <a className="bb-btn" href={LINKS.maps} target="_blank" rel="noreferrer">{s('maps')}</a>
            {grab && <a className="bb-btn bb-btn--ghost" href={grab} target="_blank" rel="noreferrer">{s('grab')}</a>}
            {instagram && <a className="bb-btn bb-btn--ghost" href={instagram} target="_blank" rel="noreferrer">{s('instagram')}</a>}
            {facebook && <a className="bb-btn bb-btn--ghost" href={facebook} target="_blank" rel="noreferrer">{s('facebook')}</a>}
          </div>
        </section>

        <footer className="bb-foot">
          <div>BigBamBoo · bigbamboo.app</div>
          <div>{s('footer')}</div>
        </footer>
      </div>
    </div>
  )
}

function fmtDate(d: string, lang: Lang) {
  const dt = new Date(`${d}T00:00:00`)
  if (isNaN(dt.getTime())) return d
  return dt.toLocaleDateString(lang === 'vi' ? 'vi-VN' : 'en-GB', { weekday: 'short', day: 'numeric', month: 'short' })
}

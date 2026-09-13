'use client'
import { useEffect, useMemo, useState } from 'react'
import Image from 'next/image'
import {
  type Lang, type Settings, resolve, resolveLink,
  sectionLabel, translateTag, priceLabel,
} from './copy'
import type { SiteEvent, SiteMenuItem } from './types'

// A port of the old Hostinger homepage. Same sections in the same order, same section
// ids, same palette and type — the styles live under .bb in globals.css. What changed on
// purpose: four languages became two, the pill shapes are squared off, the weekly hours
// table is gone (hours are event-based now), and the fonts are self-hosted.
//
// Still to come in a later phase: the ticket modal and event detail popup.

const STAMP_COUNT = 10
const FILLED_STAMPS = 3
type ClubState = 'idle' | 'sending' | 'done' | 'error'

export default function SiteHome({
  settings, events, menu, clubReady = false,
}: { settings: Settings; events: SiteEvent[]; menu: SiteMenuItem[]; clubReady?: boolean }) {
  const [lang, setLang] = useState<Lang>('en')
  const [cat, setCat] = useState('all')
  const [active, setActive] = useState('menu')
  const [clubEmail, setClubEmail] = useState('')
  const [clubZalo, setClubZalo] = useState('')
  const [clubTrap, setClubTrap] = useState('')
  const [club, setClub] = useState<ClubState>('idle')

  const t = (name: string) => resolve(settings, lang, name)

  useEffect(() => {
    try {
      const v = localStorage.getItem('bb_lang')
      if (v === 'vi' || v === 'en') setLang(v)
    } catch { /* ignore */ }
  }, [])

  function pickLang(l: Lang) {
    setLang(l)
    try { localStorage.setItem('bb_lang', l) } catch { /* ignore */ }
  }

  // Which section the header and phone bar should highlight.
  useEffect(() => {
    const ids = ['menu', 'events', 'club', 'visit']
    function onScroll() {
      const y = window.scrollY + 140
      let found = ids[0]
      for (const id of ids) {
        const el = document.getElementById(id)
        if (el && el.offsetTop <= y) found = id
      }
      setActive(found)
    }
    onScroll()
    window.addEventListener('scroll', onScroll, { passive: true })
    return () => window.removeEventListener('scroll', onScroll)
  }, [])

  const instagram = resolveLink(settings, 'instagram_url')
  const facebook = resolveLink(settings, 'facebook_url')
  const messenger = resolveLink(settings, 'messenger_url')
  const maps = resolveLink(settings, 'maps_url')
  const grab = resolveLink(settings, 'grab_url')

  // Group the drinks by section, in the order the dashboard defines.
  const sections = useMemo(() => {
    const bySection = new Map<string, SiteMenuItem[]>()
    for (const item of menu) {
      if (!bySection.has(item.section)) bySection.set(item.section, [])
      bySection.get(item.section)!.push(item)
    }
    let order: string[] = []
    try {
      const raw = settings.menu_section_order
      if (raw) { const parsed = JSON.parse(raw); if (Array.isArray(parsed)) order = parsed.map(String) }
    } catch { /* fall back to insertion order */ }
    const keys = [
      ...order.filter(k => bySection.has(k)),
      ...Array.from(bySection.keys()).filter(k => !order.includes(k)),
    ]
    return keys.map(key => ({ key, items: bySection.get(key)!, ...sectionLabel(key, lang) }))
  }, [menu, settings.menu_section_order, lang])

  const shown = cat === 'all' ? sections : sections.filter(s => s.key === cat)
  const next = events[0]
  const todayISO = new Date().toISOString().slice(0, 10)
  const openToday = !!next && next.date === todayISO

  async function joinClub(e: React.FormEvent) {
    e.preventDefault()
    if (club === 'sending' || !clubEmail.trim()) return
    setClub('sending')
    try {
      const r = await fetch('/api/public/club-signup', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ email: clubEmail, zalo: clubZalo, lang, source: 'homepage', website: clubTrap }),
      })
      if (!r.ok) throw new Error('failed')
      setClub('done')
      setClubEmail('')
      setClubZalo('')
    } catch { setClub('error') }
  }

  const navItems = [
    { id: 'menu', label: t('navMenu') },
    { id: 'events', label: t('navEvents') },
    { id: 'visit', label: t('navVisit') },
  ]

  return (
    <div className="bb">
      <header className="bb-header">
        <div className="bb-logo-wrap">
          <div className="bb-logo-icon">
            <Image src="/images/bbb-img-4.jpg" alt="" width={36} height={36} priority />
          </div>
          <div className="bb-logo-text">BigBamBoo</div>
        </div>
        <nav className="bb-nav">
          {navItems.map(n => (
            <a key={n.id} href={`#${n.id}`} className={`bb-nav-link${active === n.id ? ' is-on' : ''}`}>{n.label}</a>
          ))}
          <a href="#club" className="bb-nav-cta">{t('navClub')}</a>
        </nav>
        <div className="bb-header-controls" role="group" aria-label="Language">
          {(['en', 'vi'] as Lang[]).map(l => (
            <button
              key={l}
              className="bb-lang"
              data-on={lang === l}
              aria-pressed={lang === l}
              onClick={() => pickLang(l)}
            >
              {l.toUpperCase()}
            </button>
          ))}
        </div>
      </header>

      <section className="bb-hero">
        <div className="bb-hero-bg">
          <Image src="/images/bbb-img-1.png" alt="" fill priority sizes="100vw" />
        </div>
        <div className="bb-hero-fade" />
        <div className="bb-hero-content">
          <div className="bb-hero-logo">
            <Image src="/images/bbb-img-5.png" alt="BigBamBoo" width={585} height={585} priority sizes="(max-width: 665px) 88vw, 585px" />
          </div>
          <div className="bb-hero-slogan"><Slogan text={t('heroSlogan')} /></div>
          <p className="bb-hero-tagline">{t('heroTagline')}</p>
          <div className="bb-hero-buttons">
            <a href="#menu" className="bb-hbtn bb-hbtn--menu">{t('btnMenu')}</a>
            <a href="#events" className="bb-hbtn bb-hbtn--events">{t('btnEvents')}</a>
            {/* Scan·Tap·Win lived at /scan-tap-win.html on Hostinger; it's a real page in
                this app now. */}
            <a href="/play" className="bb-hbtn bb-hbtn--spin">{t('btnSpin')}</a>
          </div>
          <div className="bb-hero-social">
            {instagram && <a href={instagram} target="_blank" rel="noreferrer" className="bb-soc bb-soc--ig">{t('socInstagram')}</a>}
            {facebook && <a href={facebook} target="_blank" rel="noreferrer" className="bb-soc bb-soc--fb">{t('socFacebook')}</a>}
            {messenger && <a href={messenger} target="_blank" rel="noreferrer" className="bb-soc bb-soc--msg">{t('btnMessenger')}</a>}
          </div>
        </div>
      </section>

      <div className="bb-info">
        <div className="bb-info-cell">
          <div className="bb-info-label">{t('labelStatus')}</div>
          {openToday ? (
            <div className="bb-open-badge">
              <span className="bb-open-pulse" />
              <span className="bb-info-main">{t('statusOpenToday')}</span>
            </div>
          ) : (
            <div className="bb-info-main">{t('statusMain')}</div>
          )}
          <div className="bb-info-sub">{t('statusSub')}</div>
        </div>
        <div className="bb-info-cell">
          <div className="bb-info-label">{t('labelLocation')}</div>
          <div className="bb-info-main">{t('locCity')}</div>
          <div className="bb-info-sub">{t('locStreet')}</div>
        </div>
        <div className="bb-info-cell">
          <div className="bb-info-label">{t('labelComingUp')}</div>
          <div className="bb-info-main">{next ? eventTitle(next, lang) : t('comingUpNone')}</div>
          <div className="bb-info-sub">{next ? fmtDate(next.date, lang) : ''}</div>
        </div>
      </div>

      <section id="menu">
        {sections.length > 0 && (
          <div className="bb-cat-wrap">
            <div className="bb-cat-nav">
              <button className={`bb-cat-btn${cat === 'all' ? ' is-on' : ''}`} onClick={() => setCat('all')}>
                {t('catAll')}
              </button>
              {sections.map(s => (
                <button key={s.key} className={`bb-cat-btn${cat === s.key ? ' is-on' : ''}`} onClick={() => setCat(s.key)}>
                  {s.label}
                </button>
              ))}
            </div>
          </div>
        )}
        {sections.length === 0 ? (
          <div className="bb-menu-empty" style={{ paddingTop: 48 }}>{t('menuEmpty')}</div>
        ) : (
          shown.map((s, i) => (
            <div key={s.key}>
              {i > 0 && <div className="bb-menu-divider" />}
              <div className="bb-menu-head">
                <h3>{s.label}</h3>
                {s.note && <p>{s.note}</p>}
              </div>
              <div className="bb-menu-list">
                {s.items.map(item => <MenuRow key={item.id} item={item} sectionKey={s.key} lang={lang} />)}
              </div>
            </div>
          ))
        )}
      </section>

      <section id="events">
        <div className="bb-events-bg">
          <Image src="/images/bbb-img-2.png" alt="" fill loading="lazy" sizes="100vw" />
        </div>
        <div className="bb-events-inner">
          <div className="bb-events-eyebrow">{t('eventsEyebrow')}</div>
          <h2 className="bb-events-title">{t('eventsTitle')}</h2>
          {events.length === 0 ? (
            <div className="bb-events-empty">{t('eventsEmpty')}</div>
          ) : (
            <div className="bb-events-grid">
              {events.map(ev => (
                <article key={ev.id} className="bb-event-card">
                  <div className="bb-event-date">
                    <div className="bb-ev-day">{dayOf(ev.date)}</div>
                    <div className="bb-ev-month">{monthOf(ev.date, lang)}</div>
                  </div>
                  <div className="bb-ev-body">
                    {ev.type && <div className="bb-ev-type">{ev.type}</div>}
                    <div className="bb-ev-title">{eventTitle(ev, lang)}</div>
                    {eventText(ev, lang) && <div className="bb-ev-desc">{eventText(ev, lang)}</div>}
                    <div className="bb-ev-meta">
                      {fmtTime(ev) && <span className="bb-ev-time">{fmtTime(ev)}</span>}
                      {ev.facebook_link && (
                        <a href={ev.facebook_link} target="_blank" rel="noreferrer" className="bb-ev-fb">
                          {t('evFacebook')}
                        </a>
                      )}
                    </div>
                  </div>
                </article>
              ))}
            </div>
          )}
        </div>
      </section>

      <section id="coming-soon">
        <div className="bb-cs-bg">
          <Image src="/images/bbb-img-3.png" alt="" fill loading="lazy" sizes="100vw" />
        </div>
        <div className="bb-cs-content">
          <div className="bb-cs-badge">{t('merchBadge')}</div>
          <div className="bb-cs-headline">{t('merchHeadline')}</div>
          <p className="bb-cs-sub">{t('merchSub')}</p>
        </div>
      </section>

      <section id="club">
        <div className="bb-club-inner">
          <div className="bb-club-top">
            <div>
              <div className="bb-club-eyebrow">{t('clubEyebrow')}</div>
              <h2 className="bb-club-title">
                <span className="bb-ct1">{t('clubBuy')}</span>
                <span className="bb-ct2">{t('clubFree')}</span>
              </h2>
            </div>
            {!clubReady ? null : club === 'done' ? (
              <p className="bb-club-said" role="status">{t('clubThanks')}</p>
            ) : (
              <form className="bb-club-signup" onSubmit={joinClub}>
                <label className="bb-hide" htmlFor="bb-club-website">Leave this empty</label>
                <input
                  id="bb-club-website" className="bb-hide" type="text" tabIndex={-1} autoComplete="off"
                  value={clubTrap} onChange={e => setClubTrap(e.target.value)}
                />
                <input
                  type="email" required className="bb-club-email" aria-label={t('clubEmailPlaceholder')}
                  placeholder={t('clubEmailPlaceholder')}
                  value={clubEmail} onChange={e => setClubEmail(e.target.value)}
                />
                <input
                  type="tel" className="bb-club-email bb-club-email--zalo" aria-label={t('clubZaloPlaceholder')}
                  placeholder={t('clubZaloPlaceholder')}
                  value={clubZalo} onChange={e => setClubZalo(e.target.value)}
                />
                <button type="submit" className="bb-club-btn" disabled={club === 'sending'}>
                  {t('clubNotify')}
                </button>
              </form>
            )}
          </div>
          {club === 'error' && <p className="bb-club-said" role="status">{t('clubError')}</p>}
          <div className="bb-club-stamps">
            {Array.from({ length: STAMP_COUNT }).map((_, i) =>
              i === STAMP_COUNT - 1
                ? <div key={i} className="bb-stamp is-gift">FREE</div>
                : <div key={i} className={`bb-stamp${i < FILLED_STAMPS ? ' is-filled' : ''}`}><StampMark /></div>
            )}
          </div>
          {clubReady && <p className="bb-club-promise">{t('clubPromise')}</p>}
          <p className="bb-club-fine">{t('clubFine')}</p>
        </div>
      </section>

      <section id="visit">
        <div className="bb-visit-inner">
          <div className="bb-visit-left">
            <div className="bb-visit-eyebrow">{t('locCity')}</div>
            <h2 className="bb-visit-title">{t('visitTitle')}</h2>
            <div className="bb-visit-addr">{t('visitAddress')}</div>
            <div className="bb-visit-links">
              {maps && <a href={maps} target="_blank" rel="noreferrer" className="bb-map-btn">{t('visitMaps')}</a>}
              {instagram && <a href={instagram} target="_blank" rel="noreferrer" className="bb-visit-btn is-ig">{t('socInstagram')}</a>}
              {facebook && <a href={facebook} target="_blank" rel="noreferrer" className="bb-visit-btn is-fb">{t('socFacebook')}</a>}
              {grab && <a href={grab} target="_blank" rel="noreferrer" className="bb-visit-btn is-grab">{t('socGrab')}</a>}
            </div>
          </div>
          <div className="bb-visit-right">
            <div className="bb-visit-note">{t('visitNote')}</div>
          </div>
        </div>
      </section>

      <footer className="bb-foot">
        <div className="bb-foot-logo">BigBamBoo · bigbamboo.app</div>
        <div className="bb-foot-note">{t('footerNote')} · © {new Date().getFullYear()}</div>
      </footer>

      <nav className="bb-bottom-nav">
        <div className="bb-bnav-items">
          <a href="#menu" className={`bb-bnav-item${active === 'menu' ? ' is-on' : ''}`}>{t('navMenu')}</a>
          <a href="#events" className={`bb-bnav-item${active === 'events' ? ' is-on' : ''}`}>{t('navEvents')}</a>
          <a href="#club" className={`bb-bnav-item${active === 'club' ? ' is-on' : ''}`}>{t('navClubShort')}</a>
          <a href="#visit" className={`bb-bnav-item${active === 'visit' ? ' is-on' : ''}`}>{t('navVisit')}</a>
        </div>
      </nav>
    </div>
  )
}

// ── Menu row ────────────────────────────────────────────────────────────────────

function MenuRow({ item, sectionKey, lang }: { item: SiteMenuItem; sectionKey: string; lang: Lang }) {
  const name = (lang === 'vi' && item.name_vi) || item.name
  const desc = (lang === 'vi' && item.description_vi) || item.description

  // Wine, beer and shots wear the ABV next to the brand; everything else next to the name.
  const abvOnBrandLine = ['wine', 'beer', 'shots'].includes(sectionKey) && !!item.abv
  const brandParts = [item.brand, item.subtitle].filter(Boolean) as string[]
  if (abvOnBrandLine) brandParts.push(item.abv)

  const tags = item.tags.filter(Boolean)

  return (
    <div className="bb-menu-row">
      <div>
        <div className="bb-row-name-line">
          <span className="bb-row-name">{name}</span>
          {item.abv && !abvOnBrandLine && sectionKey !== 'na' && <span className="bb-row-abv">{item.abv}</span>}
        </div>
        {brandParts.length > 0 && <div className="bb-row-brand">{brandParts.join(' · ')}</div>}
        {desc && <div className="bb-row-desc">{desc}</div>}
        {(item.is_draft || tags.length > 0) && (
          <div className="bb-row-tags">
            {item.is_draft && <span className="bb-row-tag is-draft">{translateTag('On Tap', lang)}</span>}
            {tags.map(tag => (
              <span key={tag} className={`bb-row-tag${tagClass(tag)}`}>{translateTag(tag, lang)}</span>
            ))}
          </div>
        )}
      </div>
      <Price item={item} lang={lang} />
    </div>
  )
}

function Price({ item, lang }: { item: SiteMenuItem; lang: Lang }) {
  if (item.price_glass || item.price_bottle) {
    return (
      <div className="bb-prices is-wine">
        {item.price_glass && <Pair size={priceLabel('glass', lang)} val={item.price_glass} />}
        {item.price_bottle && <Pair size={priceLabel('bottle', lang)} val={item.price_bottle} />}
      </div>
    )
  }
  if (item.price_small || item.price_large) {
    return (
      <div className="bb-prices">
        {item.price_small && <Pair size={priceLabel('glass', lang)} val={item.price_small} />}
        {item.price_large && <Pair size={priceLabel('pint', lang)} val={item.price_large} />}
      </div>
    )
  }
  // Combined strings typed into the dashboard, e.g. "350ml: 59k / 500ml: 79k".
  if (item.price.includes('/')) {
    const parts = item.price.split('/').map(s => s.trim()).filter(Boolean)
    const isWine = parts.some(p => /^(glass|bottle)/i.test(p))
    return (
      <div className={`bb-prices${isWine ? ' is-wine' : ''}`}>
        {parts.map((p, i) => {
          const glass = p.match(/^glass[:\s]+(.+)$/i)
          const bottle = p.match(/^bottle[:\s]+(.+)$/i)
          const sized = p.match(/^(\d+\s*ml)[:\s]+(.+)$/i)
          if (glass) return <Pair key={i} size={priceLabel('glass', lang)} val={glass[1].trim()} />
          if (bottle) return <Pair key={i} size={priceLabel('bottle', lang)} val={bottle[1].trim()} />
          if (sized) return <Pair key={i} size={sized[1]} val={sized[2].trim()} />
          return <Pair key={i} size="" val={p} />
        })}
      </div>
    )
  }
  return <div className="bb-row-price">{item.price}</div>
}

function Pair({ size, val }: { size: string; val: string }) {
  return (
    <div className="bb-price-pair">
      {size && <span className="bb-mp-size">{size}</span>}
      <span className="bb-mp-val">{val}</span>
    </div>
  )
}

// Green for the food-ish tags, teal for the drink-ish ones — as the old page had it.
function tagClass(tag: string): string {
  const t = tag.toLowerCase()
  if (['vegan', 'local', 'fresh'].includes(t)) return ' is-g'
  if (['craft', 'on tap', 'new'].includes(t)) return ' is-b'
  return ''
}

// ── Bits and pieces ─────────────────────────────────────────────────────────────

// The slogan is one editable string; whatever sits between *stars* comes out yellow.
function Slogan({ text }: { text: string }) {
  const parts = text.split('*')
  return <>{parts.map((p, i) => (i % 2 === 1 ? <span key={i}>{p}</span> : p))}</>
}

function StampMark() {
  return (
    <svg viewBox="0 0 80 80" aria-hidden="true">
      <rect x="2" y="2" width="76" height="76" rx="8" fill="none" stroke="currentColor" strokeWidth="2.5" />
      <rect x="10" y="10" width="18" height="20" rx="3" fill="none" stroke="currentColor" strokeWidth="2" />
      <rect x="32" y="10" width="8" height="20" rx="2" fill="none" stroke="currentColor" strokeWidth="2" />
      <rect x="44" y="10" width="18" height="20" rx="3" fill="none" stroke="currentColor" strokeWidth="2" />
      <rect x="8" y="33" width="19" height="14" rx="3" fill="none" stroke="currentColor" strokeWidth="2" />
      <rect x="30" y="33" width="8" height="14" rx="2" fill="none" stroke="currentColor" strokeWidth="2" />
      <rect x="41" y="33" width="23" height="14" rx="3" fill="none" stroke="currentColor" strokeWidth="2" />
      <rect x="8" y="50" width="19" height="20" rx="3" fill="none" stroke="currentColor" strokeWidth="2" />
      <rect x="30" y="50" width="18" height="20" rx="3" fill="none" stroke="currentColor" strokeWidth="2" />
      <rect x="51" y="50" width="18" height="20" rx="3" fill="none" stroke="currentColor" strokeWidth="2" />
    </svg>
  )
}

function eventTitle(ev: SiteEvent, lang: Lang) { return (lang === 'vi' && ev.title_vi) || ev.title }
function eventText(ev: SiteEvent, lang: Lang) { return (lang === 'vi' && ev.description_vi) || ev.description }

function dayOf(d: string) {
  const dt = new Date(`${d}T00:00:00`)
  return isNaN(dt.getTime()) ? '—' : String(dt.getDate())
}

function monthOf(d: string, lang: Lang) {
  const dt = new Date(`${d}T00:00:00`)
  if (isNaN(dt.getTime())) return ''
  return dt.toLocaleDateString(lang === 'vi' ? 'vi-VN' : 'en-GB', { month: 'short' })
}

function fmtDate(d: string, lang: Lang) {
  const dt = new Date(`${d}T00:00:00`)
  if (isNaN(dt.getTime())) return d
  return dt.toLocaleDateString(lang === 'vi' ? 'vi-VN' : 'en-GB', { weekday: 'short', day: 'numeric', month: 'short' })
}

function fmtTime(ev: SiteEvent) {
  return [ev.start_time, ev.end_time]
    .filter(Boolean)
    .map(t => String(t).slice(0, 5).replace(':', 'h'))
    .join(' – ')
}

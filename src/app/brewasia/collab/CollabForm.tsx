'use client'
import { useEffect, useState } from 'react'

// Public collab sign-up for BrewAsia 2026. One shared link; a brewery tells us who it's
// brewing with, the beer, and where the kegs go. Lands on the admin Collabs page. EN / VI.

type Lang = 'en' | 'vi'
type Use = 'friday_ale_trail' | 'halloween' | 'unassigned'
type KegLine = { key: string; use: Use; qty: string; size_litres: string }

const T = {
  en: {
    eyebrow: 'BrewAsia 2026 · Collabs',
    title: 'Collab sign-up',
    intro: 'Brewing a collab for BrewAsia? Tell us who you’re brewing with, the beer, and how many kegs you can send. Not decided yet? Send what you know.',
    brewery: 'Your brewery',
    inVietnam: 'Our brewery is in Vietnam',
    contact: 'Who should we talk to?',
    name: 'Your name', phone: 'Phone / Zalo / WhatsApp', email: 'Email',
    partners: 'Brewing with',
    partnersHint: 'The other brewery or breweries. Leave empty if you don’t have a partner yet and want us to match you.',
    partner: 'Partner brewery', addPartner: '+ Add another partner', remove: 'Remove',
    beerTitle: 'The beer',
    beer: 'Beer name', beerPh: 'If named yet', style: 'Style', abv: 'ABV %',
    readyBy: 'Ready by',
    kegs: 'Kegs',
    kegsHint: 'Which event are the kegs for?',
    eventsTitle: 'The two collab events',
    trailName: 'Friday Ale Trail · Friday 30 October',
    trailText: 'An extended Ale Trail across Saigon. Everyone is invited and it’s pay as you go: buy a beer at each stop and collect a digital stamp. Collabs pour at trail bars, and extra venues can buy collab kegs at a good discounted rate.',
    festName: 'Halloween Collab Fest · Saturday 31 October at BigBamBoo',
    festText: 'Collab kegs on our taps, plus other breweries pouring. Bring your own setup, or donate kegs and we’ll put them on the main taps. Free for BrewAsia conference attendees; ticketed for the public.',
    beerRule: 'The beer doesn’t have to be brewed for the event, but we want something special, not your everyday beer: a collab, a Halloween theme, or a one-off.',
    deliverTitle: 'Send all kegs to BigBamBoo',
    deliverText: '10 An Phú, An Khánh, Thủ Đức (District 2), Ho Chi Minh City. Weekdays only, by Friday 23 October, so we can build the Ale Trail maps.',
    pourTitle: 'Halloween Collab Fest: how do you want to pour?',
    pours: { own_setup: 'We’ll bring our own setup', main_taps: 'We’ll donate kegs for your main taps', unsure: 'Not sure yet' } as Record<string, string>,
    event: 'Event', qty: 'How many kegs', size: 'Keg size (L)', tbd: 'Not sure yet',
    uses: { friday_ale_trail: 'Friday Ale Trail', halloween: 'Halloween Collab Fest', unassigned: 'Not sure yet' } as Record<Use, string>,
    addKegs: '+ Add kegs for another event',
    notes: 'Anything else?',
    submit: 'Send', saving: 'Sending…',
    thanks: 'Thank you!',
    gotIt: (b: string, p: string[]) => p.length ? `We’ve got the collab between ${b} and ${p.join(', ')}.` : `We’ve got ${b}’s collab. We’ll be in touch about a partner.`,
    ref: 'Reference',
    another: 'Send another collab',
    changeNote: 'To change anything, reply to our email or message BigBamBoo.',
    needBrewery: 'Please add your brewery name.',
    needContact: 'Please add your name and a phone number or email.',
    saveError: 'Something went wrong. Please try again.',
  },
  vi: {
    eyebrow: 'BrewAsia 2026 · Collab',
    title: 'Đăng ký collab',
    intro: 'Bạn đang nấu bia collab cho BrewAsia? Hãy cho chúng tôi biết bạn hợp tác với ai, loại bia, và số keg bạn có thể gửi. Chưa chốt? Cứ gửi những gì bạn biết.',
    brewery: 'Nhà máy bia của bạn',
    inVietnam: 'Nhà máy bia của chúng tôi ở Việt Nam',
    contact: 'Chúng tôi liên hệ với ai?',
    name: 'Tên của bạn', phone: 'Điện thoại / Zalo / WhatsApp', email: 'Email',
    partners: 'Hợp tác với',
    partnersHint: 'Nhà máy bia hợp tác cùng bạn. Để trống nếu chưa có đối tác và muốn chúng tôi kết nối.',
    partner: 'Nhà máy đối tác', addPartner: '+ Thêm đối tác', remove: 'Xoá',
    beerTitle: 'Loại bia',
    beer: 'Tên bia', beerPh: 'Nếu đã đặt tên', style: 'Dòng bia', abv: 'Độ cồn %',
    readyBy: 'Sẵn sàng trước ngày',
    kegs: 'Keg bia',
    kegsHint: 'Keg dành cho sự kiện nào?',
    eventsTitle: 'Hai sự kiện collab',
    trailName: 'Friday Ale Trail · Thứ Sáu 30/10',
    trailText: 'Ale Trail mở rộng khắp Sài Gòn. Mọi người đều được mời, trả tiền theo từng ly: mua một ly bia ở mỗi điểm và nhận một con dấu điện tử. Bia collab được phục vụ tại các quán trong trail, và các địa điểm khác có thể mua keg collab với giá ưu đãi.',
    festName: 'Halloween Collab Fest · Thứ Bảy 31/10 tại BigBamBoo',
    festText: 'Keg collab trên hệ thống vòi của chúng tôi, cùng các nhà máy bia khác. Bạn có thể mang hệ thống rót riêng, hoặc tài trợ keg để chúng tôi phục vụ trên vòi chính. Miễn phí cho khách tham dự hội nghị BrewAsia; khách thường mua vé.',
    beerRule: 'Bia không bắt buộc phải nấu riêng cho sự kiện, nhưng chúng tôi muốn điều đặc biệt, không phải bia thường ngày: bia collab, chủ đề Halloween, hoặc một mẻ đặc biệt.',
    deliverTitle: 'Gửi tất cả keg tới BigBamBoo',
    deliverText: '10 An Phú, An Khánh, Thủ Đức (Quận 2 cũ), TP. Hồ Chí Minh. Chỉ ngày thường, trước Thứ Sáu 23/10, để chúng tôi làm bản đồ Ale Trail.',
    pourTitle: 'Halloween Collab Fest: bạn muốn phục vụ thế nào?',
    pours: { own_setup: 'Chúng tôi mang hệ thống rót riêng', main_taps: 'Chúng tôi tài trợ keg cho vòi chính', unsure: 'Chưa rõ' } as Record<string, string>,
    event: 'Sự kiện', qty: 'Số lượng keg', size: 'Dung tích keg (L)', tbd: 'Chưa rõ',
    uses: { friday_ale_trail: 'Friday Ale Trail', halloween: 'Halloween Collab Fest', unassigned: 'Chưa rõ' } as Record<Use, string>,
    addKegs: '+ Thêm keg cho sự kiện khác',
    notes: 'Ghi chú thêm?',
    submit: 'Gửi', saving: 'Đang gửi…',
    thanks: 'Cảm ơn bạn!',
    gotIt: (b: string, p: string[]) => p.length ? `Chúng tôi đã nhận thông tin collab giữa ${b} và ${p.join(', ')}.` : `Chúng tôi đã nhận thông tin collab của ${b}. Chúng tôi sẽ liên hệ về đối tác.`,
    ref: 'Mã tham chiếu',
    another: 'Gửi collab khác',
    changeNote: 'Để thay đổi, vui lòng trả lời email hoặc nhắn tin cho BigBamBoo.',
    needBrewery: 'Vui lòng nhập tên nhà máy bia.',
    needContact: 'Vui lòng nhập tên và số điện thoại hoặc email.',
    saveError: 'Có lỗi xảy ra. Vui lòng thử lại.',
  },
}

let seq = 0
const nk = () => `k${++seq}`
const blankKeg = (prev?: KegLine): KegLine => ({ key: nk(), use: 'unassigned', qty: '', size_litres: prev?.size_litres || '' })

export default function CollabForm() {
  const [lang, setLang] = useState<Lang>('en')
  const t = T[lang]
  const [brewery, setBrewery] = useState('')
  const [inVietnam, setInVietnam] = useState(false)
  const [contact, setContact] = useState({ name: '', phone: '', email: '' })
  const [partners, setPartners] = useState<{ key: string; name: string }[]>([{ key: nk(), name: '' }])
  const [beer, setBeer] = useState({ name: '', style: '', abv: '', ready_by: '' })
  const [kegs, setKegs] = useState<KegLine[]>([blankKeg()])
  const [notes, setNotes] = useState('')
  const [pour, setPour] = useState('unsure')
  const [website, setWebsite] = useState('')
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState('')
  const [done, setDone] = useState<{ code: string | null; brewery: string; partners: string[] } | null>(null)

  useEffect(() => {
    try { const s = localStorage.getItem('brewasia_form_lang'); if (s === 'vi' || s === 'en') setLang(s) } catch { /* ignore */ }
  }, [])
  function pickLang(l: Lang) { setLang(l); try { localStorage.setItem('brewasia_form_lang', l) } catch { /* ignore */ } }

  const updateKeg = (key: string, patch: Partial<KegLine>) => setKegs(ks => ks.map(k => (k.key === key ? { ...k, ...patch } : k)))

  async function submit() {
    setError('')
    if (!brewery.trim()) return setError(t.needBrewery)
    if (!contact.name.trim() || (!contact.phone.trim() && !contact.email.trim())) return setError(t.needContact)
    setSaving(true)
    try {
      const r = await fetch('/api/public/collab-form', {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          brewery, in_vietnam: inVietnam, website,
          contact_name: contact.name, contact_phone: contact.phone, contact_email: contact.email,
          partners: partners.map(p => p.name),
          beer_name: beer.name, beer_style: beer.style, abv: beer.abv, ready_by: beer.ready_by,
          kegs: kegs.map(k => ({ use: k.use, qty: k.qty, size_litres: k.size_litres })),
          notes, fest_pour: kegs.some(k => k.use === 'halloween') ? pour : null,
        }),
      })
      const j = await r.json().catch(() => ({}))
      if (!r.ok || !j.ok) { setError(j.error === 'contact' ? t.needContact : j.error === 'brewery' ? t.needBrewery : t.saveError); return }
      setDone({ code: j.code, brewery: j.brewery || brewery.trim(), partners: j.partners || [] })
      window.scrollTo({ top: 0, behavior: 'smooth' })
    } catch { setError(t.saveError) } finally { setSaving(false) }
  }

  function reset() {
    setPartners([{ key: nk(), name: '' }]); setBeer({ name: '', style: '', abv: '', ready_by: '' })
    setKegs([blankKeg()]); setNotes(''); setDone(null)
  }

  return (
    <div className="donate-wrap">
      <div className="donate-top">
        <div className="donate-eyebrow">{t.eyebrow}</div>
        <div role="group" aria-label="Language" style={{ display: 'flex', gap: 4 }}>
          {(['en', 'vi'] as Lang[]).map(l => (
            <button key={l} onClick={() => pickLang(l)} aria-pressed={lang === l} className="donate-lang"
              style={{ borderColor: lang === l ? 'var(--accent)' : 'var(--border)', color: lang === l ? 'var(--accent)' : 'var(--text-muted)', background: lang === l ? 'var(--accent-light)' : 'transparent' }}>
              {l === 'en' ? 'EN' : 'VI'}
            </button>
          ))}
        </div>
      </div>

      <div className="page-title" style={{ fontSize: 40 }}>{t.title}</div>

      {done ? (
        <div className="card" style={{ padding: 22, marginTop: 10 }}>
          <div style={{ fontSize: 20, fontWeight: 700, color: 'var(--text)' }}>{t.thanks}</div>
          <p style={{ color: 'var(--text-secondary)', margin: '6px 0 12px', lineHeight: 1.55 }}>{t.gotIt(done.brewery, done.partners)}</p>
          {done.code && <div style={{ fontSize: 13, color: 'var(--text-muted)', marginBottom: 6 }}>{t.ref}: <b style={{ color: 'var(--text)' }}>{done.code}</b></div>}
          <p style={{ fontSize: 13, color: 'var(--text-secondary)', margin: '0 0 16px' }}>{t.changeNote}</p>
          <button className="btn-outline" onClick={reset}>{t.another}</button>
        </div>
      ) : (
        <>
          <p style={{ color: 'var(--text-secondary)', lineHeight: 1.6, margin: '0 0 18px', maxWidth: 600 }}>{t.intro}</p>

          <div className="donate-info">
            <div className="donate-info__title">{t.eventsTitle}</div>
            <div className="donate-info__grid">
              <div>
                <div className="donate-info__label" style={{ color: 'var(--dest-trail)' }}>{t.trailName}</div>
                <div className="donate-info__value" style={{ fontSize: 14 }}>{t.trailText}</div>
              </div>
              <div>
                <div className="donate-info__label" style={{ color: 'var(--dest-collab)' }}>{t.festName}</div>
                <div className="donate-info__value" style={{ fontSize: 14 }}>{t.festText}</div>
              </div>
            </div>
            <div className="donate-info__pass">
              <div className="donate-info__value" style={{ fontSize: 14 }}>{t.beerRule}</div>
            </div>
            <div className="donate-info__pass">
              <div className="donate-info__label">{t.deliverTitle}</div>
              <div className="donate-info__value" style={{ fontSize: 14 }}>{t.deliverText}</div>
            </div>
          </div>

          <div className="card" style={{ padding: 20, marginBottom: 14 }}>
            <Field label={t.brewery}>
              <input className="input" value={brewery} onChange={e => setBrewery(e.target.value)} autoComplete="organization" style={{ fontSize: 17, fontWeight: 600 }} />
            </Field>
            <label style={{ display: 'flex', gap: 8, alignItems: 'center', fontSize: 14, color: 'var(--text-secondary)', margin: '-4px 0 16px', cursor: 'pointer' }}>
              <input type="checkbox" checked={inVietnam} onChange={e => setInVietnam(e.target.checked)} style={{ width: 16, height: 16, accentColor: 'var(--accent)' }} />
              {t.inVietnam}
            </label>
            <input tabIndex={-1} autoComplete="off" aria-hidden="true" value={website} onChange={e => setWebsite(e.target.value)} name="website"
              style={{ position: 'absolute', left: '-10000px', width: 1, height: 1, opacity: 0 }} />
            <div className="section-title" style={{ marginBottom: 12 }}>{t.contact}</div>
            <div className="keg-grid-3">
              <Field label={t.name} last><input className="input" value={contact.name} onChange={e => setContact(c => ({ ...c, name: e.target.value }))} autoComplete="name" /></Field>
              <Field label={t.phone} last><input className="input" type="tel" value={contact.phone} onChange={e => setContact(c => ({ ...c, phone: e.target.value }))} autoComplete="tel" /></Field>
              <Field label={t.email} last><input className="input" type="email" value={contact.email} onChange={e => setContact(c => ({ ...c, email: e.target.value }))} autoComplete="email" /></Field>
            </div>
          </div>

          <div className="card" style={{ padding: 20, marginBottom: 14 }}>
            <div className="section-title" style={{ marginBottom: 6 }}>{t.partners}</div>
            <p style={{ fontSize: 13, color: 'var(--text-muted)', margin: '0 0 12px', lineHeight: 1.5 }}>{t.partnersHint}</p>
            <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
              {partners.map((p, i) => (
                <div key={p.key} style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
                  <span style={{ width: 14, textAlign: 'center', color: 'var(--text-muted)', flexShrink: 0 }}>×</span>
                  <input className="input" value={p.name} aria-label={`${t.partner} ${i + 1}`} placeholder={t.partner}
                    onChange={e => setPartners(ps => ps.map(x => (x.key === p.key ? { ...x, name: e.target.value } : x)))} />
                  {partners.length > 1 && <button className="keg-link" onClick={() => setPartners(ps => ps.filter(x => x.key !== p.key))} style={{ flexShrink: 0 }}>{t.remove}</button>}
                </div>
              ))}
              <button className="keg-add-line" onClick={() => setPartners(ps => [...ps, { key: nk(), name: '' }])}>{t.addPartner}</button>
            </div>
          </div>

          <div className="card" style={{ padding: 20, marginBottom: 14 }}>
            <div className="section-title" style={{ marginBottom: 12 }}>{t.beerTitle}</div>
            <div className="keg-grid-2">
              <Field label={t.beer}><input className="input" value={beer.name} placeholder={t.beerPh} onChange={e => setBeer(b => ({ ...b, name: e.target.value }))} /></Field>
              <Field label={t.style}><input className="input" value={beer.style} placeholder="IPA, Lager…" onChange={e => setBeer(b => ({ ...b, style: e.target.value }))} /></Field>
            </div>
            <div className="keg-grid-2">
              <Field label={t.abv} last><input className="input" inputMode="decimal" value={beer.abv} onChange={e => setBeer(b => ({ ...b, abv: e.target.value }))} /></Field>
              <Field label={t.readyBy} last><input className="input" type="date" value={beer.ready_by} onChange={e => setBeer(b => ({ ...b, ready_by: e.target.value }))} /></Field>
            </div>
          </div>

          <div className="card" style={{ padding: 20, marginBottom: 14 }}>
            <div className="section-title" style={{ marginBottom: 6 }}>{t.kegs}</div>
            <p style={{ fontSize: 13, color: 'var(--text-muted)', margin: '0 0 12px' }}>{t.kegsHint}</p>
            <datalist id="collab-form-sizes">{['20', '30', '50'].map(s => <option key={s} value={s} />)}</datalist>
            <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
              {kegs.map(k => (
                <div key={k.key} className="keg-line">
                  {kegs.length > 1 && (
                    <div style={{ display: 'flex', justifyContent: 'flex-end', marginBottom: 6 }}>
                      <button className="keg-link" onClick={() => setKegs(ks => ks.filter(x => x.key !== k.key))}>{t.remove}</button>
                    </div>
                  )}
                  <div className="keg-grid-3">
                    <Field label={t.event} last>
                      <select className="input" value={k.use} onChange={e => updateKeg(k.key, { use: e.target.value as Use })}>
                        {(['friday_ale_trail', 'halloween', 'unassigned'] as Use[]).map(u => <option key={u} value={u}>{t.uses[u]}</option>)}
                      </select>
                    </Field>
                    <Field label={t.qty} last><input className="input" inputMode="numeric" value={k.qty} placeholder={t.tbd} onChange={e => updateKeg(k.key, { qty: e.target.value.replace(/[^0-9]/g, '') })} /></Field>
                    <Field label={t.size} last><input className="input" inputMode="decimal" list="collab-form-sizes" value={k.size_litres} onChange={e => updateKeg(k.key, { size_litres: e.target.value })} /></Field>
                  </div>
                </div>
              ))}
              {kegs.length < 3 && <button className="keg-add-line" onClick={() => setKegs(ks => [...ks, blankKeg(ks[ks.length - 1])])}>{t.addKegs}</button>}
            </div>
            {kegs.some(k => k.use === 'halloween') && (
              <div style={{ marginTop: 16 }}>
                <Field label={t.pourTitle} last>
                  <select className="input" value={pour} onChange={e => setPour(e.target.value)} style={{ maxWidth: 360 }}>
                    {['own_setup', 'main_taps', 'unsure'].map(v => <option key={v} value={v}>{t.pours[v]}</option>)}
                  </select>
                </Field>
              </div>
            )}
            <div style={{ marginTop: 18 }}>
              <Field label={t.notes} last><textarea className="input" rows={3} value={notes} onChange={e => setNotes(e.target.value)} /></Field>
            </div>
          </div>

          {error && <div style={{ color: 'var(--badge-red-text)', fontSize: 14, marginBottom: 10 }}>{error}</div>}
          <button className="btn-accent" onClick={submit} disabled={saving} style={{ width: '100%', height: 48, fontSize: 16 }}>{saving ? t.saving : t.submit}</button>
        </>
      )}
    </div>
  )
}

function Field({ label, children, last }: { label: string; children: React.ReactNode; last?: boolean }) {
  return (
    <div style={{ marginBottom: last ? 0 : 14, minWidth: 0 }}>
      <label style={{ display: 'block', fontSize: 12, fontWeight: 600, color: 'var(--text-secondary)', marginBottom: 6 }}>{label}</label>
      {children}
    </div>
  )
}

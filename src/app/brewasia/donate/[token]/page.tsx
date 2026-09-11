'use client'
import { useEffect, useState } from 'react'

// Public form a brewery opens from its own link to tell BigBamBoo which kegs it is
// donating to the BrewAsia conference. EN / VI. Saves through /api/public/keg-form.

type Lang = 'en' | 'vi'
type Keg = {
  id: string; beer_name: string | null; beer_style: string | null; abv: number | null; size_litres: number | null
  coupler: string | null; qty: number; status: string; returnable: boolean; notes: string | null
}
type Line = { key: string; id?: string; beer_name: string; beer_style: string; abv: string; size_litres: string; coupler: string; qty: string }

const T = {
  en: {
    eyebrow: 'BrewAsia 2026 · Conference',
    title: 'Keg donation',
    intro: 'Thank you for donating beer to the BrewAsia conference. Tell us what you’re sending. You can come back to this link and change it until your kegs arrive at BigBamBoo.',
    contact: 'Who should we talk to?',
    name: 'Your name',
    phone: 'Phone / Zalo / WhatsApp',
    email: 'Email',
    kegs: 'Kegs',
    beer: 'Beer name',
    style: 'Style',
    abv: 'ABV %',
    size: 'Keg size (L)',
    coupler: 'Coupler',
    qty: 'How many kegs',
    addBeer: '+ Add another beer',
    remove: 'Remove',
    line: 'Beer',
    returnable: 'We need the empty kegs back after the event',
    notes: 'Anything else? (delivery date, pick-up, keg type)',
    submit: 'Send',
    update: 'Save changes',
    saving: 'Sending…',
    received: 'Already at BigBamBoo (can’t be changed here)',
    thanks: 'Thank you!',
    gotIt: (n: number, b: string) => `We’ve got ${n} ${n === 1 ? 'keg' : 'kegs'} from ${b} for the conference.`,
    change: 'Change something',
    badLink: 'This link isn’t valid. Ask BigBamBoo for a new one.',
    needContact: 'Please add your name and a phone number or email.',
    needBeer: 'Please add at least one beer.',
    saveError: 'Something went wrong. Please try again.',
    loading: 'Loading…',
    unsure: 'Not sure',
    total: (n: number, l: number) => `${n} ${n === 1 ? 'keg' : 'kegs'}${l ? ` · ${l} L` : ''}`,
    lastSaved: 'Last saved',
  },
  vi: {
    eyebrow: 'BrewAsia 2026 · Hội nghị',
    title: 'Tài trợ keg bia',
    intro: 'Cảm ơn bạn đã tài trợ bia cho hội nghị BrewAsia. Hãy cho chúng tôi biết bạn gửi những gì. Bạn có thể mở lại đường link này để chỉnh sửa cho đến khi keg được giao tới BigBamBoo.',
    contact: 'Chúng tôi liên hệ với ai?',
    name: 'Tên của bạn',
    phone: 'Điện thoại / Zalo / WhatsApp',
    email: 'Email',
    kegs: 'Keg bia',
    beer: 'Tên bia',
    style: 'Dòng bia',
    abv: 'Độ cồn %',
    size: 'Dung tích keg (L)',
    coupler: 'Loại đầu keg',
    qty: 'Số lượng keg',
    addBeer: '+ Thêm loại bia khác',
    remove: 'Xoá',
    line: 'Bia',
    returnable: 'Chúng tôi cần lấy lại keg rỗng sau sự kiện',
    notes: 'Ghi chú thêm? (ngày giao, lấy hàng, loại keg)',
    submit: 'Gửi',
    update: 'Lưu thay đổi',
    saving: 'Đang gửi…',
    received: 'Đã giao tới BigBamBoo (không thể sửa ở đây)',
    thanks: 'Cảm ơn bạn!',
    gotIt: (n: number, b: string) => `Chúng tôi đã nhận thông tin ${n} keg từ ${b} cho hội nghị.`,
    change: 'Chỉnh sửa',
    badLink: 'Đường link không hợp lệ. Vui lòng liên hệ BigBamBoo để nhận link mới.',
    needContact: 'Vui lòng nhập tên và số điện thoại hoặc email.',
    needBeer: 'Vui lòng thêm ít nhất một loại bia.',
    saveError: 'Có lỗi xảy ra. Vui lòng thử lại.',
    loading: 'Đang tải…',
    unsure: 'Không rõ',
    total: (n: number, l: number) => `${n} keg${l ? ` · ${l} L` : ''}`,
    lastSaved: 'Lưu lần cuối',
  },
}

let seq = 0
const blankLine = (prev?: Line): Line => ({ key: `l${++seq}`, beer_name: '', beer_style: '', abv: '', size_litres: prev?.size_litres || '', coupler: prev?.coupler || '', qty: '1' })
const toLine = (k: Keg): Line => ({
  key: `l${++seq}`, id: k.id, beer_name: k.beer_name || '', beer_style: k.beer_style || '',
  abv: k.abv == null ? '' : String(k.abv), size_litres: k.size_litres == null ? '' : String(k.size_litres),
  coupler: k.coupler || '', qty: String(k.qty || 1),
})
const stripPrefix = (n: string | null) => (n || '').replace(/^From brewery form:\s*/, '')

export default function DonatePage({ params }: { params: { token: string } }) {
  const [lang, setLang] = useState<Lang>('en')
  const t = T[lang]
  const [loading, setLoading] = useState(true)
  const [bad, setBad] = useState(false)
  const [brewery, setBrewery] = useState('')
  const [contact, setContact] = useState({ name: '', phone: '', email: '' })
  const [lines, setLines] = useState<Line[]>([blankLine()])
  const [locked, setLocked] = useState<Keg[]>([])
  const [returnable, setReturnable] = useState(false)
  const [notes, setNotes] = useState('')
  const [submittedAt, setSubmittedAt] = useState<string | null>(null)
  const [done, setDone] = useState(false)
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState('')

  useEffect(() => {
    try { const saved = localStorage.getItem('brewasia_form_lang'); if (saved === 'vi' || saved === 'en') setLang(saved) } catch { /* ignore */ }
    load()
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  function pickLang(l: Lang) { setLang(l); try { localStorage.setItem('brewasia_form_lang', l) } catch { /* ignore */ } }

  function apply(kegs: Keg[]) {
    const editable = kegs.filter(k => k.status === 'promised')
    setLocked(kegs.filter(k => k.status !== 'promised'))
    setLines(editable.length ? editable.map(toLine) : [blankLine()])
    if (kegs.length) {
      setReturnable(kegs.some(k => k.returnable))
      setNotes(stripPrefix(kegs.find(k => k.notes)?.notes || null))
    }
  }

  async function load() {
    setLoading(true)
    try {
      const r = await fetch(`/api/public/keg-form/${encodeURIComponent(params.token)}`, { cache: 'no-store' })
      const j = await r.json()
      if (!r.ok || !j.ok) { setBad(true); return }
      setBrewery(j.brewery.name)
      setContact({ name: j.brewery.contact_name || '', phone: j.brewery.contact_phone || '', email: j.brewery.contact_email || '' })
      setSubmittedAt(j.submitted_at)
      apply(j.kegs || [])
      if (j.submitted_at && (j.kegs || []).length) setDone(true)
    } catch { setBad(true) } finally { setLoading(false) }
  }

  const updateLine = (key: string, patch: Partial<Line>) => setLines(ls => ls.map(l => (l.key === key ? { ...l, ...patch } : l)))

  async function submit() {
    setError('')
    if (!contact.name.trim() || (!contact.phone.trim() && !contact.email.trim())) return setError(t.needContact)
    const filled = lines.filter(l => l.beer_name.trim())
    if (!filled.length) return setError(t.needBeer)
    setSaving(true)
    try {
      const r = await fetch(`/api/public/keg-form/${encodeURIComponent(params.token)}`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          contact_name: contact.name, contact_phone: contact.phone, contact_email: contact.email,
          returnable, notes,
          lines: filled.map(l => ({ id: l.id, beer_name: l.beer_name, beer_style: l.beer_style, abv: l.abv, size_litres: l.size_litres, coupler: l.coupler, qty: l.qty })),
        }),
      })
      const j = await r.json().catch(() => ({}))
      if (!r.ok || !j.ok) { setError(j.error === 'contact' ? t.needContact : j.error === 'lines' ? t.needBeer : t.saveError); return }
      apply(j.kegs || [])
      setSubmittedAt(new Date().toISOString())
      setDone(true)
      window.scrollTo({ top: 0, behavior: 'smooth' })
    } catch { setError(t.saveError) } finally { setSaving(false) }
  }

  const allKegs = [...locked, ...lines.filter(l => l.beer_name.trim()).map(l => ({ qty: Number(l.qty) || 1, size_litres: Number(l.size_litres) || 0, beer_name: l.beer_name, beer_style: l.beer_style, coupler: l.coupler }))]
  const totalKegs = allKegs.reduce((n, k) => n + (Number(k.qty) || 0), 0)
  const totalL = Math.round(allKegs.reduce((n, k) => n + (Number(k.qty) || 0) * (Number(k.size_litres) || 0), 0))

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

      {loading ? (
        <div className="card" style={{ padding: 28, color: 'var(--text-muted)' }}>{t.loading}</div>
      ) : bad ? (
        <div className="card" style={{ padding: 28 }}>
          <div className="page-title" style={{ fontSize: 30 }}>{t.title}</div>
          <p style={{ color: 'var(--text-secondary)', marginTop: 10 }}>{t.badLink}</p>
        </div>
      ) : (
        <>
          <div className="page-title" style={{ fontSize: 40 }}>{t.title}</div>
          <div style={{ fontSize: 22, fontWeight: 700, color: 'var(--text)', margin: '4px 0 10px' }}>{brewery}</div>

          {done ? (
            <div className="card" style={{ padding: 22 }}>
              <div style={{ fontSize: 20, fontWeight: 700, color: 'var(--text)' }}>{t.thanks}</div>
              <p style={{ color: 'var(--text-secondary)', margin: '6px 0 16px', lineHeight: 1.55 }}>{t.gotIt(totalKegs, brewery)}</p>
              <div style={{ display: 'flex', flexDirection: 'column', gap: 8, marginBottom: 16 }}>
                {allKegs.map((k, i) => (
                  <div key={i} className="donate-summary">
                    <b>{k.qty}×</b>
                    <span>{k.beer_name}{k.beer_style ? ` · ${k.beer_style}` : ''}</span>
                    <span style={{ marginLeft: 'auto', color: 'var(--text-muted)' }}>{k.size_litres ? `${k.size_litres} L` : ''}{k.coupler ? ` · ${k.coupler}` : ''}</span>
                  </div>
                ))}
              </div>
              {submittedAt && <div style={{ fontSize: 12, color: 'var(--text-muted)', marginBottom: 14 }}>{t.lastSaved}: {new Date(submittedAt).toLocaleString(lang === 'vi' ? 'vi-VN' : 'en-GB', { day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit' })}</div>}
              <button className="btn-outline" onClick={() => setDone(false)}>{t.change}</button>
            </div>
          ) : (
            <>
              <p style={{ color: 'var(--text-secondary)', lineHeight: 1.6, margin: '0 0 22px', maxWidth: 600 }}>{t.intro}</p>

              <div className="card" style={{ padding: 20, marginBottom: 14 }}>
                <div className="section-title" style={{ marginBottom: 12 }}>{t.contact}</div>
                <div className="keg-grid-3">
                  <Field label={t.name}><input className="input" value={contact.name} onChange={e => setContact(c => ({ ...c, name: e.target.value }))} autoComplete="name" /></Field>
                  <Field label={t.phone}><input className="input" type="tel" value={contact.phone} onChange={e => setContact(c => ({ ...c, phone: e.target.value }))} autoComplete="tel" /></Field>
                  <Field label={t.email}><input className="input" type="email" value={contact.email} onChange={e => setContact(c => ({ ...c, email: e.target.value }))} autoComplete="email" /></Field>
                </div>
              </div>

              <div className="card" style={{ padding: 20, marginBottom: 14 }}>
                <div className="section-title" style={{ marginBottom: 12, display: 'flex', justifyContent: 'space-between', gap: 10 }}>
                  <span>{t.kegs}</span>
                  {totalKegs > 0 && <span style={{ textTransform: 'none', letterSpacing: 0, color: 'var(--text-secondary)' }}>{t.total(totalKegs, totalL)}</span>}
                </div>

                {locked.length > 0 && (
                  <div style={{ marginBottom: 12 }}>
                    <div style={{ fontSize: 12, color: 'var(--text-muted)', marginBottom: 6 }}>{t.received}</div>
                    {locked.map(k => (
                      <div key={k.id} className="donate-summary" style={{ opacity: 0.75 }}>
                        <b>{k.qty}×</b><span>{k.beer_name}{k.beer_style ? ` · ${k.beer_style}` : ''}</span>
                        <span style={{ marginLeft: 'auto', color: 'var(--text-muted)' }}>{k.size_litres ? `${k.size_litres} L` : ''}</span>
                      </div>
                    ))}
                  </div>
                )}

                <datalist id="donate-sizes">{['20', '30', '50'].map(s => <option key={s} value={s} />)}</datalist>
                <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
                  {lines.map((l, i) => (
                    <div key={l.key} className="keg-line">
                      {lines.length > 1 && (
                        <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 10 }}>
                          <span style={{ fontSize: 12, fontWeight: 600, color: 'var(--text-muted)' }}>{t.line} {i + 1}</span>
                          <button className="keg-link" onClick={() => setLines(ls => ls.filter(x => x.key !== l.key))}>{t.remove}</button>
                        </div>
                      )}
                      <div className="keg-grid-2">
                        <Field label={t.beer}><input className="input" value={l.beer_name} onChange={e => updateLine(l.key, { beer_name: e.target.value })} /></Field>
                        <Field label={t.style}><input className="input" value={l.beer_style} onChange={e => updateLine(l.key, { beer_style: e.target.value })} placeholder="IPA, Lager…" /></Field>
                      </div>
                      <div className="keg-grid-4">
                        <Field label={t.abv}><input className="input" inputMode="decimal" value={l.abv} onChange={e => updateLine(l.key, { abv: e.target.value })} /></Field>
                        <Field label={t.size}><input className="input" inputMode="decimal" list="donate-sizes" value={l.size_litres} onChange={e => updateLine(l.key, { size_litres: e.target.value })} /></Field>
                        <Field label={t.coupler}>
                          <select className="input" value={l.coupler} onChange={e => updateLine(l.key, { coupler: e.target.value })}>
                            <option value="">{t.unsure}</option>
                            {['S', 'D', 'A', 'G', 'U'].map(c => <option key={c} value={c}>{c}</option>)}
                          </select>
                        </Field>
                        <Field label={t.qty}><input className="input" inputMode="numeric" value={l.qty} onChange={e => updateLine(l.key, { qty: e.target.value.replace(/[^0-9]/g, '') })} /></Field>
                      </div>
                    </div>
                  ))}
                  <button className="keg-add-line" onClick={() => setLines(ls => [...ls, blankLine(ls[ls.length - 1])])}>{t.addBeer}</button>
                </div>

                <label className="donate-check">
                  <input type="checkbox" checked={returnable} onChange={e => setReturnable(e.target.checked)} />
                  {t.returnable}
                </label>

                <Field label={t.notes} last>
                  <textarea className="input" rows={3} value={notes} onChange={e => setNotes(e.target.value)} />
                </Field>
              </div>

              {error && <div style={{ color: 'var(--badge-red-text)', fontSize: 14, marginBottom: 10 }}>{error}</div>}
              <button className="btn-accent" onClick={submit} disabled={saving} style={{ width: '100%', height: 48, fontSize: 16 }}>
                {saving ? t.saving : submittedAt ? t.update : t.submit}
              </button>
            </>
          )}
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

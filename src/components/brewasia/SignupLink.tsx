'use client'
import { useState } from 'react'

// The share box for a public BrewAsia form: the link, and the email text (EN + VI) that
// goes with it. The email text is shown and can be tweaked before copying; "Copy email
// text" copies whatever is in the box, link included.
export function SignupLink({ url, emailText, onRefresh }: { url: string; emailText: string; onRefresh?: () => void }) {
  const [copied, setCopied] = useState<string | null>(null)
  const [showText, setShowText] = useState(false)
  const [text, setText] = useState(emailText)

  async function copy(v: string, key: string) {
    try { await navigator.clipboard.writeText(v) } catch { /* clipboard blocked */ }
    setCopied(key)
    setTimeout(() => setCopied(c => (c === key ? null : c)), 1800)
  }

  return (
    <>
      <div className="donate-panel__invite">
        <input className="input" readOnly value={url} onFocus={e => e.currentTarget.select()} aria-label="Sign-up link" style={{ fontSize: 13 }} />
        <button className="btn-accent" onClick={() => copy(url, 'link')} style={{ whiteSpace: 'nowrap' }}>{copied === 'link' ? 'Copied' : 'Copy link'}</button>
        <button className="btn-outline" onClick={() => setShowText(s => !s)} aria-expanded={showText} style={{ whiteSpace: 'nowrap', fontSize: 13 }}>{showText ? 'Hide email text' : 'Email text'}</button>
        <a className="btn-outline" href={url} target="_blank" rel="noreferrer" style={{ fontSize: 13, textDecoration: 'none' }}>Open form</a>
        {onRefresh && <button className="btn-outline" onClick={onRefresh} style={{ fontSize: 13 }}>Refresh</button>}
      </div>
      {showText && (
        <div style={{ marginTop: 10 }}>
          <div style={{ fontSize: 12, color: 'var(--text-muted)', marginBottom: 6 }}>Paste this into your email or Zalo. The link is already in it. Change anything you like before copying.</div>
          <textarea className="input" rows={12} value={text} onChange={e => setText(e.target.value)} style={{ fontSize: 13, lineHeight: 1.55, fontFamily: 'inherit', width: '100%', resize: 'vertical' }} />
          <div style={{ display: 'flex', gap: 8, marginTop: 8 }}>
            <button className="btn-accent" onClick={() => copy(text, 'text')}>{copied === 'text' ? 'Copied' : 'Copy email text'}</button>
            {text !== emailText && <button className="btn-outline" onClick={() => setText(emailText)} style={{ fontSize: 13 }}>Reset</button>}
          </div>
        </div>
      )}
    </>
  )
}

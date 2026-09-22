// Until 31 October 2026, Brew Asia (brewasia.madesmpl.com) is the single source of truth
// for BrewAsia collabs, kegs and producers. These dashboard pages stay viewable here,
// but every write is switched off and points at the Brew Asia admin instead.
// Flip READ_ONLY back to false after the event to hand editing back to BigBamBoo.
export const READ_ONLY = true

export const BREWASIA_ADMIN = 'https://brewasia.madesmpl.com/admin'
export const READ_ONLY_MSG = 'Edit this in the Brew Asia admin.'

export function BrewAsiaNotice({ page }: { page: 'collabs' | 'kegs' | 'producers' }) {
  if (!READ_ONLY) return null
  const href = `${BREWASIA_ADMIN}/${page}`
  return (
    <div
      role="status"
      className="card"
      style={{ padding: '12px 16px', marginBottom: 18, borderLeft: '4px solid var(--accent)', fontSize: 13.5, lineHeight: 1.55, color: 'var(--text)' }}
    >
      BrewAsia collabs, kegs and producers now live in the Brew Asia admin until 31 October. Edit them there:{' '}
      <a href={href} target="_blank" rel="noreferrer" style={{ color: 'var(--accent)', fontWeight: 600 }}>{href.replace('https://', '')}</a>
      <div style={{ color: 'var(--text-muted)', fontSize: 12.5, marginTop: 2 }}>This page is view-only. Filters and Export CSV still work.</div>
    </div>
  )
}

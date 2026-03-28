'use client'

export default function ScanPage() {
  return (
    <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', minHeight: 400 }}>
      <div style={{ fontFamily: 'Bebas Neue', fontSize: 32, letterSpacing: '0.04em', color: 'var(--text)', marginBottom: 8 }}>Door Scanner</div>
      <div style={{ fontSize: 15, color: 'var(--text-muted)', marginTop: 8, textAlign: 'center', maxWidth: 400 }}>
        Use the dedicated door check-in page for QR scanning and guest check-in at events.
      </div>
      <a href="/door" target="_blank" rel="noopener noreferrer" className="btn-accent" style={{ marginTop: 24, fontSize: 14, textDecoration: 'none', display: 'inline-block', padding: '12px 28px' }}>
        Open Door Scanner
      </a>
      <div style={{ marginTop: 16, fontSize: 13, color: 'var(--text-muted)' }}>
        Opens in a new tab — optimized for mobile devices
      </div>
    </div>
  )
}

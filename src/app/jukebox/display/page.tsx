// ═══════════════════════════════════════════════════════════════
//  /jukebox/display?token=... — Kiosk view (server component)
//  Token is checked server-side against jukebox_settings.display_token.
//  The polling list is in DisplayClient (client component).
// ═══════════════════════════════════════════════════════════════

import { notFound } from 'next/navigation'
import { getServiceClient } from '@/lib/supabase'
import { getJukeboxVenueId } from '@/lib/jukebox/venue'
import { qrImageUrl } from '@/lib/jukebox/qr'
import { copy } from '@/lib/jukebox/copy'
import DisplayClient from './DisplayClient'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

export default async function DisplayPage({
  searchParams,
}: { searchParams: { token?: string } }) {
  const token = (searchParams.token || '').trim()
  if (!token || token.length < 8) notFound()

  const venueId = await getJukeboxVenueId()
  const sb = getServiceClient()
  const { data: settings } = await sb
    .from('jukebox_settings')
    .select('display_token, is_active, mode')
    .eq('venue_id', venueId)
    .maybeSingle()

  if (!settings || settings.display_token !== token) notFound()

  // Build the absolute URL for the QR.
  // - If APP_BASE_URL is the subdomain (jukebox.bigbamboo.app), point at the root —
  //   the host-based rewrite in next.config.js maps / → /jukebox.
  // - Otherwise, point at /jukebox so admin-domain hits still land correctly.
  const base = process.env.APP_BASE_URL?.replace(/\/$/, '') || ''
  const isSubdomain = /^https?:\/\/jukebox\./i.test(base)
  const guestUrl = base ? (isSubdomain ? base : `${base}/jukebox`) : '/jukebox'
  const qr = qrImageUrl(guestUrl, { size: 480, dark: '111111', light: 'ffffff' })

  return (
    <div style={pageWrap}>
      <header style={{ textAlign: 'center', marginBottom: 24 }}>
        <div style={kicker}>{copy.brand.title.toUpperCase()}</div>
        <div style={tagline}>{copy.brand.tagline}</div>
      </header>

      <section style={twoCol}>
        <div className="card" style={leftCard}>
          <div className="section-title" style={{ marginBottom: 16 }}>UP NEXT</div>
          <DisplayClient />
        </div>

        <div className="card" style={rightCard}>
          <div style={{ fontSize: 14, color: 'var(--text-muted)', textTransform: 'uppercase', letterSpacing: '0.08em', marginBottom: 16, textAlign: 'center' }}>
            Scan to request a song
          </div>
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img src={qr} alt="QR code" width={480} height={480} style={{ width: '100%', height: 'auto', display: 'block', borderRadius: 12 }} />
          <div style={{ marginTop: 12, fontSize: 13, fontFamily: 'monospace', color: 'var(--text-muted)', textAlign: 'center', wordBreak: 'break-all' }}>
            {guestUrl}
          </div>
          <div style={{ marginTop: 18, fontSize: 13, color: 'var(--text-secondary)', textAlign: 'center', lineHeight: 1.6 }}>
            <div>{copy.rules.cooldownLine}</div>
            <div>{copy.rules.staffLine}</div>
            <div>{copy.rules.rewardsLine}</div>
          </div>
        </div>
      </section>

      {!settings.is_active && (
        <div style={pausedBanner}>{copy.guest.requestsPaused}</div>
      )}
      {settings.is_active && settings.mode === 'locked' && (
        <div style={pausedBanner}>{copy.guest.requestsLocked}</div>
      )}
    </div>
  )
}

const pageWrap: React.CSSProperties = {
  padding: '36px 36px 24px',
  minHeight: '100vh',
  background: 'var(--bg)',
  color: 'var(--text)',
}
const kicker: React.CSSProperties = {
  fontSize: 14, fontWeight: 700, letterSpacing: '0.2em',
  color: 'var(--accent)', marginBottom: 8,
}
const tagline: React.CSSProperties = {
  fontFamily: 'Bebas Neue, sans-serif', fontSize: 56,
  letterSpacing: '0.04em', color: 'var(--text)', lineHeight: 1.05,
}
const twoCol: React.CSSProperties = {
  display: 'grid',
  gridTemplateColumns: 'minmax(0, 2fr) minmax(0, 1fr)',
  gap: 24,
  alignItems: 'start',
}
const leftCard: React.CSSProperties = { padding: 24, minHeight: 600 }
const rightCard: React.CSSProperties = { padding: 24, position: 'sticky', top: 24 }
const pausedBanner: React.CSSProperties = {
  position: 'fixed', bottom: 24, left: '50%', transform: 'translateX(-50%)',
  background: 'var(--badge-orange-bg)', border: '1px solid var(--badge-orange-border)',
  color: 'var(--badge-orange-text)',
  padding: '14px 28px', borderRadius: 12, fontSize: 16, fontWeight: 600,
  letterSpacing: '0.04em',
}

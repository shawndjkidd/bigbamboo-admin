// ═══════════════════════════════════════════════════════════════
//  /jukebox/display?token=... — Kiosk view (server component)
//  Theme-aware tropical/tiki design. Today the styles read from
//  --theme-* CSS variables that alias BigBamBoo's brand palette.
//  In Phase 1 (multi-tenant) the same CSS variables get injected
//  per-venue from venue_themes — this code does not change.
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
    .select('display_token, is_active, mode, curated_mode_enabled, curated_playlist_name')
    .eq('venue_id', venueId)
    .maybeSingle()

  if (!settings || settings.display_token !== token) notFound()

  // Build the absolute URL for the QR.
  const base = process.env.APP_BASE_URL?.replace(/\/$/, '') || ''
  const isSubdomain = /^https?:\/\/jukebox\./i.test(base)
  const guestUrl = base ? (isSubdomain ? base : `${base}/jukebox`) : '/jukebox'
  const qr = qrImageUrl(guestUrl, { size: 480, dark: '2c1810', light: 'fff8e7' })

  return (
    <div style={pageWrap}>
      <header className="kiosk-header">
        <div className="kiosk-header-brand">
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img
            src="https://bigbamboo.app/images/bbb-img-5.png"
            alt="BigBamBoo"
            className="kiosk-header-logo"
          />
          <div className="kiosk-header-wordmark">JUKEBOX</div>
        </div>
        {settings.curated_mode_enabled && settings.curated_playlist_name && (
          <div className="kiosk-tonight-pill">
            TONIGHT ·{' '}
            <span className="kiosk-tonight-pill-name">{settings.curated_playlist_name}</span>
          </div>
        )}
      </header>

      <section className="kiosk-twocol" style={twoCol}>
        <div className="jukebox-cabinet" style={leftCabinet}>
          <DisplayClient guestUrl={guestUrl} />
        </div>

        <div className="jukebox-cabinet" style={rightCabinet}>
          <div className="kiosk-scan-block">
            <div className="kiosk-scan-label">Scan to request a song</div>
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img src={qr} alt="QR code" className="kiosk-qr" />
            <div className="kiosk-qr-url">{guestUrl}</div>
          </div>

          <div id="kiosk-just-played-mount" />
          <div id="kiosk-counter-mount" />
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

// Page sized to fit a 1080p TV viewport without scrolling.
// Heights are capped via flex; the queue list inside DisplayClient
// scrolls internally if it exceeds available vertical space.
const pageWrap: React.CSSProperties = {
  padding: '14px 24px 18px',
  height: '100vh',
  color: 'var(--theme-text)',
  display: 'flex',
  flexDirection: 'column',
  gap: 12,
  overflow: 'hidden',
}
const twoCol: React.CSSProperties = {
  display: 'grid',
  gridTemplateColumns: 'minmax(0, 1.7fr) minmax(0, 1fr)',
  gap: 22,
  alignItems: 'stretch',
  flex: 1,
  minHeight: 0,
}
const leftCabinet: React.CSSProperties = {
  padding: 16,
  display: 'flex',
  flexDirection: 'column',
  gap: 12,
  minHeight: 0,
  overflow: 'hidden',
}
const rightCabinet: React.CSSProperties = {
  padding: 16,
  display: 'flex',
  flexDirection: 'column',
  gap: 14,
}
const pausedBanner: React.CSSProperties = {
  position: 'fixed', bottom: 18, left: '50%', transform: 'translateX(-50%)',
  background: 'var(--theme-coral)', color: 'var(--theme-text)',
  border: '2px solid var(--bbb-wood)',
  padding: '10px 26px', borderRadius: 100, fontSize: 16,
  fontFamily: 'var(--theme-display-font)', letterSpacing: '0.04em',
  boxShadow: '0 4px 0 var(--bbb-wood), 0 10px 22px rgba(0,0,0,0.45)',
  zIndex: 50,
}

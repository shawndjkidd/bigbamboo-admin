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

  // Build the absolute URL for the QR. Size 600 for crisp rendering at TV scale.
  const base = process.env.APP_BASE_URL?.replace(/\/$/, '') || ''
  const isSubdomain = /^https?:\/\/jukebox\./i.test(base)
  const guestUrl = base ? (isSubdomain ? base : `${base}/jukebox`) : '/jukebox'
  const qr = qrImageUrl(guestUrl, { size: 600, dark: '2c1810', light: 'fff8e7' })

  return (
    <div className="kiosk-page" style={pageWrap}>
      <header className="kiosk-header" style={{ flexShrink: 0 }}>
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

      <DisplayClient qr={qr} guestUrl={guestUrl} />

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
  padding: '12px 20px 14px',
  height: '100vh',
  boxSizing: 'border-box',
  color: 'var(--theme-text)',
  display: 'grid',
  gridTemplateRows: 'auto 1fr',
  gap: 10,
  overflow: 'hidden',
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

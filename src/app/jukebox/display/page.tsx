// ═══════════════════════════════════════════════════════════════
//  /jukebox/display?token=... — Kiosk view (server component)
//  Tropical/tiki design matching the guest page.
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
    .select('display_token, is_active, mode, curated_mode_enabled, curated_playlist_name')
    .eq('venue_id', venueId)
    .maybeSingle()

  if (!settings || settings.display_token !== token) notFound()

  // Build the absolute URL for the QR (point at jukebox.bigbamboo.app/ if env hint set).
  const base = process.env.APP_BASE_URL?.replace(/\/$/, '') || ''
  const isSubdomain = /^https?:\/\/jukebox\./i.test(base)
  const guestUrl = base ? (isSubdomain ? base : `${base}/jukebox`) : '/jukebox'
  const qr = qrImageUrl(guestUrl, { size: 600, dark: '2c1810', light: 'fff8e7' })

  return (
    <div style={pageWrap}>
      <header style={headerWrap}>
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img
          src="https://bigbamboo.app/images/bbb-img-5.png"
          alt="BigBamBoo"
          className="bbb-logo"
          style={{ maxWidth: 240 }}
        />
        <div className="jukebox-wordmark" style={{ fontSize: 64, marginTop: -40 }}>JUKEBOX</div>
        <div className="jukebox-tagline" style={{ fontSize: 22 }}>
          Scan. <span className="jukebox-tagline-accent">Pick a song.</span>{' '}
          Don&apos;t kill the vibe.
        </div>
      </header>

      <section style={twoCol}>
        <div className="jukebox-cabinet" style={leftCabinet}>
          <DisplayClient />
        </div>

        <div className="jukebox-cabinet" style={rightCabinet}>
          <div style={{
            fontFamily: 'Sigmar, sans-serif', fontSize: 14, color: 'var(--bbb-wood)',
            textAlign: 'center', letterSpacing: '0.14em', textTransform: 'uppercase',
            marginBottom: 10,
          }}>
            Scan to request a song
          </div>
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img
            src={qr}
            alt="QR code"
            style={{
              width: '100%', maxWidth: 320, height: 'auto', display: 'block',
              margin: '0 auto',
              borderRadius: 10, border: '3px solid var(--bbb-wood)',
              background: 'var(--bbb-cream-light)',
            }}
          />
          <div style={{
            marginTop: 10, fontSize: 11, fontFamily: 'monospace',
            color: 'var(--bbb-wood)', textAlign: 'center', wordBreak: 'break-all',
          }}>
            {guestUrl}
          </div>

          {settings.curated_mode_enabled && settings.curated_playlist_name && (
            <div style={{
              marginTop: 10, padding: '6px 10px', textAlign: 'center',
              background: 'rgba(232,118,42,0.15)',
              border: '1px solid rgba(232,118,42,0.4)', borderRadius: 8,
              fontFamily: 'Sigmar, sans-serif', fontSize: 12, letterSpacing: '0.08em',
              color: 'var(--bbb-wood-dark)',
            }}>
              TONIGHT: <span style={{ color: 'var(--bbb-coral)' }}>{settings.curated_playlist_name}</span>
            </div>
          )}
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

// Page is sized to fit a 1080p TV viewport without scrolling.
// Heights are capped via flex; the queue list inside DisplayClient
// scrolls internally if it exceeds available vertical space.
const pageWrap: React.CSSProperties = {
  padding: '14px 28px 18px',
  height: '100vh',
  color: 'var(--bbb-cream-light)',
  display: 'flex',
  flexDirection: 'column',
  overflow: 'hidden',
}
const headerWrap: React.CSSProperties = {
  textAlign: 'center',
  padding: '4px 0 8px',
  flexShrink: 0,
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
  minHeight: 0,
  overflow: 'hidden',
}
const rightCabinet: React.CSSProperties = {
  padding: 16,
  display: 'flex',
  flexDirection: 'column',
}
const pausedBanner: React.CSSProperties = {
  position: 'fixed', bottom: 18, left: '50%', transform: 'translateX(-50%)',
  background: 'var(--bbb-coral)', color: 'var(--bbb-cream-light)',
  border: '2px solid var(--bbb-wood)',
  padding: '10px 26px', borderRadius: 100, fontSize: 16,
  fontFamily: 'Sigmar, sans-serif', letterSpacing: '0.04em',
  boxShadow: '0 4px 0 var(--bbb-wood), 0 10px 22px rgba(0,0,0,0.45)',
}

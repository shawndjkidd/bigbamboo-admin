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

  const base = process.env.APP_BASE_URL?.replace(/\/$/, '') || ''
  const isSubdomain = /^https?:\/\/jukebox\./i.test(base)
  const guestUrl = base ? (isSubdomain ? base : `${base}/jukebox`) : '/jukebox'
  const qr = qrImageUrl(guestUrl, { size: 600, dark: '2c1810', light: 'f4e8d0' })

  return (
    <div className="jukebox-root display-page">
      <header className="display-header">
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img
          className="bbb-logo"
          src="https://bigbamboo.app/images/bbb-img-5.png"
          alt="BIG BAM BOO"
          style={{ maxWidth: 320, marginBottom: 0 }}
        />
        <div className="jukebox-wordmark" style={{ marginTop: '-48px', textAlign: 'center' }}>
          JUKEBOX
        </div>
      </header>

      <section className="display-two-col">
        <div className="card" style={{ padding: 24, minHeight: 600 }}>
          <DisplayClient />
        </div>

        <div className="card" style={{ padding: 24, position: 'sticky', top: 24 }}>
          <div style={{
            fontFamily: 'Sigmar, sans-serif',
            fontSize: 13, letterSpacing: '0.18em', textTransform: 'uppercase',
            color: 'var(--bbb-wood-light)', textAlign: 'center', marginBottom: 14,
          }}>
            Scan to request a song
          </div>
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img
            src={qr}
            alt="QR code"
            width={600}
            height={600}
            style={{ width: '100%', height: 'auto', display: 'block', borderRadius: 12, border: '3px solid var(--bbb-wood)' }}
          />
          <div style={{ marginTop: 10, fontSize: 13, fontFamily: 'monospace', color: 'var(--bbb-wood-light)', textAlign: 'center', wordBreak: 'break-all' }}>
            {guestUrl}
          </div>
          <div className="jukebox-rules" style={{ color: 'var(--bbb-wood)', textShadow: 'none', marginTop: 16 }}>
            <div>{copy.rules.cooldownLine}</div>
            <div>{copy.rules.staffLine}</div>
            <div>{copy.rules.rewardsLine}</div>
          </div>
        </div>
      </section>

      {!settings.is_active && (
        <div className="display-paused-banner">{copy.guest.requestsPaused}</div>
      )}
      {settings.is_active && settings.mode === 'locked' && (
        <div className="display-paused-banner">{copy.guest.requestsLocked}</div>
      )}
    </div>
  )
}

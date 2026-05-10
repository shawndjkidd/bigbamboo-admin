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

  // Extra fields — graceful fallback if columns don't exist yet (pre-migration).
  let wifiNetwork: string | null = null
  let wifiPassword: string | null = null
  let logoUrl: string | null = null
  const { data: extraRow, error: extraErr } = await sb
    .from('jukebox_settings')
    .select('wifi_network, wifi_password, logo_url')
    .eq('venue_id', venueId)
    .maybeSingle()
  if (!extraErr && extraRow) {
    const r = extraRow as { wifi_network?: string | null; wifi_password?: string | null; logo_url?: string | null }
    wifiNetwork = r.wifi_network ?? null
    wifiPassword = r.wifi_password ?? null
    logoUrl = r.logo_url ?? null
  }

  const base = process.env.APP_BASE_URL?.replace(/\/$/, '') || ''
  const isSubdomain = /^https?:\/\/jukebox\./i.test(base)
  const guestUrl = base ? (isSubdomain ? base : `${base}/jukebox`) : '/jukebox'
  const qr = qrImageUrl(guestUrl, { size: 600, dark: '2c1810', light: 'fff8e7' })

  return (
    <div style={pageWrap}>
      <DisplayClient
        qr={qr}
        guestUrl={guestUrl}
        wifiNetwork={wifiNetwork}
        wifiPassword={wifiPassword}
        logoUrl={logoUrl}
      />

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
  height: '100vh',
  overflow: 'hidden',
  background: 'transparent',
  boxSizing: 'border-box',
  padding: '10px',
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

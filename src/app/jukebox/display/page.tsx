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

  // Wifi fields — graceful fallback if columns don't exist yet (pre-migration)
  let wifiNetwork: string | null = null
  let wifiPassword: string | null = null
  try {
    const { data: wifiRow } = await sb
      .from('jukebox_settings')
      .select('wifi_network, wifi_password')
      .eq('venue_id', venueId)
      .maybeSingle()
    wifiNetwork = (wifiRow as { wifi_network?: string | null })?.wifi_network ?? null
    wifiPassword = (wifiRow as { wifi_password?: string | null })?.wifi_password ?? null
  } catch { /* columns not migrated yet — show nothing */ }

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
  background: 'linear-gradient(135deg, #2a5a4f 0%, #1f4338 100%)',
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

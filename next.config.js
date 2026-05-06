/** @type {import('next').NextConfig} */
const nextConfig = {
  images: {
    remotePatterns: [
      { protocol: 'https', hostname: 'images.unsplash.com' },
      { protocol: 'https', hostname: 'bigbamboo.app' },
      { protocol: 'https', hostname: '*.supabase.co' },
      // Spotify track artwork
      { protocol: 'https', hostname: 'i.scdn.co' },
      { protocol: 'https', hostname: 'mosaic.scdn.co' },
      // QR code service
      { protocol: 'https', hostname: 'api.qrserver.com' },
    ],
  },

  // Host-based rewrites so jukebox.bigbamboo.app gets clean short URLs
  // while admin.bigbamboo.app keeps the full /jukebox/* paths.
  async rewrites() {
    const jukeHost = { type: 'host', value: 'jukebox.bigbamboo.app' }
    return [
      // Root → guest jukebox page
      {
        source: '/',
        has: [jukeHost],
        destination: '/jukebox',
      },
      // /admin → staff admin
      {
        source: '/admin',
        has: [jukeHost],
        destination: '/jukebox/admin',
      },
      {
        source: '/admin/:path*',
        has: [jukeHost],
        destination: '/jukebox/admin/:path*',
      },
      // /display → kiosk
      {
        source: '/display',
        has: [jukeHost],
        destination: '/jukebox/display',
      },
      // Keep the API surface usable from the subdomain too — same paths,
      // since the routes are already namespaced under /api/jukebox/*.
    ]
  },
}

module.exports = nextConfig

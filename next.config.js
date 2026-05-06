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
    return {
      beforeFiles: [
        {
          source: '/',
          has: [jukeHost],
          destination: '/jukebox',
        },
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
        {
          source: '/display',
          has: [jukeHost],
          destination: '/jukebox/display',
        },
      ],
    }
  },
}

module.exports = nextConfig

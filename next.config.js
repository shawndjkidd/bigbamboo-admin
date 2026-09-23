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

  // The BrewAsia brewery forms have moved to Brew Asia (madesmpl) for good. The old form
  // code stays in the repo; these just send every old link (private edit tokens too,
  // which were imported) to the matching Brew Asia form.
  async redirects() {
    const BA = 'https://brewasia.madesmpl.com'
    return [
      { source: '/brewasia/collab', destination: `${BA}/forms/collab`, permanent: true },
      { source: '/brewasia/donate', destination: `${BA}/forms/kegs`, permanent: true },
      { source: '/brewasia/donate/:token', destination: `${BA}/forms/kegs/:token`, permanent: true },
      // The Collab Fest page lives on Brew Asia now. The old page is still in this
      // repo but nothing reaches it: one page, so it cannot drift out of date.
      // /collabfest is here too because that short link has been shared.
      { source: '/brewasia/collabfest', destination: `${BA}/collabfest`, permanent: true },
      { source: '/collabfest', destination: `${BA}/collabfest`, permanent: true },
    ]
  },

  // Host-based rewrites so jukebox.bigbamboo.app gets clean short URLs
  // while admin.bigbamboo.app keeps the full /jukebox/* paths.
  async rewrites() {
    const jukeHost = { type: 'host', value: 'jukebox.bigbamboo.app' }
    // bigbamboo.app is the public website; the dashboard stays on admin.bigbamboo.app.
    const siteHosts = [{ type: 'host', value: 'bigbamboo.app' }, { type: 'host', value: 'www.bigbamboo.app' }]
    return {
      beforeFiles: [
        ...siteHosts.map(h => ({ source: '/', has: [h], destination: '/site' })),
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

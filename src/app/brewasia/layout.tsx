import type { Metadata } from 'next'

// Public BrewAsia pages (brewery forms). No admin chrome, not indexed.
export const metadata: Metadata = {
  title: 'BrewAsia 2026 · Keg donation',
  robots: { index: false, follow: false },
}

export default function BrewAsiaPublicLayout({ children }: { children: React.ReactNode }) {
  return <>{children}</>
}

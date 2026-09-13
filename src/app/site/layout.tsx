import { Sigmar, DM_Sans, DM_Mono } from 'next/font/google'

// The old Hostinger page pulled Sigmar, DM Sans and DM Mono off the Google Fonts CDN
// (plus Black Han Sans and Dela Gothic One for Korean and Japanese, which are gone, and a
// 68KB base64 'MonoCubic' @font-face that was declared once and never used). These three
// are the ones that actually did the work, now self-hosted through next/font so the page
// isn't waiting on a third party.
//
// Only Sigmar has a Vietnamese subset; DM Sans and DM Mono stop at latin-ext. The stacks
// in globals.css name Vietnamese-capable fallbacks after them so the VI copy still reads.

const sigmar = Sigmar({
  weight: '400',
  subsets: ['latin', 'latin-ext', 'vietnamese'],
  variable: '--font-sigmar',
  display: 'swap',
})

const dmSans = DM_Sans({
  subsets: ['latin', 'latin-ext'],
  variable: '--font-dm-sans',
  display: 'swap',
})

const dmMono = DM_Mono({
  weight: ['400', '500'],
  subsets: ['latin', 'latin-ext'],
  variable: '--font-dm-mono',
  display: 'swap',
})

export default function SiteLayout({ children }: { children: React.ReactNode }) {
  return <div className={`${sigmar.variable} ${dmSans.variable} ${dmMono.variable}`}>{children}</div>
}

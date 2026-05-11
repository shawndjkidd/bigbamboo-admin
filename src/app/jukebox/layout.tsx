// ═══════════════════════════════════════════════════════════════
//  Jukebox layout — loads jukebox-scoped styles, fonts, and a
//  wrapper class that scopes the design tokens. No dashboard
//  chrome (sidebar etc.) — these routes are guest-facing.
// ═══════════════════════════════════════════════════════════════

import './jukebox.css'

export const metadata = {
  title: 'VibeQueue · BigBamBoo',
  description: "Scan. Pick a song. Don't kill the vibe.",
}

export default function JukeboxLayout({ children }: { children: React.ReactNode }) {
  return (
    <>
      <link
        rel="stylesheet"
        href="https://fonts.googleapis.com/css2?family=DM+Sans:wght@400;500;600;700&family=Bebas+Neue&family=Sigmar&family=JetBrains+Mono:wght@400;500&family=Inter:ital,wght@0,400;0,500;0,600;0,700;1,400;1,500&display=swap"
      />
      <div className="jukebox-root">{children}</div>
    </>
  )
}

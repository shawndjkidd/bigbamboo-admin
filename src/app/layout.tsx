import type { Metadata } from 'next'
import './globals.css'

export const metadata: Metadata = {
  title: 'BigBamBoo Admin',
    description: 'BigBamBoo Dashboard',
    }

    export default function RootLayout({ children }: { children: React.ReactNode }) {
      return (
          <html lang="en" suppressHydrationWarning>
                <head>
                        <link href="https://fonts.googleapis.com/css2?family=DM+Sans:wght@400;500;600;700&family=Bebas+Neue&family=DM+Mono:wght@400;500&display=swap" rel="stylesheet" />
                                <script dangerouslySetInnerHTML={{ __html: `
                                          (function() {
                                                      var t = localStorage.getItem('theme');
                                                                  if (!t) t = window.matchMedia('(prefers-color-scheme: dark)').matches ? 'dark' : 'light';
                                                                              document.documentElement.setAttribute('data-theme', t);
                                                                                        })();
                                                                                                `}} />
                                                                                                      </head>
                                                                                                            <body>{children}</body>
                                                                                                                </html>
                                                                                                                  )
                                                                                                                  }
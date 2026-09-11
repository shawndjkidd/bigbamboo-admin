import type { Metadata } from 'next'
import CollabForm from './CollabForm'

export const metadata: Metadata = { title: 'BrewAsia 2026 · Collab sign-up', robots: { index: false, follow: false } }

// One shared link for every brewery: /brewasia/collab
export default function CollabSignupPage() {
  return <CollabForm />
}

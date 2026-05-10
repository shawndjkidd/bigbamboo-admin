import { createBrowserClient } from '@supabase/ssr'
import { createClient } from '@supabase/supabase-js'

// Trim env values defensively — Vercel's UI sometimes saves trailing newlines
// when secrets are pasted, and Supabase JS builds URLs by string concat which
// silently breaks read paths when the URL has a trailing \n.
const SUPABASE_URL = (process.env.NEXT_PUBLIC_SUPABASE_URL || '').trim()
const SUPABASE_ANON_KEY = (process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY || '').trim()
const SUPABASE_SERVICE_ROLE_KEY = (process.env.SUPABASE_SERVICE_ROLE_KEY || '').trim()

export const supabase = createBrowserClient(SUPABASE_URL, SUPABASE_ANON_KEY)

// Server-side only — uses service role key, bypasses RLS. Never call from client components.
// cache: 'no-store' on every request prevents Next.js from serving stale Supabase reads
// from the fetch cache (observed in Vercel logs as "Using cache hodqpckslglxuyhitlgh...").
export function getServiceClient() {
  return createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY, {
    auth: { persistSession: false, autoRefreshToken: false },
    global: {
      fetch: (input, init) => fetch(input, { ...init, cache: 'no-store' }),
    },
  })
}

export type Role = 'super_admin' | 'manager' | 'scanner'

export interface StaffUser {
  id: string
  email: string
  name: string
  role: Role
  active: boolean
}

export interface MenuItem {
  id: string
  section: string
  name: string
  subtitle?: string
  description?: string
  price: string
  abv?: string
  tags: string[]
  is_draft: boolean
  is_available: boolean
  sort_order: number
  price_glass?: string
  price_bottle?: string
  price_small?: string
  price_large?: string
  description_vi?: string
  description_ko?: string
  description_ja?: string
  brand?: string
}

export interface Event {
  id: string
  title: string
  type: string
  description?: string
  event_date?: string
  start_time?: string
  end_time?: string
  facebook_link?: string
  is_free: boolean
  is_published: boolean
}

export interface SiteSetting {
  key: string
  value: string
}

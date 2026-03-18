import { createBrowserClient } from '@supabase/ssr'

export const supabase = createBrowserClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!
)

export type Role = 'super_admin' | 'manager'

export interface StaffUser {
  id: string
  email: string
  name: string
  role: Role
  active: boolean
}

export interface MenuItem {
  id: string
  section: 'cocktails' | 'beer' | 'na' | 'bites'
  name: string
  subtitle?: string
  description?: string
  price: string
  abv?: string
  tags: string[]
  is_draft: boolean
  is_available: boolean
  sort_order: number
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

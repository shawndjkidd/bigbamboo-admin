// Shapes the homepage works with, mapped from Supabase in page.tsx so the client
// component never has to know what the columns are called.

export type SiteMenuItem = {
  id: string
  section: string
  name: string
  name_vi: string | null
  subtitle: string | null
  description: string
  description_vi: string | null
  price: string
  price_glass: string
  price_bottle: string
  price_small: string
  price_large: string
  abv: string
  tags: string[]
  brand: string
  is_draft: boolean
}

export type SiteEvent = {
  id: string
  title: string
  title_vi: string | null
  type: string
  description: string
  description_vi: string | null
  date: string
  start_time: string | null
  end_time: string | null
  facebook_link: string
  is_free: boolean
  ticket_price: number | null
}

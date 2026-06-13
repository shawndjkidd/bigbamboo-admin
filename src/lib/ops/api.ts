// ════════════════════════════════════════════════════════════
//   ops module — shared client helpers
// ════════════════════════════════════════════════════════════
// Why a wrapper:
//   • all ops tables live in the `ops` Postgres schema, so every
//     query needs `.schema('ops')` — wrap once, never forget.
//   • centralizes role checks for client-side gating (server-side
//     RLS is enforced in the migration regardless).
// ════════════════════════════════════════════════════════════
import { supabase } from '@/lib/supabase'

export const ops = () => supabase.schema('ops')

export const ROLES_THAT_SEE_OPS = ['super_admin', 'admin', 'manager', 'staff'] as const
export const ROLES_THAT_SEE_DASHBOARD = ['super_admin', 'admin', 'manager'] as const
export const ROLES_THAT_MANAGE_RECIPES = ['super_admin', 'admin', 'manager'] as const
export const ROLES_THAT_LOCK_PERIODS = ['super_admin'] as const

export type StaffRole = 'super_admin' | 'admin' | 'manager' | 'staff' | 'scanner' | 'kitchen' | 'cashier'

export const canSeeDashboard = (role: StaffRole) =>
  (ROLES_THAT_SEE_DASHBOARD as readonly string[]).includes(role)

export const canManageRecipes = (role: StaffRole) =>
  (ROLES_THAT_MANAGE_RECIPES as readonly string[]).includes(role)

export const canLockPeriods = (role: StaffRole) =>
  (ROLES_THAT_LOCK_PERIODS as readonly string[]).includes(role)

// VND formatter — used everywhere in ops
export const vnd = (n: number | null | undefined) => {
  if (n == null) return '—'
  return new Intl.NumberFormat('vi-VN').format(Math.round(n)) + ' ₫'
}

export const pct = (n: number | null | undefined, decimals = 1) => {
  if (n == null) return '—'
  return (n * 100).toFixed(decimals) + '%'
}

// HCMC-local date strings
export const today = () => {
  const d = new Date()
  const tz = new Intl.DateTimeFormat('en-CA', { timeZone: 'Asia/Ho_Chi_Minh', year: 'numeric', month: '2-digit', day: '2-digit' })
  return tz.format(d) // YYYY-MM-DD
}

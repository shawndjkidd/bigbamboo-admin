// The dashboard inbox.
//
// Every public form writes one row to inbox_items so nothing arrives silently. The row is
// a pointer, not a copy — ref_table / ref_id name the real record — so the tab that owns
// that record stays the single source of truth and the inbox can never show a stale
// version of it. Nothing emails anyone; the dashboard is the inbox.

export type InboxKind = 'keg_signup' | 'collab_signup' | 'club_signup' | 'ticket_order'
export type InboxStatus = 'new' | 'read' | 'done'

// Which tab owns each kind of record, and what to call it on screen. Shared by the
// Overview list and the sidebar dots so they can never disagree about where a thing goes.
export const KINDS: Record<InboxKind, { label: string; href: string }> = {
  keg_signup:    { label: 'Keg sign-ups',    href: '/dashboard/kegs' },
  collab_signup: { label: 'Collab sign-ups', href: '/dashboard/collabs' },
  club_signup:   { label: 'Drinks Club',     href: '/dashboard/club' },
  ticket_order:  { label: 'Ticket orders',   href: '/dashboard/tickets' },
}

export const KIND_ORDER: InboxKind[] = ['keg_signup', 'collab_signup', 'ticket_order', 'club_signup']

export function kindLabel(kind: string): string {
  return (KINDS as Record<string, { label: string }>)[kind]?.label || kind.replace(/_/g, ' ')
}
export function kindHref(kind: string): string | null {
  return (KINDS as Record<string, { href: string }>)[kind]?.href || null
}

export type InboxItem = {
  id: string
  created_at: string
  kind: string
  title: string
  summary: string | null
  ref_table: string | null
  ref_id: string | null
  status: string
}

type Svc = { from: (t: string) => any }

// Fire-and-forget. A sign-up is worth more than its notification: if this throws, the
// visitor's record is already saved and the form should still say yes. The failure is
// logged loudly so a silently empty inbox is diagnosable.
export async function addInboxItem(
  svc: Svc,
  item: { kind: InboxKind; title: string; summary?: string | null; ref_table?: string | null; ref_id?: string | null },
): Promise<void> {
  try {
    const { error } = await svc.from('inbox_items').insert({
      kind: item.kind,
      title: item.title.slice(0, 200),
      summary: item.summary ? item.summary.slice(0, 500) : null,
      ref_table: item.ref_table || null,
      ref_id: item.ref_id ? String(item.ref_id) : null,
    })
    if (error) console.warn('[inbox] could not record %s: %s', item.kind, error.message)
  } catch (e) {
    console.warn('[inbox] could not record %s: %s', item.kind, (e as Error)?.message)
  }
}

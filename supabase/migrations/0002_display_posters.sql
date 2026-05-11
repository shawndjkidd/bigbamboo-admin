-- ═══════════════════════════════════════════════════════════════════════
--  Migration 0002 — Display Posters
--  Stores venue-uploaded event posters for the kiosk bottom-right panel.
--  Run in Supabase SQL editor or via `supabase db push`.
-- ═══════════════════════════════════════════════════════════════════════

create table if not exists jukebox_display_posters (
  id           uuid        primary key default gen_random_uuid(),
  venue_id     text        not null,
  storage_path text        not null,
  public_url   text        not null,
  position     integer     not null default 0,
  is_active    boolean     not null default true,
  created_at   timestamptz not null default now()
);

create index if not exists idx_jdp_venue_pos
  on jukebox_display_posters (venue_id, position);

alter table jukebox_display_posters enable row level security;

drop policy if exists "Service role full access" on jukebox_display_posters;
create policy "Service role full access" on jukebox_display_posters
  for all using (true) with check (true);

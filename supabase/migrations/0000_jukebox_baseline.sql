-- ═══════════════════════════════════════════════════════════════════════
--  BigBamBoo Jukebox — Baseline Schema (migration 0000)
--  Reverse-engineered from the live Supabase project on 2026-05-08.
--  Apply on a fresh DB to reproduce the current production schema.
--
--  Place at:  bigbamboo-admin/supabase/migrations/0000_jukebox_baseline.sql
--
--  This is the canonical schema. If production drifts from this in the
--  future, fix production. All later migrations should be additive and
--  numbered 0001+.
--
--  Notes on what is NOT in this file (because it wasn't visible from the
--  schema queries we ran):
--    - Foreign-key constraints from jukebox_* tables to jukebox_settings
--      via venue_id.  None appear to exist today.  Intentional: keeping
--      venue_id un-FK'd matches the extraction-ready philosophy (the
--      jukebox stays portable to projects that don't have this exact
--      settings table).  Don't add FKs unless you have a reason.
--    - Triggers for updated_at maintenance.  Standard pattern; included
--      below as `set_updated_at()` + per-table triggers.  If production
--      already has different triggers, drop these and let prod's win.
-- ═══════════════════════════════════════════════════════════════════════

create extension if not exists "pgcrypto";

-- ── jukebox_settings ────────────────────────────────────────────────────
create table if not exists jukebox_settings (
  id                              uuid        primary key default gen_random_uuid(),
  venue_id                        text        not null default 'bigbamboo',
  is_active                       boolean     not null default true,
  mode                            text        not null default 'approval'
                                              check (mode in ('approval','open','locked','event','autopilot')),
  guest_cooldown_minutes          integer     not null default 20,
  member_cooldown_minutes         integer     not null default 10,
  max_song_length_seconds         integer     not null default 420,
  duplicate_cooldown_minutes      integer     not null default 90,
  same_artist_cooldown_minutes    integer     not null default 10,
  allow_explicit                  boolean     not null default true,
  provider                        text        not null default 'spotify',
  auto_add_to_provider            boolean     not null default false,
  max_queue_length                integer     not null default 50,
  pending_request_ttl_minutes     integer     not null default 240,
  display_token                   text        not null default encode(gen_random_bytes(16), 'hex'),
  timezone                        text        not null default 'Asia/Ho_Chi_Minh',
  curated_mode_enabled            boolean     not null default false,
  curated_playlist_url            text,
  curated_playlist_id             text,
  curated_playlist_name           text,
  curated_playlist_owner          text,
  curated_playlist_image_url      text,
  curated_playlist_track_count    integer     not null default 0,
  curated_playlist_synced_at      timestamptz,
  curated_playlist_error          text,
  created_at                      timestamptz not null default now(),
  updated_at                      timestamptz not null default now(),
  unique (venue_id)
);

create index if not exists idx_jukebox_settings_venue
  on jukebox_settings (venue_id);

-- ── jukebox_requests ────────────────────────────────────────────────────
create table if not exists jukebox_requests (
  id                       uuid        primary key default gen_random_uuid(),
  venue_id                 text        not null default 'bigbamboo',
  provider                 text        not null default 'spotify',
  provider_track_id        text        not null,
  spotify_track_id         text,
  track_name               text        not null,
  track_name_normalized    text        not null,
  artist_name              text        not null,
  artist_name_normalized   text        not null,
  artist_ids               jsonb       not null default '[]'::jsonb,
  album_name               text,
  album_art_url            text,
  duration_ms              integer     not null,
  explicit                 boolean     not null default false,
  requested_by             text        not null,
  requested_by_hidden      boolean     not null default false,
  device_id                text        not null,
  ip_hash                  text,
  user_id                  uuid,  -- intentionally NO FK; portability per Section 7.5 of brief
  status                   text        not null default 'pending'
                                       check (status in (
                                         'pending','approved','rejected','queued',
                                         'played','skipped','removed','failed','expired'
                                       )),
  queue_position           integer,
  rejection_reason         text,
  provider_queue_status    text,
  provider_error           text,
  created_at               timestamptz not null default now(),
  approved_at              timestamptz,
  queued_at                timestamptz,
  played_at                timestamptz,
  skipped_at               timestamptz,
  removed_at               timestamptz
);

create index if not exists idx_jr_venue_status
  on jukebox_requests (venue_id, status);
create index if not exists idx_jr_venue_created
  on jukebox_requests (venue_id, created_at desc);
create index if not exists idx_jr_device_created
  on jukebox_requests (device_id, created_at desc);
create index if not exists idx_jr_iphash_created
  on jukebox_requests (ip_hash, created_at desc);
create index if not exists idx_jr_user_created
  on jukebox_requests (user_id, created_at desc);
create index if not exists idx_jr_track_norm
  on jukebox_requests (venue_id, track_name_normalized, artist_name_normalized);

-- ── jukebox_blocklist ───────────────────────────────────────────────────
create table if not exists jukebox_blocklist (
  id           uuid        primary key default gen_random_uuid(),
  venue_id     text        not null default 'bigbamboo',
  type         text        not null check (type in ('track','artist')),
  provider     text        not null default 'spotify',
  provider_id  text        not null,
  spotify_id   text,
  name         text        not null,
  reason       text,
  created_by   uuid,
  created_at   timestamptz not null default now(),
  unique (venue_id, type, provider, provider_id)
);

create index if not exists idx_jb_venue
  on jukebox_blocklist (venue_id);

-- ── jukebox_devices ─────────────────────────────────────────────────────
create table if not exists jukebox_devices (
  id                uuid        primary key default gen_random_uuid(),
  venue_id          text        not null default 'bigbamboo',
  device_id         text        not null,
  ip_hash           text,
  last_request_at   timestamptz,
  request_count     integer     not null default 0,
  created_at        timestamptz not null default now(),
  updated_at        timestamptz not null default now(),
  unique (venue_id, device_id)
);

-- ── jukebox_curated_tracks ─────────────────────────────────────────────
create table if not exists jukebox_curated_tracks (
  id                       uuid        primary key default gen_random_uuid(),
  venue_id                 text        not null,
  provider                 text        not null default 'spotify',
  provider_track_id        text        not null,
  spotify_track_id         text,
  track_name               text        not null,
  track_name_normalized    text        not null,
  artist_name              text        not null,
  artist_name_normalized   text        not null,
  artist_ids               jsonb       not null default '[]'::jsonb,
  album_name               text,
  album_art_url            text,
  duration_ms              integer     not null,
  explicit                 boolean     not null default false,
  position                 integer     not null default 0,
  created_at               timestamptz not null default now(),
  unique (venue_id, provider, provider_track_id)
);

create index if not exists idx_jct_venue_track
  on jukebox_curated_tracks (venue_id, provider_track_id);
create index if not exists idx_jct_venue_norm
  on jukebox_curated_tracks (venue_id, track_name_normalized, artist_name_normalized);
create index if not exists idx_jct_venue_position
  on jukebox_curated_tracks (venue_id, position);

-- ── jukebox_playlist_presets ────────────────────────────────────────────
create table if not exists jukebox_playlist_presets (
  id                      uuid        primary key default gen_random_uuid(),
  venue_id                text        not null,
  name                    text        not null,
  playlist_url            text        not null,
  playlist_id             text        not null,
  playlist_name           text,
  playlist_owner          text,
  playlist_image_url      text,
  playlist_track_count    integer     not null default 0,
  last_synced_at          timestamptz,
  sort_order              integer     not null default 0,
  created_at              timestamptz not null default now(),
  updated_at              timestamptz not null default now(),
  unique (venue_id, playlist_id)
);

create index if not exists idx_jpp_venue
  on jukebox_playlist_presets (venue_id, sort_order);

-- ── jukebox_provider_auth ──────────────────────────────────────────────
-- Stores the venue admin's Spotify OAuth tokens (Phase 2). Tokens are
-- encrypted in the application layer using JUKEBOX_TOKEN_KEY (AES-256-GCM)
-- before insert. Never logged in plaintext.
create table if not exists jukebox_provider_auth (
  id                       uuid        primary key default gen_random_uuid(),
  venue_id                 text        not null default 'bigbamboo',
  provider                 text        not null default 'spotify',
  access_token_encrypted   text,
  refresh_token_encrypted  text,
  token_expires_at         timestamptz,
  provider_user_id         text,
  provider_display_name    text,
  scopes                   text,
  is_connected             boolean     not null default false,
  created_at               timestamptz not null default now(),
  updated_at               timestamptz not null default now(),
  unique (venue_id, provider)
);

-- ── Public-safe views ──────────────────────────────────────────────────
-- Read paths for guests / kiosk. Service role bypasses RLS via the
-- application; these views exist to make the safe projection explicit
-- and portable (e.g. if you ever expose a read-only anon role).

create or replace view jukebox_public_queue as
  select
    id,
    venue_id,
    track_name,
    artist_name,
    album_name,
    album_art_url,
    duration_ms,
    case
      when requested_by_hidden then 'anonymous jungle friend'::text
      else requested_by
    end as requested_by,
    status,
    approved_at,
    queued_at,
    created_at
  from jukebox_requests
  where status in ('approved','queued');

create or replace view jukebox_public_settings as
  select
    venue_id,
    is_active,
    mode,
    guest_cooldown_minutes,
    member_cooldown_minutes,
    max_song_length_seconds,
    allow_explicit,
    max_queue_length,
    curated_mode_enabled,
    curated_playlist_name,
    curated_playlist_track_count,
    curated_playlist_image_url,
    curated_playlist_synced_at
  from jukebox_settings;

-- ── RLS ────────────────────────────────────────────────────────────────
-- Production policy is "service role only".  All writes happen server-side
-- in Next.js API routes via getServiceClient().  Anon role gets nothing on
-- tables — guests read via the views, which are queried by the service role.

alter table jukebox_settings          enable row level security;
alter table jukebox_requests          enable row level security;
alter table jukebox_blocklist         enable row level security;
alter table jukebox_devices           enable row level security;
alter table jukebox_curated_tracks    enable row level security;
alter table jukebox_playlist_presets  enable row level security;
alter table jukebox_provider_auth     enable row level security;

do $$
declare
  t text;
begin
  foreach t in array array[
    'jukebox_settings','jukebox_requests','jukebox_blocklist',
    'jukebox_devices','jukebox_curated_tracks','jukebox_playlist_presets',
    'jukebox_provider_auth'
  ] loop
    execute format('drop policy if exists "Service role full access" on %I', t);
    execute format(
      'create policy "Service role full access" on %I for all using (true) with check (true)',
      t
    );
  end loop;
end$$;

-- ── Triggers: keep updated_at fresh ────────────────────────────────────
create or replace function set_updated_at()
returns trigger
language plpgsql
as $$
begin
  new.updated_at := now();
  return new;
end;
$$;

do $$
declare
  t text;
begin
  foreach t in array array[
    'jukebox_settings','jukebox_devices','jukebox_playlist_presets',
    'jukebox_provider_auth'
  ] loop
    execute format('drop trigger if exists trg_%I_updated_at on %I', t, t);
    execute format(
      'create trigger trg_%I_updated_at before update on %I
       for each row execute function set_updated_at()',
      t, t
    );
  end loop;
end$$;

-- ── Seed: default venue ────────────────────────────────────────────────
insert into jukebox_settings (venue_id, mode)
values ('bigbamboo', 'approval')
on conflict (venue_id) do nothing;

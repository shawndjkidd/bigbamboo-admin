-- Drinks Club sign-ups + the dashboard inbox.
--
-- Both tables were created by hand in the Supabase SQL editor on 13 September 2026.
-- This file is written to match what is actually there, and is idempotent, so running it
-- again is a no-op and a fresh environment gets the same shape.

-- ── club_signups ────────────────────────────────────────────────────────────────
--
-- Deliberately NOT the `customers` / `loyalty_memberships` tables. Those hold people we
-- have actually served and stamped; this holds unverified contact details typed into a
-- box on a website. Keeping marketing capture out of the loyalty data means a bad address
-- here can never corrupt someone's stamp count, and it keeps the promise on the page
-- ("we'll only message you about the Drinks Club") easy to honour — one table to export,
-- one table to delete from.
create table if not exists public.club_signups (
  id         uuid primary key default gen_random_uuid(),
  created_at timestamptz not null default now(),
  email      text not null,
  zalo       text,
  name       text,
  source     text not null default 'homepage',
  lang       text not null default 'en'
);

-- One row per address. The API route treats a duplicate as success, because from the
-- visitor's side being on the list twice and being on it once are the same outcome.
create unique index if not exists club_signups_email_key
  on public.club_signups (lower(email));

-- ── inbox_items ─────────────────────────────────────────────────────────────────
--
-- One row per thing a member of the public sent us, from any form. The row is a pointer,
-- not a copy: ref_table / ref_id name the real record, so the dashboard tab that owns it
-- stays the single source of truth and nothing here can drift out of date.
--
-- Nothing emails anyone. The dashboard is the inbox.
create table if not exists public.inbox_items (
  id         uuid primary key default gen_random_uuid(),
  created_at timestamptz not null default now(),
  kind       text not null,
  title      text not null,
  summary    text,
  ref_table  text,
  ref_id     text,
  status     text not null default 'new'
);

create index if not exists inbox_items_status_idx on public.inbox_items (status, created_at desc);

-- ── RLS ─────────────────────────────────────────────────────────────────────────
--
-- Nobody reaches either table with the anon key. Writes come from /api/public/*, which
-- uses the service role and bypasses RLS entirely; reads come from the dashboard, where
-- the browser client carries a staff session. Without the policies below the dashboard
-- lists would come back empty, which looks exactly like "nobody has been in touch".
alter table public.club_signups enable row level security;
alter table public.inbox_items  enable row level security;

drop policy if exists club_signups_staff on public.club_signups;
create policy club_signups_staff on public.club_signups
  for all to authenticated
  using (exists (select 1 from public.staff_users su where su.email = auth.jwt() ->> 'email' and su.active))
  with check (exists (select 1 from public.staff_users su where su.email = auth.jwt() ->> 'email' and su.active));

drop policy if exists inbox_items_staff on public.inbox_items;
create policy inbox_items_staff on public.inbox_items
  for all to authenticated
  using (exists (select 1 from public.staff_users su where su.email = auth.jwt() ->> 'email' and su.active))
  with check (exists (select 1 from public.staff_users su where su.email = auth.jwt() ->> 'email' and su.active));

comment on table public.club_signups is
  'Drinks Club capture from the public site. Not customers — see this migration.';
comment on table public.inbox_items is
  'Pointers to things the public sent us, from any form. ref_table/ref_id name the real record.';

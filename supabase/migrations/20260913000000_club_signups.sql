-- Drinks Club sign-ups from the public homepage (bigbamboo.app).
--
-- Deliberately NOT the `customers` / `loyalty_memberships` tables. Those hold people we
-- have actually served and stamped; this holds unverified email addresses typed into a
-- box on a website. Keeping marketing capture out of the loyalty data means a bad address
-- here can never corrupt someone's stamp count, and it keeps the promise on the page
-- ("no spam, ever") easy to honour — one table to export, one table to delete from.
--
-- When the stamp card is real, the flow is: read a row here, and create the customer
-- deliberately. Nothing in this table is a customer yet.

create table if not exists public.club_signups (
  id          uuid primary key default gen_random_uuid(),
  email       text        not null,
  created_at  timestamptz not null default now(),
  -- Where it came from, so a second capture point later is distinguishable.
  source      text        not null default 'homepage',
  -- Which language the page was in. Worth knowing before anyone writes to this list.
  lang        text        not null default 'en',
  -- Set when the address becomes a real customer, so the list can be worked through
  -- without a separate "done" list.
  converted_at timestamptz,
  notes       text
);

-- One row per address. The API route upserts on this, so somebody signing up twice
-- updates their row instead of collecting duplicates.
create unique index if not exists club_signups_email_key
  on public.club_signups (lower(email));

create index if not exists club_signups_created_at_idx
  on public.club_signups (created_at desc);

comment on table public.club_signups is
  'Drinks Club email capture from the public site. Not customers — see 20260913000000_club_signups.sql.';

-- RLS: nobody reaches this table with the anon key.
--
-- Writes come from /api/public/club-signup, which uses the service role and so bypasses
-- RLS entirely. Reads come from the dashboard, where the browser client carries a staff
-- session. Without the select policy below the dashboard list would silently come back
-- empty, which looks exactly like "no one has signed up".
alter table public.club_signups enable row level security;

drop policy if exists club_signups_staff_read on public.club_signups;
create policy club_signups_staff_read
  on public.club_signups
  for select
  to authenticated
  using (
    exists (
      select 1 from public.staff_users su
      where su.email = auth.jwt() ->> 'email'
        and su.active
    )
  );

drop policy if exists club_signups_staff_write on public.club_signups;
create policy club_signups_staff_write
  on public.club_signups
  for update
  to authenticated
  using (
    exists (
      select 1 from public.staff_users su
      where su.email = auth.jwt() ->> 'email'
        and su.active
    )
  );

drop policy if exists club_signups_staff_delete on public.club_signups;
create policy club_signups_staff_delete
  on public.club_signups
  for delete
  to authenticated
  using (
    exists (
      select 1 from public.staff_users su
      where su.email = auth.jwt() ->> 'email'
        and su.active
    )
  );

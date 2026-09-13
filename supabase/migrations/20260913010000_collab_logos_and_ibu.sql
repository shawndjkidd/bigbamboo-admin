-- Collab Fest tap cards: IBU on the collab, logo on the brewery.
--
-- The card is a fight bill — two breweries billed against each other, the beer in a red
-- band, stats along the bottom. It already renders IBU and logos the moment the data
-- exists, so this migration and the form that fills it are the whole job.

-- IBU belongs to the beer, so it lives on the collab.
alter table public.brewasia_collabs add column if not exists ibu numeric;

-- The logo belongs to the brewery, not to any one collab: a brewery uploads once and
-- every collab it appears in picks the logo up. A two-brewery collab therefore collects
-- two logos, one per named partner, rather than one image belonging to the pairing.
alter table public.brewasia_producers add column if not exists logo_url text;

comment on column public.brewasia_collabs.ibu is 'Bitterness, shown on the Fest tap card next to ABV.';
comment on column public.brewasia_producers.logo_url is 'Public URL in the producer-logos bucket. Shown above the brewery name on the Fest card.';

-- ── Storage ─────────────────────────────────────────────────────────────────────
--
-- A public-read bucket. Uploads never come from the browser: the public collab form
-- posts its files to /api/public/producer-logo, which validates the actual bytes (not the
-- declared content type), caps the size, and names the file itself. So there is no insert
-- policy for anon here — the service role bypasses RLS and is the only writer.
insert into storage.buckets (id, name, public)
values ('producer-logos', 'producer-logos', true)
on conflict (id) do update set public = true;

-- Anyone can read a logo; that is the point of it being on a public page.
drop policy if exists "producer-logos public read" on storage.objects;
create policy "producer-logos public read"
  on storage.objects for select
  to public
  using (bucket_id = 'producer-logos');

-- Staff can replace or remove a logo from the Producers page when a brewery uploads
-- something wrong.
drop policy if exists "producer-logos staff write" on storage.objects;
create policy "producer-logos staff write"
  on storage.objects for all
  to authenticated
  using (
    bucket_id = 'producer-logos'
    and exists (select 1 from public.staff_users su where su.email = auth.jwt() ->> 'email' and su.active)
  )
  with check (
    bucket_id = 'producer-logos'
    and exists (select 1 from public.staff_users su where su.email = auth.jwt() ->> 'email' and su.active)
  );

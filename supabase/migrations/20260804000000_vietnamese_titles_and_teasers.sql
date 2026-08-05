-- Vietnamese counterparts for anything a promoter reads on bigbamboo.app/pitch.
-- All nullable: a blank _vi field falls back to the English one in the UI,
-- so translations can be filled in gradually without anything rendering empty.

alter table public.events
  add column if not exists title_vi  text,
  add column if not exists teaser_vi text;

alter table public.venue_availability
  add column if not exists label_vi  text,
  add column if not exists teaser_vi text;

comment on column public.events.title_vi     is 'Vietnamese event title. Falls back to title when null.';
comment on column public.events.teaser_vi    is 'Vietnamese teaser, max 15 words. Falls back to teaser when null.';
comment on column public.venue_availability.label_vi  is 'Vietnamese label. Falls back to label when null.';
comment on column public.venue_availability.teaser_vi is 'Vietnamese teaser, max 15 words. Falls back to teaser when null.';

-- Rebuilt (not replaced) because adding a column mid-list renames existing view columns.
drop view if exists public.calendar_availability;

create view public.calendar_availability
with (security_invoker = off) as
  select
    e.event_date as date,
    'booked'::text as status,
    e.title       as label,
    e.title_vi    as label_vi,
    true          as show_label,
    e.teaser,
    e.teaser_vi
  from public.events e
  where e.is_published = true
    and e.event_date >= current_date
    and e.event_date <= (current_date + '6 mons'::interval)
union all
  select
    v.date,
    v.status,
    case when v.is_public then v.label     else null end as label,
    case when v.is_public then v.label_vi  else null end as label_vi,
    v.is_public as show_label,
    case when v.is_public then v.teaser    else null end as teaser,
    case when v.is_public then v.teaser_vi else null end as teaser_vi
  from public.venue_availability v
  where v.date >= current_date
    and v.date <= (current_date + '6 mons'::interval);

grant select on public.calendar_availability to anon, authenticated;

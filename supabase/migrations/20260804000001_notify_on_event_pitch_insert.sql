-- Fires notify-pitch-zalo whenever a pitch lands.
--
-- pg_net installs into schema `net`, NOT `extensions` — calling
-- extensions.net.http_post silently throws and the handler below swallows it,
-- which looks exactly like "working but quiet". If notifications ever go dead,
-- check:  select * from net._http_response order by created desc;

create extension if not exists pg_net with schema extensions;

create or replace function public.notify_new_event_pitch()
returns trigger
language plpgsql
security definer
set search_path = net, public
as $$
declare
  req_id bigint;
begin
  -- Fire and forget: pg_net queues the request, so a slow or failing
  -- notification can never block or roll back the pitch itself.
  select net.http_post(
    url     := 'https://hodqpckslglxuyhitlgh.supabase.co/functions/v1/notify-pitch-zalo',
    headers := '{"Content-Type": "application/json"}'::jsonb,
    body    := jsonb_build_object('type', 'INSERT', 'table', 'event_pitches', 'record', to_jsonb(new))
  ) into req_id;

  raise log 'notify_new_event_pitch queued request % for pitch %', req_id, new.id;
  return new;
exception when others then
  -- A pitch is worth more than a notification: log loudly, never lose the row.
  raise warning 'notify_new_event_pitch failed for pitch %: %', new.id, sqlerrm;
  return new;
end;
$$;

drop trigger if exists on_event_pitch_created on public.event_pitches;

create trigger on_event_pitch_created
  after insert on public.event_pitches
  for each row
  execute function public.notify_new_event_pitch();

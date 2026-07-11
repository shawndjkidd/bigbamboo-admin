-- Blocked genres column — the codebase has referenced this since the genre
-- blocklist feature shipped, but the column was never actually added in
-- production; the extras query was silently failing and the blocklist has
-- been a no-op all along. This backfills the column.
alter table jukebox_settings add column if not exists blocked_genres text[] not null default '{}';

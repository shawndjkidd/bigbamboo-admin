-- Genre allowlist (a.k.a. "Genre lock" / Country Night mode).
-- When non-empty, only songs whose primary artist has a genre matching one
-- of these entries (substring match, case-insensitive) can be requested.
-- Empty array = feature off.
alter table jukebox_settings add column if not exists allowed_genres text[] not null default '{}';

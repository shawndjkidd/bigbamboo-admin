alter table jukebox_settings add column if not exists rotate_posters boolean default true;
alter table jukebox_settings add column if not exists poster_rotation_seconds integer default 8;

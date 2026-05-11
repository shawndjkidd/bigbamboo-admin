-- Branding fields: logo, wifi, poster rotation (adds what 0003 also covers, idempotent)
alter table jukebox_settings add column if not exists logo_url              text;
alter table jukebox_settings add column if not exists wifi_network          text;
alter table jukebox_settings add column if not exists wifi_password         text;
alter table jukebox_settings add column if not exists rotate_posters        boolean not null default true;
alter table jukebox_settings add column if not exists poster_rotation_seconds integer not null default 8;

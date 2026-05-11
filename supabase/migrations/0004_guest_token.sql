alter table jukebox_settings add column if not exists guest_token text not null default gen_random_uuid()::text;
alter table jukebox_settings add column if not exists guest_token_rotated_at timestamptz not null default now();
alter table jukebox_settings add column if not exists guest_token_rotation_hours integer not null default 12;

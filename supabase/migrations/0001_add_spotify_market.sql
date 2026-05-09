-- ═══════════════════════════════════════════════════════════════════════
--  Add per-venue Spotify market column.
--  Today the SpotifyProvider hardcodes 'VN' (Vietnam) since BigBamBoo's
--  one venue is in Ho Chi Minh City. For SaaS extraction, market needs
--  to be configurable per venue. This migration adds the column with
--  'VN' as the default so existing behavior is unchanged.
-- ═══════════════════════════════════════════════════════════════════════

alter table jukebox_settings
  add column if not exists spotify_market text not null default 'VN';

-- Quick sanity: allow a few common ISO 3166-1 alpha-2 markets.
-- (Spotify accepts any 2-letter market code; we don't enforce a strict
-- whitelist here. Validation happens client-side in the admin form.)

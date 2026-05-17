-- ═══════════════════════════════════════════════════════════════════════
--  Widen jukebox_settings.mode CHECK to include 'autopilot'.
--  Production was already accepting autopilot (constraint dropped or
--  never enforced there), so this brings the schema definition in line
--  with the live data + the in-app mode values.
--  Idempotent: drops any existing check by the standard auto-name,
--  then re-adds the widened version.
-- ═══════════════════════════════════════════════════════════════════════

alter table jukebox_settings
  drop constraint if exists jukebox_settings_mode_check;

alter table jukebox_settings
  add constraint jukebox_settings_mode_check
  check (mode in ('approval','open','locked','event','autopilot'));

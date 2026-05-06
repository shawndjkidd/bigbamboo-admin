// ═══════════════════════════════════════════════════════════════
//  Jukebox — venue id resolver
//  Single-tenant: venue_id is a fixed string. The function name
//  and signature stay unchanged so the rest of the code is
//  untouched if we ever multi-tenant later.
// ═══════════════════════════════════════════════════════════════

const DEFAULT_VENUE_ID =
  process.env.JUKEBOX_DEFAULT_VENUE_ID ||
  process.env.JUKEBOX_DEFAULT_VENUE_SLUG ||
  'bigbamboo';

export async function getJukeboxVenueId(): Promise<string> {
  return DEFAULT_VENUE_ID;
}

/** No-op kept for API compatibility with the old multi-tenant version. */
export function _resetVenueCache() {}

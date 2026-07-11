import { NextRequest, NextResponse } from 'next/server';
import { getServiceClient } from '@/lib/supabase';
import { getJukeboxVenueId } from '@/lib/jukebox/venue';
import { getRequestIp, hashIp } from '@/lib/jukebox/crypto';
import { rateLimit, sweepRateLimit } from '@/lib/jukebox/rateLimit';
import { autopilotFlushIfDue } from '@/lib/jukebox/autopilotFlush';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

export async function GET(req: NextRequest) {
  sweepRateLimit();
  const ipHash = hashIp(getRequestIp(req)) || 'no-ip';
  const rl = rateLimit(`queue:ip:${ipHash}`, 60, 60);
  if (!rl.ok) {
    return NextResponse.json(
      { ok: false, error: { code: 'rate_limited', message: 'Slow down.', retryAfterSec: rl.retryAfterSec } },
      { status: 429, headers: { 'retry-after': String(rl.retryAfterSec) } },
    );
  }

  const venueId = await getJukeboxVenueId();
  const sb = getServiceClient();

  // Opportunistic autopilot self-healing: try to push any approved+failed
  // rows to Spotify. Internally rate-limited (once per ~8s per venue) so
  // multiple polling clients don't slam the Spotify API. Awaited inline
  // because Vercel serverless functions can terminate before a
  // fire-and-forget promise settles; the flush is a no-op fast path most
  // of the time (just one settings read + zero-row query).
  await autopilotFlushIfDue(venueId);

  const { data } = await sb
    .from('jukebox_public_queue')
    .select('*')
    .eq('venue_id', venueId)
    .order('approved_at', { ascending: true, nullsFirst: false });

  // Synthesize 1-based positions.
  const rows = (data || []).map((r, i) => ({ ...r, position: i + 1 }));

  // Now Playing: most recently marked-played track within an 8-minute window.
  // Until Phase 2 wires real Spotify Connect playback, this is the staff's
  // "Mark played" stamp — close enough for the kiosk to look alive.
  const since = new Date(Date.now() - 8 * 60 * 1000).toISOString();
  const { data: nowRow } = await sb
    .from('jukebox_requests')
    .select(
      'id, track_name, artist_name, album_art_url, duration_ms, requested_by, requested_by_hidden, played_at',
    )
    .eq('venue_id', venueId)
    .eq('status', 'played')
    .gte('played_at', since)
    .order('played_at', { ascending: false })
    .limit(1)
    .maybeSingle();

  // If nothing was recently marked played, fall back to the head of the queue.
  // The display shows it in the same hero "On Air / Up Next" card so the
  // kiosk always has something visually anchored at the top.
  let now_playing: {
    id: string;
    track_name: string;
    artist_name: string;
    album_art_url: string | null;
    duration_ms: number;
    requested_by: string;
    played_at: string | null;
    is_fallback: boolean;
  } | null = null;

  if (nowRow) {
    now_playing = {
      id: nowRow.id,
      track_name: nowRow.track_name,
      artist_name: nowRow.artist_name,
      album_art_url: nowRow.album_art_url,
      duration_ms: nowRow.duration_ms,
      requested_by: nowRow.requested_by_hidden ? 'anonymous' : nowRow.requested_by,
      played_at: nowRow.played_at,
      is_fallback: false,
    };
  } else if (rows.length > 0) {
    // jukebox_public_queue view already collapses requested_by_hidden into
    // the requested_by string ('anonymous jungle friend'), so we use it as-is.
    const head = rows[0] as {
      id: string;
      track_name: string;
      artist_name: string;
      album_art_url: string | null;
      duration_ms: number;
      requested_by: string;
    };
    now_playing = {
      id: head.id,
      track_name: head.track_name,
      artist_name: head.artist_name,
      album_art_url: head.album_art_url,
      duration_ms: head.duration_ms,
      requested_by: head.requested_by,
      played_at: null,
      is_fallback: true,
    };
  }

  // Just Played: most recent track that finished within the last 30 minutes,
  // EXCLUDING whatever is currently shown as Now Playing. This drives the
  // little "JUST PLAYED" pill on the kiosk so guests have continuity even
  // mid-set when a song just finished but the next one hasn't been marked yet.
  const justPlayedSince = new Date(Date.now() - 30 * 60 * 1000).toISOString();
  const { data: justRows } = await sb
    .from('jukebox_requests')
    .select(
      'id, track_name, artist_name, album_art_url, duration_ms, requested_by, requested_by_hidden, played_at',
    )
    .eq('venue_id', venueId)
    .eq('status', 'played')
    .gte('played_at', justPlayedSince)
    .order('played_at', { ascending: false })
    .limit(2);

  let just_played: {
    id: string;
    track_name: string;
    artist_name: string;
    album_art_url: string | null;
    requested_by: string;
    played_at: string;
  } | null = null;

  if (justRows && justRows.length > 0) {
    // Prefer the row that ISN'T the Now Playing track (avoid showing the same
    // song as both On Air and Just Played simultaneously).
    const candidate = justRows.find((r) => r.id !== now_playing?.id) ?? justRows[0];
    if (candidate && candidate.id !== now_playing?.id) {
      just_played = {
        id: candidate.id,
        track_name: candidate.track_name,
        artist_name: candidate.artist_name,
        album_art_url: candidate.album_art_url,
        requested_by: candidate.requested_by_hidden ? 'anonymous' : candidate.requested_by,
        played_at: candidate.played_at,
      };
    }
  }

  // Activity counter — songs played since the venue's local midnight.
  // Uses the venue's timezone from settings; falls back to UTC.
  const { data: settingsRow } = await sb
    .from('jukebox_settings')
    .select('timezone')
    .eq('venue_id', venueId)
    .maybeSingle();
  const venueTz = settingsRow?.timezone || 'UTC';
  let dayStartIso: string;
  try {
    // Compute "today" in the venue's local timezone, then convert to ISO.
    const now = new Date();
    const fmt = new Intl.DateTimeFormat('en-CA', {
      timeZone: venueTz, year: 'numeric', month: '2-digit', day: '2-digit',
    });
    const localDateStr = fmt.format(now); // YYYY-MM-DD in venue tz
    // Construct a Date for midnight in that timezone. Easiest: parse as UTC then
    // adjust by the timezone offset for that specific local date.
    const midnightUtcGuess = new Date(`${localDateStr}T00:00:00Z`);
    const offsetFmt = new Intl.DateTimeFormat('en-US', {
      timeZone: venueTz, timeZoneName: 'shortOffset',
    });
    const parts = offsetFmt.formatToParts(midnightUtcGuess);
    const tzPart = parts.find((p) => p.type === 'timeZoneName')?.value || 'GMT+0';
    const m = /GMT([+-]\d+)(?::(\d+))?/i.exec(tzPart);
    const hours = m ? parseInt(m[1] || '0', 10) : 0;
    const minutes = m ? parseInt(m[2] || '0', 10) : 0;
    const offsetMs = (hours * 60 + Math.sign(hours) * minutes) * 60 * 1000;
    dayStartIso = new Date(midnightUtcGuess.getTime() - offsetMs).toISOString();
  } catch {
    dayStartIso = new Date(Date.now() - 24 * 60 * 60 * 1000).toISOString();
  }

  const { count: playedTodayCount } = await sb
    .from('jukebox_requests')
    .select('id', { count: 'exact', head: true })
    .eq('venue_id', venueId)
    .eq('status', 'played')
    .gte('played_at', dayStartIso);

  return NextResponse.json({
    ok: true,
    data: {
      queue: rows,
      now_playing,
      just_played,
      played_today_count: playedTodayCount ?? 0,
    },
  });
}

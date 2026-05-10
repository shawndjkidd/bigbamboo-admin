import { NextRequest, NextResponse } from 'next/server';
import { getServiceClient } from '@/lib/supabase';
import { getJukeboxVenueId } from '@/lib/jukebox/venue';
import { getRequestIp, hashIp } from '@/lib/jukebox/crypto';
import { rateLimit, sweepRateLimit } from '@/lib/jukebox/rateLimit';
import { filterNickname } from '@/lib/jukebox/profanity';
import { normalizeName } from '@/lib/jukebox/cooldowns';
import { getProvider } from '@/lib/jukebox/providers';
import { validateRequest } from '@/lib/jukebox/validation';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

interface Body {
  provider_track_id?: string;
  nickname?: string;
  device_id?: string;
}

export async function POST(req: NextRequest) {
  sweepRateLimit();
  let body: Body;
  try {
    body = (await req.json()) as Body;
  } catch {
    return NextResponse.json(
      { ok: false, error: { code: 'invalid_input', message: 'Body must be JSON.' } },
      { status: 400 },
    );
  }
  const providerTrackId = (body.provider_track_id || '').trim();
  const nicknameRaw = (body.nickname || '').trim();
  const deviceId = (body.device_id || '').trim();

  if (!providerTrackId || !deviceId || !/^[A-Za-z0-9_-]{8,64}$/.test(deviceId)) {
    return NextResponse.json(
      { ok: false, error: { code: 'invalid_input', message: 'Missing or malformed input.' } },
      { status: 400 },
    );
  }
  const nick = filterNickname(nicknameRaw);
  if (!nick.ok) {
    return NextResponse.json(
      { ok: false, error: { code: 'profanity', message: 'Please pick a friendlier nickname.' } },
      { status: 400 },
    );
  }

  // Per-device 5/min hard cap on POST attempts (separate from cooldown).
  const devRl = rateLimit(`req:dev:${deviceId}`, 5, 60);
  if (!devRl.ok) {
    return NextResponse.json(
      { ok: false, error: { code: 'rate_limited', message: 'Too many attempts. Slow down.', retryAfterSec: devRl.retryAfterSec } },
      { status: 429, headers: { 'retry-after': String(devRl.retryAfterSec) } },
    );
  }

  const ipHash = hashIp(getRequestIp(req));
  const venueId = await getJukeboxVenueId();
  const provider = getProvider('spotify', venueId);

  const result = await validateRequest(
    { providerTrackId, nickname: nick.clean },
    { venueId, deviceId, ipHash, userId: null, provider },
  );

  if (result.ok === false) {
    const status =
      result.code === 'cooldown' || result.code === 'queue_full' ? 429 :
      result.code === 'paused' || result.code === 'locked' ? 423 :
      400;
    const retry = (result.meta?.retryAfterSec as number | undefined) ?? undefined;
    const headers = retry ? { 'retry-after': String(retry) } : undefined;
    return NextResponse.json(
      { ok: false, error: { code: result.code, message: result.message, meta: result.meta } },
      { status, headers },
    );
  }

  const { track, settings } = result;
  const sb = getServiceClient();

  // Open mode → auto-approve. Approval/event mode → pending.
  // Curated mode also auto-approves: the track is already vetted by being in
  // the venue's curated playlist, so requiring staff to approve again is busy
  // work. (Per Shawn — "if it's on the playlist, it's pre-approved.")
  const curatedSettings = settings as typeof settings & { curated_mode_enabled?: boolean };
  const autoApprove = settings.mode === 'open' || !!curatedSettings.curated_mode_enabled;
  const nowIso = new Date().toISOString();

  const insertRow = {
    venue_id: venueId,
    provider: 'spotify',
    provider_track_id: track.id,
    spotify_track_id: track.id,
    track_name: track.name,
    track_name_normalized: normalizeName(track.name),
    artist_name: track.artists?.[0]?.name || '',
    artist_name_normalized: normalizeName(track.artists?.[0]?.name || ''),
    artist_ids: track.artists?.map((a) => a.id) || [],
    album_name: track.album?.name || null,
    album_art_url: track.album?.artUrl || null,
    duration_ms: track.durationMs,
    explicit: track.explicit,
    requested_by: nick.clean,
    device_id: deviceId,
    ip_hash: ipHash,
    user_id: null,
    status: autoApprove ? 'approved' : 'pending',
    approved_at: autoApprove ? nowIso : null,
  };

  const { data: inserted, error: insErr } = await sb
    .from('jukebox_requests')
    .insert(insertRow)
    .select('id, status, created_at, approved_at')
    .single();
  if (insErr || !inserted) {
    return NextResponse.json(
      { ok: false, error: { code: 'server_error', message: insErr?.message || 'insert failed' } },
      { status: 500 },
    );
  }

  // Upsert device row + atomic-ish counter bump.
  // Read-modify-write is fine here — the counter is for ops dashboards, not security.
  const { data: existingDev } = await sb
    .from('jukebox_devices')
    .select('id, request_count')
    .eq('venue_id', venueId)
    .eq('device_id', deviceId)
    .maybeSingle();
  if (existingDev) {
    await sb
      .from('jukebox_devices')
      .update({
        ip_hash: ipHash,
        last_request_at: nowIso,
        request_count: (existingDev.request_count || 0) + 1,
      })
      .eq('id', existingDev.id);
  } else {
    await sb.from('jukebox_devices').insert({
      venue_id: venueId,
      device_id: deviceId,
      ip_hash: ipHash,
      last_request_at: nowIso,
      request_count: 1,
    });
  }

  // Compute live queue position from approved+queued by approved_at asc.
  let queuePosition: number | null = null;
  if (inserted.status === 'approved') {
    const { data: queueRows } = await sb
      .from('jukebox_requests')
      .select('id, approved_at')
      .eq('venue_id', venueId)
      .in('status', ['approved', 'queued'])
      .order('approved_at', { ascending: true });
    const idx = (queueRows || []).findIndex((r) => r.id === inserted.id);
    queuePosition = idx >= 0 ? idx + 1 : null;
  }

  return NextResponse.json({
    ok: true,
    data: {
      request_id: inserted.id,
      status: inserted.status,
      queue_position: queuePosition,
      next_request_available_in_sec: settings.guest_cooldown_minutes * 60,
      track: {
        name: track.name,
        artist: track.artists?.[0]?.name || '',
        album_art_url: track.album?.artUrl || null,
      },
    },
  });
}

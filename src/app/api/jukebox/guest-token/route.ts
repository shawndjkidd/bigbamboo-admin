// Public — kiosk polls this every 60s to keep the QR token fresh.
// Also auto-rotates the token server-side when rotation is due.
import { randomUUID } from 'crypto';
import { NextResponse } from 'next/server';
import { getServiceClient } from '@/lib/supabase';
import { getJukeboxVenueId } from '@/lib/jukebox/venue';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

export async function GET() {
  const sb = getServiceClient();
  const venueId = await getJukeboxVenueId();

  const { data, error } = await sb
    .from('jukebox_settings')
    .select('guest_token, guest_token_rotated_at, guest_token_rotation_hours')
    .eq('venue_id', venueId)
    .maybeSingle();

  if (error || !data) {
    return NextResponse.json({ ok: false, error: { code: 'not_configured' } }, { status: 404 });
  }

  const rotationHours: number = data.guest_token_rotation_hours ?? 12;
  const rotatedAt = new Date(data.guest_token_rotated_at ?? Date.now());
  const expiresAt = new Date(rotatedAt.getTime() + rotationHours * 3_600_000);
  const now = new Date();

  let token: string = data.guest_token;
  let newRotatedAt = rotatedAt;

  // Auto-rotate if due
  if (now >= expiresAt) {
    const newToken = randomUUID();
    const nowIso = now.toISOString();
    const { data: updated } = await sb
      .from('jukebox_settings')
      .update({ guest_token: newToken, guest_token_rotated_at: nowIso })
      .eq('venue_id', venueId)
      .select('guest_token, guest_token_rotated_at')
      .single();
    if (updated) {
      token = updated.guest_token;
      newRotatedAt = new Date(updated.guest_token_rotated_at);
    }
  }

  const nextRotationAt = new Date(newRotatedAt.getTime() + rotationHours * 3_600_000);

  return NextResponse.json({
    ok: true,
    data: {
      guest_token: token,
      next_rotation_at: nextRotationAt.toISOString(),
      rotation_hours: rotationHours,
    },
  });
}

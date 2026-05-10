import { NextRequest, NextResponse } from 'next/server';
import { getServiceClient } from '@/lib/supabase';
import { getJukeboxVenueId } from '@/lib/jukebox/venue';
import { requireModerator } from '@/lib/jukebox/auth';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

const BUCKET = 'venue-assets';
const MAX_BYTES = 512_000;
const ALLOWED_TYPES = new Set(['image/png', 'image/jpeg', 'image/webp']);

export async function POST(req: NextRequest) {
  const auth = await requireModerator(req);
  if ('error' in auth) return auth.error;

  let formData: FormData;
  try {
    formData = await req.formData();
  } catch {
    return NextResponse.json({ ok: false, error: { code: 'invalid_input', message: 'Expected multipart form data.' } }, { status: 400 });
  }

  const file = formData.get('file');
  if (!file || typeof file === 'string') {
    return NextResponse.json({ ok: false, error: { code: 'invalid_input', message: 'No file provided.' } }, { status: 400 });
  }

  if (!ALLOWED_TYPES.has(file.type)) {
    return NextResponse.json({ ok: false, error: { code: 'invalid_input', message: 'Only PNG, JPEG, or WebP allowed.' } }, { status: 400 });
  }

  const bytes = await file.arrayBuffer();
  if (bytes.byteLength > MAX_BYTES) {
    return NextResponse.json({ ok: false, error: { code: 'invalid_input', message: 'File too large (max 500 KB).' } }, { status: 400 });
  }

  const ext = file.type === 'image/png' ? 'png' : file.type === 'image/webp' ? 'webp' : 'jpg';
  const venueId = await getJukeboxVenueId();
  const path = `logos/${venueId}.${ext}`;

  const sb = getServiceClient();
  const { error: uploadErr } = await sb.storage
    .from(BUCKET)
    .upload(path, Buffer.from(bytes), { contentType: file.type, upsert: true });

  if (uploadErr) {
    return NextResponse.json({ ok: false, error: { code: 'server_error', message: uploadErr.message } }, { status: 500 });
  }

  const { data: { publicUrl } } = sb.storage.from(BUCKET).getPublicUrl(path);

  // Bust the CDN cache by appending a timestamp query param to the stored URL.
  const url = `${publicUrl}?v=${Date.now()}`;

  const { error: updateErr } = await sb
    .from('jukebox_settings')
    .update({ logo_url: url })
    .eq('venue_id', venueId);

  if (updateErr) {
    return NextResponse.json({ ok: false, error: { code: 'server_error', message: updateErr.message } }, { status: 500 });
  }

  return NextResponse.json({ ok: true, data: { url } });
}

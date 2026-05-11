import { NextRequest, NextResponse } from 'next/server';
import { requireModerator } from '@/lib/jukebox/auth';
import { getServiceClient } from '@/lib/supabase';
import { getJukeboxVenueId } from '@/lib/jukebox/venue';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

const BUCKET = 'venue-display-posters';
const MAX_BYTES = 2_097_152; // 2 MB
const ALLOWED_TYPES = new Set(['image/png', 'image/jpeg']);

export async function GET(req: NextRequest) {
  const auth = await requireModerator(req);
  if ('error' in auth) return auth.error;

  const sb = getServiceClient();
  const venueId = await getJukeboxVenueId();

  const { data, error } = await sb
    .from('jukebox_display_posters')
    .select('id, storage_path, public_url, position, is_active, created_at')
    .eq('venue_id', venueId)
    .order('position', { ascending: true });

  if (error) {
    console.error('[posters GET]', error.message);
    return NextResponse.json(
      { ok: false, error: { code: 'server_error', message: error.message } },
      { status: 500 },
    );
  }

  return NextResponse.json({ ok: true, data: { posters: data || [] } });
}

export async function POST(req: NextRequest) {
  const auth = await requireModerator(req);
  if ('error' in auth) return auth.error;

  let formData: FormData;
  try {
    formData = await req.formData();
  } catch {
    return NextResponse.json(
      { ok: false, error: { code: 'invalid_input', message: 'Expected multipart form data.' } },
      { status: 400 },
    );
  }

  const file = formData.get('file');
  if (!file || typeof file === 'string') {
    return NextResponse.json(
      { ok: false, error: { code: 'invalid_input', message: 'No file provided.' } },
      { status: 400 },
    );
  }

  if (!ALLOWED_TYPES.has(file.type)) {
    return NextResponse.json(
      { ok: false, error: { code: 'invalid_input', message: 'Only PNG or JPEG allowed.' } },
      { status: 400 },
    );
  }

  const bytes = await file.arrayBuffer();
  if (bytes.byteLength > MAX_BYTES) {
    return NextResponse.json(
      { ok: false, error: { code: 'invalid_input', message: 'File too large (max 2 MB).' } },
      { status: 400 },
    );
  }

  const ext = file.type === 'image/png' ? 'png' : 'jpg';
  const venueId = await getJukeboxVenueId();
  const storagePath = `${venueId}/${Date.now()}_${Math.random().toString(36).slice(2, 8)}.${ext}`;

  const sb = getServiceClient();

  const { error: uploadErr } = await sb.storage
    .from(BUCKET)
    .upload(storagePath, Buffer.from(bytes), { contentType: file.type, upsert: false });

  if (uploadErr) {
    console.error('[posters POST] storage upload error:', uploadErr.message);
    return NextResponse.json(
      { ok: false, error: { code: 'server_error', message: uploadErr.message } },
      { status: 500 },
    );
  }

  const { data: { publicUrl } } = sb.storage.from(BUCKET).getPublicUrl(storagePath);

  // Append to end of current list.
  const { data: maxRow } = await sb
    .from('jukebox_display_posters')
    .select('position')
    .eq('venue_id', venueId)
    .order('position', { ascending: false })
    .limit(1)
    .maybeSingle();
  const position = (maxRow?.position ?? -1) + 1;

  const { data: inserted, error: insertErr } = await sb
    .from('jukebox_display_posters')
    .insert({ venue_id: venueId, storage_path: storagePath, public_url: publicUrl, position, is_active: true })
    .select('id, storage_path, public_url, position, is_active, created_at')
    .single();

  if (insertErr) {
    await sb.storage.from(BUCKET).remove([storagePath]);
    console.error('[posters POST] db insert error:', insertErr.message);
    return NextResponse.json(
      { ok: false, error: { code: 'server_error', message: insertErr.message } },
      { status: 500 },
    );
  }

  return NextResponse.json({ ok: true, data: { poster: inserted } }, { status: 201 });
}

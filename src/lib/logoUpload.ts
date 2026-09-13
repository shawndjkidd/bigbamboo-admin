// Validating and storing a brewery logo that arrived from an anonymous public form.
//
// Nothing about an upload from a stranger is trusted: not the filename, not the declared
// content type, not the extension. The bytes decide what the file is, and the name is
// generated here.

export const LOGO_BUCKET = 'producer-logos'
export const MAX_LOGO_BYTES = 2 * 1024 * 1024 // 2 MB

export type LogoKind = { ext: string; contentType: string }

// Magic numbers. A file claiming image/png while starting with "MZ" is not a png.
function sniff(bytes: Uint8Array): LogoKind | null {
  const starts = (sig: number[], at = 0) =>
    sig.every((b, i) => bytes[at + i] === b)

  // PNG: \x89PNG\r\n\x1a\n
  if (starts([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a])) return { ext: 'png', contentType: 'image/png' }
  // JPEG: FF D8 FF
  if (starts([0xff, 0xd8, 0xff])) return { ext: 'jpg', contentType: 'image/jpeg' }
  // WEBP: "RIFF" .... "WEBP"
  if (starts([0x52, 0x49, 0x46, 0x46]) && starts([0x57, 0x45, 0x42, 0x50], 8)) return { ext: 'webp', contentType: 'image/webp' }

  // SVG is text, so there is no magic number — look for a root element in the opening
  // bytes, past any BOM, whitespace, XML declaration or doctype.
  const head = new TextDecoder('utf-8', { fatal: false }).decode(bytes.slice(0, 1024)).replace(/^﻿/, '').trimStart()
  if (/^<(\?xml|!doctype svg|svg)\b/i.test(head)) {
    const whole = new TextDecoder('utf-8', { fatal: false }).decode(bytes)
    if (!/<svg[\s>]/i.test(whole)) return null
    // An SVG is a document, and a document can carry script. These are served only ever
    // inside an <img>, which already neutralises script — this is the second lock, so a
    // logo opened directly by its storage URL is inert too.
    if (/<\s*script|<\s*foreignObject|\son\w+\s*=|javascript:|<\s*iframe|<\s*embed|<\s*use[^>]+href\s*=\s*["']?\s*http/i.test(whole)) return null
    return { ext: 'svg', contentType: 'image/svg+xml' }
  }
  return null
}

export type LogoReason = 'empty' | 'too-big' | 'not-an-image'
export type PreparedLogo = { ok: true; path: string; contentType: string; bytes: Uint8Array }
export type RejectedLogo = { ok: false; reason: LogoReason }
export type LogoResult = PreparedLogo | RejectedLogo

// This project compiles with `strict: false`, which turns off the narrowing that would
// otherwise let `if (!r.ok)` tell these two apart. An explicit predicate works either way.
export function logoRejected(r: LogoResult): r is RejectedLogo { return !r.ok }

// Turns an uploaded file into something safe to store, or says why it isn't.
export async function prepareLogo(file: { size: number; arrayBuffer: () => Promise<ArrayBuffer> }, slug: string): Promise<LogoResult> {
  if (!file || !file.size) return { ok: false, reason: 'empty' }
  if (file.size > MAX_LOGO_BYTES) return { ok: false, reason: 'too-big' }

  const bytes = new Uint8Array(await file.arrayBuffer())
  // Re-check after reading: size can lie, the buffer cannot.
  if (bytes.byteLength === 0) return { ok: false, reason: 'empty' }
  if (bytes.byteLength > MAX_LOGO_BYTES) return { ok: false, reason: 'too-big' }

  const kind = sniff(bytes)
  if (!kind) return { ok: false, reason: 'not-an-image' }

  // Our name, not theirs. The brewery slug keeps it legible in the storage browser; the
  // random suffix stops one upload overwriting another and makes the URL unguessable.
  const safeSlug = (slug || 'logo').toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '')
    .replace(/đ/g, 'd').replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '').slice(0, 40) || 'logo'
  const rand = Math.random().toString(36).slice(2, 10)
  return { ok: true, path: `${safeSlug}-${Date.now().toString(36)}${rand}.${kind.ext}`, contentType: kind.contentType, bytes }
}

// Uploads a prepared logo and returns its public URL, or null if storage said no (most
// likely the bucket not existing yet). A logo is never worth failing a sign-up over.
export async function storeLogo(
  svc: any,
  prepared: PreparedLogo,
): Promise<string | null> {
  try {
    const { error } = await svc.storage.from(LOGO_BUCKET).upload(prepared.path, prepared.bytes, {
      contentType: prepared.contentType,
      upsert: false,
    })
    if (error) { console.warn('[logo] upload failed: %s', error.message); return null }
    const { data } = svc.storage.from(LOGO_BUCKET).getPublicUrl(prepared.path)
    return data?.publicUrl || null
  } catch (e) {
    console.warn('[logo] upload threw: %s', (e as Error)?.message)
    return null
  }
}

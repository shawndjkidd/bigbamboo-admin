// ═══════════════════════════════════════════════════════════════
//  Jukebox — server-only crypto
//  - AES-256-GCM encrypt/decrypt for at-rest tokens (Phase 2 OAuth)
//  - SHA-256 IP hashing with JUKEBOX_IP_SALT
//  - HMAC-signed short-lived cookies for OAuth state (Phase 2)
// ═══════════════════════════════════════════════════════════════

import {
  createCipheriv,
  createDecipheriv,
  createHash,
  createHmac,
  randomBytes,
  timingSafeEqual,
} from 'crypto';

// ── Token encryption (AES-256-GCM) ─────────────────────────────
function tokenKey(): Buffer {
  const hex = process.env.JUKEBOX_TOKEN_KEY || '';
  if (hex.length !== 64) {
    throw new Error(
      'JUKEBOX_TOKEN_KEY must be a 64-char hex string (32 bytes). Generate: openssl rand -hex 32',
    );
  }
  return Buffer.from(hex, 'hex');
}

/** Returns base64 string of: [12 bytes IV | 16 bytes auth tag | ciphertext]. */
export function encryptToken(plain: string): string {
  const iv = randomBytes(12);
  const cipher = createCipheriv('aes-256-gcm', tokenKey(), iv);
  const enc = Buffer.concat([cipher.update(plain, 'utf8'), cipher.final()]);
  const tag = cipher.getAuthTag();
  return Buffer.concat([iv, tag, enc]).toString('base64');
}

export function decryptToken(payload: string): string {
  const buf = Buffer.from(payload, 'base64');
  if (buf.length < 28) throw new Error('encrypted payload too short');
  const iv = buf.subarray(0, 12);
  const tag = buf.subarray(12, 28);
  const enc = buf.subarray(28);
  const decipher = createDecipheriv('aes-256-gcm', tokenKey(), iv);
  decipher.setAuthTag(tag);
  const dec = Buffer.concat([decipher.update(enc), decipher.final()]);
  return dec.toString('utf8');
}

// ── IP hashing ─────────────────────────────────────────────────
export function hashIp(ip: string | null | undefined): string | null {
  if (!ip) return null;
  const salt = process.env.JUKEBOX_IP_SALT || '';
  if (!salt) {
    // Fail safe but loud — never persist a raw IP.
    console.warn('[jukebox] JUKEBOX_IP_SALT missing; returning null ip_hash');
    return null;
  }
  return createHash('sha256').update(salt + '|' + ip).digest('hex');
}

/** Best-effort client IP from common Next.js / Vercel headers. */
export function getRequestIp(req: Request | { headers: Headers }): string | null {
  const h = (req as { headers: Headers }).headers;
  const fwd = h.get('x-forwarded-for');
  if (fwd) {
    const first = fwd.split(',')[0]?.trim();
    if (first) return first;
  }
  return (
    h.get('x-real-ip') ||
    h.get('cf-connecting-ip') ||
    h.get('x-vercel-forwarded-for') ||
    null
  );
}

// ── Cookie signing (HMAC-SHA256) — for Phase 2 OAuth state ────
function cookieKey(): Buffer {
  const hex = process.env.JUKEBOX_COOKIE_SECRET || '';
  if (hex.length < 32) {
    throw new Error('JUKEBOX_COOKIE_SECRET must be set (>=32 hex chars).');
  }
  return Buffer.from(hex, 'utf8');
}

export function signValue(value: string): string {
  const mac = createHmac('sha256', cookieKey()).update(value).digest('hex');
  return `${value}.${mac}`;
}

export function verifySigned(signed: string): string | null {
  const dot = signed.lastIndexOf('.');
  if (dot < 0) return null;
  const value = signed.slice(0, dot);
  const mac = signed.slice(dot + 1);
  const expected = createHmac('sha256', cookieKey()).update(value).digest('hex');
  if (mac.length !== expected.length) return null;
  if (!timingSafeEqual(Buffer.from(mac, 'hex'), Buffer.from(expected, 'hex'))) {
    return null;
  }
  return value;
}

// ── Random helpers ─────────────────────────────────────────────
export function randomToken(bytes = 16): string {
  return randomBytes(bytes).toString('hex');
}

/** PKCE code verifier (43-128 chars, URL-safe). */
export function pkceVerifier(): string {
  return randomBytes(48)
    .toString('base64')
    .replace(/\+/g, '-')
    .replace(/\//g, '_')
    .replace(/=+$/, '');
}

/** PKCE code challenge = base64url(sha256(verifier)). */
export function pkceChallenge(verifier: string): string {
  return createHash('sha256')
    .update(verifier)
    .digest('base64')
    .replace(/\+/g, '-')
    .replace(/\//g, '_')
    .replace(/=+$/, '');
}

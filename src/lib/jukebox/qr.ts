// ═══════════════════════════════════════════════════════════════
//  Jukebox — QR helper
//  Returns a URL to a QR image for the given target.
//  Uses api.qrserver.com (a public free service). Swap to the
//  `qrcode` npm package or a self-hosted generator if we ever
//  want to drop the external dependency.
// ═══════════════════════════════════════════════════════════════

export function qrImageUrl(
  target: string,
  opts?: { size?: number; margin?: number; dark?: string; light?: string },
): string {
  const size = opts?.size ?? 400
  const margin = opts?.margin ?? 4
  const dark = (opts?.dark ?? '111111').replace('#', '')
  const light = (opts?.light ?? 'ffffff').replace('#', '')
  const data = encodeURIComponent(target)
  return `https://api.qrserver.com/v1/create-qr-code/?data=${data}&size=${size}x${size}&margin=${margin}&color=${dark}&bgcolor=${light}&qzone=2&format=svg`
}

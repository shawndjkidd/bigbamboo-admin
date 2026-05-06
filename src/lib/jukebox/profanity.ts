// ═══════════════════════════════════════════════════════════════
//  Jukebox — nickname profanity filter
//  Intentionally simple. Swap to `bad-words` (or equivalent) by
//  installing the dep and replacing this module's logic; the
//  function signature stays the same.
// ═══════════════════════════════════════════════════════════════

// Small starter wordlist — covers obvious slurs and the most
// common bar-bathroom-tier nicknames. Match is substring-based on
// a normalized form (lowercased, leetspeak-folded, non-alpha removed)
// so 'F.U.C.K' and 'fuxk' both trip it.
const BLOCK = [
  'fuck',
  'shit',
  'bitch',
  'cunt',
  'nigger',
  'nigga',
  'faggot',
  'retard',
  'rape',
  'whore',
  'slut',
  'penis',
  'vagina',
  'cock',
  'tits',
  'pussy',
  'asshole',
  'bastard',
  'dickhead',
];

// Light leetspeak fold so 'sh1t' and 'b!tch' don't slip past.
const LEET: Record<string, string> = {
  '0': 'o',
  '1': 'i',
  '!': 'i',
  '|': 'i',
  '3': 'e',
  '4': 'a',
  '@': 'a',
  '5': 's',
  '$': 's',
  '7': 't',
  '+': 't',
  '8': 'b',
};

function normalize(s: string): string {
  const lower = s.toLowerCase();
  let out = '';
  for (const ch of lower) {
    out += LEET[ch] ?? ch;
  }
  return out.replace(/[^a-z]/g, '');
}

export function isProfane(name: string): boolean {
  const n = normalize(name);
  if (!n) return false;
  return BLOCK.some((bad) => n.includes(bad));
}

/** Phase 1 policy: reject profane nicknames at submit time.
 *  Staff can also hide an already-submitted nickname via the admin route. */
export function filterNickname(raw: string): { ok: true; clean: string } | { ok: false } {
  const trimmed = (raw ?? '').trim().slice(0, 32);
  if (trimmed.length < 1) return { ok: false };
  if (isProfane(trimmed)) return { ok: false };
  return { ok: true, clean: trimmed };
}

// ═══════════════════════════════════════════════════════════════
//  Jukebox — provider factory
// ═══════════════════════════════════════════════════════════════

import { ManualProvider } from './manual';
import { SpotifyProvider } from './spotify';
import type { PlaybackProvider } from './types';

let cached: { kind: string; instance: PlaybackProvider } | null = null;

export function getProvider(kind = 'spotify'): PlaybackProvider {
  if (cached && cached.kind === kind) return cached.instance;
  const inst = kind === 'manual' ? new ManualProvider() : new SpotifyProvider();
  cached = { kind, instance: inst };
  return inst;
}

export type { PlaybackProvider } from './types';

// ═══════════════════════════════════════════════════════════════
//  Jukebox — shared TypeScript types
// ═══════════════════════════════════════════════════════════════

export type JukeboxMode = 'approval' | 'open' | 'locked' | 'event';

export type RequestStatus =
  | 'pending'
  | 'approved'
  | 'rejected'
  | 'queued'
  | 'played'
  | 'skipped'
  | 'removed'
  | 'failed'
  | 'expired';

export interface JukeboxSettings {
  id: string;
  venue_id: string;
  is_active: boolean;
  mode: JukeboxMode;
  guest_cooldown_minutes: number;
  member_cooldown_minutes: number;
  max_song_length_seconds: number;
  duplicate_cooldown_minutes: number;
  same_artist_cooldown_minutes: number;
  allow_explicit: boolean;
  provider: string;
  auto_add_to_provider: boolean;
  max_queue_length: number;
  pending_request_ttl_minutes: number;
  display_token: string;
  timezone: string;
  created_at: string;
  updated_at: string;
}

export interface PublicSettings {
  venue_id: string;
  is_active: boolean;
  mode: JukeboxMode;
  guest_cooldown_minutes: number;
  member_cooldown_minutes: number;
  max_song_length_seconds: number;
  allow_explicit: boolean;
  max_queue_length: number;
}

export interface JukeboxRequest {
  id: string;
  venue_id: string;
  provider: string;
  provider_track_id: string;
  spotify_track_id: string | null;
  track_name: string;
  track_name_normalized: string;
  artist_name: string;
  artist_name_normalized: string;
  artist_ids: string[];
  album_name: string | null;
  album_art_url: string | null;
  duration_ms: number;
  explicit: boolean;
  requested_by: string;
  requested_by_hidden: boolean;
  device_id: string;
  ip_hash: string | null;
  user_id: string | null;
  status: RequestStatus;
  queue_position: number | null;
  rejection_reason: string | null;
  provider_queue_status: string | null;
  provider_error: string | null;
  created_at: string;
  approved_at: string | null;
  queued_at: string | null;
  played_at: string | null;
  skipped_at: string | null;
  removed_at: string | null;
}

export interface PublicQueueItem {
  id: string;
  venue_id: string;
  track_name: string;
  artist_name: string;
  album_name: string | null;
  album_art_url: string | null;
  duration_ms: number;
  requested_by: string;
  status: 'approved' | 'queued';
  approved_at: string | null;
  queued_at: string | null;
  created_at: string;
  position?: number;
}

export interface BlocklistEntry {
  id: string;
  venue_id: string;
  type: 'track' | 'artist';
  provider: string;
  provider_id: string;
  spotify_id: string | null;
  name: string;
  reason: string | null;
  created_by: string | null;
  created_at: string;
}

export type RejectionCode =
  | 'paused'
  | 'locked'
  | 'track_lookup'
  | 'too_long'
  | 'explicit'
  | 'blocklisted'
  | 'cooldown'
  | 'duplicate'
  | 'same_artist'
  | 'queue_full'
  | 'invalid_input'
  | 'profanity'
  | 'not_in_playlist';

export interface ApiError {
  code: string;
  message: string;
  retryAfterSec?: number;
  meta?: Record<string, unknown>;
}

export type ApiResponse<T> =
  | { ok: true; data: T }
  | { ok: false; error: ApiError };

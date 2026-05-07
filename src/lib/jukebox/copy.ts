// ═══════════════════════════════════════════════════════════════
//  Jukebox — user-facing copy
//  All strings the user/admin see live here. Edit here only.
// ═══════════════════════════════════════════════════════════════

export const copy = {
  brand: {
    title: 'BigBamBoo Jukebox',
    tagline: "Scan. Pick a song. Don't kill the vibe.",
  },
  rules: {
    cooldownLine: 'One request every 20 minutes.',
    rewardsLine: 'Join Rewards for more power.',
    staffLine: 'Staff can skip anything that makes the jungle sad.',
  },
  guest: {
    searchPlaceholder: 'Search a song or artist…',
    nicknamePlaceholder: 'Your nickname',
    submitButton: 'Send to the jungle',
    submitting: 'Sending…',
    submitConfirm: 'Your song is in the queue.',
    queuePositionLine: (n: number) =>
      n === 1 ? "You're up next." : `Position #${n} in the queue.`,
    cooldownActive: (mmss: string) =>
      `You're still cooling down. Next request available in ${mmss}.`,
    loyaltyHook: 'Want more jungle power?',
    loyaltyPitch:
      'Join BigBamBoo Rewards to request more often, vote on the queue, and unlock prizes.',
    loyaltyYes: 'Unlock More',
    loyaltyNo: "Not now, I'm just vibing",
    emptyResults: 'No tracks found. Try a different search.',
    explicitTag: 'Explicit',
    queueEmpty: 'Nothing queued yet — be the first.',
    requestsLocked: 'Requests are off right now.',
    requestsPaused: 'The jukebox is paused right now.',
  },
  rejection: {
    duplicate: 'This song was already requested recently.',
    too_long: 'This track is too long for regular jukebox mode.',
    same_artist: 'We already have this artist coming up. Try another track.',
    blocklisted: 'This song is blocked tonight.',
    paused: 'The jukebox is paused right now.',
    locked: 'Requests are off right now.',
    explicit: "Explicit tracks aren't allowed tonight.",
    queue_full: 'Queue is full right now. Try again in a few minutes.',
    track_lookup: "We couldn't find that track. Try another.",
    invalid_input: 'Something was missing or malformed in your request.',
    profanity: 'Please pick a friendlier nickname.',
    cooldown: "You're still cooling down.",
    not_in_playlist: "That track isn't on tonight's list. Try another from the playlist.",
  },
  curated: {
    bannerPrefix: "Tonight's playlist:",
    emptyResults: "We don't have that on tonight's list. Try another search.",
  },
  spotify: {
    no_active_device:
      'No active Spotify device. Open Spotify on the venue computer and try again.',
    token_expired: 'Spotify connection expired. Reconnect the venue account.',
    token_invalid: 'Spotify connection expired. Reconnect the venue account.',
    missing_permissions:
      'Spotify permissions are missing. Reconnect and approve all scopes.',
    not_premium:
      "The connected Spotify account isn't Premium. Spotify queue features need Premium.",
    track_unavailable:
      "Spotify says this track isn't available right now. Try a different version.",
    rate_limited: 'Spotify is throttling us. Try again in a moment.',
    network_error: 'Spotify rejected this request. Try again or add manually.',
    unknown: 'Spotify rejected this request. Try again or add manually.',
  },
  admin: {
    statusActive: 'Jukebox active',
    statusPaused: 'Jukebox paused',
    statusLocked: 'Requests locked',
    pendingTab: 'Pending',
    queueTab: 'Up next',
    historyTab: 'History',
    blocklistTab: 'Blocklist',
    settingsTab: 'Settings',
    spotifyTab: 'Spotify',
    approve: 'Approve',
    reject: 'Reject',
    remove: 'Remove',
    skip: 'Skip',
    markPlayed: 'Mark played',
    blockTrack: 'Block track',
    blockArtist: 'Block artist',
    hideName: 'Hide nickname',
    addToSpotify: 'Add to Spotify queue',
    rotateDisplayToken: 'Rotate display token',
  },
} as const;

export const HIDDEN_NICKNAME = 'anonymous jungle friend';

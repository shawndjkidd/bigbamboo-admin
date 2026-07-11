// ═══════════════════════════════════════════════════════════════
//  VibeQueue guest-page translations
//  EN is the authoritative source. VI is a translate-app baseline —
//  have a native Vietnamese speaker review before public launch.
// ═══════════════════════════════════════════════════════════════

export type Lang = 'en' | 'vi'
export const LANG_KEY = 'vibequeue_lang'

export const translations = {
  en: {
    poweredBy: 'powered by',
    tagBefore: 'Scan.',
    tagHighlight: 'Pick a song.',
    tagAfter: "Don't kill the vibe.",
    searchPlaceholder: 'Search a song or artist…',
    pickASong: "— Pick a song. We'll queue it up —",
    nickname: 'Nickname',
    nicknamePlaceholder: 'Your nickname',
    play: 'Play',
    back: 'Back',
    sendToJungle: 'Send to the jungle',
    sending: 'Sending…',
    searching: 'Searching…',
    searchFailed: 'Search failed.',
    noResults: 'No songs found. Try a different search.',
    endOfResults: "— That's all we found —",
    pickNickname: 'Pick a nickname.',
    requestFailed: 'Request failed.',
    couldNotLoad: 'Could not load.',
    pendingApproval: 'Pending staff approval',
    inTheQueue: 'In the queue',
    submitConfirm: 'Your song is in the queue.',
    queuePosition: (n: number) => (n === 1 ? "You're up next." : `Position #${n} in the queue.`),
    requestsPaused: 'VibeQueue is paused right now.',
    requestsLocked: 'Requests are off right now.',
    cooldownActive: (mmss: string) =>
      `You're still cooling down. Next request available in ${mmss}.`,
    noWait: "No wait — you're up soon.",
    estimatedWait: (min: number) => `Estimated wait: ~${min} min`,
    explicit: 'explicit',
    expiredQr: 'QR code expired.',
    expiredQrSub: 'Scan the QR on the venue TV to get a fresh link.',
    scanQrAgain: 'Scan the QR again',
  },
  vi: {
    // ⚠️  Translate-app quality — have a native speaker review before public launch.
    poweredBy: 'được hỗ trợ bởi',
    tagBefore: 'Quét.',
    tagHighlight: 'Chọn bài hát.',
    tagAfter: 'Đừng phá không khí.',
    searchPlaceholder: 'Tìm bài hát hoặc nghệ sĩ…',
    pickASong: '— Chọn bài hát. Chúng tôi sẽ xếp hàng —',
    nickname: 'Biệt danh',
    nicknamePlaceholder: 'Biệt danh của bạn',
    play: 'Phát',
    back: 'Quay lại',
    sendToJungle: 'Gửi vào rừng',
    sending: 'Đang gửi…',
    searching: 'Đang tìm kiếm…',
    searchFailed: 'Tìm kiếm thất bại.',
    noResults: 'Không tìm thấy bài hát. Thử tìm khác.',
    endOfResults: '— Đó là tất cả những gì tìm thấy —',
    pickNickname: 'Chọn biệt danh.',
    requestFailed: 'Yêu cầu thất bại.',
    couldNotLoad: 'Không thể tải.',
    pendingApproval: 'Đang chờ nhân viên duyệt',
    inTheQueue: 'Trong hàng đợi',
    submitConfirm: 'Bài hát của bạn đang trong hàng đợi.',
    queuePosition: (n: number) =>
      n === 1 ? 'Bạn là người tiếp theo.' : `Vị trí #${n} trong hàng đợi.`,
    requestsPaused: 'VibeQueue đang tạm dừng.',
    requestsLocked: 'Yêu cầu đang tắt.',
    cooldownActive: (mmss: string) =>
      `Bạn vẫn đang trong thời gian chờ. Yêu cầu tiếp theo sau ${mmss}.`,
    noWait: 'Không cần chờ — bạn sắp đến lượt.',
    estimatedWait: (min: number) => `Thời gian chờ: ~${min} phút`,
    explicit: 'tục tĩu',
    expiredQr: 'Mã QR đã hết hạn.',
    expiredQrSub: 'Quét mã QR trên TV nhà hàng để lấy link mới.',
    scanQrAgain: 'Quét lại mã QR',
  },
} as const

export type Translations = typeof translations.en

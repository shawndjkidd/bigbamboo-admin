// Every word on the public homepage, in English and Vietnamese.
//
// Nothing here is the final say: each entry is a *default*, shown only when the matching
// site_settings row is empty. The dashboard editor (Dashboard → Website) writes
// home_<name>_en / home_<name>_vi, and FIELDS below is what that editor renders, so the
// two stay in step from one list.
//
// The old Hostinger page kept its own keys without the home_ prefix (slogan,
// instagram_url, address_street…) and those rows are still populated in Supabase. Rather
// than migrate them, resolve() falls back to the legacy key before reaching the default,
// so the real links and address keep working untouched.

export type Lang = 'en' | 'vi'

export const DEFAULTS: Record<Lang, Record<string, string>> = {
  en: {
    navMenu: 'Menu', navEvents: 'Events', navVisit: 'Visit', navClub: 'Drink Club', navClubShort: 'Club',
    // Text between *asterisks* is picked out in yellow.
    heroSlogan: 'Cold drinks. *Breezy nights.* No bad vibes.',
    heroTagline: 'tiki–tropical vibes, draft cocktails, craft beer, American comfort food with a hawaiian twist...and a little bụi!',
    btnMenu: 'Menu', btnEvents: 'Events', btnSpin: 'Spin to Win', btnMessenger: 'Messenger',
    labelStatus: 'Status', labelLocation: 'Location', labelComingUp: 'Coming up',
    statusMain: 'Open on event nights',
    statusSub: 'Hours are event-based right now — see what’s on below',
    statusOpenToday: 'Open tonight',
    locCity: 'An Phú, Saigon', locStreet: '10 An Phú, An Khánh, Ho Chi Minh City',
    visitAddress: '10 An Phú, An Khánh, Ho Chi Minh City',
    comingUpNone: 'New events going up soon',
    eventsEyebrow: 'Events', eventsTitle: 'Upcoming Events',
    eventsEmpty: 'Nothing on the calendar just yet. Follow along on Instagram and we’ll shout when the next one lands.',
    evFacebook: 'Facebook Event',
    merchBadge: 'Merch', merchHeadline: 'Coming Soon', merchSub: 'Tees, caps, and bad decisions. Watch this space.',
    clubEyebrow: 'Drinks Club', clubBuy: 'Buy 10', clubFree: 'Get 1 Free',
    clubNotify: 'Notify Me', clubEmailPlaceholder: 'your@email.com',
    clubZaloPlaceholder: 'Zalo number (optional)',
    clubPromise: 'We’ll only ever message you about the Drinks Club.',
    clubFine: 'Digital stamp card launching soon · No spam, ever',
    clubThanks: 'You’re on the list. We’ll be in touch.',
    clubError: 'That didn’t send. Try again in a moment.',
    visitTitle: 'Pull Up.', visitMaps: 'Open in Maps',
    visitNote: 'Open on event nights — check what’s on above',
    socInstagram: 'Instagram', socFacebook: 'Facebook', socGrab: 'Grab',
    footerNote: 'An Phú · Ho Chi Minh City',
    menuEmpty: 'The menu is being updated. Ask at the bar — we’ll look after you.',
    catAll: 'All',
  },
  vi: {
    navMenu: 'Thực đơn', navEvents: 'Sự kiện', navVisit: 'Ghé thăm', navClub: 'Câu lạc bộ', navClubShort: 'CLB',
    heroSlogan: 'Đồ uống lạnh. *Đêm mát mẻ.* Không lo lắng.',
    heroTagline: 'tiki–nhiệt đới, cocktail tươi, bia thủ công, đồ ăn Mỹ kiểu Hawaii...và một chút bụi!',
    btnMenu: 'Thực đơn', btnEvents: 'Sự kiện', btnSpin: 'Quay & Thắng', btnMessenger: 'Messenger',
    labelStatus: 'Trạng thái', labelLocation: 'Vị trí', labelComingUp: 'Sắp diễn ra',
    statusMain: 'Mở cửa vào đêm sự kiện',
    statusSub: 'Hiện tại chúng tôi mở theo sự kiện — xem lịch bên dưới',
    statusOpenToday: 'Tối nay mở cửa',
    locCity: 'An Phú, Sài Gòn', locStreet: '10 An Phú, An Khánh, TP. Hồ Chí Minh',
    visitAddress: '10 An Phú, An Khánh, TP. Hồ Chí Minh',
    comingUpNone: 'Sự kiện mới sẽ sớm được cập nhật',
    eventsEyebrow: 'Sự kiện', eventsTitle: 'Sự kiện sắp tới',
    eventsEmpty: 'Hiện chưa có sự kiện nào. Theo dõi Instagram để biết sự kiện kế tiếp nhé.',
    evFacebook: 'Sự kiện Facebook',
    merchBadge: 'Hàng hóa', merchHeadline: 'Sắp ra mắt', merchSub: 'Áo thun, nón, và những quyết định táo bạo. Hãy theo dõi.',
    clubEyebrow: 'Câu lạc bộ đồ uống', clubBuy: 'Mua 10', clubFree: 'Tặng 1',
    clubNotify: 'Thông báo', clubEmailPlaceholder: 'email@cua-ban.com',
    clubZaloPlaceholder: 'Số Zalo (không bắt buộc)',
    clubPromise: 'Chúng tôi chỉ nhắn tin về Câu lạc bộ đồ uống.',
    clubFine: 'Thẻ tích điểm sắp ra mắt · Không spam',
    clubThanks: 'Bạn đã đăng ký. Chúng tôi sẽ liên hệ.',
    clubError: 'Chưa gửi được. Vui lòng thử lại sau giây lát.',
    visitTitle: 'Ghé chơi.', visitMaps: 'Mở bản đồ',
    visitNote: 'Mở cửa vào đêm sự kiện — xem lịch phía trên',
    socInstagram: 'Instagram', socFacebook: 'Facebook', socGrab: 'Grab',
    footerNote: 'An Phú · TP. Hồ Chí Minh',
    menuEmpty: 'Thực đơn đang được cập nhật. Hỏi tại quầy bar — chúng tôi sẽ phục vụ bạn.',
    catAll: 'Tất cả',
  },
}

// What the dashboard editor shows, in this order. `area` renders a textarea.
export type Field = { name: string; label: string; area?: boolean }
export const FIELDS: Field[] = [
  { name: 'heroSlogan', label: 'Hero: big slogan (text between *stars* turns yellow)' },
  { name: 'heroTagline', label: 'Hero: line underneath', area: true },
  { name: 'btnMenu', label: 'Hero button: Menu' },
  { name: 'btnEvents', label: 'Hero button: Events' },
  { name: 'btnSpin', label: 'Hero button: Spin to Win' },
  { name: 'btnMessenger', label: 'Hero button: Messenger' },
  { name: 'labelStatus', label: 'Info bar: “Status” label' },
  { name: 'statusMain', label: 'Info bar: status, main line' },
  { name: 'statusSub', label: 'Info bar: status, small line' },
  { name: 'statusOpenToday', label: 'Info bar: status when there’s an event today' },
  { name: 'labelLocation', label: 'Info bar: “Location” label' },
  { name: 'locCity', label: 'Info bar: city' },
  { name: 'locStreet', label: 'Info bar: street address (keep it short)' },
  { name: 'visitAddress', label: 'Visit: full address' },
  { name: 'labelComingUp', label: 'Info bar: “Coming up” label' },
  { name: 'comingUpNone', label: 'Info bar: when there are no events' },
  { name: 'eventsEyebrow', label: 'Events: small label above the heading' },
  { name: 'eventsTitle', label: 'Events: heading' },
  { name: 'eventsEmpty', label: 'Events: when there are none', area: true },
  { name: 'menuEmpty', label: 'Menu: when there are no items', area: true },
  { name: 'merchBadge', label: 'Merch: badge' },
  { name: 'merchHeadline', label: 'Merch: headline' },
  { name: 'merchSub', label: 'Merch: line underneath' },
  { name: 'clubEyebrow', label: 'Drinks Club: small label' },
  { name: 'clubBuy', label: 'Drinks Club: first line (“Buy 10”)' },
  { name: 'clubFree', label: 'Drinks Club: second line (“Get 1 Free”)' },
  { name: 'clubNotify', label: 'Drinks Club: sign-up button' },
  { name: 'clubEmailPlaceholder', label: 'Drinks Club: email box placeholder' },
  { name: 'clubZaloPlaceholder', label: 'Drinks Club: Zalo box placeholder' },
  { name: 'clubPromise', label: 'Drinks Club: what we promise to do with it' },
  { name: 'clubThanks', label: 'Drinks Club: thank-you message' },
  { name: 'clubError', label: 'Drinks Club: message if it fails' },
  { name: 'clubFine', label: 'Drinks Club: small print' },
  { name: 'visitTitle', label: 'Visit: heading' },
  { name: 'visitNote', label: 'Visit: opening-hours note' },
  { name: 'visitMaps', label: 'Visit: Maps button' },
  { name: 'socGrab', label: 'Visit: Grab button' },
  { name: 'footerNote', label: 'Footer: line' },
  { name: 'navMenu', label: 'Nav: Menu' },
  { name: 'navEvents', label: 'Nav: Events' },
  { name: 'navVisit', label: 'Nav: Visit' },
  { name: 'navClub', label: 'Nav: Drink Club' },
  { name: 'navClubShort', label: 'Nav: Club (phone bar)' },
]

// Text keys the old site stored without a prefix. Same wording, older name.
const LEGACY_TEXT: Record<string, string> = {
  heroSlogan: 'slogan',
}

// Link keys are shared between languages.
export const LINKS: { name: string; legacy: string; label: string; hint: string }[] = [
  { name: 'instagram_url', legacy: 'instagram_url', label: 'Instagram link', hint: 'Leave empty to hide the button' },
  { name: 'facebook_url', legacy: 'facebook_url', label: 'Facebook link', hint: 'Leave empty to hide the button' },
  { name: 'messenger_url', legacy: '', label: 'Messenger link', hint: 'Leave empty to hide the button' },
  { name: 'maps_url', legacy: 'google_maps_url', label: 'Google Maps link', hint: 'Your BigBamBoo pin, not maps.google.com' },
  { name: 'grab_url', legacy: 'grab_url', label: 'Grab link', hint: 'Your BigBamBoo page on Grab, not food.grab.com' },
]

const LINK_DEFAULTS: Record<string, string> = {
  messenger_url: 'https://m.me/bigbamboo.vn',
}

export type Settings = Record<string, string>

// home_<name>_<lang>  →  legacy unprefixed key  →  built-in default.
export function resolve(settings: Settings, lang: Lang, name: string): string {
  const own = settings[`home_${name}_${lang}`]
  if (own && own.trim()) return own
  const legacy = LEGACY_TEXT[name] ? settings[LEGACY_TEXT[name]] : ''
  if (legacy && legacy.trim()) return legacy
  return DEFAULTS[lang][name] ?? DEFAULTS.en[name] ?? ''
}

// home_<name>  →  legacy unprefixed key  →  default. Empty means "hide the button".
export function resolveLink(settings: Settings, name: string): string {
  const own = settings[`home_${name}`]
  if (own && own.trim()) return own.trim()
  const entry = LINKS.find(l => l.name === name)
  const legacy = entry?.legacy ? settings[entry.legacy] : ''
  if (legacy && legacy.trim()) return legacy.trim()
  return LINK_DEFAULTS[name] || ''
}

// Menu section labels. Anything not listed is prettified from its key
// ("grilled_cheese" → "Grilled Cheese"), which is what the old page did.
export const SECTIONS: Record<Lang, Record<string, { label: string; note: string }>> = {
  en: {
    cocktails: { label: 'Cocktails', note: "All on draft · Ask about today's specials" },
    beer: { label: 'Beer', note: 'All on draft · Cold & rotating' },
    wine: { label: 'Wine', note: 'By the glass or the bottle' },
    shots: { label: 'Shots', note: 'Chilled & ready' },
    na: { label: 'Non-Alcoholic', note: 'On tap & chilled' },
    bites: { label: 'Bar Bites', note: 'Proper food · No nonsense' },
    special_events: { label: 'Special Events', note: '' },
  },
  vi: {
    cocktails: { label: 'Cocktail', note: 'Tất cả từ vòi · Hỏi về đặc biệt hôm nay' },
    beer: { label: 'Bia', note: 'Tất cả từ vòi · Lạnh & luân phiên' },
    wine: { label: 'Rượu vang', note: 'Theo ly hoặc theo chai' },
    shots: { label: 'Shots', note: 'Ướp lạnh & sẵn sàng' },
    na: { label: 'Không cồn', note: 'Từ vòi & ướp lạnh' },
    bites: { label: 'Đồ ăn nhẹ', note: 'Đồ ăn đúng chất · Không rườm rà' },
    special_events: { label: 'Sự kiện đặc biệt', note: '' },
  },
}

export function sectionLabel(key: string, lang: Lang): { label: string; note: string } {
  const known = SECTIONS[lang][key] || SECTIONS.en[key]
  if (known) return known
  const label = key.replace(/_/g, ' ').replace(/\b\w/g, c => c.toUpperCase())
  return { label, note: '' }
}

// Menu item tags, as typed into the dashboard.
const TAGS: Record<string, string> = {
  bestseller: 'Bán chạy', new: 'Mới', craft: 'Thủ công', limited: 'Giới hạn',
  local: 'Địa phương', vegan: 'Thuần chay', spicy: 'Cay', 'no alcohol': 'Không cồn',
  'on tap': 'Từ vòi', "chef's pick": 'Đầu bếp chọn', 'crowd pleaser': 'Yêu thích',
}

export function translateTag(tag: string, lang: Lang): string {
  if (lang === 'en') return tag
  return TAGS[tag.toLowerCase().trim()] || tag
}

export function priceLabel(kind: 'glass' | 'bottle' | 'pint', lang: Lang): string {
  const en = { glass: 'Glass', bottle: 'Bottle', pint: 'Pint' }
  const vi = { glass: 'Ly', bottle: 'Chai', pint: 'Vại' }
  return (lang === 'vi' ? vi : en)[kind]
}

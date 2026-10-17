'use client'
// ═══════════════════════════════════════════════════════════════
//  BigBamBoo admin translations
//  EN is the authoritative source. VI is a working baseline —
//  have a native Vietnamese speaker review before you rely on it.
// ═══════════════════════════════════════════════════════════════
import { useEffect, useState } from 'react'

export type Lang = 'en' | 'vi'
export const ADMIN_LANG_KEY = 'bbb_admin_lang'

// ── tiny cross-component store so every page flips at once ──
let current: Lang = 'en'
const listeners = new Set<(l: Lang) => void>()

export function getAdminLang(): Lang {
  return current
}

export function setAdminLang(l: Lang) {
  current = l
  try { localStorage.setItem(ADMIN_LANG_KEY, l) } catch { /* private mode */ }
  listeners.forEach(fn => fn(l))
}

/** Reads the saved language on mount, then keeps every subscriber in sync. */
export function useAdminLang(): [Lang, (l: Lang) => void] {
  const [lang, setLang] = useState<Lang>(current)

  useEffect(() => {
    let saved: Lang | null = null
    try { saved = localStorage.getItem(ADMIN_LANG_KEY) as Lang | null } catch { /* private mode */ }
    if (saved === 'en' || saved === 'vi') {
      current = saved
      setLang(saved)
    }
    listeners.add(setLang)
    return () => { listeners.delete(setLang) }
  }, [])

  return [lang, setAdminLang]
}

/** `const { t, lang } = useT()` in any client component. */
export function useT() {
  const [lang] = useAdminLang()
  return { lang, t: dict[lang], isVi: lang === 'vi' }
}

/** Picks the Vietnamese value when it exists, else falls back to English. */
export function pick(lang: Lang, en?: string | null, vi?: string | null): string {
  if (lang === 'vi') return (vi && vi.trim()) || en || ''
  return en || ''
}

const en = {
  // ── chrome ──
  language: 'Language',
  english: 'English',
  vietnamese: 'Tiếng Việt',

  nav: {
    Overview: 'Overview',
    Financials: 'Financials',
    Dashboard: 'Dashboard',
    'Daily Sales': 'Daily Sales',
    'Add Purchase': 'Add Purchase',
    'Scan Invoice': 'Scan Invoice',
    'Delivery import': 'Delivery import',
    'Square POS': 'Square POS',
    Labor: 'Labor',
    'Cash management': 'Cash management',
    'Cash-outs': 'Cash-outs',
    'Event P&L': 'Event P&L',
    'Menu map': 'Menu map',
    Categories: 'Categories',
    'Menu & Events': 'Menu & Events',
    Menu: 'Menu',
    Events: 'Events',
    Tickets: 'Tickets',
    'Event Pitches': 'Event Pitches',
    'Venue Calendar': 'Venue Calendar',
    Recipes: 'Recipes',
    Margins: 'Margins',
    'Ask your data': 'Ask your data',
    SOPs: 'SOPs',
    'Stock counts': 'Stock counts',
    'Kitchen Mode': 'Kitchen Mode',
    'Bar Mode': 'Bar Mode',
    'Cashier Sheet': 'Cashier Sheet',
    Kitchen: 'Kitchen',
    Ingredients: 'Ingredients',
    Stock: 'Stock',
    Bar: 'Bar',
    Jukebox: 'Jukebox',
    'Requests & Queue': 'Requests & Queue',
    Engagement: 'Engagement',
    'QR Game': 'QR Game',
    Loyalty: 'Loyalty',
    'Prize Claims': 'Prize Claims',
    'Scan / Redeem': 'Scan / Redeem',
    Admin: 'Admin',
    'Opening Hours': 'Opening Hours',
    Profile: 'Profile',
    Staff: 'Staff',
    Settings: 'Settings',
  } as Record<string, string>,

  // ── shared ──
  common: {
    save: 'Save',
    saving: 'Saving…',
    saved: 'Saved',
    cancel: 'Cancel',
    close: 'Close',
    edit: 'Edit',
    done: 'Done',
    remove: 'Remove',
    removed: 'Removed',
    refresh: 'Refresh',
    loading: 'Loading…',
    today: 'Today',
    date: 'Date',
    description: 'Description',
    optional: 'optional',
    tryAgain: "Couldn't save. Try again.",
  },

  // ── teaser field ──
  teaser: {
    labelEn: 'Teaser (English)',
    labelVi: 'Teaser (Tiếng Việt)',
    words: (n: number, max: number) => `${n} / ${max} words`,
    hint: 'One line that makes people want in. Shown under the name on the public calendar.',
    hintVi: 'The Vietnamese version. Leave it blank and the English one shows instead.',
    atMax: "That's the lot — 15 words max. Trim something to add more.",
    placeholder: 'Vinyl, natural wine and zero pretension.',
    placeholderVi: 'Nhạc đĩa than, rượu vang tự nhiên, không màu mè.',
  },

  // ── events page ──
  events: {
    title: 'Events',
    total: (n: number) => `${n} event${n !== 1 ? 's' : ''} total`,
    create: '+ Create Event',
    createConfirm: 'Create Event',
    newEvent: 'New Event',
    eventTitle: 'Event Title',
    eventTitleVi: 'Event Title (Tiếng Việt)',
    titleViHint: 'Leave blank if the name works in both languages.',
    type: 'Type',
    startTime: 'Start Time',
    endTime: 'End Time',
    start: 'Start',
    end: 'End',
    facebookLink: 'Facebook Event Link',
    facebookShort: 'Facebook Link',
    photoUrl: 'Event Photo URL',
    photoShort: 'Photo URL',
    ticketing: 'Ticketing',
    freeEntry: 'Free entry',
    paidTickets: 'Paid tickets',
    free: 'Free',
    paid: 'Paid',
    ticketPrice: 'Ticket Price (VND)',
    price: 'Price (VND)',
    buyLink: 'Buy Tickets Link',
    ticketLink: 'Ticket Link',
    showOrderForm: 'Show our Buy-now order form on the site',
    showOrderFormHint: '(uncheck if you sell tickets via the link above)',
    capacity: 'Capacity',
    unlimited: 'Leave blank = unlimited',
    unlimitedShort: 'Unlimited',
    rsvpOnSite: 'Show RSVP form on site',
    rsvpShort: 'RSVP on site',
    recurring: 'Recurring',
    isRecurring: 'This is a recurring event',
    recurringShort: 'Recurring event',
    weekly: 'Every week',
    biweekly: 'Every 2 weeks',
    monthly: 'Every month',
    weeklyBadge: 'Weekly',
    biweeklyBadge: 'Biweekly',
    monthlyBadge: 'Monthly',
    published: 'Published',
    draft: 'Draft',
    attendees: 'Attendees',
    hide: 'Hide',
    attendeesCount: (n: number) => `Attendees — ${n} registered`,
    noRsvps: 'No RSVPs yet',
    name: 'Name',
    contact: 'Contact',
    qty: 'Qty',
    status: 'Status',
    checkIn: 'Check In',
    checkedIn: 'Checked In',
    notYet: 'Not yet',
    undo: 'Undo',
    created: 'Event created',
    loadingEvents: 'Loading events…',
    empty: 'No events yet. Create your first event above.',
    upcoming: 'Upcoming & Active',
    past: 'Past Events',
    confirmRemove: 'Remove this event?',
    placeholderTitle: 'BigBamBoo Sunday Market',
    placeholderType: 'Sunday Market / Live Music / Party',
    placeholderDesc: 'Short event description',
  },

  // ── venue calendar ──
  cal: {
    title: 'Venue calendar',
    blurb: 'Click a date to book it, hold it or block it. Whatever stays open shows as available to promoters on',
    booked: 'booked',
    onHold: 'on hold',
    openTrading: 'open Fri–Sun',
    statusBooked: 'Booked',
    statusHold: 'On hold',
    statusBlocked: 'Blocked',
    statusOpen: 'Open',
    ticketedEvent: 'Ticketed event',
    legendNote: 'Fri–Sun are shaded as trading nights. Published events fill their own date automatically.',
    dateUpdated: 'Date updated',
    dateOpened: 'Date is open again',
    markOpen: 'Mark open',
    saveDate: 'Save date',
    status: 'Status',
    nameLabel: 'Name',
    nameLabelVi: 'Name (Tiếng Việt)',
    nameHint: "What's on. Shown publicly only if you switch it on below.",
    nameViHint: 'Leave blank and the English name shows instead.',
    namePlaceholder: 'Private event, wedding, deep clean…',
    showPublicly: 'Show this publicly',
    showPubliclyOn: 'Promoters see the name and teaser — free marketing',
    showPubliclyOff: 'Promoters just see “Booked”',
    privateNote: 'Private note',
    privateNoteHint: 'Only you see this. Never leaves the admin.',
    privateNotePlaceholder: 'Deposit paid, contact name…',
    eventLocked: 'This date is filled by a published event, teaser and all. Edit it on the Events page — changes show up here and on the public calendar automatically.',
    eventPrefix: 'Ticketed event:',
    prevMonth: 'Previous month',
    nextMonth: 'Next month',
    months: ['January','February','March','April','May','June','July','August','September','October','November','December'],
    dows: ['Mon','Tue','Wed','Thu','Fri','Sat','Sun'],
    locale: 'en-GB',
  },
}

const vi: typeof en = {
  language: 'Ngôn ngữ',
  english: 'English',
  vietnamese: 'Tiếng Việt',

  nav: {
    Overview: 'Tổng quan',
    Financials: 'Tài chính',
    Dashboard: 'Bảng điều khiển',
    'Daily Sales': 'Doanh thu hằng ngày',
    'Add Purchase': 'Thêm chi mua',
    'Scan Invoice': 'Quét hoá đơn',
    'Delivery import': 'Nhập đơn giao hàng',
    'Square POS': 'Square POS',
    Labor: 'Nhân công',
    'Cash management': 'Quản lý tiền mặt',
    'Cash-outs': 'Chi tiền mặt',
    'Event P&L': 'Lãi/lỗ sự kiện',
    'Menu map': 'Sơ đồ thực đơn',
    Categories: 'Danh mục',
    'Menu & Events': 'Thực đơn & Sự kiện',
    Menu: 'Thực đơn',
    Events: 'Sự kiện',
    Tickets: 'Vé',
    'Event Pitches': 'Đề xuất sự kiện',
    'Venue Calendar': 'Lịch địa điểm',
    Recipes: 'Công thức',
    Margins: 'Biên lợi nhuận',
    'Ask your data': 'Hỏi dữ liệu',
    SOPs: 'Quy trình',
    'Stock counts': 'Kiểm kho',
    'Kitchen Mode': 'Chế độ bếp',
    'Bar Mode': 'Chế độ quầy bar',
    'Cashier Sheet': 'Bảng thu ngân',
    Kitchen: 'Bếp',
    Ingredients: 'Nguyên liệu',
    Stock: 'Tồn kho',
    Bar: 'Quầy bar',
    Jukebox: 'Jukebox',
    'Requests & Queue': 'Yêu cầu & Hàng chờ',
    Engagement: 'Tương tác',
    'QR Game': 'Trò chơi QR',
    Loyalty: 'Khách thân thiết',
    'Prize Claims': 'Nhận thưởng',
    'Scan / Redeem': 'Quét / Đổi thưởng',
    Admin: 'Quản trị',
    'Opening Hours': 'Giờ mở cửa',
    Profile: 'Hồ sơ',
    Staff: 'Nhân viên',
    Settings: 'Cài đặt',
  },

  common: {
    save: 'Lưu',
    saving: 'Đang lưu…',
    saved: 'Đã lưu',
    cancel: 'Huỷ',
    close: 'Đóng',
    edit: 'Sửa',
    done: 'Xong',
    remove: 'Xoá',
    removed: 'Đã xoá',
    refresh: 'Làm mới',
    loading: 'Đang tải…',
    today: 'Hôm nay',
    date: 'Ngày',
    description: 'Mô tả',
    optional: 'không bắt buộc',
    tryAgain: 'Không lưu được. Thử lại nhé.',
  },

  teaser: {
    labelEn: 'Teaser (English)',
    labelVi: 'Teaser (Tiếng Việt)',
    words: (n: number, max: number) => `${n} / ${max} từ`,
    hint: 'Một dòng khiến người ta muốn tham gia. Hiện dưới tên trên lịch công khai.',
    hintVi: 'Bản tiếng Việt. Để trống thì bản tiếng Anh sẽ hiện thay.',
    atMax: 'Hết chỗ rồi — tối đa 15 từ. Bớt một chữ để thêm chữ khác.',
    placeholder: 'Vinyl, natural wine and zero pretension.',
    placeholderVi: 'Nhạc đĩa than, rượu vang tự nhiên, không màu mè.',
  },

  events: {
    title: 'Sự kiện',
    total: (n: number) => `Tổng ${n} sự kiện`,
    create: '+ Tạo sự kiện',
    createConfirm: 'Tạo sự kiện',
    newEvent: 'Sự kiện mới',
    eventTitle: 'Tên sự kiện',
    eventTitleVi: 'Tên sự kiện (Tiếng Việt)',
    titleViHint: 'Để trống nếu tên dùng được cho cả hai ngôn ngữ.',
    type: 'Loại',
    startTime: 'Giờ bắt đầu',
    endTime: 'Giờ kết thúc',
    start: 'Bắt đầu',
    end: 'Kết thúc',
    facebookLink: 'Link sự kiện Facebook',
    facebookShort: 'Link Facebook',
    photoUrl: 'Link ảnh sự kiện',
    photoShort: 'Link ảnh',
    ticketing: 'Bán vé',
    freeEntry: 'Vào cửa miễn phí',
    paidTickets: 'Vé có phí',
    free: 'Miễn phí',
    paid: 'Có phí',
    ticketPrice: 'Giá vé (VND)',
    price: 'Giá (VND)',
    buyLink: 'Link mua vé',
    ticketLink: 'Link vé',
    showOrderForm: 'Hiện form đặt vé của mình trên website',
    showOrderFormHint: '(bỏ chọn nếu bán vé qua link ở trên)',
    capacity: 'Sức chứa',
    unlimited: 'Để trống = không giới hạn',
    unlimitedShort: 'Không giới hạn',
    rsvpOnSite: 'Hiện form đăng ký trên website',
    rsvpShort: 'Đăng ký trên web',
    recurring: 'Lặp lại',
    isRecurring: 'Đây là sự kiện lặp lại',
    recurringShort: 'Sự kiện lặp lại',
    weekly: 'Mỗi tuần',
    biweekly: 'Mỗi 2 tuần',
    monthly: 'Mỗi tháng',
    weeklyBadge: 'Hằng tuần',
    biweeklyBadge: 'Hai tuần một lần',
    monthlyBadge: 'Hằng tháng',
    published: 'Đã đăng',
    draft: 'Nháp',
    attendees: 'Khách đăng ký',
    hide: 'Ẩn',
    attendeesCount: (n: number) => `Khách đăng ký — ${n} người`,
    noRsvps: 'Chưa có ai đăng ký',
    name: 'Tên',
    contact: 'Liên hệ',
    qty: 'SL',
    status: 'Trạng thái',
    checkIn: 'Check-in',
    checkedIn: 'Đã check-in',
    notYet: 'Chưa',
    undo: 'Hoàn tác',
    created: 'Đã tạo sự kiện',
    loadingEvents: 'Đang tải sự kiện…',
    empty: 'Chưa có sự kiện nào. Tạo sự kiện đầu tiên ở trên.',
    upcoming: 'Sắp diễn ra & Đang chạy',
    past: 'Sự kiện đã qua',
    confirmRemove: 'Xoá sự kiện này?',
    placeholderTitle: 'Chợ phiên Chủ nhật BigBamBoo',
    placeholderType: 'Chợ phiên / Nhạc sống / Tiệc',
    placeholderDesc: 'Mô tả ngắn về sự kiện',
  },

  cal: {
    title: 'Lịch địa điểm',
    blurb: 'Bấm vào một ngày để đặt, giữ chỗ hoặc khoá ngày đó. Ngày còn trống sẽ hiện là còn nhận cho các nhà tổ chức tại',
    booked: 'đã đặt',
    onHold: 'đang giữ chỗ',
    openTrading: 'trống T6–CN',
    statusBooked: 'Đã đặt',
    statusHold: 'Đang giữ',
    statusBlocked: 'Đã khoá',
    statusOpen: 'Còn trống',
    ticketedEvent: 'Sự kiện bán vé',
    legendNote: 'T6–CN được tô đậm vì là các đêm kinh doanh. Sự kiện đã đăng tự lấp ngày của nó.',
    dateUpdated: 'Đã cập nhật ngày',
    dateOpened: 'Ngày này đã trống trở lại',
    markOpen: 'Đánh dấu trống',
    saveDate: 'Lưu ngày',
    status: 'Trạng thái',
    nameLabel: 'Tên',
    nameLabelVi: 'Tên (Tiếng Việt)',
    nameHint: 'Nội dung diễn ra. Chỉ hiện công khai nếu bạn bật ở dưới.',
    nameViHint: 'Để trống thì tên tiếng Anh sẽ hiện thay.',
    namePlaceholder: 'Sự kiện riêng, tiệc cưới, tổng vệ sinh…',
    showPublicly: 'Hiện công khai',
    showPubliclyOn: 'Nhà tổ chức thấy tên và teaser — quảng bá miễn phí',
    showPubliclyOff: 'Nhà tổ chức chỉ thấy “Đã đặt”',
    privateNote: 'Ghi chú riêng',
    privateNoteHint: 'Chỉ mình bạn thấy. Không bao giờ hiện ra ngoài.',
    privateNotePlaceholder: 'Đã cọc, tên người liên hệ…',
    eventLocked: 'Ngày này được lấp bởi một sự kiện đã đăng, kèm cả teaser. Sửa ở trang Sự kiện — thay đổi sẽ tự hiện ở đây và trên lịch công khai.',
    eventPrefix: 'Sự kiện bán vé:',
    prevMonth: 'Tháng trước',
    nextMonth: 'Tháng sau',
    months: ['Tháng 1','Tháng 2','Tháng 3','Tháng 4','Tháng 5','Tháng 6','Tháng 7','Tháng 8','Tháng 9','Tháng 10','Tháng 11','Tháng 12'],
    dows: ['T2','T3','T4','T5','T6','T7','CN'],
    locale: 'vi-VN',
  },
}

export const dict = { en, vi }

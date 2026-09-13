# Handover: rebuild the bigbamboo.app homepage

Written 13 September 2026, for whoever picks this up next (Claude Code on Shawn's Mac).
Read `CLAUDE.md` in the repo root first — it has the standing rules. This file is the job.

## Where things stand

The domain move is **done**. bigbamboo.app now resolves to Vercel (A `@` → 216.150.1.1) and
www 308-redirects to it. Email was deliberately left on Hostinger: the MX records
(mx1/mx2.hostinger.com), the SPF line and the Resend verification TXT must never be touched.

What is live right now at bigbamboo.app is a **holding homepage** (`src/app/site`): hero,
status strip, live events from the `events` table, a Collab Fest block, a Visit section, a
footer. It is honest and editable, but it is not the old site. Your job is to replace it
with a faithful rebuild of the old one.

## The source material

`~/Documents/Claude/Projects/BigBamBoo/old-hostinger-site/` — the real Hostinger files,
downloaded from `public_html`:

- `index.html` (1,714 lines) — the entire old homepage: markup, CSS and JS in one file.
  It already talks to the same Supabase project for menu items and events.
- `bb-addons.js` — the add-ons bundle (popups and extras).
- `images/` — logo (`bbb-img-4.jpg`), hero (`bbb-img-5.png`), `payment-qr.png`,
  `zalo-qr.png`, event art.
- `pitch.html`, `pitch/`, `default.php` — the event-pitch page and leftovers.

Read `index.html` properly before writing anything. It is the design brief.

## What the old homepage contains

1. **Header** — logo, wordmark, in-page nav (Menu, Events, Visit, Drink Club), language
   switcher (was EN/VI/KO/JA — **now EN/VI only**).
2. **Hero** — image, "Cold drinks. Breezy nights. No bad vibes.", the tiki/tropical subline,
   buttons for Menu, Events and "Spin to Win" (`/scan-tap-win.html`), social links.
3. **Status strip** — three cards: status, location, this week. **Hours are event-based
   now** — do not print a weekly schedule.
4. **Menu** (`#menu`) — filter tabs (All, Cocktails, Beer, Non-Alcoholic, Bar Bites) over
   items from `menu_items` (fields include `name`, `name_vi`, `description`,
   `description_vi`, the `price_*` columns, `section`, `is_available`, `is_draft`,
   `sort_order`).
5. **Events** (`#events`) — upcoming events from `events`.
6. **Merch** — "Coming Soon".
7. **Drinks Club** (`#club`) — "Buy 10 / Get 1 Free", notify-me capture, "digital stamp card
   launching soon".
8. **Visit** (`#visit`) — address, buttons (Maps, Instagram, Facebook, Grab), hours table.
9. **Footer**.
10. **Ticket modal** — name, email, phone, ticket count, Techcombank QR, account details,
    WhatsApp/Zalo confirmation links.

## Build it in this order

1. **Port the homepage** into `src/app/site` with the old look intact — the same type,
   colours, spacing and section order. Keep the section ids (`#menu`, `#events`, `#club`,
   `#visit`) so old links still land. Images go in `public/`.
2. **Make every string editable.** Follow the `home_*` pattern already in
   `src/app/dashboard/site/page.tsx` and add the new fields to that editor. Menu and events
   come from their tables and are edited on their existing dashboard pages.
3. **Ticket flow.** Rebuild the modal, and save orders into Supabase so Shawn can see who
   has paid instead of collecting screenshots. There is an existing `ticket_orders` table
   and a `/dashboard/tickets` page — use them rather than inventing something.
4. **Spin to Win** (`scan-tap-win.html`) — it lived on Hostinger and is now unreachable.
   Port it or retire it; ask Shawn.
5. **Drinks Club sign-ups** need somewhere to land. Ask before inventing a table.

## Fix while you're in there

- Instagram and Facebook links were `#` placeholders. They are `home_instagram_url` and
  `home_facebook_url` in settings now — leave the buttons hidden when empty.
- "Open in Maps" and "Grab" pointed at maps.google.com and food.grab.com, not at BigBamBoo.
- The old page loaded fonts from Google and scripts from a CDN; prefer `next/font` and
  local imports.

## Decisions already made (don't relitigate)

- English and Vietnamese only.
- Keep the old look — people like it. This is a port, not a redesign.
- Hours: event-based, no weekly table.
- The Collab Fest page is separate and already built; the homepage links to it.
- Shawn dislikes pill shapes. Squarish, slightly rounded, everywhere.

## How to work

Edit, `npm run build`, commit, push — Vercel deploys `main` automatically. You cannot see
your own output: after pushing, ask Shawn to look, or ask the Cowork session (which has
browser access) to screenshot the live page and report back. Do not guess at visual results.

Keep `~/Documents/Claude/Projects/BigBamBoo/BIGBAMBOO_HANDOFF.md` updated with what shipped.

# BigBamBoo admin + website — working notes

One Next.js 14 app (App Router, TypeScript) serves everything, split by hostname:

- **bigbamboo.app / www.bigbamboo.app** → the public website (`src/app/site`), via host rewrites in `next.config.js`. www 308-redirects to the bare domain (set in Vercel).
- **admin.bigbamboo.app** → the staff dashboard (`src/app/dashboard`), Supabase auth.
- **jukebox.bigbamboo.app** → the jukebox (`src/app/jukebox`), its own host rewrites.
- Public, no-login pages also live under `src/app/brewasia/*` and are reachable on either host.

Data is Supabase (project `hodqpckslglxuyhitlgh`). Browser code uses the anon client in
`src/lib/supabase`; API routes use `getServiceClient()`. Deploys are automatic on push to
`main` (Vercel project `bigbamboo-admin`, team LaidBackLabs).

## The rule that matters most

**Shawn edits content, not code.** Anything a person might want to reword, re-price or
re-link lives in the `site_settings` table (`key`, `value`) and is edited from the
dashboard. Public pages read those keys and fall back to sensible defaults in code when a
key is empty. Never hard-code a price, a date, a phone number or a piece of marketing copy
into a public page without also giving it a key and an editor field.

Key prefixes in use:

- `home_*` — the public homepage. Text keys are per language: `home_<name>_en`,
  `home_<name>_vi`. Links are shared: `home_instagram_url`, `home_facebook_url`,
  `home_grab_url`. Editor: **Dashboard → Website → Homepage** (`src/app/dashboard/site`).
- `fest_*` — the Halloween Collab Fest page. Same shape: `fest_<name>_en` / `_vi`, plus
  `fest_poster_url`, `fest_ticket_url`, `fest_contact_url`, `fest_starts_at`. Editor:
  the **Collab sign-up** panel on the Collabs page → "Edit page"
  (`src/components/brewasia/FestEditor.tsx`).

## Translation

`POST /api/admin/ops/translate` (staff-auth, Gemini) turns English strings into Vietnamese.
The Homepage editor has "Fill in Vietnamese" (empty boxes only) and "Redo all Vietnamese".
Output is a suggestion for a person to check, never published blind. The site is **English
and Vietnamese only** — Korean and Japanese were dropped on purpose.

## Design rules (Shawn's, learned the hard way)

- **No pill shapes.** Buttons, toggles and selects are squarish with slightly rounded
  corners, everywhere.
- **Gold, not orange**, in the admin. `--accent` and friends in `globals.css`.
- Event pages can be loud: the Collab Fest page is deliberately big, bold and Halloween-ish
  (`.fest-*` in `globals.css`, poster-style display face via `next/font`).
- Public pages are **EN/VI with a language toggle**, remembered in `localStorage`.
- Every public page must work at phone width.

## BrewAsia 2026 (the current push)

Conference Tue 27 Oct · Friday Ale Trail Fri 30 Oct · Halloween Collab Fest Sat 31 Oct at
BigBamBoo, 4pm–midnight.

- `src/app/dashboard/kegs` — every keg: who from, where it's going, status, source.
  Screenshot/photo scanning via Gemini (`/api/admin/ops/keg-scan`).
- `src/app/dashboard/collabs` — collab pairings, status pipeline, kegs per event.
- `src/app/dashboard/producers` — breweries and suppliers.
- `src/app/brewasia/donate` — public keg sign-up for the conference (one shared link, plus
  private per-brewery edit links). Minimum 2 kegs; 1 visitor pass per donating brewery.
- `src/app/brewasia/collab` — public collab sign-up, lands on the Collabs page tagged
  "Form".
- `src/app/brewasia/collabfest` — the public Fest page. **Only collabs at status
  `event_ready` or `done` appear.** Earlier statuses stay private on purpose.

Money on the night: 100k at the door, free with a BrewAsia conference pass; tasting packs
200k (4 tokens + glass) and 500k (10 tokens + glass); one token = one pour of any collab
beer, whatever the strength; top-ups at the same price.

## Housekeeping

- Type-check before pushing: `npx tsc --noEmit`. `npm run build` catches the rest.
- Don't add browser storage to anything that must be shared or read back later — that
  belongs in Supabase.
- The running log of what shipped and why lives outside the repo in
  `~/Documents/Claude/Projects/BigBamBoo/BIGBAMBOO_HANDOFF.md`. Keep adding to it.

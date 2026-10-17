# Claude Code handover — build Venue OS (17 Oct 2026)

## What we're building
**Venue OS**: one clean, neutral codebase that runs all of Shawn's businesses and can later be sold to
other small businesses. Shawn owns it personally (GitHub `shawndjkidd`). Working name; may change.

It starts from **Barcade's admin code** (`~/barcade-admin`, the best dashboard + backend), with every
venue name, currency, bank and POS stripped out into settings, so the code itself is pure.

## Structure
1. **Core** (every business gets it): auth/staff/roles, P&L, cash, payables, labor/payroll,
   recipes + COGS, ingredients/stock, suppliers, purchases, month close, tasks, Command Centre report.
2. **Business-model packs** (plug-and-play, switched on per business):
   - **Venue pack** — bar/restaurant: daily sales, cash-outs, floats, stations (bar/kitchen), menu map,
     events/tickets, bookings. *Build now* (Barcade + BigBamBoo).
   - **Brewery / wholesale pack** — Slow Life model: accounts CRM, orders, kegs, batches, batch costing,
     deliveries. *Design the hooks now, build later.* Reference (read-only): GitHub
     `shawndjkidd/slowlife`, `slowlife-admin`, `slowlife-tap-room`.
   - Future packs (events, distribution) use the same pattern.
3. **Connectors** (swappable adapters into one standard format):
   - POS: Square (BigBamBoo), Eats365 (Barcade), new Vietnamese POS (name TBC). Each reads sales into
     the core's standard sales tables. Switching POS = swapping the adapter.
   - Banks: E.SUN / Fubon scrapes (Barcade). Others later.
4. **Add-ons**: jukebox, public website, Drinks Club/loyalty, game, AI (Gemini) helpers.
5. **Business settings** (one file/row per business): name, slug, currency, timezone, day cutoff,
   languages, branding, which packs/connectors/add-ons are on.

Rule: nothing in core or packs may name a real business. `grep -ri "barcade\|bigbamboo\|taipei\|fubon\|esun\|eats365\|square"` outside `settings/` and `connectors/` must come back empty.

Tenancy: **one database per business** (as today). Every table keeps `venue_id` and RLS checks it, so
a shared database stays possible later.

## The businesses today
| | BigBamBoo | Barcade |
|---|---|---|
| Repo (old) | ~/bigbamboo-admin → admin.bigbamboo.app, jukebox., bigbamboo.app | ~/barcade-admin → admin.barcadetaiwan.com |
| Supabase | hodqpckslglxuyhitlgh | hpswhsrjygumqzkgqizl |
| Currency / TZ / cutoff | VND / Asia/Ho_Chi_Minh / 3am | TWD (0-dec) / Asia/Taipei / 5am |
| POS | Square (API) | Eats365 |
| Packs/add-ons | Venue; jukebox, public site, club, calendar, pitches, Ask-your-data, cashier, stock counts | Venue; bank feeds, payables, Peter's float, month close |

BigBamBoo already had BrewAsia removed (17 Oct). Don't bring BrewAsia back.

## Hard rules
- **Barcade: read only, always.** Never change ~/barcade-admin, its Vercel project or its database.
  Barcade moves to Venue OS only when Shawn says so, after side-by-side checks, with rollback ready.
- **BigBamBoo's live site doesn't change** until Venue OS is proven on a preview and Shawn says switch.
  The switch = point BigBamBoo's domains at the new Vercel project (one-click rollback).
- Never touch real production data destructively. Read-only queries against prod are fine for checking.

## Phases (run hands-off; Shawn wants to be hands-off)
1. **Map** — read both repos + both schemas + Barcade `docs/product-audit/` (esp. 07, 08). Write
   `docs/GAP-MAP.md` in venue-os: every route/table/view/function → core / venue pack / connector /
   add-on / business-specific; every hardcoded value; open security items; where BigBamBoo-only features
   land. Skim the Slow Life repos and note the hooks the brewery pack will need.
2. **Scaffold** — create `~/venue-os` (fresh git repo, no old history). Create GitHub repo
   `shawndjkidd/venue-os` (private) with `gh`. Folder layout matching the structure above.
3. **Core + venue pack** — port Barcade's code into it, de-named. Settings for both businesses.
   Schema as clean numbered migrations (no prod dumps with data).
4. **Security** — fix the audit's open items in the new code (anon PIN read, PIN rate limit,
   unauthenticated OCR/Square routes, RLS that ignores venue_id, CRON_SECRET everywhere).
5. **Connectors + add-ons** — Square adapter and BigBamBoo add-ons (jukebox, site, club…), Eats365 +
   bank adapters ported from Barcade unchanged in behaviour.
6. **Test** — run locally against a local Supabase (`supabase start`; colima/docker is installed),
   seeded with fake data. Add tests for the money maths (P&L, cash, payables) comparing to Barcade's
   current outputs. Then a Vercel preview project `venue-os` for BigBamBoo settings.
7. **Report** — `docs/where-we-are/YYYY-MM-DD-<topic>.md` after each phase; at the end, a checklist of
   what Shawn needs to approve the BigBamBoo switch.

**Stop and ask Shawn only for:** creating anything that costs money (new Supabase project, paid plans),
logins you don't have (gh, vercel, supabase — tell him the exact command), the BigBamBoo domain switch,
any change to production data, or a choice that can't be undone.

## Style
- Very concise. End every report with what Shawn needs to do + your questions. Hand commands in fenced
  blocks labelled "paste in Terminal".
- UI: squarish buttons (radius ~4), never pills. Gold `#E0B84E`, not orange. Green money in, red out.
- Before changing how a screen looks vs Barcade today: mockup, wait for yes. (Pure de-naming isn't a UI change.)
- Next.js bracket paths: quote them, use `$HOME`. If build EAGAINs: `ulimit -n 8192`.

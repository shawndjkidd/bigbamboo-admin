# Claude Code handover — bring Barcade's backend into BigBamBoo (17 Oct 2026)

## Goal
Shawn thinks Barcade's admin (dashboard + backend) is better than BigBamBoo's. Get BigBamBoo
onto it. Later, the same backend gets wired into the POS.

## Decisions (Shawn, 17 Oct 2026)
- **One shared codebase** for all venues. Each venue: own database, own domain, own settings file.
- **Laidback Labs owns the code.** Barcade and BigBamBoo are customers (licensees), not owners.
- **It will be sold to other small businesses** (software only). Build it as a product from day one:
  no venue names, currencies, banks or POS hardcoded in the core; everything venue-specific is a
  setting or an optional module.
- Venues may grow very different, and one may add distribution (wholesale, deliveries, keg tracking).
  So: a shared **core** (P&L, cash, payables, labor, recipes/COGS, stock, staff/roles) plus
  **modules** switched on per venue (Square, Eats365, bank feeds, jukebox, public site, distribution).
- Changes go live at one venue first, then the rest after checking.

## The two repos (both on this Mac)
- `~/barcade-admin` — Barcade Taiwan. Live: admin.barcadetaiwan.com. Supabase `hpswhsrjygumqzkgqizl`.
  Forked FROM BigBamBoo on 2026-06-09, ~860 commits since. 56 migrations. POS: Eats365.
  Read its `CLAUDE.md`, `SCHEMA.md`, `CLAUDE-CODE-HANDOVER-2026-10-13.md`, `docs/product-audit/`.
- `~/bigbamboo-admin` — BigBamBoo. Live: admin.bigbamboo.app + jukebox.bigbamboo.app + bigbamboo.app.
  Supabase `hodqpckslglxuyhitlgh`. ~190 commits since the fork. 16 migrations. POS: Square (live sync).

## Settings that differ (never mix them up)
| | BigBamBoo | Barcade |
|---|---|---|
| Slug | bigbamboo | barcade |
| Currency | VND | TWD (zero-decimal) |
| Timezone | Asia/Ho_Chi_Minh | Asia/Taipei |
| Day cutoff | 3am | 5am |
| POS | Square (API sync) | Eats365 |
| Bank feeds | none | E.SUN / Fubon scrapes |

## BigBamBoo-only things that must survive
Square sync + `/dashboard/ops/square`, public site (`/site`, bigbamboo.app), jukebox host rewrites,
Drinks Club, calendar, pitches, Ask-your-data (Gemini), cashier, stock counts, Command Centre daily report (05:00 HCMC).

## Already done (17 Oct, commit 516ef22)
BrewAsia removed from BigBamBoo (Kegs/Collabs/Producers, forms, Collab Fest). Redirects to
brewasia.madesmpl.com kept. DB tables `brewasia_*` left alone — do not drop.

## Step 1 — map only, change nothing
1. List every Barcade route/API/table/view/function and mark: same as BigBamBoo / better in Barcade /
   Barcade-only / Taiwan-only (banks, Eats365, Fubon, Peter's float).
2. Diff the `ops` schema of both Supabase projects (structure only).
3. Find every hardcoded venue value in Barcade (slug, TWD, Asia/Taipei, cutoff 5, Eats365, bank names).
4. Read `~/barcade-admin/docs/product-audit/07-SAAS-READINESS.md` and `08-TECHNICAL-DEBT-AND-SECURITY.md`.
   List which of those findings are still open today (e.g. anon can read station PINs, PIN rate
   limits, unauthenticated OCR/Square routes, RLS that never checks venue_id).
5. Write `docs/BARCADE-GAP-MAP.md`: the route/table map, the hardcoded-values list, open security
   items, and a proposed core-vs-module split. Recommend the tenancy model for selling it:
   one database per customer (simplest, safest, what we have now) vs one shared database (cheaper at
   scale, needs the RLS rewrite). Give effort for each.
6. Stop. Shawn approves before any code moves.

## Rules
- Very concise. End every reply with what Shawn needs to do + your questions.
- Shawn pushes. When ready, end with a fenced `cd ~/bigbamboo-admin && git push origin main` block.
- Before any UI change: mockup now vs after, wait for yes.
- Buttons squarish (radius ~4), never pills. Gold not orange.
- Never touch Barcade's production DB or repo while mapping — read only.
- Next.js bracket paths: quote them, use `$HOME` not `~`. If build EAGAINs: `ulimit -n 8192`.
- After each push, test the live site; write a "Where we are" note in `docs/`.

# Ops Module — Migration README

`20260601000000_ops_module.sql` adds the BigBamBoo financial / operations module.

## What it creates

All in a dedicated `ops` schema (no collision with jukebox / loyalty / wallet / promo tables).

### Tables
| Table | Purpose |
|---|---|
| `ops.employees` | Anyone on the schedule (links to `staff_users` if they have an app login). |
| `ops.ingredients` | Raw goods. Cost per base unit (ml/g/each), auto-updates from purchases. |
| `ops.ingredient_price_history` | Every observed price — drives latest / average / FIFO methods. |
| `ops.recipes` | Cocktails, kegged batches, food dishes, syrups, sub-recipes. |
| `ops.recipe_components` | Line items in a recipe (ingredient or sub-recipe + qty + unit). |
| `ops.batches` | Physical instances of a kegged/batched recipe with yield variance tracking. |
| `ops.purchases` | All money out — food, booze, utilities, capex, prepaids. |
| `ops.sales_daily` | One row per day per source (manual or Square). |
| `ops.sales_items` | Itemized line-item sales (from Square or manual). |
| `ops.labor_shifts` | Clocked shifts — from manual entry or Square Team. |
| `ops.assets` | CapEx items, depreciated straight-line over useful life. |
| `ops.prepaid_expenses` | Paid-up-front items spread over the period they cover. |
| `ops.pos_imports` | Audit trail of Square / CSV syncs. |
| `ops.period_close` | Monthly lock — super_admin only. |
| `ops.audit_log` | Who changed what, before/after. |

### Views
| View | What it gives you |
|---|---|
| `v_ingredient_current_cost` | Current cost-per-base-unit per ingredient, honoring its `cost_method`. |
| `v_recipe_cost` | Total cost, cost-per-unit, margin-per-unit for every recipe — recursive into sub-recipes. |
| `v_asset_depreciation_monthly` | Monthly straight-line depreciation per active asset. |
| `v_pnl_cash` | Monthly P&L on cash basis (what hit the till). |
| `v_pnl_accrual` | Monthly P&L on accrual basis (CapEx amortized, prepaids spread). |
| `v_theoretical_vs_actual_cogs` | Theoretical COGS (items sold × recipe cost) vs actual purchases. Variance = waste / theft / over-pours. |
| `v_sales_variance_pos_vs_manual` | Day-by-day diff between manual entry and Square import. |

### Triggers
- `purchases.after_insert` → if linked to an ingredient, appends to price history + updates `current_cost_per_base` based on the ingredient's `cost_method` (latest = instant, average = weighted-90-day, fifo/manual = computed in view).
- `audit_row` → captures inserts/updates/deletes on `purchases`, `sales_daily`, `recipes`, `assets` into `ops.audit_log`.

### RLS (role gates)
Uses `public.staff_users.role` from your existing auth model.

| Role | Read | Write data | Manage recipes/ingredients | Build batches | Lock months |
|---|:-:|:-:|:-:|:-:|:-:|
| `super_admin` | All | ✅ | ✅ | ✅ | ✅ |
| `admin` / `manager` | Own venue | ✅ | ✅ | ✅ | ❌ |
| `staff` | Own venue | Insert sales/purchases/shifts | ❌ | ❌ | ❌ |

Staff-can-only-edit-own-entries rule is enforced in the API route handlers (RLS would block managers from helping, which is wrong).

## How to apply

### Via Supabase MCP (preferred — once project is added to Claude's access)
Claude will run `apply_migration` against a dev branch, verify, then merge.

### Manually via Supabase CLI
```bash
cd bigbamboo-app
supabase link --project-ref hodqpckslglxuyhitlgh
supabase db push
```

### Manually via Dashboard
1. Supabase → SQL Editor → paste the contents of `20260601000000_ops_module.sql`
2. Run. Should complete in <5 seconds.

## After applying

1. Seed May 2026 data (separate script, coming next): inserts the sales/purchases/labor from the May P&L xlsx so the dashboard has real data on day one.
2. Add a few starter ingredients + recipes for one or two cocktails so the cost engine can be tested.
3. Wire `/dashboard/ops/*` routes (next batch of work).

## Notes & assumptions

- All currency = VND. Stored as `numeric(14,2)`. No FX yet.
- All timestamps stored UTC; `sales_items.occurred_on` derives from `occurred_at` at HCMC time.
- Daily sales are unique on `(venue_id, occurred_on, source)` — so manual and Square can coexist per day, and we compare them in `v_sales_variance_pos_vs_manual`.
- Recipe cost view handles one level of sub-recipe nesting. Deeper nesting will need this view materialized — flag if you start building 3+ levels deep.
- Average cost method uses a rolling 90-day window. Tweak in the view + trigger if you'd rather use lifetime or last-N-purchases.

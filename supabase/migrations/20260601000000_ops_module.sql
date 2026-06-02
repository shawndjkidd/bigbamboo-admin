-- ============================================================================
-- OPS MODULE — BigBamBoo financial / operations dashboard
-- ============================================================================
-- Adds a dedicated `ops` schema with:
--   • Sales (daily + itemized) + purchases + labor
--   • Ingredient / recipe / batch cost engine (auto-updates with purchases)
--   • CapEx (depreciated) + prepaid expenses (amortized)
--   • Monthly close + audit log
--   • Views for live P&L (cash + accrual), theoretical-vs-actual COGS
--   • RLS for super_admin / manager / staff
-- ============================================================================

create schema if not exists ops;
grant usage on schema ops to authenticated, service_role;

-- ----------------------------------------------------------------------------
-- helpers
-- ----------------------------------------------------------------------------
create or replace function ops.current_staff_role()
returns text language sql stable security definer set search_path = public, ops as $$
  select role
  from public.staff_users
  where email = auth.jwt() ->> 'email'
  limit 1
$$;

create or replace function ops.is_super_admin() returns boolean language sql stable as $$
  select ops.current_staff_role() = 'super_admin'
$$;

create or replace function ops.is_manager_or_above() returns boolean language sql stable as $$
  select ops.current_staff_role() in ('super_admin', 'admin', 'manager')
$$;

create or replace function ops.is_staff_or_above() returns boolean language sql stable as $$
  select ops.current_staff_role() in ('super_admin', 'admin', 'manager', 'staff')
$$;

create or replace function ops.touch_updated_at() returns trigger language plpgsql as $$
begin
  new.updated_at := now();
  return new;
end $$;

-- ----------------------------------------------------------------------------
-- employees  (separate from staff_users — staff_users = app login accounts;
--             employees = anyone on the schedule, including non-app users)
-- ----------------------------------------------------------------------------
create table ops.employees (
  id            uuid primary key default gen_random_uuid(),
  venue_id      uuid not null,
  name          text not null,
  role_title    text,                  -- "Bartender", "Manager"
  base_rate     numeric(12,2),         -- VND per hour
  staff_user_id uuid references public.staff_users(id) on delete set null,
  active        boolean not null default true,
  created_at    timestamptz not null default now(),
  updated_at    timestamptz not null default now()
);
create index on ops.employees(venue_id);
create trigger employees_touch before update on ops.employees
  for each row execute function ops.touch_updated_at();

-- ----------------------------------------------------------------------------
-- ingredients  (raw goods you buy)
-- ----------------------------------------------------------------------------
create type ops.ingredient_category as enum (
  'spirit','beer','wine','mixer','syrup','garnish','food','consumable','other'
);
create type ops.base_unit as enum ('ml','g','each');
create type ops.cost_method as enum ('latest','average','fifo','manual');

create table ops.ingredients (
  id                       uuid primary key default gen_random_uuid(),
  venue_id                 uuid not null,
  name                     text not null,
  category                 ops.ingredient_category not null default 'other',
  -- purchase unit (how it shows up on a receipt)
  purchase_unit_label      text not null,             -- "1L bottle", "case of 24", "1kg bag"
  purchase_unit_size       numeric(14,4) not null,    -- numeric size in base_unit (1000, 24, 1000)
  base_unit                ops.base_unit not null,    -- the unit used in recipes (ml/g/each)
  current_cost_per_base    numeric(14,4) not null default 0,  -- e.g. 500 VND/ml
  cost_method              ops.cost_method not null default 'latest',
  manual_cost_per_base     numeric(14,4),             -- override when cost_method = 'manual'
  par_level_base           numeric(14,4),             -- minimum on-hand (optional)
  notes                    text,
  active                   boolean not null default true,
  created_at               timestamptz not null default now(),
  updated_at               timestamptz not null default now(),
  unique (venue_id, name)
);
create index on ops.ingredients(venue_id);
create trigger ingredients_touch before update on ops.ingredients
  for each row execute function ops.touch_updated_at();

-- price history (lets us do latest / average / FIFO without scanning purchases)
create table ops.ingredient_price_history (
  id              uuid primary key default gen_random_uuid(),
  ingredient_id   uuid not null references ops.ingredients(id) on delete cascade,
  observed_at     timestamptz not null default now(),
  cost_per_base   numeric(14,4) not null,
  qty_base        numeric(14,4),                       -- how much we bought (for weighted avg)
  source          text not null default 'manual',      -- 'purchase' | 'manual' | 'square'
  source_id       uuid                                  -- e.g. purchases.id
);
create index on ops.ingredient_price_history(ingredient_id, observed_at desc);

-- ----------------------------------------------------------------------------
-- recipes  (cocktails, kegged batches, food dishes, syrups, sub-recipes)
-- ----------------------------------------------------------------------------
create type ops.recipe_type as enum ('menu_item','batch','sub_recipe');
create type ops.recipe_category as enum (
  'cocktail','beer','wine','na_drink','food','snack','syrup','garnish','other'
);

create table ops.recipes (
  id              uuid primary key default gen_random_uuid(),
  venue_id        uuid not null,
  name            text not null,
  type            ops.recipe_type not null default 'menu_item',
  category        ops.recipe_category not null default 'cocktail',
  description     text,
  -- yield = how much one execution of the recipe produces
  yield_qty       numeric(14,4) not null default 1,
  yield_unit      ops.base_unit not null default 'each',
  -- pricing (menu items only)
  sale_price      numeric(14,2),                       -- VND, null for batches/sub-recipes
  -- batch / keg attributes
  is_kegged       boolean not null default false,
  keg_size_ml     numeric(12,2),
  pour_size_ml    numeric(12,2),                       -- e.g. 100ml pour -> 50 pours per 5L keg
  active          boolean not null default true,
  notes           text,
  created_at      timestamptz not null default now(),
  updated_at      timestamptz not null default now(),
  unique (venue_id, name)
);
create index on ops.recipes(venue_id);
create index on ops.recipes(venue_id, type);
create trigger recipes_touch before update on ops.recipes
  for each row execute function ops.touch_updated_at();

create table ops.recipe_components (
  id                uuid primary key default gen_random_uuid(),
  recipe_id         uuid not null references ops.recipes(id) on delete cascade,
  -- exactly one of ingredient_id / sub_recipe_id must be set
  ingredient_id     uuid references ops.ingredients(id) on delete restrict,
  sub_recipe_id     uuid references ops.recipes(id) on delete restrict,
  qty               numeric(14,4) not null,
  unit              ops.base_unit not null,
  notes             text,
  sort_order        int not null default 0,
  check ((ingredient_id is not null)::int + (sub_recipe_id is not null)::int = 1)
);
create index on ops.recipe_components(recipe_id);

-- batches = physical instances of a kegged/batched recipe ("I built one today")
create table ops.batches (
  id                  uuid primary key default gen_random_uuid(),
  venue_id            uuid not null,
  recipe_id           uuid not null references ops.recipes(id) on delete restrict,
  built_at            timestamptz not null default now(),
  built_by            uuid references public.staff_users(id) on delete set null,
  planned_yield       numeric(14,4),                  -- e.g. 50 pours
  actual_yield        numeric(14,4),                  -- e.g. 47 (fill in later when keg blown)
  cost_at_production  numeric(14,2) not null,         -- snapshot of cost at build time
  notes               text,
  status              text not null default 'active',  -- 'active' | 'depleted' | 'discarded'
  depleted_at         timestamptz
);
create index on ops.batches(venue_id, built_at desc);
create index on ops.batches(recipe_id);

-- ----------------------------------------------------------------------------
-- purchases
-- ----------------------------------------------------------------------------
create type ops.purchase_category as enum (
  'food','beer','wine','liquor','mixer','garnish','consumable',
  'utilities','rent','marketing','repairs','other_opex','capex','prepaid'
);

create table ops.purchases (
  id              uuid primary key default gen_random_uuid(),
  venue_id        uuid not null,
  occurred_on     date not null,
  vendor          text,
  category        ops.purchase_category not null,
  amount          numeric(14,2) not null,
  qty             numeric(14,4),                       -- units bought (for ingredient cost calc)
  ingredient_id   uuid references ops.ingredients(id) on delete set null,
  asset_id        uuid,                                -- set when category = 'capex'
  prepaid_id      uuid,                                -- set when category = 'prepaid'
  receipt_url     text,                                -- supabase storage url
  notes           text,
  entered_by      uuid references public.staff_users(id) on delete set null,
  created_at      timestamptz not null default now(),
  updated_at      timestamptz not null default now()
);
create index on ops.purchases(venue_id, occurred_on desc);
create index on ops.purchases(category);
create index on ops.purchases(ingredient_id) where ingredient_id is not null;
create trigger purchases_touch before update on ops.purchases
  for each row execute function ops.touch_updated_at();

-- when an ingredient purchase lands, append to price history + update ingredient.current_cost
create or replace function ops.handle_ingredient_purchase() returns trigger language plpgsql as $$
declare
  ing ops.ingredients%rowtype;
  unit_cost numeric(14,4);
  qty_in_base numeric(14,4);
begin
  if new.ingredient_id is null or new.qty is null or new.qty = 0 then
    return new;
  end if;
  select * into ing from ops.ingredients where id = new.ingredient_id;
  if not found then return new; end if;

  -- qty is # of purchase_units bought; convert to base units
  qty_in_base := new.qty * ing.purchase_unit_size;
  if qty_in_base = 0 then return new; end if;
  unit_cost := new.amount / qty_in_base;

  insert into ops.ingredient_price_history(ingredient_id, observed_at, cost_per_base, qty_base, source, source_id)
  values (new.ingredient_id, new.occurred_on, unit_cost, qty_in_base, 'purchase', new.id);

  -- update ingredient.current_cost based on its method
  if ing.cost_method = 'latest' then
    update ops.ingredients
       set current_cost_per_base = unit_cost
     where id = new.ingredient_id;
  elsif ing.cost_method = 'average' then
    update ops.ingredients
       set current_cost_per_base = (
         select sum(cost_per_base * qty_base) / nullif(sum(qty_base),0)
         from ops.ingredient_price_history
         where ingredient_id = new.ingredient_id
           and observed_at >= now() - interval '90 days'
       )
     where id = new.ingredient_id;
  end if;
  -- 'fifo' and 'manual' are computed on demand in the v_ingredient_current_cost view
  return new;
end $$;

create trigger purchases_after_insert_ingredient
  after insert on ops.purchases
  for each row execute function ops.handle_ingredient_purchase();

-- ----------------------------------------------------------------------------
-- sales — daily totals (manual) + itemized (Square / manual)
-- ----------------------------------------------------------------------------
create type ops.sales_source as enum ('manual','square','other_pos');

create table ops.sales_daily (
  id            uuid primary key default gen_random_uuid(),
  venue_id      uuid not null,
  occurred_on   date not null,
  gross         numeric(14,2) not null default 0,
  tips          numeric(14,2) not null default 0,
  discounts     numeric(14,2) not null default 0,
  refunds       numeric(14,2) not null default 0,
  net           numeric(14,2) generated always as (gross + tips - discounts - refunds) stored,
  notes         text,
  source        ops.sales_source not null default 'manual',
  entered_by    uuid references public.staff_users(id) on delete set null,
  created_at    timestamptz not null default now(),
  updated_at    timestamptz not null default now(),
  unique (venue_id, occurred_on, source)
);
create index on ops.sales_daily(venue_id, occurred_on desc);
create trigger sales_daily_touch before update on ops.sales_daily
  for each row execute function ops.touch_updated_at();

create table ops.sales_items (
  id              uuid primary key default gen_random_uuid(),
  venue_id        uuid not null,
  occurred_at     timestamptz not null,
  occurred_on     date generated always as ((occurred_at at time zone 'Asia/Ho_Chi_Minh')::date) stored,
  menu_item_name  text not null,
  recipe_id       uuid references ops.recipes(id) on delete set null,
  qty             numeric(12,3) not null default 1,
  unit_price      numeric(14,2) not null,
  gross           numeric(14,2) generated always as (qty * unit_price) stored,
  discount        numeric(14,2) not null default 0,
  source          ops.sales_source not null default 'manual',
  source_id       text,                                  -- e.g. square order/line id
  created_at      timestamptz not null default now()
);
create index on ops.sales_items(venue_id, occurred_on);
create index on ops.sales_items(recipe_id);
create unique index on ops.sales_items(source, source_id) where source_id is not null;

-- ----------------------------------------------------------------------------
-- labor
-- ----------------------------------------------------------------------------
create table ops.labor_shifts (
  id              uuid primary key default gen_random_uuid(),
  venue_id        uuid not null,
  employee_id     uuid not null references ops.employees(id) on delete restrict,
  occurred_on     date not null,
  punch_in        time,
  punch_out       time,
  hours           numeric(6,2) not null,
  hourly_rate     numeric(12,2) not null,
  shift_cost      numeric(14,2) generated always as (hours * hourly_rate) stored,
  source          text not null default 'manual',       -- 'manual' | 'square'
  source_id       text,
  notes           text,
  created_at      timestamptz not null default now(),
  updated_at      timestamptz not null default now()
);
create index on ops.labor_shifts(venue_id, occurred_on desc);
create unique index on ops.labor_shifts(source, source_id) where source_id is not null;
create trigger labor_shifts_touch before update on ops.labor_shifts
  for each row execute function ops.touch_updated_at();

-- ----------------------------------------------------------------------------
-- assets (CapEx → depreciated)
-- ----------------------------------------------------------------------------
create table ops.assets (
  id                    uuid primary key default gen_random_uuid(),
  venue_id              uuid not null,
  name                  text not null,
  category              text,                            -- "kitchen", "bar", "furniture", "tech"
  purchase_date         date not null,
  amount                numeric(14,2) not null,
  useful_life_months    int not null default 24,
  salvage_value         numeric(14,2) not null default 0,
  status                text not null default 'in_service',  -- 'in_service' | 'retired'
  retired_on            date,
  notes                 text,
  created_at            timestamptz not null default now(),
  updated_at            timestamptz not null default now()
);
create index on ops.assets(venue_id);
create trigger assets_touch before update on ops.assets
  for each row execute function ops.touch_updated_at();

alter table ops.purchases
  add constraint purchases_asset_fk
  foreign key (asset_id) references ops.assets(id) on delete set null;

-- ----------------------------------------------------------------------------
-- prepaid expenses (paid up front, expensed over the period it covers)
-- ----------------------------------------------------------------------------
create table ops.prepaid_expenses (
  id              uuid primary key default gen_random_uuid(),
  venue_id        uuid not null,
  name            text not null,                         -- "Insurance Q3", "Rent May-Jul"
  category        ops.purchase_category not null default 'other_opex',
  amount          numeric(14,2) not null,
  paid_on         date not null,
  period_start    date not null,
  period_end      date not null,
  notes           text,
  created_at      timestamptz not null default now(),
  updated_at      timestamptz not null default now(),
  check (period_end >= period_start)
);
create index on ops.prepaid_expenses(venue_id, period_start, period_end);
create trigger prepaid_touch before update on ops.prepaid_expenses
  for each row execute function ops.touch_updated_at();

alter table ops.purchases
  add constraint purchases_prepaid_fk
  foreign key (prepaid_id) references ops.prepaid_expenses(id) on delete set null;

-- ----------------------------------------------------------------------------
-- POS imports + period close + audit log
-- ----------------------------------------------------------------------------
create table ops.pos_imports (
  id                uuid primary key default gen_random_uuid(),
  venue_id          uuid not null,
  source            ops.sales_source not null,
  imported_at       timestamptz not null default now(),
  imported_by       uuid references public.staff_users(id),
  period_start      date,
  period_end        date,
  raw_payload       jsonb,
  parsed_count      int,
  variance_to_manual numeric(14,2),
  reconciled_at     timestamptz,
  notes             text
);
create index on ops.pos_imports(venue_id, imported_at desc);

create table ops.period_close (
  id            uuid primary key default gen_random_uuid(),
  venue_id      uuid not null,
  period_month  date not null,                            -- always first-of-month
  locked_at     timestamptz not null default now(),
  locked_by     uuid references public.staff_users(id),
  notes         text,
  unique (venue_id, period_month)
);

create table ops.audit_log (
  id            uuid primary key default gen_random_uuid(),
  venue_id      uuid,
  entity        text not null,                            -- 'purchases', 'sales_daily', etc.
  entity_id     uuid,
  action        text not null,                            -- 'insert' | 'update' | 'delete'
  actor_id      uuid,                                     -- staff_users.id
  actor_email   text,
  before_data   jsonb,
  after_data    jsonb,
  occurred_at   timestamptz not null default now()
);
create index on ops.audit_log(venue_id, occurred_at desc);
create index on ops.audit_log(entity, entity_id);

-- generic audit trigger (attach to whichever tables you want history on)
create or replace function ops.audit_row() returns trigger language plpgsql as $$
declare
  actor uuid;
  actor_email text;
begin
  select id, email into actor, actor_email
    from public.staff_users where email = auth.jwt() ->> 'email' limit 1;
  insert into ops.audit_log(venue_id, entity, entity_id, action, actor_id, actor_email, before_data, after_data)
  values (
    coalesce(new.venue_id, old.venue_id),
    TG_TABLE_NAME,
    coalesce(new.id, old.id),
    lower(TG_OP),
    actor, actor_email,
    case when TG_OP in ('UPDATE','DELETE') then to_jsonb(old) end,
    case when TG_OP in ('INSERT','UPDATE') then to_jsonb(new) end
  );
  return coalesce(new, old);
end $$;

create trigger audit_purchases   after insert or update or delete on ops.purchases    for each row execute function ops.audit_row();
create trigger audit_sales_daily after insert or update or delete on ops.sales_daily  for each row execute function ops.audit_row();
create trigger audit_recipes     after insert or update or delete on ops.recipes      for each row execute function ops.audit_row();
create trigger audit_assets      after insert or update or delete on ops.assets       for each row execute function ops.audit_row();

-- ============================================================================
-- VIEWS — live P&L, COGS, margin
-- ============================================================================

-- current cost per base unit per ingredient (respects cost_method)
create or replace view ops.v_ingredient_current_cost as
select
  i.id, i.venue_id, i.name, i.category, i.base_unit, i.cost_method,
  case i.cost_method
    when 'manual'  then i.manual_cost_per_base
    when 'latest'  then (select cost_per_base from ops.ingredient_price_history h
                          where h.ingredient_id = i.id order by observed_at desc limit 1)
    when 'average' then (select sum(cost_per_base * qty_base) / nullif(sum(qty_base),0)
                          from ops.ingredient_price_history h
                          where h.ingredient_id = i.id and observed_at >= now() - interval '90 days')
    when 'fifo'    then (select cost_per_base from ops.ingredient_price_history h
                          where h.ingredient_id = i.id order by observed_at asc limit 1)
  end as current_cost_per_base
from ops.ingredients i;

-- recursive recipe cost: sums ingredient cost + sub-recipe cost per yield unit
create or replace view ops.v_recipe_cost as
with recursive recipe_cost(recipe_id, total_cost) as (
  -- base: recipes whose components are all ingredients
  select
    r.id as recipe_id,
    coalesce(sum(rc.qty * vic.current_cost_per_base), 0) as total_cost
  from ops.recipes r
  left join ops.recipe_components rc on rc.recipe_id = r.id and rc.ingredient_id is not null
  left join ops.v_ingredient_current_cost vic on vic.id = rc.ingredient_id
  group by r.id
)
select
  r.id as recipe_id,
  r.venue_id,
  r.name,
  r.type,
  r.category,
  r.yield_qty,
  r.yield_unit,
  r.sale_price,
  -- include sub-recipe costs (one level deep; for deeper nesting, materialize this view)
  rc.total_cost + coalesce(
    (select sum(c.qty * rc2.total_cost / nullif(sr.yield_qty, 0))
       from ops.recipe_components c
       join ops.recipes sr on sr.id = c.sub_recipe_id
       join recipe_cost rc2 on rc2.recipe_id = sr.id
      where c.recipe_id = r.id and c.sub_recipe_id is not null), 0
  ) as total_cost,
  -- cost per serving (yield-aware)
  (rc.total_cost + coalesce(
    (select sum(c.qty * rc2.total_cost / nullif(sr.yield_qty, 0))
       from ops.recipe_components c
       join ops.recipes sr on sr.id = c.sub_recipe_id
       join recipe_cost rc2 on rc2.recipe_id = sr.id
      where c.recipe_id = r.id and c.sub_recipe_id is not null), 0
  )) / nullif(r.yield_qty, 0) as cost_per_unit,
  r.sale_price - ((rc.total_cost + coalesce(
    (select sum(c.qty * rc2.total_cost / nullif(sr.yield_qty, 0))
       from ops.recipe_components c
       join ops.recipes sr on sr.id = c.sub_recipe_id
       join recipe_cost rc2 on rc2.recipe_id = sr.id
      where c.recipe_id = r.id and c.sub_recipe_id is not null), 0
  )) / nullif(r.yield_qty, 0)) as margin_per_unit
from ops.recipes r
left join recipe_cost rc on rc.recipe_id = r.id;

-- monthly depreciation per asset (straight-line)
create or replace view ops.v_asset_depreciation_monthly as
select
  a.id, a.venue_id, a.name, a.category,
  a.purchase_date,
  a.amount,
  a.useful_life_months,
  a.salvage_value,
  (a.amount - a.salvage_value) / nullif(a.useful_life_months, 0) as monthly_depreciation,
  a.purchase_date as start_month,
  (a.purchase_date + (a.useful_life_months || ' months')::interval)::date as end_month
from ops.assets a
where a.status = 'in_service';

-- monthly P&L (cash basis): everything hits the month it occurred / was paid
create or replace view ops.v_pnl_cash as
with months as (
  select generate_series(
    date_trunc('month', (select min(occurred_on) from ops.sales_daily union all select min(occurred_on) from ops.purchases))::date,
    date_trunc('month', current_date)::date,
    '1 month'::interval
  )::date as period_month
)
select
  m.period_month,
  v.id as venue_id,
  (select coalesce(sum(net),0)   from ops.sales_daily s where s.venue_id = v.id and date_trunc('month', s.occurred_on) = m.period_month) as revenue,
  (select coalesce(sum(amount),0) from ops.purchases p where p.venue_id = v.id and date_trunc('month', p.occurred_on) = m.period_month and p.category in ('food','beer','wine','liquor','mixer','garnish')) as cogs,
  (select coalesce(sum(shift_cost),0) from ops.labor_shifts l where l.venue_id = v.id and date_trunc('month', l.occurred_on) = m.period_month) as labor,
  (select coalesce(sum(amount),0) from ops.purchases p where p.venue_id = v.id and date_trunc('month', p.occurred_on) = m.period_month and p.category in ('utilities','rent','marketing','repairs','consumable','other_opex')) as opex,
  (select coalesce(sum(amount),0) from ops.purchases p where p.venue_id = v.id and date_trunc('month', p.occurred_on) = m.period_month and p.category = 'capex') as capex
from months m
cross join public.venues v;

-- monthly P&L (accrual): capex amortized over useful life, prepaids spread
create or replace view ops.v_pnl_accrual as
with cash as (select * from ops.v_pnl_cash),
depreciation as (
  select
    date_trunc('month', gs)::date as period_month,
    a.venue_id,
    sum(a.monthly_depreciation) as depreciation
  from ops.v_asset_depreciation_monthly a
  cross join lateral generate_series(a.start_month, a.end_month - interval '1 month', '1 month') gs
  group by 1, 2
),
prepaid as (
  select
    date_trunc('month', gs)::date as period_month,
    p.venue_id,
    sum(p.amount / greatest(1, extract(month from age(p.period_end, p.period_start))::int + 1)) as prepaid_expense
  from ops.prepaid_expenses p
  cross join lateral generate_series(p.period_start, p.period_end, '1 month') gs
  group by 1, 2
)
select
  c.period_month,
  c.venue_id,
  c.revenue,
  c.cogs,
  c.labor,
  c.opex,
  coalesce(d.depreciation, 0) as depreciation,
  coalesce(pp.prepaid_expense, 0) as prepaid_expense,
  c.revenue - c.cogs - c.labor - c.opex - coalesce(d.depreciation, 0) - coalesce(pp.prepaid_expense, 0) as net_income_accrual
from cash c
left join depreciation d on d.period_month = c.period_month and d.venue_id = c.venue_id
left join prepaid pp     on pp.period_month = c.period_month and pp.venue_id = c.venue_id;

-- theoretical COGS = items sold × recipe cost. Compare vs actual purchase COGS for the period.
create or replace view ops.v_theoretical_vs_actual_cogs as
with theo as (
  select
    date_trunc('month', si.occurred_on)::date as period_month,
    si.venue_id,
    sum(si.qty * vrc.cost_per_unit) as theoretical_cogs
  from ops.sales_items si
  left join ops.v_recipe_cost vrc on vrc.recipe_id = si.recipe_id
  group by 1, 2
),
actual as (
  select
    date_trunc('month', occurred_on)::date as period_month,
    venue_id,
    sum(amount) as actual_cogs
  from ops.purchases
  where category in ('food','beer','wine','liquor','mixer','garnish')
  group by 1, 2
)
select
  coalesce(t.period_month, a.period_month) as period_month,
  coalesce(t.venue_id, a.venue_id) as venue_id,
  coalesce(t.theoretical_cogs, 0) as theoretical_cogs,
  coalesce(a.actual_cogs, 0) as actual_cogs,
  coalesce(a.actual_cogs, 0) - coalesce(t.theoretical_cogs, 0) as variance,
  case when coalesce(t.theoretical_cogs, 0) = 0 then null
       else (coalesce(a.actual_cogs, 0) - coalesce(t.theoretical_cogs, 0)) / t.theoretical_cogs
  end as variance_pct
from theo t
full outer join actual a on a.period_month = t.period_month and a.venue_id = t.venue_id;

-- sales variance: manual entry vs Square import
create or replace view ops.v_sales_variance_pos_vs_manual as
select
  m.venue_id,
  m.occurred_on,
  m.gross as manual_gross,
  s.gross as pos_gross,
  s.gross - m.gross as variance,
  case when m.gross = 0 then null else (s.gross - m.gross)/m.gross end as variance_pct
from ops.sales_daily m
left join ops.sales_daily s on s.venue_id = m.venue_id and s.occurred_on = m.occurred_on and s.source = 'square'
where m.source = 'manual';

-- ============================================================================
-- RLS — all writes gated by role; reads gated by venue + role
-- ============================================================================
alter table ops.employees             enable row level security;
alter table ops.ingredients           enable row level security;
alter table ops.ingredient_price_history enable row level security;
alter table ops.recipes               enable row level security;
alter table ops.recipe_components     enable row level security;
alter table ops.batches               enable row level security;
alter table ops.purchases             enable row level security;
alter table ops.sales_daily           enable row level security;
alter table ops.sales_items           enable row level security;
alter table ops.labor_shifts          enable row level security;
alter table ops.assets                enable row level security;
alter table ops.prepaid_expenses      enable row level security;
alter table ops.pos_imports           enable row level security;
alter table ops.period_close          enable row level security;
alter table ops.audit_log             enable row level security;

-- helper: is user assigned to this venue?
create or replace function ops.user_in_venue(p_venue uuid)
returns boolean language sql stable security definer set search_path = public, ops as $$
  select exists(
    select 1 from public.staff_users su
    where su.email = auth.jwt() ->> 'email'
      and (su.role = 'super_admin' or su.venue_id = p_venue)
  )
$$;

-- READ policies — staff_or_above can read their venue
do $$
declare t text;
begin
  for t in select unnest(array[
    'employees','ingredients','ingredient_price_history','recipes','recipe_components',
    'batches','purchases','sales_daily','sales_items','labor_shifts','assets',
    'prepaid_expenses','pos_imports','period_close','audit_log'
  ]) loop
    execute format($f$
      create policy %I_read on ops.%I for select to authenticated
      using (
        ops.is_super_admin() or
        ops.user_in_venue(coalesce(venue_id,
          (select venue_id from ops.recipes r where r.id = recipe_id),
          (select venue_id from ops.ingredients i where i.id = ingredient_id)))
      )
    $f$, t, t);
  end loop;
end $$;

-- staff_or_above can INSERT sales/purchases/batches (note: batches gated to managers below)
create policy purchases_insert    on ops.purchases    for insert to authenticated with check (ops.is_staff_or_above() and ops.user_in_venue(venue_id));
create policy sales_daily_insert  on ops.sales_daily  for insert to authenticated with check (ops.is_staff_or_above() and ops.user_in_venue(venue_id));
create policy sales_items_insert  on ops.sales_items  for insert to authenticated with check (ops.is_staff_or_above() and ops.user_in_venue(venue_id));
create policy labor_shifts_insert on ops.labor_shifts for insert to authenticated with check (ops.is_staff_or_above() and ops.user_in_venue(venue_id));

-- batches: managers only
create policy batches_insert on ops.batches for insert to authenticated with check (ops.is_manager_or_above() and ops.user_in_venue(venue_id));
create policy batches_update on ops.batches for update to authenticated using (ops.is_manager_or_above() and ops.user_in_venue(venue_id));

-- managers can update anyone's entries (staff can only update their own — enforced in route handler for now)
create policy purchases_update    on ops.purchases    for update to authenticated using (ops.is_manager_or_above() and ops.user_in_venue(venue_id));
create policy sales_daily_update  on ops.sales_daily  for update to authenticated using (ops.is_manager_or_above() and ops.user_in_venue(venue_id));
create policy labor_shifts_update on ops.labor_shifts for update to authenticated using (ops.is_manager_or_above() and ops.user_in_venue(venue_id));

-- managers can manage recipes, ingredients, employees, assets, prepaids
create policy employees_write          on ops.employees           for all to authenticated using (ops.is_manager_or_above() and ops.user_in_venue(venue_id)) with check (ops.is_manager_or_above() and ops.user_in_venue(venue_id));
create policy ingredients_write        on ops.ingredients         for all to authenticated using (ops.is_manager_or_above() and ops.user_in_venue(venue_id)) with check (ops.is_manager_or_above() and ops.user_in_venue(venue_id));
create policy recipes_write            on ops.recipes             for all to authenticated using (ops.is_manager_or_above() and ops.user_in_venue(venue_id)) with check (ops.is_manager_or_above() and ops.user_in_venue(venue_id));
create policy recipe_components_write  on ops.recipe_components   for all to authenticated using (ops.is_manager_or_above()) with check (ops.is_manager_or_above());
create policy assets_write             on ops.assets              for all to authenticated using (ops.is_manager_or_above() and ops.user_in_venue(venue_id)) with check (ops.is_manager_or_above() and ops.user_in_venue(venue_id));
create policy prepaid_write            on ops.prepaid_expenses    for all to authenticated using (ops.is_manager_or_above() and ops.user_in_venue(venue_id)) with check (ops.is_manager_or_above() and ops.user_in_venue(venue_id));

-- pos_imports + period_close: managers can write, super_admin can unlock
create policy pos_imports_write  on ops.pos_imports  for all to authenticated using (ops.is_manager_or_above() and ops.user_in_venue(venue_id)) with check (ops.is_manager_or_above() and ops.user_in_venue(venue_id));
create policy period_close_write on ops.period_close for insert to authenticated with check (ops.is_super_admin() and ops.user_in_venue(venue_id));
create policy period_close_unlock on ops.period_close for delete to authenticated using (ops.is_super_admin());

-- audit_log is read-only to managers (writes only via trigger as service_role)
create policy audit_log_read on ops.audit_log for select to authenticated using (ops.is_manager_or_above());

-- service role bypasses RLS by default; no extra policies needed there.

-- ============================================================================
-- Grants
-- ============================================================================
grant select, insert, update, delete on all tables    in schema ops to authenticated;
grant select                          on all views     in schema ops to authenticated;
grant usage, select                   on all sequences in schema ops to authenticated;

-- end of migration --

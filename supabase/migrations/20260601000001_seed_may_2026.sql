-- ============================================================================
-- SEED: BigBamBoo May 2026 data
-- ============================================================================
-- Idempotent — safe to re-run. Uses the BigBamBoo venue (slug = 'bigbamboo')
-- already in public.venues. Seeds:
--   • 3 employees (Hai, Trinh, Apple)
--   • All May sales_daily rows
--   • All May purchases (food, beer, liquor, NA bev, utilities, capex)
--   • All May labor_shifts (28 shifts, 161.5 hrs total)
--   • The two CapEx assets (oven 24mo, tarps 12mo)
-- ============================================================================

do $$
declare
  v_venue   uuid;
  v_hai     uuid;
  v_trinh   uuid;
  v_apple   uuid;
  v_oven    uuid;
  v_tarps   uuid;
begin
  -- ----- venue --------------------------------------------------------------
  select id into v_venue from public.venues where slug = 'bigbamboo' limit 1;
  if v_venue is null then
    raise exception 'BigBamBoo venue not found in public.venues. Insert it before seeding ops data.';
  end if;

  -- ----- employees ----------------------------------------------------------
  insert into ops.employees (venue_id, name, role_title, base_rate)
  values (v_venue, 'Hai',   'Bartender / Lead', 65000)
  on conflict (id) do nothing
  returning id into v_hai;
  if v_hai is null then
    select id into v_hai from ops.employees where venue_id = v_venue and name = 'Hai' limit 1;
  end if;

  insert into ops.employees (venue_id, name, role_title, base_rate)
  values (v_venue, 'Trinh', 'Server', 35000)
  on conflict (id) do nothing
  returning id into v_trinh;
  if v_trinh is null then
    select id into v_trinh from ops.employees where venue_id = v_venue and name = 'Trinh' limit 1;
  end if;

  insert into ops.employees (venue_id, name, role_title, base_rate)
  values (v_venue, 'Apple', 'Server', 35000)
  on conflict (id) do nothing
  returning id into v_apple;
  if v_apple is null then
    select id into v_apple from ops.employees where venue_id = v_venue and name = 'Apple' limit 1;
  end if;

  -- ----- assets (capex with depreciation) -----------------------------------
  insert into ops.assets (venue_id, name, category, purchase_date, amount, useful_life_months, notes)
  values (v_venue, 'Oven',  'kitchen', '2026-05-23', 1500000, 24, 'Seeded from May 2026 P&L')
  returning id into v_oven;

  insert into ops.assets (venue_id, name, category, purchase_date, amount, useful_life_months, notes)
  values (v_venue, 'Tarps', 'bar',     '2026-05-15',  600000, 12, 'Awning tarp replacement')
  returning id into v_tarps;

  -- ----- sales_daily --------------------------------------------------------
  -- (BIS 5M alcohol prepay rolled into Friday May 8 = 7,426,000)
  insert into ops.sales_daily (venue_id, occurred_on, gross, source, notes) values
    (v_venue, '2026-05-01',  1095000, 'manual', 'Friday'),
    (v_venue, '2026-05-02',  8000000, 'manual', 'Saturday'),
    (v_venue, '2026-05-03',  7601000, 'manual', 'Sunday'),
    (v_venue, '2026-05-08',  7426000, 'manual', 'Friday — 2,426k door + 5,000k BIS alcohol prepay'),
    (v_venue, '2026-05-09',  6667000, 'manual', 'Saturday'),
    (v_venue, '2026-05-15',  1424000, 'manual', 'Friday'),
    (v_venue, '2026-05-16',  5932000, 'manual', 'Saturday'),
    (v_venue, '2026-05-22',  7500000, 'manual', 'Friday'),
    (v_venue, '2026-05-23', 29027000, 'manual', 'Saturday'),
    (v_venue, '2026-05-29',  5190000, 'manual', 'Friday'),
    (v_venue, '2026-05-30', 14197000, 'manual', 'Saturday'),
    (v_venue, '2026-05-31',  2320000, 'manual', 'Sunday')
  on conflict (venue_id, occurred_on, source) do nothing;

  -- ----- purchases ----------------------------------------------------------
  -- food
  insert into ops.purchases (venue_id, occurred_on, vendor, category, amount, notes) values
    (v_venue, '2026-05-02', 'Local market',  'food',     1500000, 'Groceries'),
    (v_venue, '2026-05-03', 'Local market',  'food',      500000, 'Groceries'),
    (v_venue, '2026-05-04', 'Capichi',       'food',     1080000, 'Capichi food order'),
    (v_venue, '2026-05-08', 'Local market',  'food',     1000000, 'Groceries'),
    (v_venue, '2026-05-08', 'Tartine',       'food',      312000, 'Tartine bread'),
    (v_venue, '2026-05-13', 'Sausage supp.', 'food',     1965600, 'Sausages'),
    (v_venue, '2026-05-14', 'Local market',  'food',     1000000, 'Groceries'),
    (v_venue, '2026-05-20', 'Local market',  'food',      650000, 'Groceries'),
    (v_venue, '2026-05-23', 'Bread supp.',   'food',     1100000, 'Bread'),
    (v_venue, '2026-05-30', 'Local market',  'food',     1300000, 'Groceries'),
    (v_venue, '2026-05-31', 'Bread supp.',   'food',      540000, 'Bread');

  -- non-alcoholic beverages (mixer category)
  insert into ops.purchases (venue_id, occurred_on, vendor, category, amount, notes) values
    (v_venue, '2026-05-09', 'Tea supp.',     'mixer',     236000, 'Tea'),
    (v_venue, '2026-05-30', 'Local market',  'mixer',     200000, 'Water (consumables)');

  -- beer
  insert into ops.purchases (venue_id, occurred_on, vendor, category, amount, notes) values
    (v_venue, '2026-05-08', 'Huda',          'beer',     1570000, 'Huda beer'),
    (v_venue, '2026-05-30', 'Huda',          'beer',     1570000, 'Huda beer');

  -- liquor
  insert into ops.purchases (venue_id, occurred_on, vendor, category, amount, notes) values
    (v_venue, '2026-05-20', 'Spirits supp.', 'liquor',    530000, 'Tequila'),
    (v_venue, '2026-05-20', 'Spirits supp.', 'liquor',    500000, 'Gin'),
    (v_venue, '2026-05-23', 'Spirits supp.', 'liquor',    420000, 'Bourbon'),
    (v_venue, '2026-05-30', 'Spirits supp.', 'liquor',   1000000, 'Jim Beam'),
    (v_venue, '2026-05-30', 'Spirits supp.', 'liquor',   1000000, 'Gin');

  -- utilities
  insert into ops.purchases (venue_id, occurred_on, vendor, category, amount, notes) values
    (v_venue, '2026-05-05', 'EVN (Power)',   'utilities', 8641164, 'Power bill'),
    (v_venue, '2026-05-05', 'Water co.',     'utilities',  790000, 'Water bill');

  -- capex (linked to assets)
  insert into ops.purchases (venue_id, occurred_on, vendor, category, amount, asset_id, notes) values
    (v_venue, '2026-05-15', 'Awning Co.',    'capex',     600000, v_tarps, 'Tarps — see asset depreciation'),
    (v_venue, '2026-05-23', 'Kitchen supp.', 'capex',    1500000, v_oven,  'Oven — see asset depreciation');

  -- ----- labor_shifts (from May 2026 scheduling log) ------------------------
  insert into ops.labor_shifts (venue_id, employee_id, occurred_on, punch_in, punch_out, hours, hourly_rate) values
    (v_venue, v_hai,   '2026-05-02', '13:00', '21:00', 8.0, 65000),
    (v_venue, v_trinh, '2026-05-02', '13:00', '17:00', 4.0, 35000),
    (v_venue, v_apple, '2026-05-02', '17:00', '22:00', 5.0, 35000),
    (v_venue, v_hai,   '2026-05-03', '13:00', '20:00', 7.0, 65000),
    (v_venue, v_trinh, '2026-05-03', '13:00', '17:00', 4.0, 35000),
    (v_venue, v_apple, '2026-05-03', '17:00', '22:00', 5.0, 35000),
    (v_venue, v_hai,   '2026-05-08', '14:30', '21:00', 6.5, 65000),
    (v_venue, v_trinh, '2026-05-08', '14:30', '19:00', 4.5, 35000),
    (v_venue, v_apple, '2026-05-08', '14:30', '22:00', 7.5, 35000),
    (v_venue, v_hai,   '2026-05-09', '16:30', '22:00', 5.5, 65000),
    (v_venue, v_apple, '2026-05-09', '16:30', '01:00', 8.5, 35000),
    (v_venue, v_hai,   '2026-05-15', '16:30', '22:00', 5.5, 65000),
    (v_venue, v_apple, '2026-05-15', '16:30', '23:00', 6.5, 35000),
    (v_venue, v_hai,   '2026-05-16', '16:00', '22:00', 6.0, 65000),
    (v_venue, v_apple, '2026-05-16', '16:30', '00:00', 7.5, 35000),
    (v_venue, v_trinh, '2026-05-16', '16:30', '20:00', 3.5, 35000),
    (v_venue, v_hai,   '2026-05-20', '16:00', '18:00', 2.0, 65000),
    (v_venue, v_hai,   '2026-05-22', '16:00', '22:00', 6.0, 65000),
    (v_venue, v_trinh, '2026-05-22', '17:00', '00:00', 7.0, 35000),
    (v_venue, v_hai,   '2026-05-23', '14:00', '22:00', 8.0, 65000),
    (v_venue, v_trinh, '2026-05-23', '15:00', '21:00', 6.0, 35000),
    (v_venue, v_apple, '2026-05-23', '17:00', '23:00', 6.0, 35000),
    (v_venue, v_hai,   '2026-05-29', '16:00', '22:00', 6.0, 65000),
    (v_venue, v_trinh, '2026-05-29', '17:00', '00:00', 7.0, 35000),
    (v_venue, v_hai,   '2026-05-30', '15:00', '21:00', 6.0, 65000),
    (v_venue, v_trinh, '2026-05-30', '16:00', '22:00', 6.0, 35000),
    (v_venue, v_hai,   '2026-05-31', '15:00', '19:00', 4.0, 65000),
    (v_venue, v_trinh, '2026-05-31', '16:00', '19:00', 3.0, 35000);

  raise notice 'BigBamBoo May 2026 seed complete: venue=%, employees=3, sales=12 days, purchases=22, labor_shifts=28, assets=2',
    v_venue;
end $$;

-- ============================================================================
-- Verify (run separately if desired):
--   select 'sales_daily' as t, count(*), sum(gross) from ops.sales_daily
--   union all select 'purchases', count(*), sum(amount) from ops.purchases
--   union all select 'labor_shifts', count(*), sum(shift_cost) from ops.labor_shifts
--   union all select 'employees', count(*), null from ops.employees
--   union all select 'assets', count(*), sum(amount) from ops.assets;
--
-- Expected:
--   sales_daily   12   96,379,000
--   purchases     22   30,134,764  (cogs + utilities + capex)
--   labor_shifts  28    7,767,500  (161.5 hrs)
--   employees      3   —
--   assets         2    2,100,000
-- ============================================================================

-- Demo data for local resets. The app migrations create the base org; this file
-- makes the mobile demo feel populated across stock, restock, SKU variations, and reports.

insert into auth.users (
  id,
  aud,
  role,
  email,
  email_confirmed_at,
  raw_user_meta_data,
  created_at,
  updated_at
) values
  (
    '00000000-0000-4000-8000-000000000901',
    'authenticated',
    'authenticated',
    'demo-admin@aero.test',
    now(),
    jsonb_build_object('full_name', 'Demo Admin'),
    now(),
    now()
  ),
  (
    '00000000-0000-4000-8000-000000000902',
    'authenticated',
    'authenticated',
    'demo-staff@aero.test',
    now(),
    jsonb_build_object('full_name', 'Demo Staff'),
    now(),
    now()
  )
on conflict (id) do update set
  email = excluded.email,
  raw_user_meta_data = excluded.raw_user_meta_data,
  updated_at = now();

insert into public.profiles (id, email, full_name) values
  ('00000000-0000-4000-8000-000000000901', 'demo-admin@aero.test', 'Demo Admin'),
  ('00000000-0000-4000-8000-000000000902', 'demo-staff@aero.test', 'Demo Staff')
on conflict (id) do update set
  email = excluded.email,
  full_name = excluded.full_name,
  updated_at = now();

insert into public.organization_members (organization_id, user_id, role, status) values
  ('00000000-0000-4000-8000-000000000001', '00000000-0000-4000-8000-000000000901', 'admin', 'active'),
  ('00000000-0000-4000-8000-000000000001', '00000000-0000-4000-8000-000000000902', 'staff', 'active')
on conflict (organization_id, user_id) do update set
  role = excluded.role,
  status = excluded.status;

insert into public.plan_entitlements (organization_id, plan, admin_limit, staff_limit, sku_limit, location_limit, advanced_report_enabled, stock_transfer_enabled)
values ('00000000-0000-4000-8000-000000000001', 'basic', 5, 10, 500, 2, true, true)
on conflict (organization_id) do update set
  admin_limit = excluded.admin_limit,
  staff_limit = excluded.staff_limit,
  sku_limit = excluded.sku_limit,
  location_limit = excluded.location_limit,
  advanced_report_enabled = excluded.advanced_report_enabled,
  stock_transfer_enabled = excluded.stock_transfer_enabled,
  updated_at = now();

insert into public.locations (id, organization_id, name, is_default) values
  ('00000000-0000-4000-8000-000000000101', '00000000-0000-4000-8000-000000000001', 'Main Store', true)
on conflict (id) do update set name = excluded.name, is_default = excluded.is_default, updated_at = now();

insert into public.suppliers (id, organization_id, name, notes) values
  ('00000000-0000-4000-8000-000000000201', '00000000-0000-4000-8000-000000000001', 'PetSupply Co.', 'Malaysia dry food distributor'),
  ('00000000-0000-4000-8000-000000000202', '00000000-0000-4000-8000-000000000001', 'Whisker & Co.', 'Cat food supplier'),
  ('00000000-0000-4000-8000-000000000203', '00000000-0000-4000-8000-000000000001', 'Playful Pets Thailand', 'Toy supplier from Thailand'),
  ('00000000-0000-4000-8000-000000000204', '00000000-0000-4000-8000-000000000001', 'Fresh Groom MY', 'Grooming and hygiene supplier'),
  ('00000000-0000-4000-8000-000000000205', '00000000-0000-4000-8000-000000000001', 'Purrfect Nutrition', 'Premium wet food distributor')
on conflict (id) do update set name = excluded.name, notes = excluded.notes, updated_at = now();

insert into public.supplier_contacts (id, supplier_id, organization_id, contact_name, country, phone_raw, whatsapp_number, is_primary) values
  ('00000000-0000-4000-8000-000000000301', '00000000-0000-4000-8000-000000000201', '00000000-0000-4000-8000-000000000001', 'Maya Torres', 'MY', '012-345 6789', '60123456789', true),
  ('00000000-0000-4000-8000-000000000302', '00000000-0000-4000-8000-000000000202', '00000000-0000-4000-8000-000000000001', 'Leo Grant', 'MY', '019-876 5432', '60198765432', true),
  ('00000000-0000-4000-8000-000000000303', '00000000-0000-4000-8000-000000000203', '00000000-0000-4000-8000-000000000001', 'Ari Chai', 'TH', '081-234-5678', '66812345678', true),
  ('00000000-0000-4000-8000-000000000304', '00000000-0000-4000-8000-000000000204', '00000000-0000-4000-8000-000000000001', 'Nur Aina', 'MY', '016-222 9031', '60162229031', true),
  ('00000000-0000-4000-8000-000000000305', '00000000-0000-4000-8000-000000000205', '00000000-0000-4000-8000-000000000001', 'Jay Lim', 'MY', '011-3300 7788', '601133007788', true)
on conflict (id) do update set
  contact_name = excluded.contact_name,
  country = excluded.country,
  phone_raw = excluded.phone_raw,
  whatsapp_number = excluded.whatsapp_number,
  updated_at = now();

insert into public.sku_variation_groups (id, organization_id, product_name, variation_name, add_variation_images) values
  ('00000000-0000-4000-8000-000000000701', '00000000-0000-4000-8000-000000000001', 'Cat Food Pouch x28', 'Flavor', true),
  ('00000000-0000-4000-8000-000000000702', '00000000-0000-4000-8000-000000000001', 'Dog Harness Pro', 'Size', false)
on conflict (id) do update set
  product_name = excluded.product_name,
  variation_name = excluded.variation_name,
  add_variation_images = excluded.add_variation_images,
  updated_at = now();

insert into public.skus (id, organization_id, supplier_id, sku_code, name, variant, price, low_stock_qty, max_stock_qty, variation_group_id, is_active) values
  ('00000000-0000-4000-8000-000000000401', '00000000-0000-4000-8000-000000000001', '00000000-0000-4000-8000-000000000201', 'DF-CH-2KG', 'Dog Food - Chicken', '2kg', 42.90, 15, 60, null, true),
  ('00000000-0000-4000-8000-000000000402', '00000000-0000-4000-8000-000000000001', '00000000-0000-4000-8000-000000000202', 'CF-TU-1.5', 'Cat Food - Tuna', '1.5kg', 38.50, 10, 30, null, true),
  ('00000000-0000-4000-8000-000000000403', '00000000-0000-4000-8000-000000000001', '00000000-0000-4000-8000-000000000203', 'RB-SM-001', 'Rubber Ball', 'Small', 8.90, 8, 25, null, true),
  ('00000000-0000-4000-8000-000000000404', '00000000-0000-4000-8000-000000000001', '00000000-0000-4000-8000-000000000203', 'DL-MED-002', 'Dog Leash', 'Medium', 24.90, 6, 20, null, true),
  ('00000000-0000-4000-8000-000000000405', '00000000-0000-4000-8000-000000000001', '00000000-0000-4000-8000-000000000202', 'CL-10L-001', 'Cat Litter', '10L', 18.00, 10, 30, null, true),
  ('00000000-0000-4000-8000-000000000406', '00000000-0000-4000-8000-000000000001', '00000000-0000-4000-8000-000000000201', 'DT-BAC-200', 'Dog Treats - Bacon', '200g', 13.90, 8, 20, null, true),
  ('00000000-0000-4000-8000-000000000407', '00000000-0000-4000-8000-000000000001', '00000000-0000-4000-8000-000000000204', 'SH-OAT-500', 'Oatmeal Pet Shampoo', '500ml', 22.90, 8, 36, null, true),
  ('00000000-0000-4000-8000-000000000408', '00000000-0000-4000-8000-000000000001', '00000000-0000-4000-8000-000000000204', 'WF-LAV-80', 'Lavender Wipes', '80 sheets', 12.50, 12, 48, null, true),
  ('00000000-0000-4000-8000-000000000501', '00000000-0000-4000-8000-000000000001', '00000000-0000-4000-8000-000000000205', 'CFP-TUNA-X28', 'Cat Food Pouch x28', 'Tuna', 54.90, 12, 60, '00000000-0000-4000-8000-000000000701', true),
  ('00000000-0000-4000-8000-000000000502', '00000000-0000-4000-8000-000000000001', '00000000-0000-4000-8000-000000000205', 'CFP-CHICK-X28', 'Cat Food Pouch x28', 'Chicken', 54.90, 12, 60, '00000000-0000-4000-8000-000000000701', true),
  ('00000000-0000-4000-8000-000000000503', '00000000-0000-4000-8000-000000000001', '00000000-0000-4000-8000-000000000205', 'CFP-SALM-X28', 'Cat Food Pouch x28', 'Salmon', 58.90, 12, 60, '00000000-0000-4000-8000-000000000701', true),
  ('00000000-0000-4000-8000-000000000504', '00000000-0000-4000-8000-000000000001', '00000000-0000-4000-8000-000000000203', 'HARN-S', 'Dog Harness Pro', 'Small', 35.00, 6, 24, '00000000-0000-4000-8000-000000000702', true),
  ('00000000-0000-4000-8000-000000000505', '00000000-0000-4000-8000-000000000001', '00000000-0000-4000-8000-000000000203', 'HARN-M', 'Dog Harness Pro', 'Medium', 39.00, 6, 24, '00000000-0000-4000-8000-000000000702', true),
  ('00000000-0000-4000-8000-000000000506', '00000000-0000-4000-8000-000000000001', '00000000-0000-4000-8000-000000000203', 'HARN-L', 'Dog Harness Pro', 'Large', 42.00, 6, 24, '00000000-0000-4000-8000-000000000702', true)
on conflict (id) do update set
  supplier_id = excluded.supplier_id,
  sku_code = excluded.sku_code,
  name = excluded.name,
  variant = excluded.variant,
  price = excluded.price,
  low_stock_qty = excluded.low_stock_qty,
  max_stock_qty = excluded.max_stock_qty,
  variation_group_id = excluded.variation_group_id,
  is_active = true,
  archived_at = null,
  updated_at = now();

insert into public.inventory_levels (organization_id, sku_id, location_id, quantity) values
  ('00000000-0000-4000-8000-000000000001', '00000000-0000-4000-8000-000000000401', '00000000-0000-4000-8000-000000000101', 45),
  ('00000000-0000-4000-8000-000000000001', '00000000-0000-4000-8000-000000000402', '00000000-0000-4000-8000-000000000101', 12),
  ('00000000-0000-4000-8000-000000000001', '00000000-0000-4000-8000-000000000403', '00000000-0000-4000-8000-000000000101', 0),
  ('00000000-0000-4000-8000-000000000001', '00000000-0000-4000-8000-000000000404', '00000000-0000-4000-8000-000000000101', 8),
  ('00000000-0000-4000-8000-000000000001', '00000000-0000-4000-8000-000000000405', '00000000-0000-4000-8000-000000000101', 22),
  ('00000000-0000-4000-8000-000000000001', '00000000-0000-4000-8000-000000000406', '00000000-0000-4000-8000-000000000101', 5),
  ('00000000-0000-4000-8000-000000000001', '00000000-0000-4000-8000-000000000407', '00000000-0000-4000-8000-000000000101', 34),
  ('00000000-0000-4000-8000-000000000001', '00000000-0000-4000-8000-000000000408', '00000000-0000-4000-8000-000000000101', 7),
  ('00000000-0000-4000-8000-000000000001', '00000000-0000-4000-8000-000000000501', '00000000-0000-4000-8000-000000000101', 51),
  ('00000000-0000-4000-8000-000000000001', '00000000-0000-4000-8000-000000000502', '00000000-0000-4000-8000-000000000101', 9),
  ('00000000-0000-4000-8000-000000000001', '00000000-0000-4000-8000-000000000503', '00000000-0000-4000-8000-000000000101', 0),
  ('00000000-0000-4000-8000-000000000001', '00000000-0000-4000-8000-000000000504', '00000000-0000-4000-8000-000000000101', 18),
  ('00000000-0000-4000-8000-000000000001', '00000000-0000-4000-8000-000000000505', '00000000-0000-4000-8000-000000000101', 4),
  ('00000000-0000-4000-8000-000000000001', '00000000-0000-4000-8000-000000000506', '00000000-0000-4000-8000-000000000101', 15)
on conflict (sku_id, location_id) do update set quantity = excluded.quantity, updated_at = now();

insert into public.stock_movements (id, organization_id, sku_id, location_id, actor_user_id, movement_type, quantity_delta, quantity_before, quantity_after, reason, note, created_at) values
  ('00000000-0000-4000-8000-000000000801', '00000000-0000-4000-8000-000000000001', '00000000-0000-4000-8000-000000000401', '00000000-0000-4000-8000-000000000101', '00000000-0000-4000-8000-000000000901', 'add', 24, 21, 45, 'New Products', '[demo] Supplier delivery received before weekend rush.', now() - interval '5 months'),
  ('00000000-0000-4000-8000-000000000802', '00000000-0000-4000-8000-000000000001', '00000000-0000-4000-8000-000000000402', '00000000-0000-4000-8000-000000000101', '00000000-0000-4000-8000-000000000902', 'deduct', -8, 20, 12, 'Stock Adjustment', '[demo] Damaged bags removed during shelf audit.', now() - interval '4 months'),
  ('00000000-0000-4000-8000-000000000803', '00000000-0000-4000-8000-000000000001', '00000000-0000-4000-8000-000000000403', '00000000-0000-4000-8000-000000000101', '00000000-0000-4000-8000-000000000902', 'deduct', -6, 6, 0, 'Others', '[demo] Last toys sold out.', now() - interval '3 months'),
  ('00000000-0000-4000-8000-000000000804', '00000000-0000-4000-8000-000000000001', '00000000-0000-4000-8000-000000000501', '00000000-0000-4000-8000-000000000101', '00000000-0000-4000-8000-000000000901', 'add', 36, 15, 51, 'New Products', '[demo] Tuna pouch variation replenished.', now() - interval '2 months'),
  ('00000000-0000-4000-8000-000000000805', '00000000-0000-4000-8000-000000000001', '00000000-0000-4000-8000-000000000503', '00000000-0000-4000-8000-000000000101', '00000000-0000-4000-8000-000000000902', 'deduct', -12, 12, 0, 'Stock Adjustment', '[demo] Salmon pouches sold through faster than expected.', now() - interval '1 month'),
  ('00000000-0000-4000-8000-000000000806', '00000000-0000-4000-8000-000000000001', '00000000-0000-4000-8000-000000000505', '00000000-0000-4000-8000-000000000101', '00000000-0000-4000-8000-000000000902', 'deduct', -5, 9, 4, 'Transfer', '[demo] Sent stock to front display rack.', now() - interval '8 days'),
  ('00000000-0000-4000-8000-000000000807', '00000000-0000-4000-8000-000000000001', '00000000-0000-4000-8000-000000000408', '00000000-0000-4000-8000-000000000101', '00000000-0000-4000-8000-000000000901', 'deduct', -8, 15, 7, 'Warehouse Transfer', '[demo] Transferred wipes for grooming event.', now() - interval '3 days')
on conflict (id) do update set
  quantity_delta = excluded.quantity_delta,
  quantity_before = excluded.quantity_before,
  quantity_after = excluded.quantity_after,
  reason = excluded.reason,
  note = excluded.note,
  created_at = excluded.created_at;

insert into public.restock_requests (id, organization_id, sku_id, location_id, requested_by, status, requested_qty, current_qty_snapshot, low_stock_qty_snapshot, note, created_at, acknowledged_at, ordered_at, resolved_at) values
  ('00000000-0000-4000-8000-000000000601', '00000000-0000-4000-8000-000000000001', '00000000-0000-4000-8000-000000000403', '00000000-0000-4000-8000-000000000101', '00000000-0000-4000-8000-000000000902', 'open', 20, 0, 8, '[demo] Rubber balls are sold out at the cashier rack.', now() - interval '2 days', null, null, null),
  ('00000000-0000-4000-8000-000000000602', '00000000-0000-4000-8000-000000000001', '00000000-0000-4000-8000-000000000503', '00000000-0000-4000-8000-000000000101', '00000000-0000-4000-8000-000000000902', 'acknowledged', 36, 0, 12, '[demo] Salmon pouch variation needs urgent supplier follow-up.', now() - interval '1 day', now() - interval '18 hours', null, null),
  ('00000000-0000-4000-8000-000000000603', '00000000-0000-4000-8000-000000000001', '00000000-0000-4000-8000-000000000505', '00000000-0000-4000-8000-000000000101', '00000000-0000-4000-8000-000000000902', 'ordered', 18, 4, 6, '[demo] Medium harness sizes moving quickly this week.', now() - interval '12 hours', now() - interval '10 hours', now() - interval '4 hours', null),
  ('00000000-0000-4000-8000-000000000604', '00000000-0000-4000-8000-000000000001', '00000000-0000-4000-8000-000000000408', '00000000-0000-4000-8000-000000000101', '00000000-0000-4000-8000-000000000902', 'open', 24, 7, 12, '[demo] Wipes are below low-stock threshold after event.', now() - interval '4 hours', null, null, null)
on conflict (id) do update set
  status = excluded.status,
  requested_qty = excluded.requested_qty,
  current_qty_snapshot = excluded.current_qty_snapshot,
  low_stock_qty_snapshot = excluded.low_stock_qty_snapshot,
  note = excluded.note,
  created_at = excluded.created_at,
  acknowledged_at = excluded.acknowledged_at,
  ordered_at = excluded.ordered_at,
  resolved_at = excluded.resolved_at;

insert into public.restock_request_events (id, organization_id, restock_request_id, actor_user_id, from_status, to_status, comment, created_at) values
  ('00000000-0000-4000-8000-000000000611', '00000000-0000-4000-8000-000000000001', '00000000-0000-4000-8000-000000000601', '00000000-0000-4000-8000-000000000902', null, 'open', '[demo] Rubber balls are sold out at the cashier rack.', now() - interval '2 days'),
  ('00000000-0000-4000-8000-000000000612', '00000000-0000-4000-8000-000000000001', '00000000-0000-4000-8000-000000000602', '00000000-0000-4000-8000-000000000902', null, 'open', '[demo] Salmon pouch variation needs urgent supplier follow-up.', now() - interval '1 day'),
  ('00000000-0000-4000-8000-000000000613', '00000000-0000-4000-8000-000000000001', '00000000-0000-4000-8000-000000000602', '00000000-0000-4000-8000-000000000901', 'open', 'acknowledged', '[demo] Admin has messaged supplier.', now() - interval '18 hours'),
  ('00000000-0000-4000-8000-000000000614', '00000000-0000-4000-8000-000000000001', '00000000-0000-4000-8000-000000000603', '00000000-0000-4000-8000-000000000902', null, 'open', '[demo] Medium harness sizes moving quickly this week.', now() - interval '12 hours'),
  ('00000000-0000-4000-8000-000000000615', '00000000-0000-4000-8000-000000000001', '00000000-0000-4000-8000-000000000603', '00000000-0000-4000-8000-000000000901', 'acknowledged', 'ordered', '[demo] Supplier confirmed delivery tomorrow.', now() - interval '4 hours')
on conflict (id) do update set
  from_status = excluded.from_status,
  to_status = excluded.to_status,
  comment = excluded.comment,
  created_at = excluded.created_at;

insert into public.audit_events (id, organization_id, actor_user_id, actor_role, event_type, entity_type, entity_id, entity_label, action, before_data, after_data, metadata, created_at) values
  ('00000000-0000-4000-8000-000000000821', '00000000-0000-4000-8000-000000000001', '00000000-0000-4000-8000-000000000901', 'admin', 'crud', 'sku_variation_group', '00000000-0000-4000-8000-000000000701', 'Cat Food Pouch x28', 'create_variation_group', null, jsonb_build_object('variation_name', 'Flavor'), jsonb_build_object('source', 'demo_seed'), now() - interval '20 days'),
  ('00000000-0000-4000-8000-000000000822', '00000000-0000-4000-8000-000000000001', '00000000-0000-4000-8000-000000000901', 'admin', 'crud', 'sku', '00000000-0000-4000-8000-000000000502', 'Cat Food Pouch x28', 'update_sku', jsonb_build_object('price', 52.90), jsonb_build_object('price', 54.90), jsonb_build_object('source', 'demo_seed'), now() - interval '9 days'),
  ('00000000-0000-4000-8000-000000000823', '00000000-0000-4000-8000-000000000001', '00000000-0000-4000-8000-000000000902', 'staff', 'restock', 'restock_request', '00000000-0000-4000-8000-000000000602', 'Restock request', 'create_restock_request', null, jsonb_build_object('status', 'open', 'requested_qty', 36), jsonb_build_object('sku_id', '00000000-0000-4000-8000-000000000503'), now() - interval '1 day'),
  ('00000000-0000-4000-8000-000000000824', '00000000-0000-4000-8000-000000000001', '00000000-0000-4000-8000-000000000901', 'admin', 'restock', 'restock_request', '00000000-0000-4000-8000-000000000603', 'Restock request', 'update_restock_status', jsonb_build_object('status', 'acknowledged'), jsonb_build_object('status', 'ordered'), jsonb_build_object('source', 'demo_seed'), now() - interval '4 hours'),
  ('00000000-0000-4000-8000-000000000825', '00000000-0000-4000-8000-000000000001', '00000000-0000-4000-8000-000000000902', 'staff', 'stock', 'inventory_level', null, 'Stock adjustment', 'deduct_stock', jsonb_build_object('quantity', 9), jsonb_build_object('quantity', 4), jsonb_build_object('sku_id', '00000000-0000-4000-8000-000000000505', 'reason', 'Transfer'), now() - interval '8 days')
on conflict (id) do update set
  actor_role = excluded.actor_role,
  event_type = excluded.event_type,
  entity_type = excluded.entity_type,
  entity_label = excluded.entity_label,
  action = excluded.action,
  before_data = excluded.before_data,
  after_data = excluded.after_data,
  metadata = excluded.metadata,
  created_at = excluded.created_at;

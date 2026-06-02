begin;

create table if not exists public.sku_variation_groups (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations(id) on delete cascade,
  product_name text not null,
  variation_name text not null,
  add_variation_images boolean not null default false,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

alter table public.sku_variation_groups enable row level security;

alter table public.skus
  add column if not exists price numeric(12, 2) not null default 0,
  add column if not exists variation_group_id uuid references public.sku_variation_groups(id) on delete set null;

alter table public.stock_movements
  add column if not exists reason text not null default 'Stock Adjustment';

do $$
begin
  if not exists (select 1 from pg_constraint where conname = 'skus_price_non_negative') then
    alter table public.skus add constraint skus_price_non_negative check (price >= 0);
  end if;

  if not exists (select 1 from pg_constraint where conname = 'stock_movements_reason_allowed') then
    alter table public.stock_movements add constraint stock_movements_reason_allowed check (
      reason in ('Returned', 'New Products', 'Stock Adjustment', 'Transfer', 'Others', 'Excel Import', 'Warehouse Transfer')
    );
  end if;
end $$;

create index if not exists sku_variation_groups_org_created_idx on public.sku_variation_groups(organization_id, created_at desc);
create index if not exists skus_variation_group_id_idx on public.skus(variation_group_id);

drop policy if exists "Admins can manage SKU variation groups" on public.sku_variation_groups;
create policy "Admins can manage SKU variation groups"
on public.sku_variation_groups
for all
to authenticated
using (private.is_org_admin(organization_id))
with check (private.is_org_admin(organization_id));

drop function if exists public.adjust_stock(uuid, uuid, integer, text);
drop function if exists public.admin_create_sku(uuid, text, text, text, text, text, text, text, text, integer, integer, integer);
drop function if exists public.admin_update_sku(uuid, text, text, text, text, text, text, text, text, integer, integer);
drop function if exists public.get_admin_inventory_overview(uuid);
drop function if exists public.get_admin_sku_manager_rows(uuid);
drop function if exists public.get_staff_inventory_overview(uuid);

create function public.admin_create_sku_variation_group(
  p_organization_id uuid,
  p_product_name text,
  p_variation_name text,
  p_add_variation_images boolean default false
) returns uuid
language plpgsql
security definer
set search_path to ''
as $$
declare
  group_id uuid;
  actor_role text;
begin
  if auth.uid() is null then raise exception 'Not authenticated'; end if;
  if not private.is_org_admin(p_organization_id) then raise exception 'Admin access required'; end if;
  if nullif(trim(p_product_name), '') is null then raise exception 'Product name is required'; end if;
  if nullif(trim(p_variation_name), '') is null then raise exception 'Variation name is required'; end if;

  insert into public.sku_variation_groups (organization_id, product_name, variation_name, add_variation_images)
  values (p_organization_id, trim(p_product_name), trim(p_variation_name), coalesce(p_add_variation_images, false))
  returning id into group_id;

  actor_role := private.member_role_for(p_organization_id);

  insert into public.audit_events (organization_id, actor_user_id, actor_role, event_type, entity_type, entity_id, entity_label, action, after_data)
  values (
    p_organization_id,
    auth.uid(),
    actor_role,
    'crud',
    'sku_variation_group',
    group_id,
    trim(p_product_name),
    'create_variation_group',
    jsonb_build_object('product_name', trim(p_product_name), 'variation_name', trim(p_variation_name), 'add_variation_images', coalesce(p_add_variation_images, false))
  );

  return group_id;
end;
$$;

create function public.adjust_stock(
  p_sku_id uuid,
  p_location_id uuid,
  p_delta integer,
  p_note text default null,
  p_reason text default 'Stock Adjustment'
) returns table (sku_id uuid, location_id uuid, quantity integer, movement_id uuid)
language plpgsql
security definer
set search_path to ''
as $$
declare
  inv_row public.inventory_levels%rowtype;
  next_quantity integer;
  actor_role text;
  new_movement_id uuid;
begin
  if auth.uid() is null then raise exception 'Not authenticated'; end if;
  if p_delta = 0 then raise exception 'Stock adjustment cannot be zero'; end if;
  if p_reason not in ('Returned', 'New Products', 'Stock Adjustment', 'Transfer', 'Others', 'Excel Import', 'Warehouse Transfer') then raise exception 'Invalid stock adjustment reason'; end if;

  select * into inv_row
  from public.inventory_levels il
  where il.sku_id = p_sku_id
    and il.location_id = p_location_id
  for update;

  if not found then raise exception 'Inventory row not found'; end if;
  if not private.is_org_member(inv_row.organization_id) then raise exception 'Not authorized'; end if;

  actor_role := private.member_role_for(inv_row.organization_id);
  next_quantity := inv_row.quantity + p_delta;

  if next_quantity < 0 then raise exception 'Stock cannot go below zero'; end if;

  update public.inventory_levels il
  set quantity = next_quantity, updated_at = now()
  where il.id = inv_row.id;

  insert into public.stock_movements (
    organization_id, sku_id, location_id, actor_user_id, movement_type,
    quantity_delta, quantity_before, quantity_after, reason, note
  ) values (
    inv_row.organization_id, inv_row.sku_id, inv_row.location_id, auth.uid(),
    case when p_delta > 0 then 'add'::public.movement_type else 'deduct'::public.movement_type end,
    p_delta, inv_row.quantity, next_quantity, p_reason, nullif(trim(coalesce(p_note, '')), '')
  ) returning id into new_movement_id;

  insert into public.audit_events (
    organization_id, actor_user_id, actor_role, event_type, entity_type, entity_id,
    entity_label, action, before_data, after_data, metadata
  ) values (
    inv_row.organization_id, auth.uid(), actor_role, 'stock', 'inventory_level', inv_row.id,
    'Stock adjustment', case when p_delta > 0 then 'add_stock' else 'deduct_stock' end,
    jsonb_build_object('quantity', inv_row.quantity),
    jsonb_build_object('quantity', next_quantity),
    jsonb_build_object('sku_id', inv_row.sku_id, 'location_id', inv_row.location_id, 'delta', p_delta, 'reason', p_reason, 'note', p_note, 'movement_id', new_movement_id)
  );

  return query select inv_row.sku_id, inv_row.location_id, next_quantity, new_movement_id;
end;
$$;

create function public.admin_create_sku(
  p_organization_id uuid,
  p_supplier_name text,
  p_contact_name text,
  p_country text,
  p_phone_raw text,
  p_whatsapp_number text,
  p_sku_code text,
  p_name text,
  p_variant text,
  p_price numeric,
  p_low_stock_qty integer,
  p_max_stock_qty integer,
  p_opening_stock integer,
  p_variation_group_id uuid default null
) returns uuid
language plpgsql
security definer
set search_path to ''
as $$
declare
  supplier_id uuid;
  contact_id uuid;
  sku_id uuid;
  default_location_id uuid;
  sku_count integer;
  sku_limit integer;
  actor_role text;
begin
  if auth.uid() is null then raise exception 'Not authenticated'; end if;
  if not private.is_org_admin(p_organization_id) then raise exception 'Admin access required'; end if;
  if nullif(trim(p_supplier_name), '') is null then raise exception 'Supplier name is required'; end if;
  if nullif(trim(p_sku_code), '') is null then raise exception 'SKU code is required'; end if;
  if nullif(trim(p_name), '') is null then raise exception 'Product name is required'; end if;
  if p_country not in ('MY', 'TH') then raise exception 'Country must be MY or TH'; end if;
  if p_low_stock_qty < 0 or p_max_stock_qty < 0 or p_opening_stock < 0 then raise exception 'Stock values cannot be negative'; end if;
  if p_price < 0 then raise exception 'Price cannot be negative'; end if;
  if p_variation_group_id is not null and not exists (select 1 from public.sku_variation_groups where id = p_variation_group_id and organization_id = p_organization_id) then raise exception 'Variation group not found'; end if;

  select pe.sku_limit into sku_limit from public.plan_entitlements pe where pe.organization_id = p_organization_id;
  select count(*) into sku_count from public.skus s where s.organization_id = p_organization_id and s.is_active and s.archived_at is null;
  if sku_limit is not null and sku_count >= sku_limit then raise exception 'SKU limit reached'; end if;

  select id into default_location_id from public.locations where organization_id = p_organization_id and is_default and archived_at is null limit 1;
  if default_location_id is null then raise exception 'Default location not found'; end if;

  insert into public.suppliers (organization_id, name)
  values (p_organization_id, trim(p_supplier_name))
  returning id into supplier_id;

  insert into public.supplier_contacts (supplier_id, organization_id, contact_name, country, phone_raw, whatsapp_number, is_primary)
  values (supplier_id, p_organization_id, nullif(trim(p_contact_name), ''), p_country, trim(p_phone_raw), trim(p_whatsapp_number), true)
  returning id into contact_id;

  insert into public.skus (organization_id, supplier_id, sku_code, name, variant, price, low_stock_qty, max_stock_qty, variation_group_id)
  values (p_organization_id, supplier_id, upper(trim(p_sku_code)), trim(p_name), nullif(trim(p_variant), ''), p_price, p_low_stock_qty, p_max_stock_qty, p_variation_group_id)
  returning id into sku_id;

  insert into public.inventory_levels (organization_id, sku_id, location_id, quantity)
  values (p_organization_id, sku_id, default_location_id, p_opening_stock);

  actor_role := private.member_role_for(p_organization_id);

  if p_opening_stock > 0 then
    insert into public.stock_movements (organization_id, sku_id, location_id, actor_user_id, movement_type, quantity_delta, quantity_before, quantity_after, reason, note)
    values (p_organization_id, sku_id, default_location_id, auth.uid(), 'add', p_opening_stock, 0, p_opening_stock, 'New Products', 'Opening stock');
  end if;

  insert into public.audit_events (organization_id, actor_user_id, actor_role, event_type, entity_type, entity_id, entity_label, action, after_data, metadata)
  values (
    p_organization_id, auth.uid(), actor_role, 'crud', 'sku', sku_id, trim(p_name), 'create_sku',
    jsonb_build_object('sku_code', upper(trim(p_sku_code)), 'name', trim(p_name), 'variant', p_variant, 'price', p_price, 'low_stock_qty', p_low_stock_qty, 'max_stock_qty', p_max_stock_qty, 'opening_stock', p_opening_stock),
    jsonb_build_object('supplier_id', supplier_id, 'supplier_contact_id', contact_id, 'variation_group_id', p_variation_group_id)
  );

  return sku_id;
end;
$$;

create function public.admin_update_sku(
  p_sku_id uuid,
  p_supplier_name text,
  p_contact_name text,
  p_country text,
  p_phone_raw text,
  p_whatsapp_number text,
  p_sku_code text,
  p_name text,
  p_variant text,
  p_price numeric,
  p_low_stock_qty integer,
  p_max_stock_qty integer
) returns uuid
language plpgsql
security definer
set search_path to ''
as $$
declare
  old_sku public.skus%rowtype;
  old_supplier public.suppliers%rowtype;
  org_id uuid;
  contact_id uuid;
  actor_role text;
begin
  if auth.uid() is null then raise exception 'Not authenticated'; end if;
  select * into old_sku from public.skus where id = p_sku_id for update;
  if not found then raise exception 'SKU not found'; end if;

  org_id := old_sku.organization_id;
  if not private.is_org_admin(org_id) then raise exception 'Admin access required'; end if;
  if nullif(trim(p_supplier_name), '') is null then raise exception 'Supplier name is required'; end if;
  if nullif(trim(p_sku_code), '') is null then raise exception 'SKU code is required'; end if;
  if nullif(trim(p_name), '') is null then raise exception 'Product name is required'; end if;
  if p_country not in ('MY', 'TH') then raise exception 'Country must be MY or TH'; end if;
  if p_low_stock_qty < 0 or p_max_stock_qty < 0 then raise exception 'Stock values cannot be negative'; end if;
  if p_price < 0 then raise exception 'Price cannot be negative'; end if;

  select * into old_supplier from public.suppliers where id = old_sku.supplier_id for update;

  update public.suppliers set name = trim(p_supplier_name), updated_at = now() where id = old_sku.supplier_id;

  select id into contact_id from public.supplier_contacts where supplier_id = old_sku.supplier_id and is_primary limit 1;
  if contact_id is null then
    insert into public.supplier_contacts (supplier_id, organization_id, contact_name, country, phone_raw, whatsapp_number, is_primary)
    values (old_sku.supplier_id, org_id, nullif(trim(p_contact_name), ''), p_country, trim(p_phone_raw), trim(p_whatsapp_number), true);
  else
    update public.supplier_contacts
    set contact_name = nullif(trim(p_contact_name), ''), country = p_country, phone_raw = trim(p_phone_raw), whatsapp_number = trim(p_whatsapp_number), updated_at = now()
    where id = contact_id;
  end if;

  update public.skus
  set sku_code = upper(trim(p_sku_code)), name = trim(p_name), variant = nullif(trim(p_variant), ''), price = p_price, low_stock_qty = p_low_stock_qty, max_stock_qty = p_max_stock_qty, updated_at = now()
  where id = p_sku_id;

  actor_role := private.member_role_for(org_id);

  insert into public.audit_events (organization_id, actor_user_id, actor_role, event_type, entity_type, entity_id, entity_label, action, before_data, after_data, metadata)
  values (
    org_id, auth.uid(), actor_role, 'crud', 'sku', p_sku_id, trim(p_name), 'update_sku',
    jsonb_build_object('sku_code', old_sku.sku_code, 'name', old_sku.name, 'variant', old_sku.variant, 'price', old_sku.price, 'low_stock_qty', old_sku.low_stock_qty, 'max_stock_qty', old_sku.max_stock_qty, 'supplier_name', old_supplier.name),
    jsonb_build_object('sku_code', upper(trim(p_sku_code)), 'name', trim(p_name), 'variant', p_variant, 'price', p_price, 'low_stock_qty', p_low_stock_qty, 'max_stock_qty', p_max_stock_qty, 'supplier_name', trim(p_supplier_name)),
    jsonb_build_object('supplier_id', old_sku.supplier_id, 'supplier_contact_id', contact_id, 'variation_group_id', old_sku.variation_group_id)
  );

  return p_sku_id;
end;
$$;

create function public.get_staff_inventory_overview(p_organization_id uuid)
returns table (
  sku_id uuid,
  location_id uuid,
  product_name text,
  variant text,
  sku_code text,
  photo_path text,
  price numeric,
  quantity integer,
  low_stock_qty integer,
  max_stock_qty integer,
  location_name text,
  is_low_stock boolean,
  is_out_of_stock boolean
)
language sql
security definer
set search_path to ''
as $$
  select s.id, il.location_id, s.name, s.variant, s.sku_code, s.photo_path, s.price, il.quantity, s.low_stock_qty, s.max_stock_qty, l.name,
    il.quantity <= s.low_stock_qty,
    il.quantity = 0
  from public.inventory_levels il
  join public.skus s on s.id = il.sku_id and s.organization_id = il.organization_id
  join public.locations l on l.id = il.location_id
  where il.organization_id = p_organization_id
    and s.is_active = true
    and s.archived_at is null
    and private.is_org_member(p_organization_id)
  order by s.name asc, s.variant asc nulls first;
$$;

create function public.get_admin_inventory_overview(p_organization_id uuid)
returns table (
  sku_id uuid,
  location_id uuid,
  product_name text,
  variant text,
  sku_code text,
  photo_path text,
  price numeric,
  quantity integer,
  low_stock_qty integer,
  max_stock_qty integer,
  location_name text,
  is_low_stock boolean,
  is_out_of_stock boolean,
  supplier_name text,
  contact_name text,
  phone_raw text,
  whatsapp_number text
)
language sql
security definer
set search_path to ''
as $$
  select s.id, il.location_id, s.name, s.variant, s.sku_code, s.photo_path, s.price, il.quantity, s.low_stock_qty, s.max_stock_qty, l.name,
    il.quantity <= s.low_stock_qty,
    il.quantity = 0,
    sup.name, sc.contact_name, sc.phone_raw, sc.whatsapp_number
  from public.inventory_levels il
  join public.skus s on s.id = il.sku_id and s.organization_id = il.organization_id
  join public.locations l on l.id = il.location_id
  left join public.suppliers sup on sup.id = s.supplier_id
  left join public.supplier_contacts sc on sc.supplier_id = sup.id and sc.is_primary = true
  where il.organization_id = p_organization_id
    and s.is_active = true
    and s.archived_at is null
    and private.is_org_admin(p_organization_id)
  order by s.name asc, s.variant asc nulls first;
$$;

create function public.get_admin_sku_manager_rows(p_organization_id uuid)
returns table (
  sku_id uuid,
  product_name text,
  variant text,
  sku_code text,
  photo_path text,
  price numeric,
  variation_group_id uuid,
  variation_name text,
  add_variation_images boolean,
  quantity integer,
  low_stock_qty integer,
  max_stock_qty integer,
  supplier_name text,
  contact_name text,
  country text,
  phone_raw text,
  whatsapp_number text
)
language sql
security definer
set search_path to ''
as $$
  select s.id, s.name, s.variant, s.sku_code, s.photo_path, s.price, s.variation_group_id, svg.variation_name, svg.add_variation_images, il.quantity, s.low_stock_qty, s.max_stock_qty, sup.name, sc.contact_name, sc.country, sc.phone_raw, sc.whatsapp_number
  from public.skus s
  join public.inventory_levels il on il.sku_id = s.id
  left join public.sku_variation_groups svg on svg.id = s.variation_group_id
  left join public.suppliers sup on sup.id = s.supplier_id
  left join public.supplier_contacts sc on sc.supplier_id = sup.id and sc.is_primary
  where s.organization_id = p_organization_id
    and s.is_active
    and s.archived_at is null
    and private.is_org_admin(p_organization_id)
  order by coalesce(svg.created_at, s.created_at) desc, svg.variation_name nulls first, s.created_at desc;
$$;

revoke execute on function public.admin_create_sku_variation_group(uuid, text, text, boolean) from public, anon;
revoke execute on function public.adjust_stock(uuid, uuid, integer, text, text) from public, anon;
revoke execute on function public.admin_create_sku(uuid, text, text, text, text, text, text, text, text, numeric, integer, integer, integer, uuid) from public, anon;
revoke execute on function public.admin_update_sku(uuid, text, text, text, text, text, text, text, text, numeric, integer, integer) from public, anon;
revoke execute on function public.get_staff_inventory_overview(uuid) from public, anon;
revoke execute on function public.get_admin_inventory_overview(uuid) from public, anon;
revoke execute on function public.get_admin_sku_manager_rows(uuid) from public, anon;

grant execute on function public.admin_create_sku_variation_group(uuid, text, text, boolean) to authenticated;
grant execute on function public.adjust_stock(uuid, uuid, integer, text, text) to authenticated;
grant execute on function public.admin_create_sku(uuid, text, text, text, text, text, text, text, text, numeric, integer, integer, integer, uuid) to authenticated;
grant execute on function public.admin_update_sku(uuid, text, text, text, text, text, text, text, text, numeric, integer, integer) to authenticated;
grant execute on function public.get_staff_inventory_overview(uuid) to authenticated;
grant execute on function public.get_admin_inventory_overview(uuid) to authenticated;
grant execute on function public.get_admin_sku_manager_rows(uuid) to authenticated;

notify pgrst, 'reload schema';

commit;

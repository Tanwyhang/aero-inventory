-- Stock adjustment reasons, SKU pricing, and grouped variation SKUs.
-- Apply in Supabase SQL editor or convert into your normal migration pipeline.

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
  if not exists (
    select 1 from pg_constraint where conname = 'skus_price_non_negative'
  ) then
    alter table public.skus add constraint skus_price_non_negative check (price >= 0);
  end if;

  if not exists (
    select 1 from pg_constraint where conname = 'stock_movements_reason_allowed'
  ) then
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

create or replace function public.admin_create_sku_variation_group(
  p_organization_id uuid,
  p_product_name text,
  p_variation_name text,
  p_add_variation_images boolean default false
) returns uuid
language plpgsql
security definer
set search_path = public, private
as $$
declare
  v_actor uuid := auth.uid();
  v_group_id uuid;
  v_actor_role text;
begin
  if v_actor is null then
    raise exception 'Authentication required';
  end if;

  if not private.is_org_admin(p_organization_id) then
    raise exception 'Admin access required';
  end if;

  v_actor_role := private.member_role_for(p_organization_id);

  insert into public.sku_variation_groups (organization_id, product_name, variation_name, add_variation_images)
  values (p_organization_id, trim(p_product_name), trim(p_variation_name), coalesce(p_add_variation_images, false))
  returning id into v_group_id;

  insert into public.audit_events (
    organization_id,
    actor_user_id,
    actor_role,
    event_type,
    entity_type,
    entity_id,
    entity_label,
    action,
    after_data
  ) values (
    p_organization_id,
    v_actor,
    v_actor_role,
    'sku',
    'sku_variation_group',
    v_group_id,
    trim(p_product_name),
    'create_variation_group',
    jsonb_build_object('product_name', trim(p_product_name), 'variation_name', trim(p_variation_name), 'add_variation_images', coalesce(p_add_variation_images, false))
  );

  return v_group_id;
end;
$$;

create or replace function public.adjust_stock(
  p_sku_id uuid,
  p_location_id uuid,
  p_delta integer,
  p_note text default null,
  p_reason text default 'Stock Adjustment'
) returns table (sku_id uuid, location_id uuid, quantity integer, movement_id uuid)
language plpgsql
security definer
set search_path = public, private
as $$
declare
  v_actor uuid := auth.uid();
  v_actor_role text;
  v_organization_id uuid;
  v_before integer;
  v_after integer;
  v_movement_id uuid;
  v_sku_label text;
  v_location_name text;
begin
  if v_actor is null then
    raise exception 'Authentication required';
  end if;

  if p_delta = 0 then
    raise exception 'Stock change cannot be zero';
  end if;

  if p_reason not in ('Returned', 'New Products', 'Stock Adjustment', 'Transfer', 'Others', 'Excel Import', 'Warehouse Transfer') then
    raise exception 'Invalid stock adjustment reason';
  end if;

  select il.organization_id, il.quantity, s.sku_code, l.name
    into v_organization_id, v_before, v_sku_label, v_location_name
  from public.inventory_levels il
  join public.skus s on s.id = il.sku_id
  join public.locations l on l.id = il.location_id
  where il.sku_id = p_sku_id
    and il.location_id = p_location_id
  for update of il;

  if v_organization_id is null then
    raise exception 'Inventory row not found';
  end if;

  v_actor_role := private.member_role_for(v_organization_id);
  if v_actor_role not in ('admin', 'staff') then
    raise exception 'Active membership required';
  end if;

  v_after := v_before + p_delta;
  if v_after < 0 then
    raise exception 'Stock cannot go below zero';
  end if;

  update public.inventory_levels
  set quantity = v_after,
      updated_at = now()
  where sku_id = p_sku_id
    and location_id = p_location_id;

  insert into public.stock_movements (
    organization_id,
    sku_id,
    location_id,
    actor_user_id,
    movement_type,
    quantity_delta,
    quantity_before,
    quantity_after,
    reason,
    note
  ) values (
    v_organization_id,
    p_sku_id,
    p_location_id,
    v_actor,
    case when p_delta > 0 then 'add'::public.movement_type else 'deduct'::public.movement_type end,
    p_delta,
    v_before,
    v_after,
    p_reason,
    nullif(trim(coalesce(p_note, '')), '')
  ) returning id into v_movement_id;

  insert into public.audit_events (
    organization_id,
    actor_user_id,
    actor_role,
    event_type,
    entity_type,
    entity_id,
    entity_label,
    action,
    before_data,
    after_data,
    metadata
  ) values (
    v_organization_id,
    v_actor,
    v_actor_role,
    'stock',
    'stock_movement',
    v_movement_id,
    v_sku_label,
    'adjust_stock',
    jsonb_build_object('quantity', v_before),
    jsonb_build_object('quantity', v_after),
    jsonb_build_object(
      'action_id', v_movement_id,
      'sku_id', p_sku_id,
      'location_id', p_location_id,
      'warehouse', v_location_name,
      'quantity_delta', p_delta,
      'reason', p_reason,
      'note', nullif(trim(coalesce(p_note, '')), '')
    )
  );

  return query select p_sku_id, p_location_id, v_after, v_movement_id;
end;
$$;

-- Replace these RPCs only if your current DB uses the same Phase-One table names.
-- They include new `price` and variation grouping fields expected by the app.
create or replace function public.admin_create_sku(
  p_organization_id uuid,
  p_supplier_name text,
  p_contact_name text default '',
  p_country text default 'MY',
  p_phone_raw text default '',
  p_whatsapp_number text default '',
  p_sku_code text default '',
  p_name text default '',
  p_variant text default '',
  p_price numeric default 0,
  p_low_stock_qty integer default 0,
  p_max_stock_qty integer default 0,
  p_opening_stock integer default 0,
  p_variation_group_id uuid default null
) returns uuid
language plpgsql
security definer
set search_path = public, private
as $$
declare
  v_actor uuid := auth.uid();
  v_actor_role text;
  v_supplier_id uuid;
  v_contact_id uuid;
  v_sku_id uuid;
  v_location_id uuid;
  v_movement_id uuid;
begin
  if v_actor is null then
    raise exception 'Authentication required';
  end if;

  if not private.is_org_admin(p_organization_id) then
    raise exception 'Admin access required';
  end if;

  if p_price < 0 then
    raise exception 'Price cannot be below zero';
  end if;

  v_actor_role := private.member_role_for(p_organization_id);

  select id into v_supplier_id
  from public.suppliers
  where organization_id = p_organization_id
    and lower(name) = lower(trim(p_supplier_name))
    and archived_at is null
  order by created_at
  limit 1;

  if v_supplier_id is null then
    insert into public.suppliers (organization_id, name)
    values (p_organization_id, trim(p_supplier_name))
    returning id into v_supplier_id;
  end if;

  select id into v_contact_id
  from public.supplier_contacts
  where supplier_id = v_supplier_id
  order by is_primary desc, created_at
  limit 1;

  if v_contact_id is null then
    insert into public.supplier_contacts (supplier_id, organization_id, contact_name, country, phone_raw, whatsapp_number, is_primary)
    values (v_supplier_id, p_organization_id, nullif(trim(p_contact_name), ''), p_country, trim(p_phone_raw), trim(p_whatsapp_number), true);
  else
    update public.supplier_contacts
    set contact_name = nullif(trim(p_contact_name), ''),
        country = p_country,
        phone_raw = trim(p_phone_raw),
        whatsapp_number = trim(p_whatsapp_number),
        updated_at = now()
    where id = v_contact_id;
  end if;

  insert into public.skus (organization_id, supplier_id, sku_code, name, variant, price, low_stock_qty, max_stock_qty, variation_group_id)
  values (p_organization_id, v_supplier_id, upper(trim(p_sku_code)), trim(p_name), nullif(trim(p_variant), ''), p_price, p_low_stock_qty, p_max_stock_qty, p_variation_group_id)
  returning id into v_sku_id;

  select id into v_location_id
  from public.locations
  where organization_id = p_organization_id
    and archived_at is null
  order by is_default desc, created_at
  limit 1;

  if v_location_id is null then
    raise exception 'Default warehouse not found';
  end if;

  insert into public.inventory_levels (organization_id, sku_id, location_id, quantity)
  values (p_organization_id, v_sku_id, v_location_id, p_opening_stock);

  if p_opening_stock <> 0 then
    insert into public.stock_movements (organization_id, sku_id, location_id, actor_user_id, movement_type, quantity_delta, quantity_before, quantity_after, reason, note)
    values (p_organization_id, v_sku_id, v_location_id, v_actor, 'add'::public.movement_type, p_opening_stock, 0, p_opening_stock, 'New Products', 'Opening stock')
    returning id into v_movement_id;
  end if;

  insert into public.audit_events (organization_id, actor_user_id, actor_role, event_type, entity_type, entity_id, entity_label, action, after_data, metadata)
  values (
    p_organization_id,
    v_actor,
    v_actor_role,
    'sku',
    'sku',
    v_sku_id,
    upper(trim(p_sku_code)),
    'create_sku',
    jsonb_build_object('sku_code', upper(trim(p_sku_code)), 'name', trim(p_name), 'variant', nullif(trim(p_variant), ''), 'price', p_price),
    jsonb_build_object('variation_group_id', p_variation_group_id, 'opening_movement_id', v_movement_id)
  );

  return v_sku_id;
end;
$$;

create or replace function public.admin_update_sku(
  p_sku_id uuid,
  p_supplier_name text,
  p_contact_name text default '',
  p_country text default 'MY',
  p_phone_raw text default '',
  p_whatsapp_number text default '',
  p_sku_code text default '',
  p_name text default '',
  p_variant text default '',
  p_price numeric default 0,
  p_low_stock_qty integer default 0,
  p_max_stock_qty integer default 0
) returns uuid
language plpgsql
security definer
set search_path = public, private
as $$
declare
  v_actor uuid := auth.uid();
  v_actor_role text;
  v_organization_id uuid;
  v_supplier_id uuid;
  v_contact_id uuid;
  v_before jsonb;
begin
  if v_actor is null then
    raise exception 'Authentication required';
  end if;

  select organization_id, to_jsonb(s.*) into v_organization_id, v_before
  from public.skus s
  where s.id = p_sku_id;

  if v_organization_id is null then
    raise exception 'SKU not found';
  end if;

  if not private.is_org_admin(v_organization_id) then
    raise exception 'Admin access required';
  end if;

  if p_price < 0 then
    raise exception 'Price cannot be below zero';
  end if;

  v_actor_role := private.member_role_for(v_organization_id);

  select id into v_supplier_id
  from public.suppliers
  where organization_id = v_organization_id
    and lower(name) = lower(trim(p_supplier_name))
    and archived_at is null
  order by created_at
  limit 1;

  if v_supplier_id is null then
    insert into public.suppliers (organization_id, name)
    values (v_organization_id, trim(p_supplier_name))
    returning id into v_supplier_id;
  end if;

  select id into v_contact_id
  from public.supplier_contacts
  where supplier_id = v_supplier_id
  order by is_primary desc, created_at
  limit 1;

  if v_contact_id is null then
    insert into public.supplier_contacts (supplier_id, organization_id, contact_name, country, phone_raw, whatsapp_number, is_primary)
    values (v_supplier_id, v_organization_id, nullif(trim(p_contact_name), ''), p_country, trim(p_phone_raw), trim(p_whatsapp_number), true);
  else
    update public.supplier_contacts
    set contact_name = nullif(trim(p_contact_name), ''),
        country = p_country,
        phone_raw = trim(p_phone_raw),
        whatsapp_number = trim(p_whatsapp_number),
        updated_at = now()
    where id = v_contact_id;
  end if;

  update public.skus
  set supplier_id = v_supplier_id,
      sku_code = upper(trim(p_sku_code)),
      name = trim(p_name),
      variant = nullif(trim(p_variant), ''),
      price = p_price,
      low_stock_qty = p_low_stock_qty,
      max_stock_qty = p_max_stock_qty,
      updated_at = now()
  where id = p_sku_id;

  insert into public.audit_events (organization_id, actor_user_id, actor_role, event_type, entity_type, entity_id, entity_label, action, before_data, after_data)
  values (
    v_organization_id,
    v_actor,
    v_actor_role,
    'sku',
    'sku',
    p_sku_id,
    upper(trim(p_sku_code)),
    'update_sku',
    v_before,
    jsonb_build_object('sku_code', upper(trim(p_sku_code)), 'name', trim(p_name), 'variant', nullif(trim(p_variant), ''), 'price', p_price)
  );

  return p_sku_id;
end;
$$;

create or replace function public.get_admin_sku_manager_rows(p_organization_id uuid)
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
set search_path = public, private
as $$
  select
    s.id,
    s.name,
    s.variant,
    s.sku_code,
    s.photo_path,
    s.price,
    s.variation_group_id,
    svg.variation_name,
    svg.add_variation_images,
    coalesce(il.quantity, 0),
    s.low_stock_qty,
    s.max_stock_qty,
    sup.name,
    sc.contact_name,
    sc.country,
    sc.phone_raw,
    sc.whatsapp_number
  from public.skus s
  left join public.sku_variation_groups svg on svg.id = s.variation_group_id
  left join public.inventory_levels il on il.sku_id = s.id
  left join public.suppliers sup on sup.id = s.supplier_id
  left join lateral (
    select contact_name, country, phone_raw, whatsapp_number
    from public.supplier_contacts
    where supplier_id = sup.id
    order by is_primary desc, created_at
    limit 1
  ) sc on true
  where s.organization_id = p_organization_id
    and s.archived_at is null
    and private.is_org_admin(p_organization_id)
  order by coalesce(svg.created_at, s.created_at) desc, svg.variation_name nulls first, s.created_at desc;
$$;

create or replace function public.get_staff_inventory_overview(p_organization_id uuid)
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
set search_path = public, private
as $$
  select
    s.id,
    il.location_id,
    s.name,
    s.variant,
    s.sku_code,
    s.photo_path,
    s.price,
    il.quantity,
    s.low_stock_qty,
    s.max_stock_qty,
    l.name,
    il.quantity <= s.low_stock_qty and il.quantity > 0,
    il.quantity = 0
  from public.inventory_levels il
  join public.skus s on s.id = il.sku_id
  join public.locations l on l.id = il.location_id
  where il.organization_id = p_organization_id
    and s.archived_at is null
    and private.is_org_member(p_organization_id)
  order by s.name, s.variant nulls first;
$$;

create or replace function public.get_admin_inventory_overview(p_organization_id uuid)
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
set search_path = public, private
as $$
  select
    s.id,
    il.location_id,
    s.name,
    s.variant,
    s.sku_code,
    s.photo_path,
    s.price,
    il.quantity,
    s.low_stock_qty,
    s.max_stock_qty,
    l.name,
    il.quantity <= s.low_stock_qty and il.quantity > 0,
    il.quantity = 0,
    sup.name,
    sc.contact_name,
    sc.phone_raw,
    sc.whatsapp_number
  from public.inventory_levels il
  join public.skus s on s.id = il.sku_id
  join public.locations l on l.id = il.location_id
  left join public.suppliers sup on sup.id = s.supplier_id
  left join lateral (
    select contact_name, phone_raw, whatsapp_number
    from public.supplier_contacts
    where supplier_id = sup.id
    order by is_primary desc, created_at
    limit 1
  ) sc on true
  where il.organization_id = p_organization_id
    and s.archived_at is null
    and private.is_org_admin(p_organization_id)
  order by s.name, s.variant nulls first;
$$;

grant execute on function public.admin_create_sku_variation_group(uuid, text, text, boolean) to authenticated;
grant execute on function public.adjust_stock(uuid, uuid, integer, text, text) to authenticated;
grant execute on function public.admin_create_sku(uuid, text, text, text, text, text, text, text, text, numeric, integer, integer, integer, uuid) to authenticated;
grant execute on function public.admin_update_sku(uuid, text, text, text, text, text, text, text, text, numeric, integer, integer) to authenticated;
grant execute on function public.get_admin_sku_manager_rows(uuid) to authenticated;
grant execute on function public.get_staff_inventory_overview(uuid) to authenticated;
grant execute on function public.get_admin_inventory_overview(uuid) to authenticated;

commit;

do $$
begin
  if not exists (select 1 from pg_type where typname = 'partner_share_status' and typnamespace = 'public'::regnamespace) then
    create type public.partner_share_status as enum ('draft', 'confirmed', 'sent', 'completed');
  end if;
end $$;

create table if not exists public.product_categories (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations(id) on delete cascade,
  name text not null,
  archived_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (organization_id, name)
);

alter table public.skus add column if not exists category_id uuid references public.product_categories(id) on delete set null;

create table if not exists public.partners (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations(id) on delete cascade,
  name text not null,
  contact_name text,
  phone_raw text,
  whatsapp_number text,
  notes text,
  archived_at timestamptz,
  created_by uuid references auth.users(id) on delete set null,
  updated_by uuid references auth.users(id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (organization_id, name)
);

create table if not exists public.partner_share_sheets (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations(id) on delete cascade,
  partner_id uuid not null references public.partners(id) on delete restrict,
  location_id uuid not null references public.locations(id) on delete restrict,
  source_shop_name text not null,
  share_date date not null default current_date,
  status public.partner_share_status not null default 'draft',
  created_by uuid references auth.users(id) on delete set null,
  updated_by uuid references auth.users(id) on delete set null,
  confirmed_by uuid references auth.users(id) on delete set null,
  sent_by uuid references auth.users(id) on delete set null,
  completed_by uuid references auth.users(id) on delete set null,
  stock_deducted_by uuid references auth.users(id) on delete set null,
  confirmed_at timestamptz,
  sent_at timestamptz,
  completed_at timestamptz,
  stock_deducted_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.partner_share_items (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations(id) on delete cascade,
  sheet_id uuid not null references public.partner_share_sheets(id) on delete cascade,
  sku_id uuid not null references public.skus(id) on delete restrict,
  location_id uuid not null references public.locations(id) on delete restrict,
  product_name text not null,
  variant text,
  sku_code text not null,
  current_stock_snapshot integer not null check (current_stock_snapshot >= 0),
  photo_path text,
  supplier_name text,
  category_name text,
  share_qty integer not null check (share_qty > 0),
  remark text,
  created_by uuid references auth.users(id) on delete set null,
  updated_by uuid references auth.users(id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (sheet_id, sku_id, location_id)
);

create index if not exists product_categories_org_idx on public.product_categories (organization_id, archived_at, name);
create index if not exists skus_category_id_idx on public.skus (category_id);
create index if not exists partners_org_idx on public.partners (organization_id, archived_at, name);
create index if not exists partner_share_sheets_org_status_idx on public.partner_share_sheets (organization_id, status, share_date desc);
create index if not exists partner_share_sheets_partner_idx on public.partner_share_sheets (partner_id, share_date desc);
create index if not exists partner_share_items_sheet_idx on public.partner_share_items (sheet_id, created_at asc);
create index if not exists partner_share_items_sku_idx on public.partner_share_items (sku_id);

drop trigger if exists touch_product_categories_updated_at on public.product_categories;
create trigger touch_product_categories_updated_at before update on public.product_categories for each row execute function private.touch_updated_at();
drop trigger if exists touch_partners_updated_at on public.partners;
create trigger touch_partners_updated_at before update on public.partners for each row execute function private.touch_updated_at();
drop trigger if exists touch_partner_share_sheets_updated_at on public.partner_share_sheets;
create trigger touch_partner_share_sheets_updated_at before update on public.partner_share_sheets for each row execute function private.touch_updated_at();
drop trigger if exists touch_partner_share_items_updated_at on public.partner_share_items;
create trigger touch_partner_share_items_updated_at before update on public.partner_share_items for each row execute function private.touch_updated_at();

alter table public.product_categories enable row level security;
alter table public.partners enable row level security;
alter table public.partner_share_sheets enable row level security;
alter table public.partner_share_items enable row level security;

drop policy if exists "members can read product categories" on public.product_categories;
create policy "members can read product categories" on public.product_categories for select to authenticated using (private.is_org_member(organization_id));
drop policy if exists "admins can manage product categories" on public.product_categories;
create policy "admins can manage product categories" on public.product_categories for all to authenticated using (private.is_org_admin(organization_id)) with check (private.is_org_admin(organization_id));

drop policy if exists "members can read partners" on public.partners;
create policy "members can read partners" on public.partners for select to authenticated using (private.is_org_member(organization_id));
drop policy if exists "admins can manage partners" on public.partners;
create policy "admins can manage partners" on public.partners for all to authenticated using (private.is_org_admin(organization_id)) with check (private.is_org_admin(organization_id));

drop policy if exists "members can read partner share sheets" on public.partner_share_sheets;
create policy "members can read partner share sheets" on public.partner_share_sheets for select to authenticated using (private.is_org_member(organization_id));
drop policy if exists "admins can manage partner share sheets" on public.partner_share_sheets;
create policy "admins can manage partner share sheets" on public.partner_share_sheets for all to authenticated using (private.is_org_admin(organization_id)) with check (private.is_org_admin(organization_id));

drop policy if exists "members can read partner share items" on public.partner_share_items;
create policy "members can read partner share items" on public.partner_share_items for select to authenticated using (private.is_org_member(organization_id));
drop policy if exists "admins can manage partner share items" on public.partner_share_items;
create policy "admins can manage partner share items" on public.partner_share_items for all to authenticated using (private.is_org_admin(organization_id)) with check (private.is_org_admin(organization_id));

create or replace function private.product_category_id_for(target_org_id uuid, category_name text)
returns uuid
language plpgsql
security definer
set search_path = ''
as $$
declare
  category_id uuid;
  clean_name text := nullif(trim(coalesce(category_name, '')), '');
begin
  if clean_name is null then
    return null;
  end if;

  insert into public.product_categories (organization_id, name)
  values (target_org_id, clean_name)
  on conflict (organization_id, name) do update set archived_at = null, updated_at = now()
  returning id into category_id;

  return category_id;
end;
$$;

create or replace function public.admin_upsert_product_category(p_organization_id uuid, p_name text)
returns uuid
language plpgsql
security definer
set search_path = ''
as $$
declare
  category_id uuid;
  actor_role text;
begin
  if auth.uid() is null then raise exception 'Not authenticated'; end if;
  if not private.is_org_admin(p_organization_id) then raise exception 'Admin access required'; end if;
  if nullif(trim(p_name), '') is null then raise exception 'Category name is required'; end if;

  category_id := private.product_category_id_for(p_organization_id, p_name);
  actor_role := private.member_role_for(p_organization_id);

  insert into public.audit_events (organization_id, actor_user_id, actor_role, event_type, entity_type, entity_id, entity_label, action, after_data)
  values (p_organization_id, auth.uid(), actor_role, 'crud', 'product_category', category_id, trim(p_name), 'upsert_product_category', jsonb_build_object('name', trim(p_name)));

  return category_id;
end;
$$;

drop function if exists public.get_staff_inventory_overview(uuid);
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
  is_out_of_stock boolean,
  category_name text
)
language sql
security definer
set search_path = ''
as $$
  select s.id, il.location_id, s.name, s.variant, s.sku_code, s.photo_path, s.price, il.quantity, s.low_stock_qty, s.max_stock_qty, l.name,
    il.quantity <= s.low_stock_qty,
    il.quantity = 0,
    pc.name
  from public.inventory_levels il
  join public.skus s on s.id = il.sku_id and s.organization_id = il.organization_id
  join public.locations l on l.id = il.location_id
  left join public.product_categories pc on pc.id = s.category_id
  where il.organization_id = p_organization_id
    and s.is_active = true
    and s.archived_at is null
    and private.is_org_member(p_organization_id)
  order by pc.name asc nulls last, s.name asc, s.variant asc nulls first;
$$;

drop function if exists public.get_admin_inventory_overview(uuid);
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
  whatsapp_number text,
  category_name text
)
language sql
security definer
set search_path = ''
as $$
  select s.id, il.location_id, s.name, s.variant, s.sku_code, s.photo_path, s.price, il.quantity, s.low_stock_qty, s.max_stock_qty, l.name,
    il.quantity <= s.low_stock_qty,
    il.quantity = 0,
    sup.name, sc.contact_name, sc.phone_raw, sc.whatsapp_number,
    pc.name
  from public.inventory_levels il
  join public.skus s on s.id = il.sku_id and s.organization_id = il.organization_id
  join public.locations l on l.id = il.location_id
  left join public.suppliers sup on sup.id = s.supplier_id
  left join public.supplier_contacts sc on sc.supplier_id = sup.id and sc.is_primary = true
  left join public.product_categories pc on pc.id = s.category_id
  where il.organization_id = p_organization_id
    and s.is_active = true
    and s.archived_at is null
    and private.is_org_admin(p_organization_id)
  order by pc.name asc nulls last, s.name asc, s.variant asc nulls first;
$$;

drop function if exists public.get_admin_sku_manager_rows(uuid);
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
  whatsapp_number text,
  category_name text
)
language sql
security definer
set search_path = ''
as $$
  select s.id, s.name, s.variant, s.sku_code, s.photo_path, s.price, s.variation_group_id, svg.variation_name, svg.add_variation_images, il.quantity, s.low_stock_qty, s.max_stock_qty, sup.name, sc.contact_name, sc.country, sc.phone_raw, sc.whatsapp_number, pc.name
  from public.skus s
  join public.inventory_levels il on il.sku_id = s.id
  left join public.sku_variation_groups svg on svg.id = s.variation_group_id
  left join public.suppliers sup on sup.id = s.supplier_id
  left join public.supplier_contacts sc on sc.supplier_id = sup.id and sc.is_primary
  left join public.product_categories pc on pc.id = s.category_id
  where s.organization_id = p_organization_id
    and s.is_active
    and s.archived_at is null
    and private.is_org_admin(p_organization_id)
  order by coalesce(svg.created_at, s.created_at) desc, svg.variation_name nulls first, s.created_at desc;
$$;

create or replace function public.admin_create_sku(
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
  p_variation_group_id uuid default null,
  p_category_name text default null
) returns uuid
language plpgsql
security definer
set search_path = ''
as $$
declare
  supplier_id uuid;
  contact_id uuid;
  sku_id uuid;
  default_location_id uuid;
  sku_count integer;
  sku_limit integer;
  actor_role text;
  category_id uuid;
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

  category_id := private.product_category_id_for(p_organization_id, p_category_name);

  insert into public.suppliers (organization_id, name)
  values (p_organization_id, trim(p_supplier_name))
  returning id into supplier_id;

  insert into public.supplier_contacts (supplier_id, organization_id, contact_name, country, phone_raw, whatsapp_number, is_primary)
  values (supplier_id, p_organization_id, nullif(trim(p_contact_name), ''), p_country, trim(p_phone_raw), trim(p_whatsapp_number), true)
  returning id into contact_id;

  insert into public.skus (organization_id, supplier_id, sku_code, name, variant, price, low_stock_qty, max_stock_qty, variation_group_id, category_id)
  values (p_organization_id, supplier_id, upper(trim(p_sku_code)), trim(p_name), nullif(trim(p_variant), ''), p_price, p_low_stock_qty, p_max_stock_qty, p_variation_group_id, category_id)
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
    jsonb_build_object('sku_code', upper(trim(p_sku_code)), 'name', trim(p_name), 'variant', p_variant, 'price', p_price, 'category_name', p_category_name, 'low_stock_qty', p_low_stock_qty, 'max_stock_qty', p_max_stock_qty, 'opening_stock', p_opening_stock),
    jsonb_build_object('supplier_id', supplier_id, 'supplier_contact_id', contact_id, 'variation_group_id', p_variation_group_id, 'category_id', category_id)
  );

  return sku_id;
end;
$$;

create or replace function public.admin_update_sku(
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
  p_max_stock_qty integer,
  p_category_name text default null
) returns uuid
language plpgsql
security definer
set search_path = ''
as $$
declare
  old_sku public.skus%rowtype;
  old_supplier public.suppliers%rowtype;
  old_category text;
  org_id uuid;
  contact_id uuid;
  actor_role text;
  category_id uuid;
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
  select name into old_category from public.product_categories where id = old_sku.category_id;
  category_id := private.product_category_id_for(org_id, p_category_name);

  update public.suppliers set name = trim(p_supplier_name), updated_at = now() where id = old_sku.supplier_id;

  select id into contact_id from public.supplier_contacts where supplier_id = old_sku.supplier_id and is_primary limit 1;
  if contact_id is null then
    insert into public.supplier_contacts (supplier_id, organization_id, contact_name, country, phone_raw, whatsapp_number, is_primary)
    values (old_sku.supplier_id, org_id, nullif(trim(p_contact_name), ''), p_country, trim(p_phone_raw), trim(p_whatsapp_number), true)
    returning id into contact_id;
  else
    update public.supplier_contacts
    set contact_name = nullif(trim(p_contact_name), ''), country = p_country, phone_raw = trim(p_phone_raw), whatsapp_number = trim(p_whatsapp_number), updated_at = now()
    where id = contact_id;
  end if;

  update public.skus
  set sku_code = upper(trim(p_sku_code)), name = trim(p_name), variant = nullif(trim(p_variant), ''), price = p_price, low_stock_qty = p_low_stock_qty, max_stock_qty = p_max_stock_qty, category_id = category_id, updated_at = now()
  where id = p_sku_id;

  actor_role := private.member_role_for(org_id);

  insert into public.audit_events (organization_id, actor_user_id, actor_role, event_type, entity_type, entity_id, entity_label, action, before_data, after_data, metadata)
  values (
    org_id, auth.uid(), actor_role, 'crud', 'sku', p_sku_id, trim(p_name), 'update_sku',
    jsonb_build_object('sku_code', old_sku.sku_code, 'name', old_sku.name, 'variant', old_sku.variant, 'price', old_sku.price, 'low_stock_qty', old_sku.low_stock_qty, 'max_stock_qty', old_sku.max_stock_qty, 'supplier_name', old_supplier.name, 'category_name', old_category),
    jsonb_build_object('sku_code', upper(trim(p_sku_code)), 'name', trim(p_name), 'variant', p_variant, 'price', p_price, 'low_stock_qty', p_low_stock_qty, 'max_stock_qty', p_max_stock_qty, 'supplier_name', trim(p_supplier_name), 'category_name', p_category_name),
    jsonb_build_object('supplier_id', old_sku.supplier_id, 'supplier_contact_id', contact_id, 'variation_group_id', old_sku.variation_group_id, 'category_id', category_id)
  );

  return p_sku_id;
end;
$$;

create or replace function public.get_partner_share_page_data(p_organization_id uuid)
returns jsonb
language sql
security definer
set search_path = ''
as $$
  select jsonb_build_object(
    'partners', coalesce((
      select jsonb_agg(jsonb_build_object(
        'id', p.id,
        'name', p.name,
        'contact_name', p.contact_name,
        'phone_raw', p.phone_raw,
        'whatsapp_number', p.whatsapp_number,
        'notes', p.notes,
        'archived_at', p.archived_at,
        'created_at', p.created_at,
        'updated_at', p.updated_at
      ) order by p.name asc)
      from public.partners p
      where p.organization_id = p_organization_id and p.archived_at is null
    ), '[]'::jsonb),
    'categories', coalesce((
      select jsonb_agg(jsonb_build_object('id', pc.id, 'name', pc.name) order by pc.name asc)
      from public.product_categories pc
      where pc.organization_id = p_organization_id and pc.archived_at is null
    ), '[]'::jsonb),
    'sheets', coalesce((
      select jsonb_agg(jsonb_build_object(
        'id', s.id,
        'partner_id', s.partner_id,
        'partner_name', p.name,
        'location_id', s.location_id,
        'location_name', l.name,
        'source_shop_name', s.source_shop_name,
        'share_date', s.share_date,
        'status', s.status,
        'item_count', coalesce(i.item_count, 0),
        'total_share_qty', coalesce(i.total_share_qty, 0),
        'prepared_by_name', coalesce(cp.full_name, cp.email),
        'approved_by_name', coalesce(ap.full_name, ap.email),
        'sent_by_name', coalesce(sp.full_name, sp.email),
        'completed_by_name', coalesce(op.full_name, op.email),
        'stock_deducted_by_name', coalesce(dp.full_name, dp.email),
        'confirmed_at', s.confirmed_at,
        'sent_at', s.sent_at,
        'completed_at', s.completed_at,
        'stock_deducted_at', s.stock_deducted_at,
        'created_at', s.created_at,
        'updated_at', s.updated_at
      ) order by s.share_date desc, s.created_at desc)
      from public.partner_share_sheets s
      join public.partners p on p.id = s.partner_id
      join public.locations l on l.id = s.location_id
      left join lateral (
        select count(*)::integer item_count, coalesce(sum(share_qty), 0)::integer total_share_qty
        from public.partner_share_items psi
        where psi.sheet_id = s.id
      ) i on true
      left join public.profiles cp on cp.id = s.created_by
      left join public.profiles ap on ap.id = s.confirmed_by
      left join public.profiles sp on sp.id = s.sent_by
      left join public.profiles op on op.id = s.completed_by
      left join public.profiles dp on dp.id = s.stock_deducted_by
      where s.organization_id = p_organization_id
    ), '[]'::jsonb)
  )
  where private.is_org_member(p_organization_id);
$$;

create or replace function public.get_partner_share_sheet_detail(p_sheet_id uuid)
returns jsonb
language sql
security definer
set search_path = ''
as $$
  select jsonb_build_object(
    'sheet', jsonb_build_object(
      'id', s.id,
      'organization_id', s.organization_id,
      'partner_id', s.partner_id,
      'partner_name', p.name,
      'location_id', s.location_id,
      'location_name', l.name,
      'source_shop_name', s.source_shop_name,
      'share_date', s.share_date,
      'status', s.status,
      'prepared_by_name', coalesce(cp.full_name, cp.email),
      'approved_by_name', coalesce(ap.full_name, ap.email),
      'sent_by_name', coalesce(sp.full_name, sp.email),
      'completed_by_name', coalesce(op.full_name, op.email),
      'stock_deducted_by_name', coalesce(dp.full_name, dp.email),
      'confirmed_at', s.confirmed_at,
      'sent_at', s.sent_at,
      'completed_at', s.completed_at,
      'stock_deducted_at', s.stock_deducted_at,
      'created_at', s.created_at,
      'updated_at', s.updated_at
    ),
    'items', coalesce((
      select jsonb_agg(jsonb_build_object(
        'id', psi.id,
        'sheet_id', psi.sheet_id,
        'sku_id', psi.sku_id,
        'location_id', psi.location_id,
        'product_name', psi.product_name,
        'variant', psi.variant,
        'sku_code', psi.sku_code,
        'current_stock_snapshot', psi.current_stock_snapshot,
        'photo_path', psi.photo_path,
        'supplier_name', psi.supplier_name,
        'category_name', psi.category_name,
        'share_qty', psi.share_qty,
        'remark', psi.remark,
        'created_at', psi.created_at,
        'updated_at', psi.updated_at
      ) order by psi.created_at asc)
      from public.partner_share_items psi
      where psi.sheet_id = s.id
    ), '[]'::jsonb)
  )
  from public.partner_share_sheets s
  join public.partners p on p.id = s.partner_id
  join public.locations l on l.id = s.location_id
  left join public.profiles cp on cp.id = s.created_by
  left join public.profiles ap on ap.id = s.confirmed_by
  left join public.profiles sp on sp.id = s.sent_by
  left join public.profiles op on op.id = s.completed_by
  left join public.profiles dp on dp.id = s.stock_deducted_by
  where s.id = p_sheet_id and private.is_org_member(s.organization_id);
$$;

create or replace function public.admin_create_partner(p_organization_id uuid, p_name text, p_contact_name text default null, p_phone_raw text default null, p_whatsapp_number text default null, p_notes text default null)
returns uuid
language plpgsql
security definer
set search_path = ''
as $$
declare
  partner_id uuid;
  actor_role text;
begin
  if auth.uid() is null then raise exception 'Not authenticated'; end if;
  if not private.is_org_admin(p_organization_id) then raise exception 'Admin access required'; end if;
  if nullif(trim(p_name), '') is null then raise exception 'Partner name is required'; end if;

  insert into public.partners (organization_id, name, contact_name, phone_raw, whatsapp_number, notes, created_by, updated_by)
  values (p_organization_id, trim(p_name), nullif(trim(coalesce(p_contact_name, '')), ''), nullif(trim(coalesce(p_phone_raw, '')), ''), nullif(trim(coalesce(p_whatsapp_number, '')), ''), nullif(trim(coalesce(p_notes, '')), ''), auth.uid(), auth.uid())
  returning id into partner_id;

  actor_role := private.member_role_for(p_organization_id);
  insert into public.audit_events (organization_id, actor_user_id, actor_role, event_type, entity_type, entity_id, entity_label, action, after_data)
  values (p_organization_id, auth.uid(), actor_role, 'partner_share', 'partner', partner_id, trim(p_name), 'create_partner', jsonb_build_object('name', trim(p_name), 'contact_name', p_contact_name, 'phone_raw', p_phone_raw));

  return partner_id;
end;
$$;

create or replace function public.admin_update_partner(p_partner_id uuid, p_name text, p_contact_name text default null, p_phone_raw text default null, p_whatsapp_number text default null, p_notes text default null)
returns uuid
language plpgsql
security definer
set search_path = ''
as $$
declare
  old_partner public.partners%rowtype;
  actor_role text;
begin
  if auth.uid() is null then raise exception 'Not authenticated'; end if;
  select * into old_partner from public.partners where id = p_partner_id for update;
  if not found then raise exception 'Partner not found'; end if;
  if not private.is_org_admin(old_partner.organization_id) then raise exception 'Admin access required'; end if;
  if nullif(trim(p_name), '') is null then raise exception 'Partner name is required'; end if;

  update public.partners
  set name = trim(p_name), contact_name = nullif(trim(coalesce(p_contact_name, '')), ''), phone_raw = nullif(trim(coalesce(p_phone_raw, '')), ''), whatsapp_number = nullif(trim(coalesce(p_whatsapp_number, '')), ''), notes = nullif(trim(coalesce(p_notes, '')), ''), updated_by = auth.uid(), updated_at = now()
  where id = p_partner_id;

  actor_role := private.member_role_for(old_partner.organization_id);
  insert into public.audit_events (organization_id, actor_user_id, actor_role, event_type, entity_type, entity_id, entity_label, action, before_data, after_data)
  values (old_partner.organization_id, auth.uid(), actor_role, 'partner_share', 'partner', p_partner_id, trim(p_name), 'update_partner', to_jsonb(old_partner), jsonb_build_object('name', trim(p_name), 'contact_name', p_contact_name, 'phone_raw', p_phone_raw, 'notes', p_notes));

  return p_partner_id;
end;
$$;

create or replace function public.admin_archive_partner(p_partner_id uuid)
returns uuid
language plpgsql
security definer
set search_path = ''
as $$
declare
  old_partner public.partners%rowtype;
  actor_role text;
begin
  if auth.uid() is null then raise exception 'Not authenticated'; end if;
  select * into old_partner from public.partners where id = p_partner_id for update;
  if not found then raise exception 'Partner not found'; end if;
  if not private.is_org_admin(old_partner.organization_id) then raise exception 'Admin access required'; end if;

  update public.partners set archived_at = now(), updated_by = auth.uid(), updated_at = now() where id = p_partner_id;
  actor_role := private.member_role_for(old_partner.organization_id);
  insert into public.audit_events (organization_id, actor_user_id, actor_role, event_type, entity_type, entity_id, entity_label, action, before_data)
  values (old_partner.organization_id, auth.uid(), actor_role, 'partner_share', 'partner', p_partner_id, old_partner.name, 'archive_partner', to_jsonb(old_partner));

  return p_partner_id;
end;
$$;

create or replace function public.admin_create_partner_share_sheet(p_partner_id uuid, p_location_id uuid, p_share_date date default current_date)
returns uuid
language plpgsql
security definer
set search_path = ''
as $$
declare
  partner_row public.partners%rowtype;
  location_row public.locations%rowtype;
  org_row public.organizations%rowtype;
  sheet_id uuid;
  actor_role text;
begin
  if auth.uid() is null then raise exception 'Not authenticated'; end if;
  select * into partner_row from public.partners where id = p_partner_id and archived_at is null;
  if not found then raise exception 'Partner not found'; end if;
  if not private.is_org_admin(partner_row.organization_id) then raise exception 'Admin access required'; end if;
  select * into location_row from public.locations where id = p_location_id and organization_id = partner_row.organization_id and archived_at is null;
  if not found then raise exception 'Location not found'; end if;
  select * into org_row from public.organizations where id = partner_row.organization_id;

  insert into public.partner_share_sheets (organization_id, partner_id, location_id, source_shop_name, share_date, created_by, updated_by)
  values (partner_row.organization_id, partner_row.id, location_row.id, org_row.name, coalesce(p_share_date, current_date), auth.uid(), auth.uid())
  returning id into sheet_id;

  actor_role := private.member_role_for(partner_row.organization_id);
  insert into public.audit_events (organization_id, actor_user_id, actor_role, event_type, entity_type, entity_id, entity_label, action, after_data)
  values (partner_row.organization_id, auth.uid(), actor_role, 'partner_share', 'partner_share_sheet', sheet_id, partner_row.name, 'create_partner_share_sheet', jsonb_build_object('partner_id', partner_row.id, 'share_date', coalesce(p_share_date, current_date), 'location_id', location_row.id));

  return sheet_id;
end;
$$;

create or replace function public.admin_add_partner_share_item(p_sheet_id uuid, p_sku_id uuid, p_share_qty integer, p_remark text default null)
returns uuid
language plpgsql
security definer
set search_path = ''
as $$
declare
  sheet_row public.partner_share_sheets%rowtype;
  sku_row public.skus%rowtype;
  inv_row public.inventory_levels%rowtype;
  supplier_name text;
  category_name text;
  item_id uuid;
  actor_role text;
begin
  if auth.uid() is null then raise exception 'Not authenticated'; end if;
  select * into sheet_row from public.partner_share_sheets where id = p_sheet_id for update;
  if not found then raise exception 'Partner share sheet not found'; end if;
  if not private.is_org_admin(sheet_row.organization_id) then raise exception 'Admin access required'; end if;
  if sheet_row.status <> 'draft' then raise exception 'Only draft sheets can add products'; end if;
  if p_share_qty <= 0 then raise exception 'Share quantity must be positive'; end if;

  select * into sku_row from public.skus where id = p_sku_id and organization_id = sheet_row.organization_id and is_active and archived_at is null;
  if not found then raise exception 'SKU not found'; end if;
  select * into inv_row from public.inventory_levels where sku_id = p_sku_id and location_id = sheet_row.location_id;
  if not found then raise exception 'Inventory row not found'; end if;
  if p_share_qty > inv_row.quantity then raise exception 'Share quantity cannot exceed current stock'; end if;
  select sup.name into supplier_name from public.suppliers sup where sup.id = sku_row.supplier_id;
  select pc.name into category_name from public.product_categories pc where pc.id = sku_row.category_id;

  insert into public.partner_share_items (organization_id, sheet_id, sku_id, location_id, product_name, variant, sku_code, current_stock_snapshot, photo_path, supplier_name, category_name, share_qty, remark, created_by, updated_by)
  values (sheet_row.organization_id, sheet_row.id, sku_row.id, sheet_row.location_id, sku_row.name, sku_row.variant, sku_row.sku_code, inv_row.quantity, sku_row.photo_path, supplier_name, category_name, p_share_qty, nullif(trim(coalesce(p_remark, '')), ''), auth.uid(), auth.uid())
  returning id into item_id;

  actor_role := private.member_role_for(sheet_row.organization_id);
  insert into public.audit_events (organization_id, actor_user_id, actor_role, event_type, entity_type, entity_id, entity_label, action, after_data, metadata)
  values (sheet_row.organization_id, auth.uid(), actor_role, 'partner_share', 'partner_share_item', item_id, sku_row.name, 'add_partner_share_item', jsonb_build_object('share_qty', p_share_qty, 'remark', p_remark), jsonb_build_object('sheet_id', sheet_row.id, 'sku_id', sku_row.id));

  return item_id;
end;
$$;

create or replace function public.admin_update_partner_share_item(p_item_id uuid, p_share_qty integer, p_remark text default null)
returns uuid
language plpgsql
security definer
set search_path = ''
as $$
declare
  old_item public.partner_share_items%rowtype;
  sheet_row public.partner_share_sheets%rowtype;
  current_qty integer;
  actor_role text;
begin
  if auth.uid() is null then raise exception 'Not authenticated'; end if;
  select * into old_item from public.partner_share_items where id = p_item_id for update;
  if not found then raise exception 'Partner share item not found'; end if;
  select * into sheet_row from public.partner_share_sheets where id = old_item.sheet_id for update;
  if not private.is_org_admin(old_item.organization_id) then raise exception 'Admin access required'; end if;
  if sheet_row.status = 'completed' then raise exception 'Completed sheets cannot be edited'; end if;
  if p_share_qty <= 0 then raise exception 'Share quantity must be positive'; end if;
  select quantity into current_qty from public.inventory_levels where sku_id = old_item.sku_id and location_id = old_item.location_id;
  if p_share_qty > current_qty then raise exception 'Share quantity cannot exceed current stock'; end if;

  update public.partner_share_items
  set share_qty = p_share_qty, remark = nullif(trim(coalesce(p_remark, '')), ''), current_stock_snapshot = current_qty, updated_by = auth.uid(), updated_at = now()
  where id = p_item_id;
  update public.partner_share_sheets set updated_by = auth.uid(), updated_at = now() where id = sheet_row.id;

  actor_role := private.member_role_for(old_item.organization_id);
  insert into public.audit_events (organization_id, actor_user_id, actor_role, event_type, entity_type, entity_id, entity_label, action, before_data, after_data, metadata)
  values (old_item.organization_id, auth.uid(), actor_role, 'partner_share', 'partner_share_item', p_item_id, old_item.product_name, 'update_partner_share_item', to_jsonb(old_item), jsonb_build_object('share_qty', p_share_qty, 'remark', p_remark, 'current_stock_snapshot', current_qty), jsonb_build_object('sheet_id', old_item.sheet_id));

  return p_item_id;
end;
$$;

create or replace function public.admin_remove_partner_share_item(p_item_id uuid)
returns uuid
language plpgsql
security definer
set search_path = ''
as $$
declare
  old_item public.partner_share_items%rowtype;
  sheet_status public.partner_share_status;
  actor_role text;
begin
  if auth.uid() is null then raise exception 'Not authenticated'; end if;
  select * into old_item from public.partner_share_items where id = p_item_id for update;
  if not found then raise exception 'Partner share item not found'; end if;
  if not private.is_org_admin(old_item.organization_id) then raise exception 'Admin access required'; end if;
  select status into sheet_status from public.partner_share_sheets where id = old_item.sheet_id;
  if sheet_status = 'completed' then raise exception 'Completed sheets cannot be edited'; end if;

  delete from public.partner_share_items where id = p_item_id;
  update public.partner_share_sheets set updated_by = auth.uid(), updated_at = now() where id = old_item.sheet_id;
  actor_role := private.member_role_for(old_item.organization_id);
  insert into public.audit_events (organization_id, actor_user_id, actor_role, event_type, entity_type, entity_id, entity_label, action, before_data, metadata)
  values (old_item.organization_id, auth.uid(), actor_role, 'partner_share', 'partner_share_item', p_item_id, old_item.product_name, 'remove_partner_share_item', to_jsonb(old_item), jsonb_build_object('sheet_id', old_item.sheet_id));

  return p_item_id;
end;
$$;

create or replace function public.admin_update_partner_share_status(p_sheet_id uuid, p_status public.partner_share_status)
returns uuid
language plpgsql
security definer
set search_path = ''
as $$
declare
  old_sheet public.partner_share_sheets%rowtype;
  item_count integer;
  actor_role text;
begin
  if auth.uid() is null then raise exception 'Not authenticated'; end if;
  select * into old_sheet from public.partner_share_sheets where id = p_sheet_id for update;
  if not found then raise exception 'Partner share sheet not found'; end if;
  if not private.is_org_admin(old_sheet.organization_id) then raise exception 'Admin access required'; end if;
  if old_sheet.status = 'completed' and p_status <> 'completed' then raise exception 'Completed sheets cannot move backward'; end if;
  select count(*) into item_count from public.partner_share_items where sheet_id = p_sheet_id;
  if p_status in ('confirmed', 'sent', 'completed') and item_count = 0 then raise exception 'Add at least one product before changing status'; end if;

  update public.partner_share_sheets
  set status = p_status,
      updated_by = auth.uid(),
      confirmed_by = case when p_status = 'confirmed' and confirmed_by is null then auth.uid() else confirmed_by end,
      sent_by = case when p_status = 'sent' and sent_by is null then auth.uid() else sent_by end,
      completed_by = case when p_status = 'completed' and completed_by is null then auth.uid() else completed_by end,
      confirmed_at = case when p_status = 'confirmed' and confirmed_at is null then now() else confirmed_at end,
      sent_at = case when p_status = 'sent' and sent_at is null then now() else sent_at end,
      completed_at = case when p_status = 'completed' and completed_at is null then now() else completed_at end,
      updated_at = now()
  where id = p_sheet_id;

  actor_role := private.member_role_for(old_sheet.organization_id);
  insert into public.audit_events (organization_id, actor_user_id, actor_role, event_type, entity_type, entity_id, entity_label, action, before_data, after_data)
  values (old_sheet.organization_id, auth.uid(), actor_role, 'partner_share', 'partner_share_sheet', p_sheet_id, 'Partner Share Qty', 'update_partner_share_status', jsonb_build_object('status', old_sheet.status), jsonb_build_object('status', p_status, 'approved_by', auth.uid()));

  return p_sheet_id;
end;
$$;

create or replace function public.admin_deduct_partner_share_stock(p_sheet_id uuid)
returns uuid
language plpgsql
security definer
set search_path = ''
as $$
declare
  sheet_row public.partner_share_sheets%rowtype;
  item_row public.partner_share_items%rowtype;
  inv_qty integer;
  movement_id uuid;
  actor_role text;
begin
  if auth.uid() is null then raise exception 'Not authenticated'; end if;
  select * into sheet_row from public.partner_share_sheets where id = p_sheet_id for update;
  if not found then raise exception 'Partner share sheet not found'; end if;
  if not private.is_org_admin(sheet_row.organization_id) then raise exception 'Admin access required'; end if;
  if sheet_row.stock_deducted_at is not null then raise exception 'Stock already deducted for this sheet'; end if;

  for item_row in select * from public.partner_share_items where sheet_id = p_sheet_id order by created_at asc loop
    select quantity into inv_qty from public.inventory_levels where sku_id = item_row.sku_id and location_id = item_row.location_id for update;
    if inv_qty is null then raise exception 'Inventory row not found for %', item_row.sku_code; end if;
    if item_row.share_qty > inv_qty then raise exception 'Not enough stock for %', item_row.sku_code; end if;
  end loop;

  actor_role := private.member_role_for(sheet_row.organization_id);

  for item_row in select * from public.partner_share_items where sheet_id = p_sheet_id order by created_at asc loop
    select quantity into inv_qty from public.inventory_levels where sku_id = item_row.sku_id and location_id = item_row.location_id for update;
    update public.inventory_levels set quantity = inv_qty - item_row.share_qty, updated_at = now() where sku_id = item_row.sku_id and location_id = item_row.location_id;
    insert into public.stock_movements (organization_id, sku_id, location_id, actor_user_id, movement_type, quantity_delta, quantity_before, quantity_after, reason, note)
    values (sheet_row.organization_id, item_row.sku_id, item_row.location_id, auth.uid(), 'deduct', -item_row.share_qty, inv_qty, inv_qty - item_row.share_qty, 'Transfer', 'Partner Share Qty')
    returning id into movement_id;
  end loop;

  update public.partner_share_sheets
  set stock_deducted_by = auth.uid(), stock_deducted_at = now(), updated_by = auth.uid(), updated_at = now()
  where id = p_sheet_id;

  insert into public.audit_events (organization_id, actor_user_id, actor_role, event_type, entity_type, entity_id, entity_label, action, after_data)
  values (sheet_row.organization_id, auth.uid(), actor_role, 'partner_share', 'partner_share_sheet', p_sheet_id, 'Partner Share Qty', 'deduct_partner_share_stock', jsonb_build_object('stock_deducted_by', auth.uid(), 'stock_deducted_at', now()));

  return p_sheet_id;
end;
$$;

revoke all on function public.admin_upsert_product_category(uuid, text) from public, anon;
revoke all on function public.get_staff_inventory_overview(uuid) from public, anon;
revoke all on function public.get_admin_inventory_overview(uuid) from public, anon;
revoke all on function public.get_admin_sku_manager_rows(uuid) from public, anon;
revoke all on function public.get_partner_share_page_data(uuid) from public, anon;
revoke all on function public.get_partner_share_sheet_detail(uuid) from public, anon;
revoke all on function public.admin_create_partner(uuid, text, text, text, text, text) from public, anon;
revoke all on function public.admin_update_partner(uuid, text, text, text, text, text) from public, anon;
revoke all on function public.admin_archive_partner(uuid) from public, anon;
revoke all on function public.admin_create_partner_share_sheet(uuid, uuid, date) from public, anon;
revoke all on function public.admin_add_partner_share_item(uuid, uuid, integer, text) from public, anon;
revoke all on function public.admin_update_partner_share_item(uuid, integer, text) from public, anon;
revoke all on function public.admin_remove_partner_share_item(uuid) from public, anon;
revoke all on function public.admin_update_partner_share_status(uuid, public.partner_share_status) from public, anon;
revoke all on function public.admin_deduct_partner_share_stock(uuid) from public, anon;

grant execute on function public.admin_upsert_product_category(uuid, text) to authenticated;
grant execute on function public.get_staff_inventory_overview(uuid) to authenticated;
grant execute on function public.get_admin_inventory_overview(uuid) to authenticated;
grant execute on function public.get_admin_sku_manager_rows(uuid) to authenticated;
grant execute on function public.get_partner_share_page_data(uuid) to authenticated;
grant execute on function public.get_partner_share_sheet_detail(uuid) to authenticated;
grant execute on function public.admin_create_partner(uuid, text, text, text, text, text) to authenticated;
grant execute on function public.admin_update_partner(uuid, text, text, text, text, text) to authenticated;
grant execute on function public.admin_archive_partner(uuid) to authenticated;
grant execute on function public.admin_create_partner_share_sheet(uuid, uuid, date) to authenticated;
grant execute on function public.admin_add_partner_share_item(uuid, uuid, integer, text) to authenticated;
grant execute on function public.admin_update_partner_share_item(uuid, integer, text) to authenticated;
grant execute on function public.admin_remove_partner_share_item(uuid) to authenticated;
grant execute on function public.admin_update_partner_share_status(uuid, public.partner_share_status) to authenticated;
grant execute on function public.admin_deduct_partner_share_stock(uuid) to authenticated;

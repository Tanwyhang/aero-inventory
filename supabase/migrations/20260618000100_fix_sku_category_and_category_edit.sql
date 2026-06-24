create or replace function private.product_category_id_for(target_org_id uuid, category_name text)
returns uuid
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_category_id uuid;
  clean_name text := nullif(trim(coalesce(category_name, '')), '');
begin
  if clean_name is null then
    return null;
  end if;

  insert into public.product_categories (organization_id, name)
  values (target_org_id, clean_name)
  on conflict (organization_id, name) do update set archived_at = null, updated_at = now()
  returning public.product_categories.id into v_category_id;

  return v_category_id;
end;
$$;

create or replace function public.admin_update_product_category(p_category_id uuid, p_name text)
returns uuid
language plpgsql
security definer
set search_path = ''
as $$
declare
  category_row public.product_categories%rowtype;
  actor_role text;
begin
  if auth.uid() is null then raise exception 'Not authenticated'; end if;
  if nullif(trim(p_name), '') is null then raise exception 'Category name is required'; end if;

  select * into category_row
  from public.product_categories pc
  where pc.id = p_category_id
  for update;

  if not found then raise exception 'Category not found'; end if;
  if not private.is_org_admin(category_row.organization_id) then raise exception 'Admin access required'; end if;

  update public.product_categories pc
  set name = trim(p_name), archived_at = null, updated_at = now()
  where pc.id = p_category_id;

  actor_role := private.member_role_for(category_row.organization_id);
  insert into public.audit_events (organization_id, actor_user_id, actor_role, event_type, entity_type, entity_id, entity_label, action, before_data, after_data)
  values (
    category_row.organization_id,
    auth.uid(),
    actor_role,
    'crud',
    'product_category',
    p_category_id,
    trim(p_name),
    'update_product_category',
    jsonb_build_object('name', category_row.name),
    jsonb_build_object('name', trim(p_name))
  );

  return p_category_id;
end;
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
  v_category_id uuid;
begin
  if auth.uid() is null then raise exception 'Not authenticated'; end if;
  if not private.is_org_admin(p_organization_id) then raise exception 'Admin access required'; end if;
  if nullif(trim(p_supplier_name), '') is null then raise exception 'Supplier name is required'; end if;
  if nullif(trim(p_sku_code), '') is null then raise exception 'SKU code is required'; end if;
  if nullif(trim(p_name), '') is null then raise exception 'Product name is required'; end if;
  if p_country not in ('MY', 'TH') then raise exception 'Country must be MY or TH'; end if;
  if p_low_stock_qty < 0 or p_max_stock_qty < 0 or p_opening_stock < 0 then raise exception 'Stock values cannot be negative'; end if;
  if p_price < 0 then raise exception 'Price cannot be negative'; end if;
  if p_variation_group_id is not null and not exists (select 1 from public.sku_variation_groups svg where svg.id = p_variation_group_id and svg.organization_id = p_organization_id) then raise exception 'Variation group not found'; end if;

  select pe.sku_limit into sku_limit from public.plan_entitlements pe where pe.organization_id = p_organization_id;
  select count(*) into sku_count from public.skus s where s.organization_id = p_organization_id and s.is_active and s.archived_at is null;
  if sku_limit is not null and sku_count >= sku_limit then raise exception 'SKU limit reached'; end if;

  select l.id into default_location_id from public.locations l where l.organization_id = p_organization_id and l.is_default and l.archived_at is null limit 1;
  if default_location_id is null then raise exception 'Default location not found'; end if;

  v_category_id := private.product_category_id_for(p_organization_id, p_category_name);

  insert into public.suppliers (organization_id, name)
  values (p_organization_id, trim(p_supplier_name))
  returning id into supplier_id;

  insert into public.supplier_contacts (supplier_id, organization_id, contact_name, country, phone_raw, whatsapp_number, is_primary)
  values (supplier_id, p_organization_id, nullif(trim(p_contact_name), ''), p_country, trim(p_phone_raw), trim(p_whatsapp_number), true)
  returning id into contact_id;

  insert into public.skus (organization_id, supplier_id, sku_code, name, variant, price, low_stock_qty, max_stock_qty, variation_group_id, category_id)
  values (p_organization_id, supplier_id, upper(trim(p_sku_code)), trim(p_name), nullif(trim(p_variant), ''), p_price, p_low_stock_qty, p_max_stock_qty, p_variation_group_id, v_category_id)
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
    jsonb_build_object('sku_code', upper(trim(p_sku_code)), 'name', trim(p_name), 'variant', p_variant, 'price', p_price, 'category_name', p_category_name, 'low_stock_qty', p_low_stock_qty, 'opening_stock', p_opening_stock),
    jsonb_build_object('supplier_id', supplier_id, 'supplier_contact_id', contact_id, 'variation_group_id', p_variation_group_id, 'category_id', v_category_id)
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
  v_category_id uuid;
begin
  if auth.uid() is null then raise exception 'Not authenticated'; end if;
  select * into old_sku from public.skus s where s.id = p_sku_id for update;
  if not found then raise exception 'SKU not found'; end if;

  org_id := old_sku.organization_id;
  if not private.is_org_admin(org_id) then raise exception 'Admin access required'; end if;
  if nullif(trim(p_supplier_name), '') is null then raise exception 'Supplier name is required'; end if;
  if nullif(trim(p_sku_code), '') is null then raise exception 'SKU code is required'; end if;
  if nullif(trim(p_name), '') is null then raise exception 'Product name is required'; end if;
  if p_country not in ('MY', 'TH') then raise exception 'Country must be MY or TH'; end if;
  if p_low_stock_qty < 0 or p_max_stock_qty < 0 then raise exception 'Stock values cannot be negative'; end if;
  if p_price < 0 then raise exception 'Price cannot be negative'; end if;

  select * into old_supplier from public.suppliers sup where sup.id = old_sku.supplier_id for update;
  select pc.name into old_category from public.product_categories pc where pc.id = old_sku.category_id;
  v_category_id := private.product_category_id_for(org_id, p_category_name);

  update public.suppliers sup set name = trim(p_supplier_name), updated_at = now() where sup.id = old_sku.supplier_id;

  select sc.id into contact_id from public.supplier_contacts sc where sc.supplier_id = old_sku.supplier_id and sc.is_primary limit 1;
  if contact_id is null then
    insert into public.supplier_contacts (supplier_id, organization_id, contact_name, country, phone_raw, whatsapp_number, is_primary)
    values (old_sku.supplier_id, org_id, nullif(trim(p_contact_name), ''), p_country, trim(p_phone_raw), trim(p_whatsapp_number), true)
    returning id into contact_id;
  else
    update public.supplier_contacts sc
    set contact_name = nullif(trim(p_contact_name), ''), country = p_country, phone_raw = trim(p_phone_raw), whatsapp_number = trim(p_whatsapp_number), updated_at = now()
    where sc.id = contact_id;
  end if;

  update public.skus s
  set sku_code = upper(trim(p_sku_code)),
      name = trim(p_name),
      variant = nullif(trim(p_variant), ''),
      price = p_price,
      low_stock_qty = p_low_stock_qty,
      max_stock_qty = p_max_stock_qty,
      category_id = v_category_id,
      updated_at = now()
  where s.id = p_sku_id;

  actor_role := private.member_role_for(org_id);

  insert into public.audit_events (organization_id, actor_user_id, actor_role, event_type, entity_type, entity_id, entity_label, action, before_data, after_data, metadata)
  values (
    org_id, auth.uid(), actor_role, 'crud', 'sku', p_sku_id, trim(p_name), 'update_sku',
    jsonb_build_object('sku_code', old_sku.sku_code, 'name', old_sku.name, 'variant', old_sku.variant, 'price', old_sku.price, 'low_stock_qty', old_sku.low_stock_qty, 'supplier_name', old_supplier.name, 'category_name', old_category),
    jsonb_build_object('sku_code', upper(trim(p_sku_code)), 'name', trim(p_name), 'variant', p_variant, 'price', p_price, 'low_stock_qty', p_low_stock_qty, 'supplier_name', trim(p_supplier_name), 'category_name', p_category_name),
    jsonb_build_object('supplier_id', old_sku.supplier_id, 'supplier_contact_id', contact_id, 'variation_group_id', old_sku.variation_group_id, 'category_id', v_category_id)
  );

  return p_sku_id;
end;
$$;

revoke execute on function public.admin_update_product_category(uuid, text) from public, anon;
grant execute on function public.admin_update_product_category(uuid, text) to authenticated;

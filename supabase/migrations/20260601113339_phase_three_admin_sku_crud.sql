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
  p_low_stock_qty integer,
  p_max_stock_qty integer,
  p_opening_stock integer
)
returns uuid
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
begin
  if auth.uid() is null then raise exception 'Not authenticated'; end if;
  if not private.is_org_admin(p_organization_id) then raise exception 'Admin access required'; end if;
  if nullif(trim(p_supplier_name), '') is null then raise exception 'Supplier name is required'; end if;
  if nullif(trim(p_sku_code), '') is null then raise exception 'SKU code is required'; end if;
  if nullif(trim(p_name), '') is null then raise exception 'Product name is required'; end if;
  if p_country not in ('MY', 'TH') then raise exception 'Country must be MY or TH'; end if;
  if p_low_stock_qty < 0 or p_max_stock_qty < 0 or p_opening_stock < 0 then raise exception 'Stock values cannot be negative'; end if;

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

  insert into public.skus (organization_id, supplier_id, sku_code, name, variant, low_stock_qty, max_stock_qty)
  values (p_organization_id, supplier_id, upper(trim(p_sku_code)), trim(p_name), nullif(trim(p_variant), ''), p_low_stock_qty, p_max_stock_qty)
  returning id into sku_id;

  insert into public.inventory_levels (organization_id, sku_id, location_id, quantity)
  values (p_organization_id, sku_id, default_location_id, p_opening_stock);

  actor_role := private.member_role_for(p_organization_id);

  if p_opening_stock > 0 then
    insert into public.stock_movements (organization_id, sku_id, location_id, actor_user_id, movement_type, quantity_delta, quantity_before, quantity_after, note)
    values (p_organization_id, sku_id, default_location_id, auth.uid(), 'add', p_opening_stock, 0, p_opening_stock, 'Opening stock');
  end if;

  insert into public.audit_events (organization_id, actor_user_id, actor_role, event_type, entity_type, entity_id, entity_label, action, after_data, metadata)
  values (
    p_organization_id, auth.uid(), actor_role, 'crud', 'sku', sku_id, trim(p_name), 'create_sku',
    jsonb_build_object('sku_code', upper(trim(p_sku_code)), 'name', trim(p_name), 'variant', p_variant, 'low_stock_qty', p_low_stock_qty, 'max_stock_qty', p_max_stock_qty, 'opening_stock', p_opening_stock),
    jsonb_build_object('supplier_id', supplier_id, 'supplier_contact_id', contact_id)
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
  p_low_stock_qty integer,
  p_max_stock_qty integer
)
returns uuid
language plpgsql
security definer
set search_path = ''
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
  set sku_code = upper(trim(p_sku_code)), name = trim(p_name), variant = nullif(trim(p_variant), ''), low_stock_qty = p_low_stock_qty, max_stock_qty = p_max_stock_qty, updated_at = now()
  where id = p_sku_id;

  actor_role := private.member_role_for(org_id);
  insert into public.audit_events (organization_id, actor_user_id, actor_role, event_type, entity_type, entity_id, entity_label, action, before_data, after_data, metadata)
  values (
    org_id, auth.uid(), actor_role, 'crud', 'sku', p_sku_id, trim(p_name), 'update_sku',
    jsonb_build_object('sku_code', old_sku.sku_code, 'name', old_sku.name, 'variant', old_sku.variant, 'low_stock_qty', old_sku.low_stock_qty, 'max_stock_qty', old_sku.max_stock_qty, 'supplier_name', old_supplier.name),
    jsonb_build_object('sku_code', upper(trim(p_sku_code)), 'name', trim(p_name), 'variant', p_variant, 'low_stock_qty', p_low_stock_qty, 'max_stock_qty', p_max_stock_qty, 'supplier_name', trim(p_supplier_name)),
    jsonb_build_object('supplier_id', old_sku.supplier_id, 'supplier_contact_id', contact_id)
  );

  return p_sku_id;
end;
$$;

create or replace function public.admin_archive_sku(p_sku_id uuid)
returns uuid
language plpgsql
security definer
set search_path = ''
as $$
declare
  sku_row public.skus%rowtype;
  actor_role text;
begin
  if auth.uid() is null then raise exception 'Not authenticated'; end if;
  select * into sku_row from public.skus where id = p_sku_id for update;
  if not found then raise exception 'SKU not found'; end if;
  if not private.is_org_admin(sku_row.organization_id) then raise exception 'Admin access required'; end if;

  update public.skus set is_active = false, archived_at = now(), updated_at = now() where id = p_sku_id;
  actor_role := private.member_role_for(sku_row.organization_id);
  insert into public.audit_events (organization_id, actor_user_id, actor_role, event_type, entity_type, entity_id, entity_label, action, before_data, after_data)
  values (sku_row.organization_id, auth.uid(), actor_role, 'crud', 'sku', p_sku_id, sku_row.name, 'archive_sku', to_jsonb(sku_row), jsonb_build_object('is_active', false, 'archived_at', now()));
  return p_sku_id;
end;
$$;

create or replace function public.get_admin_sku_manager_rows(p_organization_id uuid)
returns table (
  sku_id uuid,
  product_name text,
  variant text,
  sku_code text,
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
set search_path = ''
as $$
  select s.id, s.name, s.variant, s.sku_code, il.quantity, s.low_stock_qty, s.max_stock_qty, sup.name, sc.contact_name, sc.country, sc.phone_raw, sc.whatsapp_number
  from public.skus s
  join public.inventory_levels il on il.sku_id = s.id
  left join public.suppliers sup on sup.id = s.supplier_id
  left join public.supplier_contacts sc on sc.supplier_id = sup.id and sc.is_primary
  where s.organization_id = p_organization_id
    and s.is_active
    and s.archived_at is null
    and private.is_org_admin(p_organization_id)
  order by s.created_at desc;
$$;

revoke all on function public.admin_create_sku(uuid, text, text, text, text, text, text, text, text, integer, integer, integer) from public, anon;
revoke all on function public.admin_update_sku(uuid, text, text, text, text, text, text, text, text, integer, integer) from public, anon;
revoke all on function public.admin_archive_sku(uuid) from public, anon;
revoke all on function public.get_admin_sku_manager_rows(uuid) from public, anon;
grant execute on function public.admin_create_sku(uuid, text, text, text, text, text, text, text, text, integer, integer, integer) to authenticated;
grant execute on function public.admin_update_sku(uuid, text, text, text, text, text, text, text, text, integer, integer) to authenticated;
grant execute on function public.admin_archive_sku(uuid) to authenticated;
grant execute on function public.get_admin_sku_manager_rows(uuid) to authenticated;
;

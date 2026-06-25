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
  variation_group_id uuid,
  variation_name text,
  add_variation_images boolean,
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
set search_path to ''
as $$
  select
    s.id,
    il.location_id,
    s.name,
    s.variant,
    s.sku_code,
    s.photo_path,
    s.price,
    s.variation_group_id,
    svg.variation_name,
    svg.add_variation_images,
    il.quantity,
    s.low_stock_qty,
    s.max_stock_qty,
    l.name,
    il.quantity <= s.low_stock_qty,
    il.quantity = 0,
    pc.name
  from public.inventory_levels il
  join public.skus s on s.id = il.sku_id and s.organization_id = il.organization_id
  join public.locations l on l.id = il.location_id
  left join public.sku_variation_groups svg on svg.id = s.variation_group_id
  left join public.product_categories pc on pc.id = s.category_id
  where il.organization_id = p_organization_id
    and s.is_active = true
    and s.archived_at is null
    and private.is_org_member(p_organization_id)
  order by pc.name asc nulls last, coalesce(svg.product_name, s.name) asc, s.variant asc nulls first;
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
  variation_group_id uuid,
  variation_name text,
  add_variation_images boolean,
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
set search_path to ''
as $$
  select
    s.id,
    il.location_id,
    s.name,
    s.variant,
    s.sku_code,
    s.photo_path,
    s.price,
    s.variation_group_id,
    svg.variation_name,
    svg.add_variation_images,
    il.quantity,
    s.low_stock_qty,
    s.max_stock_qty,
    l.name,
    il.quantity <= s.low_stock_qty,
    il.quantity = 0,
    sup.name,
    sc.contact_name,
    sc.phone_raw,
    sc.whatsapp_number,
    pc.name
  from public.inventory_levels il
  join public.skus s on s.id = il.sku_id and s.organization_id = il.organization_id
  join public.locations l on l.id = il.location_id
  left join public.sku_variation_groups svg on svg.id = s.variation_group_id
  left join public.suppliers sup on sup.id = s.supplier_id
  left join public.supplier_contacts sc on sc.supplier_id = sup.id and sc.is_primary = true
  left join public.product_categories pc on pc.id = s.category_id
  where il.organization_id = p_organization_id
    and s.is_active = true
    and s.archived_at is null
    and private.is_org_admin(p_organization_id)
  order by pc.name asc nulls last, coalesce(svg.product_name, s.name) asc, s.variant asc nulls first;
$$;

revoke execute on function public.get_staff_inventory_overview(uuid) from public, anon;
revoke execute on function public.get_admin_inventory_overview(uuid) from public, anon;
grant execute on function public.get_staff_inventory_overview(uuid) to authenticated;
grant execute on function public.get_admin_inventory_overview(uuid) to authenticated;

notify pgrst, 'reload schema';

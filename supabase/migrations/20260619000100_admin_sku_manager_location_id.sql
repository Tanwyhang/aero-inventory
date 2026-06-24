drop function if exists public.get_admin_sku_manager_rows(uuid);

create function public.get_admin_sku_manager_rows(p_organization_id uuid)
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
  supplier_name text,
  contact_name text,
  country text,
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
    sup.name,
    sc.contact_name,
    sc.country,
    sc.phone_raw,
    sc.whatsapp_number,
    pc.name
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

revoke execute on function public.get_admin_sku_manager_rows(uuid) from public, anon;
grant execute on function public.get_admin_sku_manager_rows(uuid) to authenticated;

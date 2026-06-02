create or replace function public.get_admin_restock_requests(p_organization_id uuid)
returns table (
  id uuid,
  sku_id uuid,
  location_id uuid,
  status public.restock_request_status,
  requested_qty integer,
  current_qty_snapshot integer,
  low_stock_qty_snapshot integer,
  note text,
  created_at timestamptz,
  product_name text,
  sku_code text,
  requested_by_name text,
  requested_by_email text
)
language sql
security definer
set search_path = ''
as $$
  select
    rr.id,
    rr.sku_id,
    rr.location_id,
    rr.status,
    rr.requested_qty,
    rr.current_qty_snapshot,
    rr.low_stock_qty_snapshot,
    rr.note,
    rr.created_at,
    s.name,
    s.sku_code,
    p.full_name,
    p.email
  from public.restock_requests rr
  join public.skus s on s.id = rr.sku_id
  left join public.profiles p on p.id = rr.requested_by
  where rr.organization_id = p_organization_id
    and rr.status in ('open', 'acknowledged', 'ordered')
    and private.is_org_admin(p_organization_id)
  order by rr.created_at desc;
$$;

revoke all on function public.get_admin_restock_requests(uuid) from public, anon;
grant execute on function public.get_admin_restock_requests(uuid) to authenticated;
;

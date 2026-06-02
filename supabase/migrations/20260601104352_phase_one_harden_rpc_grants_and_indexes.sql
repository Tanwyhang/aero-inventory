revoke all on function public.claim_bootstrap_admin() from public, anon;
revoke all on function public.get_my_membership() from public, anon;
revoke all on function public.get_staff_inventory_overview(uuid) from public, anon;
revoke all on function public.get_admin_inventory_overview(uuid) from public, anon;
revoke all on function public.adjust_stock(uuid, uuid, integer, text) from public, anon;

grant execute on function public.claim_bootstrap_admin() to authenticated;
grant execute on function public.get_my_membership() to authenticated;
grant execute on function public.get_staff_inventory_overview(uuid) to authenticated;
grant execute on function public.get_admin_inventory_overview(uuid) to authenticated;
grant execute on function public.adjust_stock(uuid, uuid, integer, text) to authenticated;

create index if not exists bootstrap_admin_claims_claimed_by_idx on public.bootstrap_admin_claims (claimed_by);
create index if not exists bootstrap_admin_claims_organization_id_idx on public.bootstrap_admin_claims (organization_id);
create index if not exists inventory_levels_location_id_idx on public.inventory_levels (location_id);
create index if not exists skus_supplier_id_idx on public.skus (supplier_id);
create index if not exists stock_movements_location_id_idx on public.stock_movements (location_id);
create index if not exists stock_movements_sku_id_idx on public.stock_movements (sku_id);
;

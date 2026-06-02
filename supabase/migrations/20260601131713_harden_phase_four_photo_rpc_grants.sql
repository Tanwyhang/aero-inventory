revoke all on function public.get_staff_inventory_overview(uuid) from public;
revoke all on function public.get_staff_inventory_overview(uuid) from anon;
revoke all on function public.get_admin_inventory_overview(uuid) from public;
revoke all on function public.get_admin_inventory_overview(uuid) from anon;
revoke all on function public.get_admin_sku_manager_rows(uuid) from public;
revoke all on function public.get_admin_sku_manager_rows(uuid) from anon;
revoke all on function public.admin_update_sku_photo(uuid, text) from public;
revoke all on function public.admin_update_sku_photo(uuid, text) from anon;

grant execute on function public.get_staff_inventory_overview(uuid) to authenticated;
grant execute on function public.get_admin_inventory_overview(uuid) to authenticated;
grant execute on function public.get_admin_sku_manager_rows(uuid) to authenticated;
grant execute on function public.admin_update_sku_photo(uuid, text) to authenticated;;

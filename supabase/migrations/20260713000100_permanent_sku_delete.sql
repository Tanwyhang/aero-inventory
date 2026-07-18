create or replace function public.admin_delete_sku(p_sku_id uuid)
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

  actor_role := private.member_role_for(sku_row.organization_id);
  insert into public.audit_events (organization_id, actor_user_id, actor_role, event_type, entity_type, entity_id, entity_label, action, before_data)
  values (sku_row.organization_id, auth.uid(), actor_role, 'crud', 'sku', p_sku_id, sku_row.name, 'delete_sku', to_jsonb(sku_row));

  delete from public.partner_share_items where sku_id = p_sku_id;
  delete from public.restock_requests where sku_id = p_sku_id;
  delete from public.stock_movements where sku_id = p_sku_id;
  delete from public.skus where id = p_sku_id;

  return p_sku_id;
end;
$$;
revoke all on function public.admin_delete_sku(uuid) from public, anon;
grant execute on function public.admin_delete_sku(uuid) to authenticated;

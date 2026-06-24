create or replace function public.admin_record_partner_share_output(p_sheet_id uuid, p_output_type text)
returns uuid
language plpgsql
security definer
set search_path = ''
as $$
declare
  sheet_row public.partner_share_sheets%rowtype;
  partner_name text;
  actor_role text;
begin
  if auth.uid() is null then raise exception 'Not authenticated'; end if;
  if p_output_type not in ('whatsapp_copy', 'excel_export') then raise exception 'Invalid output type'; end if;

  select * into sheet_row from public.partner_share_sheets where id = p_sheet_id;
  if not found then raise exception 'Partner share sheet not found'; end if;
  if not private.is_org_member(sheet_row.organization_id) then raise exception 'Not authorized'; end if;

  select name into partner_name from public.partners where id = sheet_row.partner_id;
  actor_role := private.member_role_for(sheet_row.organization_id);

  insert into public.audit_events (organization_id, actor_user_id, actor_role, event_type, entity_type, entity_id, entity_label, action, after_data)
  values (
    sheet_row.organization_id,
    auth.uid(),
    actor_role,
    'partner_share',
    'partner_share_sheet',
    sheet_row.id,
    coalesce(partner_name, 'Partner Share Qty'),
    p_output_type,
    jsonb_build_object('output_type', p_output_type, 'status', sheet_row.status, 'share_date', sheet_row.share_date)
  );

  return sheet_row.id;
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
  if sheet_row.status not in ('sent', 'completed') then raise exception 'Stock can only be deducted after the sheet is sent or completed'; end if;
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

revoke all on function public.admin_record_partner_share_output(uuid, text) from public, anon;
grant execute on function public.admin_record_partner_share_output(uuid, text) to authenticated;

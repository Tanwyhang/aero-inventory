alter table public.partner_share_sheets
add column if not exists auto_sync_with_main_store boolean not null default false;

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
        'auto_sync_with_main_store', s.auto_sync_with_main_store,
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
        select
          count(*)::integer item_count,
          coalesce(sum(case when s.auto_sync_with_main_store then il.quantity else psi.share_qty end), 0)::integer total_share_qty
        from public.partner_share_items psi
        left join public.inventory_levels il on il.sku_id = psi.sku_id and il.location_id = psi.location_id
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
      'auto_sync_with_main_store', s.auto_sync_with_main_store,
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
  if sheet_row.auto_sync_with_main_store then raise exception 'Disable auto-sync before editing share quantity'; end if;
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

create or replace function public.admin_set_partner_share_auto_sync(p_sheet_id uuid, p_auto_sync_with_main_store boolean)
returns uuid
language plpgsql
security definer
set search_path = ''
as $$
declare
  sheet_row public.partner_share_sheets%rowtype;
  actor_role text;
begin
  if auth.uid() is null then raise exception 'Not authenticated'; end if;

  select * into sheet_row from public.partner_share_sheets where id = p_sheet_id for update;
  if not found then raise exception 'Partner share sheet not found'; end if;
  if not private.is_org_admin(sheet_row.organization_id) then raise exception 'Admin access required'; end if;
  if sheet_row.status = 'completed' then raise exception 'Completed sheets cannot change auto-sync'; end if;

  update public.partner_share_sheets
  set auto_sync_with_main_store = p_auto_sync_with_main_store,
      updated_by = auth.uid(),
      updated_at = now()
  where id = p_sheet_id;

  actor_role := private.member_role_for(sheet_row.organization_id);
  insert into public.audit_events (organization_id, actor_user_id, actor_role, event_type, entity_type, entity_id, entity_label, action, before_data, after_data)
  values (
    sheet_row.organization_id,
    auth.uid(),
    actor_role,
    'partner_share',
    'partner_share_sheet',
    p_sheet_id,
    sheet_row.source_shop_name,
    'set_partner_share_auto_sync',
    jsonb_build_object('auto_sync_with_main_store', sheet_row.auto_sync_with_main_store),
    jsonb_build_object('auto_sync_with_main_store', p_auto_sync_with_main_store)
  );

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
  effective_qty integer;
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
    effective_qty := case when sheet_row.auto_sync_with_main_store then inv_qty else item_row.share_qty end;
    if effective_qty > inv_qty then raise exception 'Not enough stock for %', item_row.sku_code; end if;
  end loop;

  actor_role := private.member_role_for(sheet_row.organization_id);

  for item_row in select * from public.partner_share_items where sheet_id = p_sheet_id order by created_at asc loop
    select quantity into inv_qty from public.inventory_levels where sku_id = item_row.sku_id and location_id = item_row.location_id for update;
    effective_qty := case when sheet_row.auto_sync_with_main_store then inv_qty else item_row.share_qty end;

    if effective_qty > 0 then
      update public.inventory_levels set quantity = inv_qty - effective_qty, updated_at = now() where sku_id = item_row.sku_id and location_id = item_row.location_id;
      insert into public.stock_movements (organization_id, sku_id, location_id, actor_user_id, movement_type, quantity_delta, quantity_before, quantity_after, reason, note)
      values (sheet_row.organization_id, item_row.sku_id, item_row.location_id, auth.uid(), 'deduct', -effective_qty, inv_qty, inv_qty - effective_qty, 'Transfer', 'Partner Share Qty')
      returning id into movement_id;
    end if;
  end loop;

  update public.partner_share_sheets
  set stock_deducted_by = auth.uid(), stock_deducted_at = now(), updated_by = auth.uid(), updated_at = now()
  where id = p_sheet_id;

  insert into public.audit_events (organization_id, actor_user_id, actor_role, event_type, entity_type, entity_id, entity_label, action, after_data)
  values (sheet_row.organization_id, auth.uid(), actor_role, 'partner_share', 'partner_share_sheet', p_sheet_id, 'Partner Share Qty', 'deduct_partner_share_stock', jsonb_build_object('stock_deducted_by', auth.uid(), 'stock_deducted_at', now(), 'auto_sync_with_main_store', sheet_row.auto_sync_with_main_store));

  return p_sheet_id;
end;
$$;

revoke all on function public.admin_set_partner_share_auto_sync(uuid, boolean) from public, anon;
grant execute on function public.admin_set_partner_share_auto_sync(uuid, boolean) to authenticated;

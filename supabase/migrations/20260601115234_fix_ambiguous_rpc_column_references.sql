create or replace function public.adjust_stock(p_sku_id uuid, p_location_id uuid, p_delta integer, p_note text default null)
returns table (
  sku_id uuid,
  location_id uuid,
  quantity integer,
  movement_id uuid
)
language plpgsql
security definer
set search_path = ''
as $$
declare
  inv_row public.inventory_levels%rowtype;
  next_quantity integer;
  actor_role text;
  new_movement_id uuid;
begin
  if auth.uid() is null then
    raise exception 'Not authenticated';
  end if;

  if p_delta = 0 then
    raise exception 'Stock adjustment cannot be zero';
  end if;

  select * into inv_row
  from public.inventory_levels il
  where il.sku_id = p_sku_id
    and il.location_id = p_location_id
  for update;

  if not found then
    raise exception 'Inventory row not found';
  end if;

  if not private.is_org_member(inv_row.organization_id) then
    raise exception 'Not authorized';
  end if;

  actor_role := private.member_role_for(inv_row.organization_id);
  next_quantity := inv_row.quantity + p_delta;

  if next_quantity < 0 then
    raise exception 'Stock cannot go below zero';
  end if;

  update public.inventory_levels il
  set quantity = next_quantity, updated_at = now()
  where il.id = inv_row.id;

  insert into public.stock_movements (
    organization_id, sku_id, location_id, actor_user_id, movement_type,
    quantity_delta, quantity_before, quantity_after, note
  ) values (
    inv_row.organization_id, inv_row.sku_id, inv_row.location_id, auth.uid(),
    case when p_delta > 0 then 'add'::public.movement_type else 'deduct'::public.movement_type end,
    p_delta, inv_row.quantity, next_quantity, nullif(trim(coalesce(p_note, '')), '')
  ) returning id into new_movement_id;

  insert into public.audit_events (
    organization_id, actor_user_id, actor_role, event_type, entity_type, entity_id,
    entity_label, action, before_data, after_data, metadata
  ) values (
    inv_row.organization_id, auth.uid(), actor_role, 'stock', 'inventory_level', inv_row.id,
    'Stock adjustment', case when p_delta > 0 then 'add_stock' else 'deduct_stock' end,
    jsonb_build_object('quantity', inv_row.quantity),
    jsonb_build_object('quantity', next_quantity),
    jsonb_build_object('sku_id', inv_row.sku_id, 'location_id', inv_row.location_id, 'delta', p_delta, 'note', p_note, 'movement_id', new_movement_id)
  );

  return query select inv_row.sku_id, inv_row.location_id, next_quantity, new_movement_id;
end;
$$;

create or replace function public.create_restock_request(
  p_sku_id uuid,
  p_location_id uuid,
  p_requested_qty integer default null,
  p_note text default null
)
returns uuid
language plpgsql
security definer
set search_path = ''
as $$
declare
  inv_row public.inventory_levels%rowtype;
  sku_row public.skus%rowtype;
  actor_role text;
  request_id uuid;
begin
  if auth.uid() is null then
    raise exception 'Not authenticated';
  end if;

  if p_requested_qty is not null and p_requested_qty <= 0 then
    raise exception 'Requested quantity must be positive';
  end if;

  select * into inv_row
  from public.inventory_levels il
  where il.sku_id = p_sku_id
    and il.location_id = p_location_id;

  if not found then
    raise exception 'Inventory row not found';
  end if;

  if not private.is_org_member(inv_row.organization_id) then
    raise exception 'Not authorized';
  end if;

  select * into sku_row from public.skus s where s.id = inv_row.sku_id;
  actor_role := private.member_role_for(inv_row.organization_id);

  insert into public.restock_requests (
    organization_id,
    sku_id,
    location_id,
    requested_by,
    requested_qty,
    current_qty_snapshot,
    low_stock_qty_snapshot,
    note
  ) values (
    inv_row.organization_id,
    inv_row.sku_id,
    inv_row.location_id,
    auth.uid(),
    p_requested_qty,
    inv_row.quantity,
    sku_row.low_stock_qty,
    nullif(trim(coalesce(p_note, '')), '')
  ) returning id into request_id;

  insert into public.restock_request_events (
    organization_id,
    restock_request_id,
    actor_user_id,
    from_status,
    to_status,
    comment
  ) values (
    inv_row.organization_id,
    request_id,
    auth.uid(),
    null,
    'open',
    nullif(trim(coalesce(p_note, '')), '')
  );

  insert into public.audit_events (
    organization_id,
    actor_user_id,
    actor_role,
    event_type,
    entity_type,
    entity_id,
    entity_label,
    action,
    after_data,
    metadata
  ) values (
    inv_row.organization_id,
    auth.uid(),
    actor_role,
    'restock',
    'restock_request',
    request_id,
    'Restock request',
    'create_restock_request',
    jsonb_build_object('status', 'open', 'requested_qty', p_requested_qty, 'note', p_note),
    jsonb_build_object('sku_id', inv_row.sku_id, 'location_id', inv_row.location_id, 'current_qty', inv_row.quantity, 'low_stock_qty', sku_row.low_stock_qty)
  );

  return request_id;
end;
$$;
;

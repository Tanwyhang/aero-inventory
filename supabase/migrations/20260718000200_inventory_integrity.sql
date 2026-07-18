begin;

create or replace function public.adjust_stock(
  p_organization_id uuid,
  p_sku_id uuid,
  p_location_id uuid,
  p_delta integer,
  p_note text default null,
  p_reason text default 'Stock Adjustment',
  p_expected_quantity integer default null
) returns table (sku_id uuid, location_id uuid, quantity integer, movement_id uuid)
language plpgsql
security definer
set search_path = ''
as $$
declare
  sku_row public.skus%rowtype;
  inv_row public.inventory_levels%rowtype;
begin
  if auth.uid() is null then raise exception 'Not authenticated'; end if;
  if not private.is_org_member(p_organization_id) then raise exception 'Workspace access required'; end if;
  if p_delta is null or p_delta = 0 then raise exception 'Stock adjustment cannot be zero'; end if;
  if p_expected_quantity is not null and p_expected_quantity < 0 then raise exception 'Expected quantity cannot be negative'; end if;

  select * into sku_row
  from public.skus s
  where s.id = p_sku_id
    and s.organization_id = p_organization_id
    and s.is_active
    and s.archived_at is null
  for update;

  if not found then raise exception 'SKU is not available in the selected workspace or has been archived'; end if;

  select * into inv_row
  from public.inventory_levels il
  where il.organization_id = p_organization_id
    and il.sku_id = p_sku_id
    and il.location_id = p_location_id
  for update;

  if not found then raise exception 'Inventory row is not available in the selected workspace'; end if;

  if p_expected_quantity is not null and inv_row.quantity <> p_expected_quantity then
    raise exception 'Inventory changed since you opened it. Refresh and try again';
  end if;

  return query
  select result.sku_id, result.location_id, result.quantity, result.movement_id
  from public.adjust_stock(p_sku_id, p_location_id, p_delta, p_note, p_reason) result;
end;
$$;

create or replace function public.create_restock_request(
  p_organization_id uuid,
  p_sku_id uuid,
  p_location_id uuid,
  p_requested_qty integer default null,
  p_note text default null
) returns uuid
language plpgsql
security definer
set search_path = ''
as $$
declare
  sku_row public.skus%rowtype;
  inv_row public.inventory_levels%rowtype;
begin
  if auth.uid() is null then raise exception 'Not authenticated'; end if;
  if not private.is_org_member(p_organization_id) then raise exception 'Workspace access required'; end if;

  select * into sku_row
  from public.skus s
  where s.id = p_sku_id
    and s.organization_id = p_organization_id
    and s.is_active
    and s.archived_at is null
  for update;

  if not found then raise exception 'SKU is not available in the selected workspace or has been archived'; end if;

  select * into inv_row
  from public.inventory_levels il
  where il.organization_id = p_organization_id
    and il.sku_id = p_sku_id
    and il.location_id = p_location_id
  for update;

  if not found then raise exception 'Inventory row is not available in the selected workspace'; end if;

  return public.create_restock_request(p_sku_id, p_location_id, p_requested_qty, p_note);
end;
$$;

create or replace function public.update_restock_request_status(
  p_organization_id uuid,
  p_request_id uuid,
  p_status public.restock_request_status,
  p_comment text default null
) returns uuid
language plpgsql
security definer
set search_path = ''
as $$
declare
  request_row public.restock_requests%rowtype;
  sku_row public.skus%rowtype;
begin
  if auth.uid() is null then raise exception 'Not authenticated'; end if;
  if not private.is_org_admin(p_organization_id) then raise exception 'Admin access required'; end if;

  -- Lock the SKU before the request so status changes and archiving use the
  -- same lock order and cannot race each other. Archived legacy requests must
  -- remain cancellable, but cannot move back into an operational status.
  select s.* into sku_row
  from public.restock_requests rr
  join public.skus s
    on s.id = rr.sku_id
   and s.organization_id = rr.organization_id
  where rr.id = p_request_id
    and rr.organization_id = p_organization_id
  for update of s;

  if not found then raise exception 'Restock request SKU is unavailable'; end if;

  select * into request_row
  from public.restock_requests rr
  where rr.id = p_request_id
    and rr.organization_id = p_organization_id
  for update;

  if not found then raise exception 'Restock request is not available in the selected workspace'; end if;

  if (not sku_row.is_active or sku_row.archived_at is not null) and p_status <> 'cancelled' then
    raise exception 'Archived SKU restock requests can only be cancelled';
  end if;

  return public.update_restock_request_status(p_request_id, p_status, p_comment);
end;
$$;

-- Archiving is a business event, not a delete. Cancel active restock work in
-- the same transaction so an archived SKU cannot remain operational.
create or replace function public.admin_archive_sku(p_sku_id uuid)
returns uuid
language plpgsql
security definer
set search_path = ''
as $$
declare
  sku_row public.skus%rowtype;
  request_row public.restock_requests%rowtype;
  actor_role text;
  cancelled_request_count integer := 0;
begin
  if auth.uid() is null then raise exception 'Not authenticated'; end if;

  select * into sku_row
  from public.skus s
  where s.id = p_sku_id
    and s.is_active
    and s.archived_at is null
  for update of s;

  if not found then raise exception 'SKU is already archived or unavailable'; end if;
  if not private.is_org_admin(sku_row.organization_id) then raise exception 'Admin access required'; end if;

  if exists (
    select 1
    from public.partner_share_items psi
    join public.partner_share_sheets pss
      on pss.id = psi.sheet_id
     and pss.organization_id = psi.organization_id
     and pss.location_id = psi.location_id
    where psi.organization_id = sku_row.organization_id
      and psi.sku_id = p_sku_id
      and pss.stock_deducted_at is null
  ) then
    raise exception 'Resolve active Partner Share sheets before archiving this SKU';
  end if;

  actor_role := private.member_role_for(sku_row.organization_id);

  for request_row in
    select rr.*
    from public.restock_requests rr
    where rr.organization_id = sku_row.organization_id
      and rr.sku_id = p_sku_id
      and rr.status in ('open', 'acknowledged', 'ordered')
    order by rr.created_at asc
    for update of rr
  loop
    update public.restock_requests rr
    set status = 'cancelled',
        resolved_at = coalesce(rr.resolved_at, now())
    where rr.id = request_row.id
      and rr.organization_id = sku_row.organization_id;

    insert into public.restock_request_events (
      organization_id, restock_request_id, actor_user_id, from_status, to_status, comment
    ) values (
      sku_row.organization_id,
      request_row.id,
      auth.uid(),
      request_row.status,
      'cancelled',
      'Automatically cancelled because the SKU was archived'
    );

    cancelled_request_count := cancelled_request_count + 1;
  end loop;

  update public.skus s
  set is_active = false,
      archived_at = now(),
      updated_at = now()
  where s.id = p_sku_id
    and s.organization_id = sku_row.organization_id
    and s.is_active
    and s.archived_at is null;

  insert into public.audit_events (
    organization_id, actor_user_id, actor_role, event_type, entity_type,
    entity_id, entity_label, action, before_data, after_data, metadata
  ) values (
    sku_row.organization_id,
    auth.uid(),
    actor_role,
    'crud',
    'sku',
    p_sku_id,
    sku_row.name,
    'archive_sku',
    to_jsonb(sku_row),
    jsonb_build_object('is_active', false, 'archived_at', now()),
    jsonb_build_object('cancelled_restock_requests', cancelled_request_count)
  );

  return p_sku_id;
end;
$$;

-- Older releases allowed a SKU to be archived while an undeducted Partner
-- Share sheet still referenced it. Reopen only those stranded sheets so the
-- admin UI can remove the archived item, while preserving the prior state in
-- an immutable system audit event.
do $$
declare
  legacy_sheet public.partner_share_sheets%rowtype;
begin
  for legacy_sheet in
    select pss.*
    from public.partner_share_sheets pss
    where pss.status <> 'draft'
      and pss.stock_deducted_at is null
      and exists (
        select 1
        from public.partner_share_items psi
        left join public.skus s
          on s.id = psi.sku_id
         and s.organization_id = psi.organization_id
         and s.is_active
         and s.archived_at is null
        where psi.sheet_id = pss.id
          and psi.organization_id = pss.organization_id
          and psi.location_id = pss.location_id
          and s.id is null
      )
    for update of pss
  loop
    insert into public.audit_events (
      organization_id, actor_user_id, actor_role, event_type, entity_type,
      entity_id, entity_label, action, before_data, after_data, metadata
    ) values (
      legacy_sheet.organization_id,
      null,
      'system',
      'partner_share',
      'partner_share_sheet',
      legacy_sheet.id,
      legacy_sheet.source_shop_name,
      'recover_legacy_partner_share_sheet',
      to_jsonb(legacy_sheet),
      jsonb_build_object('status', 'draft'),
      jsonb_build_object('reason', 'Undeducted sheet referenced an archived or unavailable SKU')
    );

    update public.partner_share_sheets pss
    set status = 'draft',
        confirmed_by = null,
        sent_by = null,
        completed_by = null,
        confirmed_at = null,
        sent_at = null,
        completed_at = null,
        updated_at = now()
    where pss.id = legacy_sheet.id
      and pss.organization_id = legacy_sheet.organization_id;
  end loop;
end;
$$;

create or replace function public.admin_update_sku_with_stock(
  p_organization_id uuid,
  p_sku_id uuid,
  p_location_id uuid,
  p_expected_quantity integer,
  p_target_quantity integer,
  p_supplier_name text,
  p_contact_name text,
  p_country text,
  p_phone_raw text,
  p_whatsapp_number text,
  p_sku_code text,
  p_name text,
  p_variant text,
  p_price numeric,
  p_low_stock_qty integer,
  p_max_stock_qty integer,
  p_category_name text default null
) returns uuid
language plpgsql
security definer
set search_path = ''
as $$
declare
  sku_row public.skus%rowtype;
  inv_row public.inventory_levels%rowtype;
begin
  if auth.uid() is null then raise exception 'Not authenticated'; end if;
  if not private.is_org_admin(p_organization_id) then raise exception 'Admin access required'; end if;
  if p_expected_quantity is null or p_target_quantity is null then raise exception 'Expected and target stock are required'; end if;
  if p_expected_quantity < 0 or p_target_quantity < 0 then raise exception 'Stock values cannot be negative'; end if;

  select * into sku_row
  from public.skus s
  where s.id = p_sku_id
    and s.organization_id = p_organization_id
    and s.is_active
    and s.archived_at is null
  for update;

  if not found then raise exception 'SKU is not available in the selected workspace or has been archived'; end if;

  select * into inv_row
  from public.inventory_levels il
  where il.organization_id = p_organization_id
    and il.sku_id = p_sku_id
    and il.location_id = p_location_id
  for update;

  if not found then raise exception 'Inventory row is not available in the selected workspace'; end if;
  if inv_row.quantity <> p_expected_quantity then
    raise exception 'Inventory changed since you opened it. Refresh and try again';
  end if;

  perform public.admin_update_sku(
    p_sku_id,
    p_supplier_name,
    p_contact_name,
    p_country,
    p_phone_raw,
    p_whatsapp_number,
    p_sku_code,
    p_name,
    p_variant,
    p_price,
    p_low_stock_qty,
    p_max_stock_qty,
    p_category_name
  );

  if p_target_quantity <> p_expected_quantity then
    perform 1
    from public.adjust_stock(
      p_organization_id,
      p_sku_id,
      p_location_id,
      p_target_quantity - p_expected_quantity,
      'Updated from SKU edit modal',
      'Stock Adjustment',
      p_expected_quantity
    );
  end if;

  return p_sku_id;
end;
$$;

create or replace function public.admin_save_sku_variation_group(
  p_organization_id uuid,
  p_variation_group_id uuid,
  p_product_name text,
  p_variation_name text,
  p_add_variation_images boolean,
  p_supplier_name text,
  p_contact_name text,
  p_country text,
  p_phone_raw text,
  p_whatsapp_number text,
  p_category_name text,
  p_items jsonb
) returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  item jsonb;
  group_id uuid;
  group_row public.sku_variation_groups%rowtype;
  sku_id uuid;
  existing_group_id uuid;
  client_id text;
  actor_role text;
  saved_items jsonb := '[]'::jsonb;
begin
  if auth.uid() is null then raise exception 'Not authenticated'; end if;
  if not private.is_org_admin(p_organization_id) then raise exception 'Admin access required'; end if;
  if nullif(trim(p_product_name), '') is null then raise exception 'Product name is required'; end if;
  if nullif(trim(p_variation_name), '') is null then raise exception 'Variation name is required'; end if;
  if p_items is null or jsonb_typeof(p_items) <> 'array' then raise exception 'Variation items must be an array'; end if;
  if jsonb_array_length(p_items) < 1 or jsonb_array_length(p_items) > 100 then raise exception 'A variation group must contain between 1 and 100 SKU types'; end if;

  if exists (
    select 1
    from jsonb_array_elements(p_items) as values_row(value)
    group by values_row.value ->> 'client_id'
    having count(*) > 1
  ) then
    raise exception 'Variation item identifiers must be unique';
  end if;

  if p_variation_group_id is null then
    group_id := public.admin_create_sku_variation_group(
      p_organization_id,
      p_product_name,
      p_variation_name,
      p_add_variation_images
    );
  else
    select * into group_row
    from public.sku_variation_groups svg
    where svg.id = p_variation_group_id
      and svg.organization_id = p_organization_id
    for update;

    if not found then raise exception 'Variation group is not available in the selected workspace'; end if;
    group_id := group_row.id;

    update public.sku_variation_groups svg
    set product_name = trim(p_product_name),
        variation_name = trim(p_variation_name),
        add_variation_images = coalesce(p_add_variation_images, false),
        updated_at = now()
    where svg.id = group_id
      and svg.organization_id = p_organization_id;

    actor_role := private.member_role_for(p_organization_id);
    insert into public.audit_events (
      organization_id, actor_user_id, actor_role, event_type, entity_type,
      entity_id, entity_label, action, before_data, after_data
    ) values (
      p_organization_id,
      auth.uid(),
      actor_role,
      'crud',
      'sku_variation_group',
      group_id,
      trim(p_product_name),
      'update_variation_group',
      jsonb_build_object(
        'product_name', group_row.product_name,
        'variation_name', group_row.variation_name,
        'add_variation_images', group_row.add_variation_images
      ),
      jsonb_build_object(
        'product_name', trim(p_product_name),
        'variation_name', trim(p_variation_name),
        'add_variation_images', coalesce(p_add_variation_images, false)
      )
    );
  end if;

  for item in select value from jsonb_array_elements(p_items) loop
    client_id := nullif(trim(item ->> 'client_id'), '');
    if client_id is null then raise exception 'Variation item identifier is required'; end if;

    if nullif(item ->> 'sku_id', '') is null then
      sku_id := public.admin_create_sku(
        p_organization_id,
        p_supplier_name,
        p_contact_name,
        p_country,
        p_phone_raw,
        p_whatsapp_number,
        item ->> 'sku_code',
        p_product_name,
        item ->> 'name',
        (item ->> 'price')::numeric,
        (item ->> 'low_stock_qty')::integer,
        (item ->> 'max_stock_qty')::integer,
        (item ->> 'opening_stock')::integer,
        group_id,
        p_category_name
      );
    else
      sku_id := (item ->> 'sku_id')::uuid;

      select s.variation_group_id into existing_group_id
      from public.skus s
      where s.id = sku_id
        and s.organization_id = p_organization_id
        and s.is_active
        and s.archived_at is null
      for update;

      if not found then raise exception 'SKU is not available in the selected workspace or has been archived'; end if;
      if existing_group_id is distinct from group_id then raise exception 'SKU does not belong to the selected variation group'; end if;

      perform public.admin_update_sku_with_stock(
        p_organization_id,
        sku_id,
        (item ->> 'location_id')::uuid,
        (item ->> 'expected_quantity')::integer,
        (item ->> 'target_quantity')::integer,
        p_supplier_name,
        p_contact_name,
        p_country,
        p_phone_raw,
        p_whatsapp_number,
        item ->> 'sku_code',
        p_product_name,
        item ->> 'name',
        (item ->> 'price')::numeric,
        (item ->> 'low_stock_qty')::integer,
        (item ->> 'max_stock_qty')::integer,
        p_category_name
      );
    end if;

    saved_items := saved_items || jsonb_build_array(jsonb_build_object('client_id', client_id, 'sku_id', sku_id));
  end loop;

  return jsonb_build_object('variation_group_id', group_id, 'items', saved_items);
end;
$$;

drop function if exists public.adjust_stock(uuid, uuid, integer, text);
revoke all on function public.adjust_stock(uuid, uuid, integer, text, text) from public, anon, authenticated;
revoke all on function public.create_restock_request(uuid, uuid, integer, text) from public, anon, authenticated;
revoke all on function public.update_restock_request_status(uuid, public.restock_request_status, text) from public, anon, authenticated;

revoke all on function public.adjust_stock(uuid, uuid, uuid, integer, text, text, integer) from public, anon, authenticated;
revoke all on function public.create_restock_request(uuid, uuid, uuid, integer, text) from public, anon, authenticated;
revoke all on function public.update_restock_request_status(uuid, uuid, public.restock_request_status, text) from public, anon, authenticated;
revoke all on function public.admin_archive_sku(uuid) from public, anon, authenticated;
revoke all on function public.admin_update_sku_with_stock(uuid, uuid, uuid, integer, integer, text, text, text, text, text, text, text, text, numeric, integer, integer, text) from public, anon, authenticated;
revoke all on function public.admin_save_sku_variation_group(uuid, uuid, text, text, boolean, text, text, text, text, text, text, jsonb) from public, anon, authenticated;

grant execute on function public.adjust_stock(uuid, uuid, uuid, integer, text, text, integer) to authenticated;
grant execute on function public.create_restock_request(uuid, uuid, uuid, integer, text) to authenticated;
grant execute on function public.update_restock_request_status(uuid, uuid, public.restock_request_status, text) to authenticated;
grant execute on function public.admin_archive_sku(uuid) to authenticated;
grant execute on function public.admin_update_sku_with_stock(uuid, uuid, uuid, integer, integer, text, text, text, text, text, text, text, text, numeric, integer, integer, text) to authenticated;
grant execute on function public.admin_save_sku_variation_group(uuid, uuid, text, text, boolean, text, text, text, text, text, text, jsonb) to authenticated;

notify pgrst, 'reload schema';

commit;

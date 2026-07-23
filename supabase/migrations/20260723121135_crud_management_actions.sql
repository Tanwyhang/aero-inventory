-- Complete the safe CRUD surface for SKU categories and Partner Share sheets.

create or replace function public.admin_archive_product_category(p_category_id uuid)
returns uuid
language plpgsql
security definer
set search_path = ''
as $$
declare
  category_row public.product_categories%rowtype;
  actor_role text;
  affected_skus integer;
begin
  if auth.uid() is null then raise exception 'Not authenticated'; end if;

  select * into category_row
  from public.product_categories
  where id = p_category_id and archived_at is null
  for update;

  if not found then raise exception 'Category not found'; end if;
  if not private.is_org_admin(category_row.organization_id) then raise exception 'Admin access required'; end if;

  update public.skus
  set category_id = null, updated_at = now()
  where organization_id = category_row.organization_id
    and category_id = category_row.id;
  get diagnostics affected_skus = row_count;

  update public.product_categories
  set archived_at = now(), updated_at = now()
  where id = category_row.id;

  actor_role := private.member_role_for(category_row.organization_id);
  insert into public.audit_events (
    organization_id, actor_user_id, actor_role, event_type, entity_type,
    entity_id, entity_label, action, before_data, after_data
  ) values (
    category_row.organization_id, auth.uid(), actor_role, 'sku', 'product_category',
    category_row.id, category_row.name, 'archive_category', to_jsonb(category_row),
    jsonb_build_object('archived', true, 'affected_skus', affected_skus)
  );

  return category_row.id;
end;
$$;

create or replace function public.admin_delete_draft_partner_share_sheet(p_sheet_id uuid)
returns uuid
language plpgsql
security definer
set search_path = ''
as $$
declare
  sheet_row public.partner_share_sheets%rowtype;
  actor_role text;
  partner_name text;
  item_count integer;
begin
  if auth.uid() is null then raise exception 'Not authenticated'; end if;

  select * into sheet_row
  from public.partner_share_sheets
  where id = p_sheet_id
  for update;

  if not found then raise exception 'Partner share sheet not found'; end if;
  if not private.is_org_admin(sheet_row.organization_id) then raise exception 'Admin access required'; end if;
  if sheet_row.status <> 'draft' then raise exception 'Only draft share sheets can be deleted'; end if;
  if sheet_row.stock_deducted_at is not null then raise exception 'A share sheet with deducted stock cannot be deleted'; end if;

  select p.name into partner_name
  from public.partners p
  where p.id = sheet_row.partner_id and p.organization_id = sheet_row.organization_id;

  select count(*)::integer into item_count
  from public.partner_share_items psi
  where psi.sheet_id = sheet_row.id and psi.organization_id = sheet_row.organization_id;

  actor_role := private.member_role_for(sheet_row.organization_id);
  insert into public.audit_events (
    organization_id, actor_user_id, actor_role, event_type, entity_type,
    entity_id, entity_label, action, before_data, after_data
  ) values (
    sheet_row.organization_id, auth.uid(), actor_role, 'partner_share', 'partner_share_sheet',
    sheet_row.id, coalesce(partner_name, 'Partner Share Sheet'), 'delete_draft_partner_share_sheet',
    to_jsonb(sheet_row), jsonb_build_object('deleted', true, 'item_count', item_count)
  );

  delete from public.partner_share_sheets
  where id = sheet_row.id and organization_id = sheet_row.organization_id;

  return sheet_row.id;
end;
$$;

create or replace function public.admin_update_draft_partner_share_sheet(
  p_sheet_id uuid,
  p_partner_id uuid,
  p_location_id uuid,
  p_share_date date
)
returns uuid
language plpgsql
security definer
set search_path = ''
as $$
declare
  sheet_row public.partner_share_sheets%rowtype;
  partner_row public.partners%rowtype;
  location_row public.locations%rowtype;
  actor_role text;
  item_count integer;
begin
  if auth.uid() is null then raise exception 'Not authenticated'; end if;

  select * into sheet_row
  from public.partner_share_sheets
  where id = p_sheet_id
  for update;

  if not found then raise exception 'Partner share sheet not found'; end if;
  if not private.is_org_admin(sheet_row.organization_id) then raise exception 'Admin access required'; end if;
  if sheet_row.status <> 'draft' then raise exception 'Only draft share sheets can be edited'; end if;

  select * into partner_row
  from public.partners
  where id = p_partner_id
    and organization_id = sheet_row.organization_id
    and archived_at is null;
  if not found then raise exception 'Partner not found'; end if;

  select * into location_row
  from public.locations
  where id = p_location_id
    and organization_id = sheet_row.organization_id
    and archived_at is null;
  if not found then raise exception 'Location not found'; end if;

  select count(*)::integer into item_count
  from public.partner_share_items psi
  where psi.sheet_id = sheet_row.id;

  if item_count > 0 and p_location_id <> sheet_row.location_id then
    raise exception 'Remove products before changing the sheet location';
  end if;

  update public.partner_share_sheets
  set partner_id = partner_row.id,
      location_id = location_row.id,
      share_date = coalesce(p_share_date, sheet_row.share_date),
      updated_by = auth.uid(),
      updated_at = now()
  where id = sheet_row.id;

  actor_role := private.member_role_for(sheet_row.organization_id);
  insert into public.audit_events (
    organization_id, actor_user_id, actor_role, event_type, entity_type,
    entity_id, entity_label, action, before_data, after_data
  ) values (
    sheet_row.organization_id, auth.uid(), actor_role, 'partner_share', 'partner_share_sheet',
    sheet_row.id, partner_row.name, 'update_draft_partner_share_sheet', to_jsonb(sheet_row),
    jsonb_build_object('partner_id', partner_row.id, 'location_id', location_row.id, 'share_date', coalesce(p_share_date, sheet_row.share_date))
  );

  return sheet_row.id;
end;
$$;

revoke all on function public.admin_archive_product_category(uuid) from public, anon, authenticated;
revoke all on function public.admin_delete_draft_partner_share_sheet(uuid) from public, anon, authenticated;
revoke all on function public.admin_update_draft_partner_share_sheet(uuid, uuid, uuid, date) from public, anon, authenticated;
grant execute on function public.admin_archive_product_category(uuid) to authenticated;
grant execute on function public.admin_delete_draft_partner_share_sheet(uuid) to authenticated;
grant execute on function public.admin_update_draft_partner_share_sheet(uuid, uuid, uuid, date) to authenticated;

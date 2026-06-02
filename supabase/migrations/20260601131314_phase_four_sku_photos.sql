insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values ('sku-photos', 'sku-photos', false, 5242880, array['image/jpeg', 'image/png', 'image/webp', 'image/gif'])
on conflict (id) do update
set public = false,
    file_size_limit = excluded.file_size_limit,
    allowed_mime_types = excluded.allowed_mime_types;

drop policy if exists "sku_photos_select_org_members" on storage.objects;
drop policy if exists "sku_photos_insert_org_admins" on storage.objects;
drop policy if exists "sku_photos_update_org_admins" on storage.objects;
drop policy if exists "sku_photos_delete_org_admins" on storage.objects;

create policy "sku_photos_select_org_members"
on storage.objects for select
to authenticated
using (
  bucket_id = 'sku-photos'
  and private.is_org_member((storage.foldername(name))[1]::uuid)
);

create policy "sku_photos_insert_org_admins"
on storage.objects for insert
to authenticated
with check (
  bucket_id = 'sku-photos'
  and private.is_org_admin((storage.foldername(name))[1]::uuid)
);

create policy "sku_photos_update_org_admins"
on storage.objects for update
to authenticated
using (
  bucket_id = 'sku-photos'
  and private.is_org_admin((storage.foldername(name))[1]::uuid)
)
with check (
  bucket_id = 'sku-photos'
  and private.is_org_admin((storage.foldername(name))[1]::uuid)
);

create policy "sku_photos_delete_org_admins"
on storage.objects for delete
to authenticated
using (
  bucket_id = 'sku-photos'
  and private.is_org_admin((storage.foldername(name))[1]::uuid)
);

drop function if exists public.get_staff_inventory_overview(uuid);
drop function if exists public.get_admin_inventory_overview(uuid);
drop function if exists public.get_admin_sku_manager_rows(uuid);

create function public.get_staff_inventory_overview(p_organization_id uuid)
returns table(
  sku_id uuid,
  location_id uuid,
  product_name text,
  variant text,
  sku_code text,
  photo_path text,
  quantity integer,
  low_stock_qty integer,
  max_stock_qty integer,
  location_name text,
  is_low_stock boolean,
  is_out_of_stock boolean
)
language sql
security definer
set search_path = ''
as $$
  select s.id, il.location_id, s.name, s.variant, s.sku_code, s.photo_path, il.quantity, s.low_stock_qty, s.max_stock_qty, l.name,
    il.quantity <= s.low_stock_qty,
    il.quantity = 0
  from public.inventory_levels il
  join public.skus s on s.id = il.sku_id and s.organization_id = il.organization_id
  join public.locations l on l.id = il.location_id
  where il.organization_id = p_organization_id
    and s.is_active = true
    and s.archived_at is null
    and private.is_org_member(p_organization_id)
  order by s.name asc;
$$;

create function public.get_admin_inventory_overview(p_organization_id uuid)
returns table(
  sku_id uuid,
  location_id uuid,
  product_name text,
  variant text,
  sku_code text,
  photo_path text,
  quantity integer,
  low_stock_qty integer,
  max_stock_qty integer,
  location_name text,
  supplier_name text,
  contact_name text,
  phone_raw text,
  whatsapp_number text,
  is_low_stock boolean,
  is_out_of_stock boolean
)
language sql
security definer
set search_path = ''
as $$
  select s.id, il.location_id, s.name, s.variant, s.sku_code, s.photo_path, il.quantity, s.low_stock_qty, s.max_stock_qty, l.name,
    sup.name, sc.contact_name, sc.phone_raw, sc.whatsapp_number,
    il.quantity <= s.low_stock_qty,
    il.quantity = 0
  from public.inventory_levels il
  join public.skus s on s.id = il.sku_id and s.organization_id = il.organization_id
  join public.locations l on l.id = il.location_id
  left join public.suppliers sup on sup.id = s.supplier_id
  left join public.supplier_contacts sc on sc.supplier_id = sup.id and sc.is_primary = true
  where il.organization_id = p_organization_id
    and s.is_active = true
    and s.archived_at is null
    and private.is_org_admin(p_organization_id)
  order by s.name asc;
$$;

create function public.get_admin_sku_manager_rows(p_organization_id uuid)
returns table(
  sku_id uuid,
  product_name text,
  variant text,
  sku_code text,
  photo_path text,
  quantity integer,
  low_stock_qty integer,
  max_stock_qty integer,
  supplier_name text,
  contact_name text,
  country text,
  phone_raw text,
  whatsapp_number text
)
language sql
security definer
set search_path = ''
as $$
  select s.id, s.name, s.variant, s.sku_code, s.photo_path, il.quantity, s.low_stock_qty, s.max_stock_qty, sup.name, sc.contact_name, sc.country, sc.phone_raw, sc.whatsapp_number
  from public.skus s
  join public.inventory_levels il on il.sku_id = s.id
  left join public.suppliers sup on sup.id = s.supplier_id
  left join public.supplier_contacts sc on sc.supplier_id = sup.id and sc.is_primary
  where s.organization_id = p_organization_id
    and s.is_active
    and s.archived_at is null
    and private.is_org_admin(p_organization_id)
  order by s.created_at desc;
$$;

create or replace function public.admin_update_sku_photo(p_sku_id uuid, p_photo_path text)
returns uuid
language plpgsql
security definer
set search_path = ''
as $$
declare
  old_sku public.skus%rowtype;
  org_id uuid;
  actor_role text;
begin
  if auth.uid() is null then raise exception 'Not authenticated'; end if;
  select * into old_sku from public.skus where id = p_sku_id for update;
  if not found then raise exception 'SKU not found'; end if;
  org_id := old_sku.organization_id;
  if not private.is_org_admin(org_id) then raise exception 'Admin access required'; end if;
  if p_photo_path is not null and split_part(p_photo_path, '/', 1)::uuid <> org_id then
    raise exception 'Photo path must be within organization folder';
  end if;

  update public.skus
  set photo_path = nullif(trim(p_photo_path), ''), updated_at = now()
  where id = p_sku_id;

  actor_role := private.member_role_for(org_id);
  insert into public.audit_events (organization_id, actor_user_id, actor_role, event_type, entity_type, entity_id, entity_label, action, before_data, after_data)
  values (
    org_id, auth.uid(), actor_role, 'crud', 'sku', p_sku_id, old_sku.name, 'update_sku_photo',
    jsonb_build_object('photo_path', old_sku.photo_path),
    jsonb_build_object('photo_path', nullif(trim(p_photo_path), ''))
  );

  return p_sku_id;
end;
$$;

revoke all on function public.get_staff_inventory_overview(uuid) from anon;
revoke all on function public.get_admin_inventory_overview(uuid) from anon;
revoke all on function public.get_admin_sku_manager_rows(uuid) from anon;
revoke all on function public.admin_update_sku_photo(uuid, text) from anon;
grant execute on function public.get_staff_inventory_overview(uuid) to authenticated;
grant execute on function public.get_admin_inventory_overview(uuid) to authenticated;
grant execute on function public.get_admin_sku_manager_rows(uuid) to authenticated;
grant execute on function public.admin_update_sku_photo(uuid, text) to authenticated;;

begin;

-- A previously deployed migration exposed irreversible SKU deletion. Keep its
-- history entry for migration ordering, but remove the capability before any
-- tenant hardening or new SaaS features are enabled.
drop function if exists public.admin_delete_sku(uuid);

-- Archived workspaces must be inaccessible at the same authorization layer used
-- by RLS policies and SECURITY DEFINER RPCs, not merely hidden by the UI.
create or replace function private.member_role_for(target_org_id uuid)
returns text
language sql
stable
security definer
set search_path = ''
as $$
  select om.role::text
  from public.organization_members om
  join public.organizations o
    on o.id = om.organization_id
   and o.archived_at is null
  where om.organization_id = target_org_id
    and om.user_id = auth.uid()
    and om.status = 'active'
  limit 1;
$$;

create or replace function private.is_org_member(target_org_id uuid)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select exists (
    select 1
    from public.organization_members om
    join public.organizations o
      on o.id = om.organization_id
     and o.archived_at is null
    where om.organization_id = target_org_id
      and om.user_id = auth.uid()
      and om.status = 'active'
  );
$$;

create or replace function private.is_org_admin(target_org_id uuid)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select exists (
    select 1
    from public.organization_members om
    join public.organizations o
      on o.id = om.organization_id
     and o.archived_at is null
    where om.organization_id = target_org_id
      and om.user_id = auth.uid()
      and om.status = 'active'
      and om.role = 'admin'
  );
$$;

-- Bootstrap claims and workspace invites are Google-only flows. Checking the
-- identity table avoids trusting a caller-controlled/unverified email signup.
create or replace function public.claim_bootstrap_admin()
returns uuid
language plpgsql
security definer
set search_path = ''
as $$
declare
  user_email text;
  claim_row public.bootstrap_admin_claims%rowtype;
  user_name text := coalesce(auth.jwt() -> 'user_metadata' ->> 'full_name', auth.jwt() -> 'user_metadata' ->> 'name');
  user_avatar text := auth.jwt() -> 'user_metadata' ->> 'avatar_url';
begin
  if auth.uid() is null then
    raise exception 'Not authenticated';
  end if;

  select lower(nullif(trim(ai.identity_data ->> 'email'), ''))
  into user_email
  from auth.identities ai
  join auth.users u on u.id = ai.user_id
  where ai.user_id = auth.uid()
    and ai.provider = 'google'
    and lower(nullif(trim(ai.identity_data ->> 'email'), '')) = lower(nullif(trim(u.email), ''))
  order by ai.created_at asc
  limit 1;

  if nullif(user_email, '') is null then
    raise exception 'Verified Google email required';
  end if;

  user_name := coalesce(user_name, user_email);

  select bac.* into claim_row
  from public.bootstrap_admin_claims bac
  join public.organizations o
    on o.id = bac.organization_id
   and o.archived_at is null
  where lower(bac.email) = user_email
    and bac.claimed_by is null
  limit 1
  for update of bac;

  if not found then
    select om.organization_id into claim_row.organization_id
    from public.organization_members om
    join public.organizations o
      on o.id = om.organization_id
     and o.archived_at is null
    where om.user_id = auth.uid()
      and om.status = 'active'
    order by om.created_at asc
    limit 1;

    if claim_row.organization_id is null then
      -- A valid first-time Google user may not have a bootstrap claim yet.
      -- Returning NULL lets the normal workspace-creation flow continue.
      return null;
    end if;

    return claim_row.organization_id;
  end if;

  insert into public.profiles (id, email, full_name, avatar_url)
  values (auth.uid(), user_email, user_name, user_avatar)
  on conflict (id) do update set
    email = excluded.email,
    full_name = excluded.full_name,
    avatar_url = excluded.avatar_url,
    updated_at = now();

  insert into public.organization_members (organization_id, user_id, role, status)
  values (claim_row.organization_id, auth.uid(), 'admin', 'active')
  on conflict (organization_id, user_id) do update set
    role = 'admin',
    status = 'active',
    disabled_at = null,
    updated_at = now();

  update public.bootstrap_admin_claims
  set claimed_by = auth.uid(), claimed_at = now()
  where id = claim_row.id;

  insert into public.audit_events (organization_id, actor_user_id, actor_role, event_type, entity_type, entity_id, entity_label, action, after_data)
  values (claim_row.organization_id, auth.uid(), 'admin', 'auth', 'organization', claim_row.organization_id, 'Bootstrap admin claim', 'claim_admin', jsonb_build_object('email', user_email));

  return claim_row.organization_id;
end;
$$;

create or replace function public.accept_workspace_invite(p_token text)
returns uuid
language plpgsql
security definer
set search_path = ''
as $$
declare
  token_digest text := encode(extensions.digest(coalesce(p_token, ''), 'sha256'), 'hex');
  invite_row public.organization_invites%rowtype;
  user_email text;
  user_name text := coalesce(auth.jwt() -> 'user_metadata' ->> 'full_name', auth.jwt() -> 'user_metadata' ->> 'name');
  user_avatar text := auth.jwt() -> 'user_metadata' ->> 'avatar_url';
begin
  if auth.uid() is null then
    raise exception 'Not authenticated';
  end if;

  select lower(nullif(trim(ai.identity_data ->> 'email'), ''))
  into user_email
  from auth.identities ai
  join auth.users u on u.id = ai.user_id
  where ai.user_id = auth.uid()
    and ai.provider = 'google'
    and lower(nullif(trim(ai.identity_data ->> 'email'), '')) = lower(nullif(trim(u.email), ''))
  order by ai.created_at asc
  limit 1;

  if nullif(user_email, '') is null then
    raise exception 'Verified Google email required';
  end if;

  user_name := coalesce(user_name, user_email);

  select oi.* into invite_row
  from public.organization_invites oi
  join public.organizations o
    on o.id = oi.organization_id
   and o.archived_at is null
  where oi.token_hash = token_digest
  for update of oi;

  if not found then
    raise exception 'Invalid invite code';
  end if;

  if invite_row.revoked_at is not null or invite_row.expires_at < now() or invite_row.use_count >= invite_row.max_uses then
    raise exception 'Invite is no longer valid';
  end if;

  if invite_row.email is not null and lower(invite_row.email) <> user_email then
    raise exception 'This invite is for a different email address';
  end if;

  insert into public.profiles (id, email, full_name, avatar_url)
  values (auth.uid(), user_email, user_name, user_avatar)
  on conflict (id) do update set
    email = excluded.email,
    full_name = coalesce(public.profiles.full_name, excluded.full_name),
    avatar_url = coalesce(excluded.avatar_url, public.profiles.avatar_url),
    updated_at = now();

  insert into public.organization_members (organization_id, user_id, role, status, invited_by, accepted_at, disabled_at, last_accessed_at)
  values (invite_row.organization_id, auth.uid(), invite_row.role, 'active', invite_row.created_by, now(), null, now())
  on conflict (organization_id, user_id) do update set
    role = excluded.role,
    status = 'active',
    accepted_at = coalesce(public.organization_members.accepted_at, now()),
    disabled_at = null,
    last_accessed_at = now(),
    updated_at = now();

  update public.organization_invites
  set use_count = use_count + 1,
      accepted_by = auth.uid(),
      accepted_at = coalesce(accepted_at, now()),
      updated_at = now()
  where id = invite_row.id;

  insert into public.user_workspace_preferences (user_id, last_organization_id)
  values (auth.uid(), invite_row.organization_id)
  on conflict (user_id) do update set last_organization_id = excluded.last_organization_id, updated_at = now();

  insert into public.audit_events (organization_id, actor_user_id, actor_role, event_type, entity_type, entity_id, entity_label, action, after_data)
  values (invite_row.organization_id, auth.uid(), invite_row.role::text, 'workspace', 'organization_member', auth.uid(), user_email, 'accept_invite', jsonb_build_object('email', user_email, 'role', invite_row.role));

  return invite_row.organization_id;
end;
$$;

revoke all on function public.claim_bootstrap_admin() from public, anon;
revoke all on function public.accept_workspace_invite(text) from public, anon;
grant execute on function public.claim_bootstrap_admin() to authenticated;
grant execute on function public.accept_workspace_invite(text) to authenticated;

-- Fail closed if historical data already violates tenant boundaries. Silently
-- attaching constraints to corrupt data would leave SECURITY DEFINER reads and
-- stock mutations exposed until that data happened to be edited.
do $$
begin
  if exists (
    select 1
    from public.supplier_contacts sc
    left join public.suppliers s on s.id = sc.supplier_id and s.organization_id = sc.organization_id
    where s.id is null
  ) or exists (
    select 1
    from public.skus s
    left join public.suppliers sup on sup.id = s.supplier_id and sup.organization_id = s.organization_id
    where s.supplier_id is not null and sup.id is null
  ) or exists (
    select 1
    from public.skus s
    left join public.sku_variation_groups svg on svg.id = s.variation_group_id and svg.organization_id = s.organization_id
    where s.variation_group_id is not null and svg.id is null
  ) or exists (
    select 1
    from public.skus s
    left join public.product_categories pc on pc.id = s.category_id and pc.organization_id = s.organization_id
    where s.category_id is not null and pc.id is null
  ) or exists (
    select 1
    from public.inventory_levels il
    left join public.skus s on s.id = il.sku_id and s.organization_id = il.organization_id
    left join public.locations l on l.id = il.location_id and l.organization_id = il.organization_id
    where s.id is null or l.id is null
  ) or exists (
    select 1
    from public.stock_movements sm
    left join public.skus s on s.id = sm.sku_id and s.organization_id = sm.organization_id
    left join public.locations l on l.id = sm.location_id and l.organization_id = sm.organization_id
    where s.id is null or l.id is null
  ) or exists (
    select 1
    from public.restock_requests rr
    left join public.skus s on s.id = rr.sku_id and s.organization_id = rr.organization_id
    left join public.locations l on l.id = rr.location_id and l.organization_id = rr.organization_id
    where s.id is null or l.id is null
  ) or exists (
    select 1
    from public.restock_request_events rre
    left join public.restock_requests rr on rr.id = rre.restock_request_id and rr.organization_id = rre.organization_id
    where rr.id is null
  ) or exists (
    select 1
    from public.partner_share_sheets pss
    left join public.partners p on p.id = pss.partner_id and p.organization_id = pss.organization_id
    left join public.locations l on l.id = pss.location_id and l.organization_id = pss.organization_id
    where p.id is null or l.id is null
  ) or exists (
    select 1
    from public.partner_share_items psi
    left join public.partner_share_sheets pss
      on pss.id = psi.sheet_id
     and pss.organization_id = psi.organization_id
     and pss.location_id = psi.location_id
    left join public.skus s on s.id = psi.sku_id and s.organization_id = psi.organization_id
    left join public.locations l on l.id = psi.location_id and l.organization_id = psi.organization_id
    where pss.id is null or s.id is null or l.id is null
  ) then
    raise exception 'Cross-tenant relationship data exists; repair it before applying tenant hardening';
  end if;
end;
$$;

create or replace function private.enforce_tenant_relationships()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  if tg_table_name = 'supplier_contacts' then
    if not exists (
      select 1 from public.suppliers s
      where s.id = new.supplier_id and s.organization_id = new.organization_id
    ) then
      raise exception using errcode = '23514', message = 'Supplier contact tenant mismatch';
    end if;
  elsif tg_table_name = 'skus' then
    if new.supplier_id is not null and not exists (
      select 1 from public.suppliers s
      where s.id = new.supplier_id and s.organization_id = new.organization_id
    ) then
      raise exception using errcode = '23514', message = 'SKU supplier tenant mismatch';
    end if;
    if new.variation_group_id is not null and not exists (
      select 1 from public.sku_variation_groups svg
      where svg.id = new.variation_group_id and svg.organization_id = new.organization_id
    ) then
      raise exception using errcode = '23514', message = 'SKU variation group tenant mismatch';
    end if;
    if new.category_id is not null and not exists (
      select 1 from public.product_categories pc
      where pc.id = new.category_id and pc.organization_id = new.organization_id
    ) then
      raise exception using errcode = '23514', message = 'SKU category tenant mismatch';
    end if;
  elsif tg_table_name = 'inventory_levels' then
    if not exists (
      select 1 from public.skus s
      where s.id = new.sku_id and s.organization_id = new.organization_id
    ) or not exists (
      select 1 from public.locations l
      where l.id = new.location_id and l.organization_id = new.organization_id
    ) then
      raise exception using errcode = '23514', message = 'Inventory tenant mismatch';
    end if;
  elsif tg_table_name = 'stock_movements' then
    if not exists (
      select 1 from public.skus s
      where s.id = new.sku_id and s.organization_id = new.organization_id
    ) or not exists (
      select 1 from public.locations l
      where l.id = new.location_id and l.organization_id = new.organization_id
    ) then
      raise exception using errcode = '23514', message = 'Stock movement tenant mismatch';
    end if;
  elsif tg_table_name = 'restock_requests' then
    if not exists (
      select 1 from public.skus s
      where s.id = new.sku_id and s.organization_id = new.organization_id
    ) or not exists (
      select 1 from public.locations l
      where l.id = new.location_id and l.organization_id = new.organization_id
    ) then
      raise exception using errcode = '23514', message = 'Restock request tenant mismatch';
    end if;
  elsif tg_table_name = 'restock_request_events' then
    if not exists (
      select 1 from public.restock_requests rr
      where rr.id = new.restock_request_id and rr.organization_id = new.organization_id
    ) then
      raise exception using errcode = '23514', message = 'Restock event tenant mismatch';
    end if;
  elsif tg_table_name = 'partner_share_sheets' then
    if not exists (
      select 1 from public.partners p
      where p.id = new.partner_id and p.organization_id = new.organization_id
    ) or not exists (
      select 1 from public.locations l
      where l.id = new.location_id and l.organization_id = new.organization_id
    ) then
      raise exception using errcode = '23514', message = 'Partner share sheet tenant mismatch';
    end if;
  elsif tg_table_name = 'partner_share_items' then
    if not exists (
      select 1 from public.partner_share_sheets pss
      where pss.id = new.sheet_id
        and pss.organization_id = new.organization_id
        and pss.location_id = new.location_id
    ) or not exists (
      select 1 from public.skus s
      where s.id = new.sku_id and s.organization_id = new.organization_id
    ) or not exists (
      select 1 from public.locations l
      where l.id = new.location_id and l.organization_id = new.organization_id
    ) then
      raise exception using errcode = '23514', message = 'Partner share item tenant mismatch';
    end if;
  end if;

  return new;
end;
$$;

revoke all on function private.enforce_tenant_relationships() from public, anon, authenticated;

drop trigger if exists enforce_supplier_contacts_tenant on public.supplier_contacts;
create trigger enforce_supplier_contacts_tenant
before insert or update of organization_id, supplier_id on public.supplier_contacts
for each row execute function private.enforce_tenant_relationships();

drop trigger if exists enforce_skus_tenant on public.skus;
create trigger enforce_skus_tenant
before insert or update of organization_id, supplier_id, variation_group_id, category_id on public.skus
for each row execute function private.enforce_tenant_relationships();

drop trigger if exists enforce_inventory_levels_tenant on public.inventory_levels;
create trigger enforce_inventory_levels_tenant
before insert or update of organization_id, sku_id, location_id on public.inventory_levels
for each row execute function private.enforce_tenant_relationships();

drop trigger if exists enforce_stock_movements_tenant on public.stock_movements;
create trigger enforce_stock_movements_tenant
before insert or update of organization_id, sku_id, location_id on public.stock_movements
for each row execute function private.enforce_tenant_relationships();

drop trigger if exists enforce_restock_requests_tenant on public.restock_requests;
create trigger enforce_restock_requests_tenant
before insert or update of organization_id, sku_id, location_id on public.restock_requests
for each row execute function private.enforce_tenant_relationships();

drop trigger if exists enforce_restock_request_events_tenant on public.restock_request_events;
create trigger enforce_restock_request_events_tenant
before insert or update of organization_id, restock_request_id on public.restock_request_events
for each row execute function private.enforce_tenant_relationships();

drop trigger if exists enforce_partner_share_sheets_tenant on public.partner_share_sheets;
create trigger enforce_partner_share_sheets_tenant
before insert or update of organization_id, partner_id, location_id on public.partner_share_sheets
for each row execute function private.enforce_tenant_relationships();

drop trigger if exists enforce_partner_share_items_tenant on public.partner_share_items;
create trigger enforce_partner_share_items_tenant
before insert or update of organization_id, sheet_id, sku_id, location_id on public.partner_share_items
for each row execute function private.enforce_tenant_relationships();

-- The public Data API may expose table DML whenever table grants and an ALL RLS
-- policy coexist. Business writes must go through audited RPCs instead.
drop policy if exists "admins can manage locations" on public.locations;
drop policy if exists "admins can manage suppliers" on public.suppliers;
drop policy if exists "admins can manage supplier contacts" on public.supplier_contacts;
drop policy if exists "admins can manage skus" on public.skus;
drop policy if exists "Admins can manage SKU variation groups" on public.sku_variation_groups;
drop policy if exists "admins can manage product categories" on public.product_categories;
drop policy if exists "admins can manage partners" on public.partners;
drop policy if exists "admins can manage partner share sheets" on public.partner_share_sheets;
drop policy if exists "admins can manage partner share items" on public.partner_share_items;
drop policy if exists "members can read partner share items" on public.partner_share_items;
drop policy if exists "admins can manage workspace invites" on public.organization_invites;

drop policy if exists "admins can read suppliers" on public.suppliers;
create policy "admins can read suppliers" on public.suppliers
for select to authenticated using (private.is_org_admin(organization_id));

drop policy if exists "admins can read supplier contacts" on public.supplier_contacts;
create policy "admins can read supplier contacts" on public.supplier_contacts
for select to authenticated using (private.is_org_admin(organization_id));

drop policy if exists "admins can read skus" on public.skus;
create policy "admins can read skus" on public.skus
for select to authenticated using (private.is_org_admin(organization_id));

drop policy if exists "admins can read SKU variation groups" on public.sku_variation_groups;
create policy "admins can read SKU variation groups" on public.sku_variation_groups
for select to authenticated using (private.is_org_admin(organization_id));

drop policy if exists "admins can read partner share items" on public.partner_share_items;
create policy "admins can read partner share items" on public.partner_share_items
for select to authenticated using (private.is_org_admin(organization_id));

revoke insert, update, delete on table
  public.locations,
  public.suppliers,
  public.supplier_contacts,
  public.skus,
  public.inventory_levels,
  public.stock_movements,
  public.audit_events,
  public.restock_requests,
  public.restock_request_events,
  public.sku_variation_groups,
  public.product_categories,
  public.partners,
  public.partner_share_sheets,
  public.partner_share_items,
  public.organization_invites
from public, anon, authenticated;

-- TRUNCATE is not covered by RLS. Remove it from every current and future
-- public table so API roles cannot bypass tenant policies or erase history.
revoke truncate on all tables in schema public from public, anon, authenticated;
alter default privileges in schema public revoke truncate on tables from public, anon, authenticated;

-- Category support changed these signatures. CREATE OR REPLACE with a changed
-- argument list created overloads, so remove the obsolete versions explicitly.
drop function if exists public.admin_create_sku(uuid, text, text, text, text, text, text, text, text, numeric, integer, integer, integer, uuid);
drop function if exists public.admin_create_sku(uuid, text, text, text, text, text, text, text, text, integer, integer, integer);
drop function if exists public.admin_update_sku(uuid, text, text, text, text, text, text, text, text, numeric, integer, integer);
drop function if exists public.admin_update_sku(uuid, text, text, text, text, text, text, text, text, integer, integer);

revoke all on function public.admin_create_sku(uuid, text, text, text, text, text, text, text, text, numeric, integer, integer, integer, uuid, text) from public, anon, authenticated;
grant execute on function public.admin_create_sku(uuid, text, text, text, text, text, text, text, text, numeric, integer, integer, integer, uuid, text) to authenticated;

create or replace function public.admin_update_sku(
  p_sku_id uuid,
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
  old_sku public.skus%rowtype;
  old_supplier public.suppliers%rowtype;
  old_category text;
  org_id uuid;
  contact_id uuid;
  actor_role text;
  v_category_id uuid;
begin
  if auth.uid() is null then raise exception 'Not authenticated'; end if;

  select * into old_sku
  from public.skus s
  where s.id = p_sku_id
    and s.is_active
    and s.archived_at is null
  for update of s;

  if not found then raise exception 'SKU not found'; end if;

  org_id := old_sku.organization_id;
  if not private.is_org_admin(org_id) then raise exception 'Admin access required'; end if;
  if nullif(trim(p_supplier_name), '') is null then raise exception 'Supplier name is required'; end if;
  if nullif(trim(p_sku_code), '') is null then raise exception 'SKU code is required'; end if;
  if nullif(trim(p_name), '') is null then raise exception 'Product name is required'; end if;
  if p_country not in ('MY', 'TH') then raise exception 'Country must be MY or TH'; end if;
  if p_low_stock_qty < 0 or p_max_stock_qty < 0 then raise exception 'Stock values cannot be negative'; end if;
  if p_price < 0 then raise exception 'Price cannot be negative'; end if;

  select * into old_supplier
  from public.suppliers sup
  where sup.id = old_sku.supplier_id
    and sup.organization_id = org_id
  for update of sup;

  if not found then raise exception 'SKU supplier tenant mismatch'; end if;

  select pc.name into old_category
  from public.product_categories pc
  where pc.id = old_sku.category_id
    and pc.organization_id = org_id;

  v_category_id := private.product_category_id_for(org_id, p_category_name);

  update public.suppliers sup
  set name = trim(p_supplier_name), updated_at = now()
  where sup.id = old_sku.supplier_id
    and sup.organization_id = org_id;

  select sc.id into contact_id
  from public.supplier_contacts sc
  where sc.supplier_id = old_sku.supplier_id
    and sc.organization_id = org_id
    and sc.is_primary
  order by sc.created_at asc
  limit 1;

  if contact_id is null then
    insert into public.supplier_contacts (supplier_id, organization_id, contact_name, country, phone_raw, whatsapp_number, is_primary)
    values (old_sku.supplier_id, org_id, nullif(trim(p_contact_name), ''), p_country, trim(p_phone_raw), trim(p_whatsapp_number), true)
    returning id into contact_id;
  else
    update public.supplier_contacts sc
    set contact_name = nullif(trim(p_contact_name), ''),
        country = p_country,
        phone_raw = trim(p_phone_raw),
        whatsapp_number = trim(p_whatsapp_number),
        updated_at = now()
    where sc.id = contact_id
      and sc.organization_id = org_id
      and sc.supplier_id = old_sku.supplier_id;
  end if;

  update public.skus s
  set sku_code = upper(trim(p_sku_code)),
      name = trim(p_name),
      variant = nullif(trim(p_variant), ''),
      price = p_price,
      low_stock_qty = p_low_stock_qty,
      max_stock_qty = p_max_stock_qty,
      category_id = v_category_id,
      updated_at = now()
  where s.id = p_sku_id
    and s.organization_id = org_id;

  actor_role := private.member_role_for(org_id);

  insert into public.audit_events (organization_id, actor_user_id, actor_role, event_type, entity_type, entity_id, entity_label, action, before_data, after_data, metadata)
  values (
    org_id, auth.uid(), actor_role, 'crud', 'sku', p_sku_id, trim(p_name), 'update_sku',
    jsonb_build_object('sku_code', old_sku.sku_code, 'name', old_sku.name, 'variant', old_sku.variant, 'price', old_sku.price, 'low_stock_qty', old_sku.low_stock_qty, 'max_stock_qty', old_sku.max_stock_qty, 'supplier_name', old_supplier.name, 'category_name', old_category),
    jsonb_build_object('sku_code', upper(trim(p_sku_code)), 'name', trim(p_name), 'variant', p_variant, 'price', p_price, 'low_stock_qty', p_low_stock_qty, 'max_stock_qty', p_max_stock_qty, 'supplier_name', trim(p_supplier_name), 'category_name', p_category_name),
    jsonb_build_object('supplier_id', old_sku.supplier_id, 'supplier_contact_id', contact_id, 'variation_group_id', old_sku.variation_group_id, 'category_id', v_category_id)
  );

  return p_sku_id;
end;
$$;

revoke all on function public.admin_update_sku(uuid, text, text, text, text, text, text, text, text, numeric, integer, integer, text) from public, anon, authenticated;
grant execute on function public.admin_update_sku(uuid, text, text, text, text, text, text, text, text, numeric, integer, integer, text) to authenticated;

create or replace function public.get_staff_inventory_overview(p_organization_id uuid)
returns table (
  sku_id uuid,
  location_id uuid,
  product_name text,
  variant text,
  sku_code text,
  photo_path text,
  price numeric,
  variation_group_id uuid,
  variation_name text,
  add_variation_images boolean,
  quantity integer,
  low_stock_qty integer,
  max_stock_qty integer,
  location_name text,
  is_low_stock boolean,
  is_out_of_stock boolean,
  category_name text
)
language sql
security definer
set search_path = ''
as $$
  select
    s.id,
    il.location_id,
    s.name,
    s.variant,
    s.sku_code,
    s.photo_path,
    s.price,
    s.variation_group_id,
    svg.variation_name,
    svg.add_variation_images,
    il.quantity,
    s.low_stock_qty,
    s.max_stock_qty,
    l.name,
    il.quantity <= s.low_stock_qty,
    il.quantity = 0,
    pc.name
  from public.inventory_levels il
  join public.skus s
    on s.id = il.sku_id
   and s.organization_id = il.organization_id
  join public.locations l
    on l.id = il.location_id
   and l.organization_id = il.organization_id
  left join public.sku_variation_groups svg
    on svg.id = s.variation_group_id
   and svg.organization_id = il.organization_id
  left join public.product_categories pc
    on pc.id = s.category_id
   and pc.organization_id = il.organization_id
  where il.organization_id = p_organization_id
    and s.is_active = true
    and s.archived_at is null
    and private.is_org_member(p_organization_id)
  order by pc.name asc nulls last, coalesce(svg.product_name, s.name) asc, s.variant asc nulls first;
$$;

create or replace function public.get_admin_inventory_overview(p_organization_id uuid)
returns table (
  sku_id uuid,
  location_id uuid,
  product_name text,
  variant text,
  sku_code text,
  photo_path text,
  price numeric,
  variation_group_id uuid,
  variation_name text,
  add_variation_images boolean,
  quantity integer,
  low_stock_qty integer,
  max_stock_qty integer,
  location_name text,
  is_low_stock boolean,
  is_out_of_stock boolean,
  supplier_name text,
  contact_name text,
  phone_raw text,
  whatsapp_number text,
  category_name text
)
language sql
security definer
set search_path = ''
as $$
  select
    s.id,
    il.location_id,
    s.name,
    s.variant,
    s.sku_code,
    s.photo_path,
    s.price,
    s.variation_group_id,
    svg.variation_name,
    svg.add_variation_images,
    il.quantity,
    s.low_stock_qty,
    s.max_stock_qty,
    l.name,
    il.quantity <= s.low_stock_qty,
    il.quantity = 0,
    sup.name,
    sc.contact_name,
    sc.phone_raw,
    sc.whatsapp_number,
    pc.name
  from public.inventory_levels il
  join public.skus s
    on s.id = il.sku_id
   and s.organization_id = il.organization_id
  join public.locations l
    on l.id = il.location_id
   and l.organization_id = il.organization_id
  left join public.sku_variation_groups svg
    on svg.id = s.variation_group_id
   and svg.organization_id = il.organization_id
  left join public.suppliers sup
    on sup.id = s.supplier_id
   and sup.organization_id = il.organization_id
  left join public.supplier_contacts sc
    on sc.supplier_id = sup.id
   and sc.organization_id = il.organization_id
   and sc.is_primary = true
  left join public.product_categories pc
    on pc.id = s.category_id
   and pc.organization_id = il.organization_id
  where il.organization_id = p_organization_id
    and s.is_active = true
    and s.archived_at is null
    and private.is_org_admin(p_organization_id)
  order by pc.name asc nulls last, coalesce(svg.product_name, s.name) asc, s.variant asc nulls first;
$$;

create or replace function public.get_admin_sku_manager_rows(p_organization_id uuid)
returns table (
  sku_id uuid,
  location_id uuid,
  product_name text,
  variant text,
  sku_code text,
  photo_path text,
  price numeric,
  variation_group_id uuid,
  variation_name text,
  add_variation_images boolean,
  quantity integer,
  low_stock_qty integer,
  max_stock_qty integer,
  supplier_name text,
  contact_name text,
  country text,
  phone_raw text,
  whatsapp_number text,
  category_name text
)
language sql
security definer
set search_path = ''
as $$
  select
    s.id,
    il.location_id,
    s.name,
    s.variant,
    s.sku_code,
    s.photo_path,
    s.price,
    s.variation_group_id,
    svg.variation_name,
    svg.add_variation_images,
    il.quantity,
    s.low_stock_qty,
    s.max_stock_qty,
    sup.name,
    sc.contact_name,
    sc.country,
    sc.phone_raw,
    sc.whatsapp_number,
    pc.name
  from public.skus s
  join public.inventory_levels il
    on il.sku_id = s.id
   and il.organization_id = s.organization_id
  join public.locations l
    on l.id = il.location_id
   and l.organization_id = s.organization_id
  left join public.sku_variation_groups svg
    on svg.id = s.variation_group_id
   and svg.organization_id = s.organization_id
  left join public.suppliers sup
    on sup.id = s.supplier_id
   and sup.organization_id = s.organization_id
  left join public.supplier_contacts sc
    on sc.supplier_id = sup.id
   and sc.organization_id = s.organization_id
   and sc.is_primary
  left join public.product_categories pc
    on pc.id = s.category_id
   and pc.organization_id = s.organization_id
  where s.organization_id = p_organization_id
    and s.is_active
    and s.archived_at is null
    and private.is_org_admin(p_organization_id)
  order by coalesce(svg.created_at, s.created_at) desc, svg.variation_name nulls first, s.created_at desc;
$$;

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
  join public.skus s
    on s.id = rr.sku_id
   and s.organization_id = rr.organization_id
  join public.locations l
    on l.id = rr.location_id
   and l.organization_id = rr.organization_id
  left join public.organization_members om
    on om.organization_id = rr.organization_id
   and om.user_id = rr.requested_by
  left join public.profiles p on p.id = om.user_id
  where rr.organization_id = p_organization_id
    and rr.status in ('open', 'acknowledged', 'ordered')
    and private.is_org_admin(p_organization_id)
  order by rr.created_at desc;
$$;

revoke all on function public.get_staff_inventory_overview(uuid) from public, anon, authenticated;
revoke all on function public.get_admin_inventory_overview(uuid) from public, anon, authenticated;
revoke all on function public.get_admin_sku_manager_rows(uuid) from public, anon, authenticated;
revoke all on function public.get_admin_restock_requests(uuid) from public, anon, authenticated;
grant execute on function public.get_staff_inventory_overview(uuid) to authenticated;
grant execute on function public.get_admin_inventory_overview(uuid) to authenticated;
grant execute on function public.get_admin_sku_manager_rows(uuid) to authenticated;
grant execute on function public.get_admin_restock_requests(uuid) to authenticated;

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
      where p.organization_id = p_organization_id
        and p.archived_at is null
    ), '[]'::jsonb),
    'categories', coalesce((
      select jsonb_agg(jsonb_build_object('id', pc.id, 'name', pc.name) order by pc.name asc)
      from public.product_categories pc
      where pc.organization_id = p_organization_id
        and pc.archived_at is null
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
      join public.partners p
        on p.id = s.partner_id
       and p.organization_id = s.organization_id
      join public.locations l
        on l.id = s.location_id
       and l.organization_id = s.organization_id
      left join lateral (
        select
          count(*)::integer item_count,
          coalesce(sum(case when s.auto_sync_with_main_store then il.quantity else psi.share_qty end), 0)::integer total_share_qty
        from public.partner_share_items psi
        left join public.inventory_levels il
          on il.sku_id = psi.sku_id
         and il.location_id = psi.location_id
         and il.organization_id = psi.organization_id
        where psi.sheet_id = s.id
          and psi.organization_id = s.organization_id
          and psi.location_id = s.location_id
      ) i on true
      left join public.organization_members cpm
        on cpm.organization_id = s.organization_id
       and cpm.user_id = s.created_by
      left join public.profiles cp on cp.id = cpm.user_id
      left join public.organization_members apm
        on apm.organization_id = s.organization_id
       and apm.user_id = s.confirmed_by
      left join public.profiles ap on ap.id = apm.user_id
      left join public.organization_members spm
        on spm.organization_id = s.organization_id
       and spm.user_id = s.sent_by
      left join public.profiles sp on sp.id = spm.user_id
      left join public.organization_members opm
        on opm.organization_id = s.organization_id
       and opm.user_id = s.completed_by
      left join public.profiles op on op.id = opm.user_id
      left join public.organization_members dpm
        on dpm.organization_id = s.organization_id
       and dpm.user_id = s.stock_deducted_by
      left join public.profiles dp on dp.id = dpm.user_id
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
        'supplier_name', case when private.is_org_admin(s.organization_id) then psi.supplier_name else null end,
        'category_name', psi.category_name,
        'share_qty', psi.share_qty,
        'remark', psi.remark,
        'created_at', psi.created_at,
        'updated_at', psi.updated_at
      ) order by psi.created_at asc)
      from public.partner_share_items psi
      where psi.sheet_id = s.id
        and psi.organization_id = s.organization_id
        and psi.location_id = s.location_id
    ), '[]'::jsonb)
  )
  from public.partner_share_sheets s
  join public.partners p
    on p.id = s.partner_id
   and p.organization_id = s.organization_id
  join public.locations l
    on l.id = s.location_id
   and l.organization_id = s.organization_id
  left join public.organization_members cpm
    on cpm.organization_id = s.organization_id
   and cpm.user_id = s.created_by
  left join public.profiles cp on cp.id = cpm.user_id
  left join public.organization_members apm
    on apm.organization_id = s.organization_id
   and apm.user_id = s.confirmed_by
  left join public.profiles ap on ap.id = apm.user_id
  left join public.organization_members spm
    on spm.organization_id = s.organization_id
   and spm.user_id = s.sent_by
  left join public.profiles sp on sp.id = spm.user_id
  left join public.organization_members opm
    on opm.organization_id = s.organization_id
   and opm.user_id = s.completed_by
  left join public.profiles op on op.id = opm.user_id
  left join public.organization_members dpm
    on dpm.organization_id = s.organization_id
   and dpm.user_id = s.stock_deducted_by
  left join public.profiles dp on dp.id = dpm.user_id
  where s.id = p_sheet_id
    and private.is_org_member(s.organization_id);
$$;

revoke all on function public.get_partner_share_page_data(uuid) from public, anon, authenticated;
revoke all on function public.get_partner_share_sheet_detail(uuid) from public, anon, authenticated;
grant execute on function public.get_partner_share_page_data(uuid) to authenticated;
grant execute on function public.get_partner_share_sheet_detail(uuid) to authenticated;

create or replace function public.admin_add_partner_share_item(p_sheet_id uuid, p_sku_id uuid, p_share_qty integer, p_remark text default null)
returns uuid
language plpgsql
security definer
set search_path = ''
as $$
declare
  sheet_row public.partner_share_sheets%rowtype;
  sku_row public.skus%rowtype;
  inv_row public.inventory_levels%rowtype;
  supplier_name text;
  category_name text;
  item_id uuid;
  actor_role text;
begin
  if auth.uid() is null then raise exception 'Not authenticated'; end if;

  select * into sheet_row
  from public.partner_share_sheets pss
  where pss.id = p_sheet_id
  for update of pss;

  if not found then raise exception 'Partner share sheet not found'; end if;
  if not private.is_org_admin(sheet_row.organization_id) then raise exception 'Admin access required'; end if;
  if sheet_row.status <> 'draft' then raise exception 'Only draft sheets can add products'; end if;
  if p_share_qty <= 0 then raise exception 'Share quantity must be positive'; end if;

  select * into sku_row
  from public.skus s
  where s.id = p_sku_id
    and s.organization_id = sheet_row.organization_id
    and s.is_active
    and s.archived_at is null;

  if not found then raise exception 'SKU not found'; end if;

  select * into inv_row
  from public.inventory_levels il
  where il.organization_id = sheet_row.organization_id
    and il.sku_id = p_sku_id
    and il.location_id = sheet_row.location_id;

  if not found then raise exception 'Inventory row not found'; end if;
  if p_share_qty > inv_row.quantity then raise exception 'Share quantity cannot exceed current stock'; end if;

  select sup.name into supplier_name
  from public.suppliers sup
  where sup.id = sku_row.supplier_id
    and sup.organization_id = sheet_row.organization_id;

  select pc.name into category_name
  from public.product_categories pc
  where pc.id = sku_row.category_id
    and pc.organization_id = sheet_row.organization_id;

  insert into public.partner_share_items (organization_id, sheet_id, sku_id, location_id, product_name, variant, sku_code, current_stock_snapshot, photo_path, supplier_name, category_name, share_qty, remark, created_by, updated_by)
  values (sheet_row.organization_id, sheet_row.id, sku_row.id, sheet_row.location_id, sku_row.name, sku_row.variant, sku_row.sku_code, inv_row.quantity, sku_row.photo_path, supplier_name, category_name, p_share_qty, nullif(trim(coalesce(p_remark, '')), ''), auth.uid(), auth.uid())
  returning id into item_id;

  actor_role := private.member_role_for(sheet_row.organization_id);
  insert into public.audit_events (organization_id, actor_user_id, actor_role, event_type, entity_type, entity_id, entity_label, action, after_data, metadata)
  values (sheet_row.organization_id, auth.uid(), actor_role, 'partner_share', 'partner_share_item', item_id, sku_row.name, 'add_partner_share_item', jsonb_build_object('share_qty', p_share_qty, 'remark', p_remark), jsonb_build_object('sheet_id', sheet_row.id, 'sku_id', sku_row.id));

  return item_id;
end;
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

  select * into old_item
  from public.partner_share_items psi
  where psi.id = p_item_id
  for update of psi;

  if not found then raise exception 'Partner share item not found'; end if;

  select * into sheet_row
  from public.partner_share_sheets pss
  where pss.id = old_item.sheet_id
    and pss.organization_id = old_item.organization_id
    and pss.location_id = old_item.location_id
  for update of pss;

  if not found then raise exception 'Partner share item tenant mismatch'; end if;
  if not private.is_org_admin(sheet_row.organization_id) then raise exception 'Admin access required'; end if;
  if sheet_row.status = 'completed' then raise exception 'Completed sheets cannot be edited'; end if;
  if sheet_row.stock_deducted_at is not null then raise exception 'Stock-deducted sheets cannot be edited'; end if;
  if sheet_row.auto_sync_with_main_store then raise exception 'Disable auto-sync before editing share quantity'; end if;
  if p_share_qty <= 0 then raise exception 'Share quantity must be positive'; end if;

  select il.quantity into current_qty
  from public.inventory_levels il
  join public.skus s
    on s.id = il.sku_id
   and s.organization_id = il.organization_id
   and s.is_active
   and s.archived_at is null
  where il.organization_id = sheet_row.organization_id
    and il.sku_id = old_item.sku_id
    and il.location_id = old_item.location_id
  for update of il, s;

  if current_qty is null then raise exception 'SKU is not available or inventory row not found'; end if;
  if p_share_qty > current_qty then raise exception 'Share quantity cannot exceed current stock'; end if;

  update public.partner_share_items psi
  set share_qty = p_share_qty,
      remark = nullif(trim(coalesce(p_remark, '')), ''),
      current_stock_snapshot = current_qty,
      updated_by = auth.uid(),
      updated_at = now()
  where psi.id = p_item_id
    and psi.organization_id = sheet_row.organization_id
    and psi.sheet_id = sheet_row.id;

  update public.partner_share_sheets pss
  set updated_by = auth.uid(), updated_at = now()
  where pss.id = sheet_row.id
    and pss.organization_id = sheet_row.organization_id;

  actor_role := private.member_role_for(sheet_row.organization_id);
  insert into public.audit_events (organization_id, actor_user_id, actor_role, event_type, entity_type, entity_id, entity_label, action, before_data, after_data, metadata)
  values (sheet_row.organization_id, auth.uid(), actor_role, 'partner_share', 'partner_share_item', p_item_id, old_item.product_name, 'update_partner_share_item', to_jsonb(old_item), jsonb_build_object('share_qty', p_share_qty, 'remark', p_remark, 'current_stock_snapshot', current_qty), jsonb_build_object('sheet_id', sheet_row.id));

  return p_item_id;
end;
$$;

create or replace function public.admin_remove_partner_share_item(p_item_id uuid)
returns uuid
language plpgsql
security definer
set search_path = ''
as $$
declare
  old_item public.partner_share_items%rowtype;
  sheet_row public.partner_share_sheets%rowtype;
  actor_role text;
begin
  if auth.uid() is null then raise exception 'Not authenticated'; end if;

  select * into old_item
  from public.partner_share_items psi
  where psi.id = p_item_id
  for update of psi;

  if not found then raise exception 'Partner share item not found'; end if;

  select * into sheet_row
  from public.partner_share_sheets pss
  where pss.id = old_item.sheet_id
    and pss.organization_id = old_item.organization_id
    and pss.location_id = old_item.location_id
  for update of pss;

  if not found then raise exception 'Partner share item tenant mismatch'; end if;
  if not private.is_org_admin(sheet_row.organization_id) then raise exception 'Admin access required'; end if;
  if sheet_row.status = 'completed' then raise exception 'Completed sheets cannot be edited'; end if;
  if sheet_row.stock_deducted_at is not null then raise exception 'Stock-deducted sheets cannot be edited'; end if;

  delete from public.partner_share_items psi
  where psi.id = p_item_id
    and psi.organization_id = sheet_row.organization_id
    and psi.sheet_id = sheet_row.id;

  update public.partner_share_sheets pss
  set updated_by = auth.uid(), updated_at = now()
  where pss.id = sheet_row.id
    and pss.organization_id = sheet_row.organization_id;

  actor_role := private.member_role_for(sheet_row.organization_id);
  insert into public.audit_events (organization_id, actor_user_id, actor_role, event_type, entity_type, entity_id, entity_label, action, before_data, metadata)
  values (sheet_row.organization_id, auth.uid(), actor_role, 'partner_share', 'partner_share_item', p_item_id, old_item.product_name, 'remove_partner_share_item', to_jsonb(old_item), jsonb_build_object('sheet_id', sheet_row.id));

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

  select * into sheet_row
  from public.partner_share_sheets pss
  where pss.id = p_sheet_id
  for update of pss;

  if not found then raise exception 'Partner share sheet not found'; end if;
  if not private.is_org_admin(sheet_row.organization_id) then raise exception 'Admin access required'; end if;
  if sheet_row.status = 'completed' then raise exception 'Completed sheets cannot change auto-sync'; end if;
  if sheet_row.stock_deducted_at is not null then raise exception 'Stock-deducted sheets cannot change auto-sync'; end if;

  update public.partner_share_sheets pss
  set auto_sync_with_main_store = p_auto_sync_with_main_store,
      updated_by = auth.uid(),
      updated_at = now()
  where pss.id = p_sheet_id
    and pss.organization_id = sheet_row.organization_id;

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

create or replace function public.admin_update_partner_share_status(p_sheet_id uuid, p_status public.partner_share_status)
returns uuid
language plpgsql
security definer
set search_path = ''
as $$
declare
  old_sheet public.partner_share_sheets%rowtype;
  item_count integer;
  actor_role text;
begin
  if auth.uid() is null then raise exception 'Not authenticated'; end if;

  select * into old_sheet
  from public.partner_share_sheets pss
  where pss.id = p_sheet_id
  for update of pss;

  if not found then raise exception 'Partner share sheet not found'; end if;
  if not private.is_org_admin(old_sheet.organization_id) then raise exception 'Admin access required'; end if;
  if old_sheet.status = 'completed' and p_status <> 'completed' then raise exception 'Completed sheets cannot move backward'; end if;
  if old_sheet.stock_deducted_at is not null
     and p_status <> old_sheet.status
     and p_status <> 'completed' then
    raise exception 'Stock-deducted sheets can only be completed';
  end if;

  select count(*) into item_count
  from public.partner_share_items psi
  where psi.sheet_id = p_sheet_id
    and psi.organization_id = old_sheet.organization_id
    and psi.location_id = old_sheet.location_id;

  if p_status in ('confirmed', 'sent', 'completed') and item_count = 0 then raise exception 'Add at least one product before changing status'; end if;
  if old_sheet.stock_deducted_at is null
     and p_status in ('confirmed', 'sent', 'completed')
     and exists (
    select 1
    from public.partner_share_items psi
    left join public.skus s
      on s.id = psi.sku_id
     and s.organization_id = psi.organization_id
     and s.is_active
     and s.archived_at is null
    where psi.sheet_id = p_sheet_id
      and psi.organization_id = old_sheet.organization_id
      and psi.location_id = old_sheet.location_id
      and s.id is null
  ) then
    raise exception 'Remove archived SKUs before changing partner share status';
  end if;

  update public.partner_share_sheets pss
  set status = p_status,
      updated_by = auth.uid(),
      confirmed_by = case when p_status = 'confirmed' and confirmed_by is null then auth.uid() else confirmed_by end,
      sent_by = case when p_status = 'sent' and sent_by is null then auth.uid() else sent_by end,
      completed_by = case when p_status = 'completed' and completed_by is null then auth.uid() else completed_by end,
      confirmed_at = case when p_status = 'confirmed' and confirmed_at is null then now() else confirmed_at end,
      sent_at = case when p_status = 'sent' and sent_at is null then now() else sent_at end,
      completed_at = case when p_status = 'completed' and completed_at is null then now() else completed_at end,
      updated_at = now()
  where pss.id = p_sheet_id
    and pss.organization_id = old_sheet.organization_id;

  actor_role := private.member_role_for(old_sheet.organization_id);
  insert into public.audit_events (organization_id, actor_user_id, actor_role, event_type, entity_type, entity_id, entity_label, action, before_data, after_data)
  values (old_sheet.organization_id, auth.uid(), actor_role, 'partner_share', 'partner_share_sheet', p_sheet_id, 'Partner Share Qty', 'update_partner_share_status', jsonb_build_object('status', old_sheet.status), jsonb_build_object('status', p_status, 'approved_by', auth.uid()));

  return p_sheet_id;
end;
$$;

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

  select * into sheet_row
  from public.partner_share_sheets pss
  where pss.id = p_sheet_id;

  if not found then raise exception 'Partner share sheet not found'; end if;
  if not private.is_org_member(sheet_row.organization_id) then raise exception 'Not authorized'; end if;

  select p.name into partner_name
  from public.partners p
  where p.id = sheet_row.partner_id
    and p.organization_id = sheet_row.organization_id;

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
  effective_qty integer;
  actor_role text;
begin
  if auth.uid() is null then raise exception 'Not authenticated'; end if;

  select * into sheet_row
  from public.partner_share_sheets pss
  where pss.id = p_sheet_id
  for update of pss;

  if not found then raise exception 'Partner share sheet not found'; end if;
  if not private.is_org_admin(sheet_row.organization_id) then raise exception 'Admin access required'; end if;
  if sheet_row.status not in ('sent', 'completed') then raise exception 'Stock can only be deducted after the sheet is sent or completed'; end if;
  if sheet_row.stock_deducted_at is not null then raise exception 'Stock already deducted for this sheet'; end if;

  if exists (
    select 1
    from public.partner_share_items psi
    where psi.sheet_id = p_sheet_id
      and (psi.organization_id <> sheet_row.organization_id or psi.location_id <> sheet_row.location_id)
  ) then
    raise exception 'Partner share item tenant mismatch';
  end if;

  for item_row in
    select psi.*
    from public.partner_share_items psi
    where psi.sheet_id = p_sheet_id
      and psi.organization_id = sheet_row.organization_id
      and psi.location_id = sheet_row.location_id
    order by psi.created_at asc
  loop
    select il.quantity into inv_qty
    from public.inventory_levels il
    join public.skus sku
      on sku.id = il.sku_id
     and sku.organization_id = il.organization_id
     and sku.is_active
     and sku.archived_at is null
    join public.locations l
      on l.id = il.location_id
     and l.organization_id = il.organization_id
    where il.organization_id = sheet_row.organization_id
      and il.sku_id = item_row.sku_id
      and il.location_id = item_row.location_id
    for update of il, sku;

    if inv_qty is null then raise exception 'Inventory row not found for %', item_row.sku_code; end if;

    effective_qty := case when sheet_row.auto_sync_with_main_store then inv_qty else item_row.share_qty end;
    if effective_qty > inv_qty then raise exception 'Not enough stock for %', item_row.sku_code; end if;
  end loop;

  actor_role := private.member_role_for(sheet_row.organization_id);

  for item_row in
    select psi.*
    from public.partner_share_items psi
    where psi.sheet_id = p_sheet_id
      and psi.organization_id = sheet_row.organization_id
      and psi.location_id = sheet_row.location_id
    order by psi.created_at asc
  loop
    select il.quantity into inv_qty
    from public.inventory_levels il
    where il.organization_id = sheet_row.organization_id
      and il.sku_id = item_row.sku_id
      and il.location_id = item_row.location_id
    for update of il;

    effective_qty := case when sheet_row.auto_sync_with_main_store then inv_qty else item_row.share_qty end;

    if effective_qty > 0 then
      update public.inventory_levels il
      set quantity = inv_qty - effective_qty, updated_at = now()
      where il.organization_id = sheet_row.organization_id
        and il.sku_id = item_row.sku_id
        and il.location_id = item_row.location_id;

      insert into public.stock_movements (organization_id, sku_id, location_id, actor_user_id, movement_type, quantity_delta, quantity_before, quantity_after, reason, note)
      values (sheet_row.organization_id, item_row.sku_id, item_row.location_id, auth.uid(), 'deduct', -effective_qty, inv_qty, inv_qty - effective_qty, 'Transfer', 'Partner Share Qty');
    end if;
  end loop;

  update public.partner_share_sheets pss
  set stock_deducted_by = auth.uid(),
      stock_deducted_at = now(),
      updated_by = auth.uid(),
      updated_at = now()
  where pss.id = p_sheet_id
    and pss.organization_id = sheet_row.organization_id;

  insert into public.audit_events (organization_id, actor_user_id, actor_role, event_type, entity_type, entity_id, entity_label, action, after_data)
  values (sheet_row.organization_id, auth.uid(), actor_role, 'partner_share', 'partner_share_sheet', p_sheet_id, 'Partner Share Qty', 'deduct_partner_share_stock', jsonb_build_object('stock_deducted_by', auth.uid(), 'stock_deducted_at', now(), 'auto_sync_with_main_store', sheet_row.auto_sync_with_main_store));

  return p_sheet_id;
end;
$$;

revoke all on function public.admin_add_partner_share_item(uuid, uuid, integer, text) from public, anon, authenticated;
revoke all on function public.admin_update_partner_share_item(uuid, integer, text) from public, anon, authenticated;
revoke all on function public.admin_remove_partner_share_item(uuid) from public, anon, authenticated;
revoke all on function public.admin_set_partner_share_auto_sync(uuid, boolean) from public, anon, authenticated;
revoke all on function public.admin_update_partner_share_status(uuid, public.partner_share_status) from public, anon, authenticated;
revoke all on function public.admin_record_partner_share_output(uuid, text) from public, anon, authenticated;
revoke all on function public.admin_deduct_partner_share_stock(uuid) from public, anon, authenticated;
grant execute on function public.admin_add_partner_share_item(uuid, uuid, integer, text) to authenticated;
grant execute on function public.admin_update_partner_share_item(uuid, integer, text) to authenticated;
grant execute on function public.admin_remove_partner_share_item(uuid) to authenticated;
grant execute on function public.admin_set_partner_share_auto_sync(uuid, boolean) to authenticated;
grant execute on function public.admin_update_partner_share_status(uuid, public.partner_share_status) to authenticated;
grant execute on function public.admin_record_partner_share_output(uuid, text) to authenticated;
grant execute on function public.admin_deduct_partner_share_stock(uuid) to authenticated;

-- Bootstrap claims are consumed only through the hardened RPC. Do not expose
-- unclaimed email rows to any authenticated account through a direct select.
drop policy if exists "matching email can read unclaimed bootstrap claims" on public.bootstrap_admin_claims;

revoke all on function private.product_category_id_for(uuid, text) from public, anon, authenticated;

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
  clean_photo_path text := nullif(trim(coalesce(p_photo_path, '')), '');
begin
  if auth.uid() is null then raise exception 'Not authenticated'; end if;

  select * into old_sku
  from public.skus s
  where s.id = p_sku_id
    and s.is_active
    and s.archived_at is null
  for update of s;

  if not found then raise exception 'SKU not found'; end if;

  org_id := old_sku.organization_id;
  if not private.is_org_admin(org_id) then raise exception 'Admin access required'; end if;
  if clean_photo_path is not null and split_part(clean_photo_path, '/', 1) <> org_id::text then
    raise exception 'Photo path must be within organization folder';
  end if;

  update public.skus s
  set photo_path = clean_photo_path, updated_at = now()
  where s.id = p_sku_id
    and s.organization_id = org_id
    and s.is_active
    and s.archived_at is null;

  actor_role := private.member_role_for(org_id);
  insert into public.audit_events (organization_id, actor_user_id, actor_role, event_type, entity_type, entity_id, entity_label, action, before_data, after_data)
  values (
    org_id, auth.uid(), actor_role, 'crud', 'sku', p_sku_id, old_sku.name, 'update_sku_photo',
    jsonb_build_object('photo_path', old_sku.photo_path),
    jsonb_build_object('photo_path', clean_photo_path)
  );

  return p_sku_id;
end;
$$;

revoke all on function public.admin_update_sku_photo(uuid, text) from public, anon, authenticated;
grant execute on function public.admin_update_sku_photo(uuid, text) to authenticated;

-- Archiving changes the row into a state that intentionally fails the normal
-- organizations UPDATE policy's post-image check. Perform it atomically after
-- authorizing against the active pre-image and write an audit event.
create or replace function public.admin_archive_workspace(p_organization_id uuid)
returns uuid
language plpgsql
security definer
set search_path = ''
as $$
declare
  old_organization public.organizations%rowtype;
  actor_role text;
begin
  if auth.uid() is null then raise exception 'Not authenticated'; end if;

  select * into old_organization
  from public.organizations o
  where o.id = p_organization_id
    and o.archived_at is null
  for update of o;

  if not found then raise exception 'Workspace not found'; end if;
  if not private.is_org_admin(p_organization_id) then raise exception 'Admin access required'; end if;

  actor_role := private.member_role_for(p_organization_id);

  update public.organizations o
  set archived_at = now(), updated_at = now()
  where o.id = p_organization_id
    and o.archived_at is null;

  insert into public.audit_events (organization_id, actor_user_id, actor_role, event_type, entity_type, entity_id, entity_label, action, before_data, after_data)
  values (
    p_organization_id,
    auth.uid(),
    actor_role,
    'workspace',
    'organization',
    p_organization_id,
    old_organization.name,
    'archive_workspace',
    jsonb_build_object('archived_at', old_organization.archived_at),
    jsonb_build_object('archived_at', now())
  );

  return p_organization_id;
end;
$$;

revoke all on function public.admin_archive_workspace(uuid) from public, anon, authenticated;
grant execute on function public.admin_archive_workspace(uuid) to authenticated;

notify pgrst, 'reload schema';

commit;

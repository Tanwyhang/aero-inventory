-- SaaS account-seat enforcement and Aero platform administration.
--
-- The viewer role is intentionally unlimited. Admin and staff seats are
-- enforced in database triggers so service code, RPCs, and direct privileged
-- writes all share the same invariant.
alter type public.member_role add value if not exists 'viewer';

begin;

alter table public.organizations
  add column if not exists suspended_at timestamptz;

create index if not exists organizations_platform_status_idx
  on public.organizations (archived_at, suspended_at, created_at desc);

-- Platform identities and their audit history live outside the exposed public
-- schema. Workspace admins never become platform admins implicitly.
create table if not exists private.platform_admins (
  user_id uuid primary key references auth.users(id) on delete cascade,
  is_active boolean not null default true,
  granted_by uuid references auth.users(id) on delete set null,
  granted_at timestamptz not null default now(),
  revoked_by uuid references auth.users(id) on delete set null,
  revoked_at timestamptz,
  updated_at timestamptz not null default now(),
  check ((is_active and revoked_at is null) or (not is_active and revoked_at is not null))
);

create table if not exists private.platform_admin_claims (
  email text primary key check (email = lower(trim(email)) and email <> ''),
  claimed_by uuid references auth.users(id) on delete set null,
  claimed_at timestamptz,
  created_at timestamptz not null default now()
);

create table if not exists private.platform_audit_events (
  id uuid primary key default extensions.gen_random_uuid(),
  actor_user_id uuid references auth.users(id) on delete set null,
  action text not null,
  target_user_id uuid references auth.users(id) on delete set null,
  organization_id uuid references public.organizations(id) on delete set null,
  before_data jsonb,
  after_data jsonb,
  metadata jsonb,
  created_at timestamptz not null default now()
);

create index if not exists platform_audit_events_created_idx
  on private.platform_audit_events (created_at desc);

create index if not exists platform_audit_events_org_idx
  on private.platform_audit_events (organization_id, created_at desc);

create table if not exists private.user_login_activity (
  user_id uuid primary key references auth.users(id) on delete cascade,
  last_login_at timestamptz not null,
  updated_at timestamptz not null default now()
);

-- A dedicated guard row is the organization-scoped serialization lock for the
-- active-Admin invariant. Updating a membership row already holds that member
-- row, so locking the organization row from a row trigger would invert the
-- public RPC lock order. This counter provides atomic serialization without
-- that deadlock risk.
create table if not exists private.organization_admin_guards (
  organization_id uuid primary key references public.organizations(id) on delete cascade,
  active_admin_count integer not null check (active_admin_count >= 0),
  updated_at timestamptz not null default now()
);

revoke all on table private.platform_admins from public, anon, authenticated;
revoke all on table private.platform_admin_claims from public, anon, authenticated;
revoke all on table private.platform_audit_events from public, anon, authenticated;
revoke all on table private.user_login_activity from public, anon, authenticated;
revoke all on table private.organization_admin_guards from public, anon, authenticated;

create or replace function private.is_platform_admin()
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select auth.uid() is not null
    and exists (
      select 1
      from private.platform_admins pa
      where pa.user_id = auth.uid()
        and pa.is_active
        and pa.revoked_at is null
    );
$$;

revoke all on function private.is_platform_admin() from public, anon, authenticated;

create or replace function private.audit_platform_admin_registry()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  insert into private.platform_audit_events (
    actor_user_id,
    action,
    target_user_id,
    before_data,
    after_data
  )
  values (
    auth.uid(),
    case
      when tg_op = 'INSERT' then 'grant_platform_admin'
      when tg_op = 'DELETE' then 'delete_platform_admin'
      when new.is_active and not old.is_active then 'reactivate_platform_admin'
      when not new.is_active and old.is_active then 'revoke_platform_admin'
      else 'update_platform_admin'
    end,
    coalesce(new.user_id, old.user_id),
    case when tg_op = 'INSERT' then null else to_jsonb(old) end,
    case when tg_op = 'DELETE' then null else to_jsonb(new) end
  );

  if tg_op = 'DELETE' then
    return old;
  end if;

  return new;
end;
$$;

drop trigger if exists audit_platform_admin_registry on private.platform_admins;
create trigger audit_platform_admin_registry
after insert or update or delete on private.platform_admins
for each row execute function private.audit_platform_admin_registry();

drop trigger if exists touch_platform_admins_updated_at on private.platform_admins;
create trigger touch_platform_admins_updated_at
before update on private.platform_admins
for each row execute function private.touch_updated_at();

-- Only the known Aero owner email may bootstrap the first platform account.
-- If that verified Google identity already exists, activate it during rollout;
-- otherwise claim_platform_admin() completes the same flow after sign-in.
insert into private.platform_admin_claims (email)
values ('wyhang2006gt@gmail.com')
on conflict (email) do nothing;

do $$
declare
  owner_user_id uuid;
begin
  select u.id
  into owner_user_id
  from auth.users u
  join auth.identities ai
    on ai.user_id = u.id
   and ai.provider = 'google'
  where lower(nullif(trim(u.email), '')) = 'wyhang2006gt@gmail.com'
    and lower(nullif(trim(ai.identity_data ->> 'email'), '')) = lower(nullif(trim(u.email), ''))
  order by ai.created_at asc
  limit 1;

  if owner_user_id is not null then
    insert into private.platform_admins (user_id, is_active, granted_by, granted_at, revoked_by, revoked_at)
    values (owner_user_id, true, owner_user_id, now(), null, null)
    on conflict (user_id) do nothing;

    update private.platform_admin_claims
    set claimed_by = owner_user_id,
        claimed_at = coalesce(claimed_at, now())
    where email = 'wyhang2006gt@gmail.com'
      and (claimed_by is null or claimed_by = owner_user_id)
      and exists (
        select 1
        from private.platform_admins pa
        where pa.user_id = owner_user_id
          and pa.is_active
          and pa.revoked_at is null
      );
  end if;
end;
$$;

create or replace function public.claim_platform_admin()
returns boolean
language plpgsql
security definer
set search_path = ''
as $$
declare
  verified_email text;
  claim_row private.platform_admin_claims%rowtype;
  existing_is_active boolean;
begin
  if auth.uid() is null then
    raise exception 'Not authenticated';
  end if;

  select lower(nullif(trim(ai.identity_data ->> 'email'), ''))
  into verified_email
  from auth.identities ai
  join auth.users u on u.id = ai.user_id
  where ai.user_id = auth.uid()
    and ai.provider = 'google'
    and lower(nullif(trim(ai.identity_data ->> 'email'), '')) = lower(nullif(trim(u.email), ''))
  order by ai.created_at asc
  limit 1;

  if verified_email is null then
    return false;
  end if;

  select pac.*
  into claim_row
  from private.platform_admin_claims pac
  where pac.email = verified_email
    and (pac.claimed_by is null or pac.claimed_by = auth.uid())
  for update;

  if not found then
    return false;
  end if;

  select pa.is_active and pa.revoked_at is null
  into existing_is_active
  from private.platform_admins pa
  where pa.user_id = auth.uid();

  if found then
    -- A revoked bootstrap owner may only be reactivated by another active Aero
    -- Super Admin, never by replaying the one-time claim RPC. Existing active
    -- owners are a no-op, so calling this during login does not create noise.
    return existing_is_active;
  end if;

  insert into private.platform_admins (user_id, is_active, granted_by, granted_at, revoked_by, revoked_at)
  values (auth.uid(), true, auth.uid(), now(), null, null)
  on conflict (user_id) do nothing;

  update private.platform_admin_claims
  set claimed_by = auth.uid(),
      claimed_at = coalesce(claimed_at, now())
  where email = verified_email;

  insert into private.platform_audit_events (actor_user_id, action, target_user_id, metadata)
  values (auth.uid(), 'claim_platform_admin', auth.uid(), jsonb_build_object('email', verified_email));

  return true;
end;
$$;

create or replace function public.is_aero_super_admin()
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select private.is_platform_admin();
$$;

create or replace function public.record_user_login()
returns timestamptz
language plpgsql
security definer
set search_path = ''
as $$
declare
  recorded_at timestamptz := clock_timestamp();
begin
  if auth.uid() is null then
    raise exception 'Not authenticated';
  end if;

  insert into private.user_login_activity (user_id, last_login_at, updated_at)
  values (auth.uid(), recorded_at, recorded_at)
  on conflict (user_id) do update set
    last_login_at = greatest(private.user_login_activity.last_login_at, excluded.last_login_at),
    updated_at = excluded.updated_at;

  return recorded_at;
end;
$$;

-- Suspending a customer workspace is separate from archiving it. Both states
-- deny all normal tenant authorization, while platform RPCs remain available.
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
   and o.suspended_at is null
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
     and o.suspended_at is null
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
     and o.suspended_at is null
    where om.organization_id = target_org_id
      and om.user_id = auth.uid()
      and om.status = 'active'
      and om.role = 'admin'
  );
$$;

-- Operational writes are available to active Admin and Staff members only.
-- Viewer remains a tenant member for read policies and read-only RPCs, but can
-- never pass this mutation authorization boundary.
create or replace function private.is_org_operator(target_org_id uuid)
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
     and o.suspended_at is null
    where om.organization_id = target_org_id
      and om.user_id = auth.uid()
      and om.status = 'active'
      and om.role::text in ('admin', 'staff')
  );
$$;

revoke all on function private.is_org_operator(uuid) from public, anon, authenticated;

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
  if not private.is_org_operator(p_organization_id) then raise exception 'Admin or Staff access required'; end if;
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
  if not private.is_org_operator(p_organization_id) then raise exception 'Admin or Staff access required'; end if;

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
  if not private.is_org_operator(sheet_row.organization_id) then raise exception 'Admin or Staff access required'; end if;

  select p.name into partner_name
  from public.partners p
  where p.id = sheet_row.partner_id
    and p.organization_id = sheet_row.organization_id;

  actor_role := private.member_role_for(sheet_row.organization_id);
  insert into public.audit_events (
    organization_id,
    actor_user_id,
    actor_role,
    event_type,
    entity_type,
    entity_id,
    entity_label,
    action,
    after_data
  )
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

-- Existing organizations should always have an entitlement row. Defaults stay
-- at one admin and one staff seat for every new workspace.
insert into public.plan_entitlements (organization_id)
select o.id
from public.organizations o
left join public.plan_entitlements pe on pe.organization_id = o.id
where pe.organization_id is null
on conflict (organization_id) do nothing;

-- Preserve any historical accounts or unexpired invite commitments that are
-- already above the old configured limits, then enforce the reconciled values.
with seat_usage as (
  select
    o.id as organization_id,
    count(*) filter (
      where om.role = 'admin' and om.status in ('active', 'invited')
    )::integer
      + coalesce((
          select sum(greatest(oi.max_uses - oi.use_count, 0))::integer
          from public.organization_invites oi
          where oi.organization_id = o.id
            and oi.role = 'admin'
            and oi.revoked_at is null
            and oi.expires_at > now()
            and oi.use_count < oi.max_uses
        ), 0) as admin_seats,
    count(*) filter (
      where om.role = 'staff' and om.status in ('active', 'invited')
    )::integer
      + coalesce((
          select sum(greatest(oi.max_uses - oi.use_count, 0))::integer
          from public.organization_invites oi
          where oi.organization_id = o.id
            and oi.role = 'staff'
            and oi.revoked_at is null
            and oi.expires_at > now()
            and oi.use_count < oi.max_uses
        ), 0) as staff_seats
  from public.organizations o
  left join public.organization_members om on om.organization_id = o.id
  group by o.id
), changed as (
  update public.plan_entitlements pe
  set admin_limit = greatest(pe.admin_limit, su.admin_seats, 1),
      staff_limit = greatest(pe.staff_limit, su.staff_seats, 0),
      updated_at = now()
  from seat_usage su
  where pe.organization_id = su.organization_id
    and (pe.admin_limit < su.admin_seats or pe.staff_limit < su.staff_seats)
  returning pe.organization_id, pe.admin_limit, pe.staff_limit
)
insert into private.platform_audit_events (action, organization_id, after_data, metadata)
select
  'reconcile_workspace_seat_limits',
  c.organization_id,
  jsonb_build_object('admin_limit', c.admin_limit, 'staff_limit', c.staff_limit),
  jsonb_build_object('source', 'migration')
from changed c;

insert into private.organization_admin_guards (organization_id, active_admin_count, updated_at)
select
  o.id,
  count(om.user_id) filter (
    where om.role = 'admin' and om.status = 'active'
  )::integer,
  now()
from public.organizations o
left join public.organization_members om on om.organization_id = o.id
group by o.id
on conflict (organization_id) do update set
  active_admin_count = excluded.active_admin_count,
  updated_at = excluded.updated_at;

create or replace function private.enforce_last_active_workspace_admin()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  old_is_active_admin boolean := false;
  new_is_active_admin boolean := false;
  guard_count integer;
begin
  if tg_op = 'INSERT' then
    new_is_active_admin := new.role = 'admin' and new.status = 'active';
  elsif tg_op = 'UPDATE' then
    if new.organization_id <> old.organization_id then
      raise exception 'Workspace memberships cannot be moved between organizations';
    end if;

    old_is_active_admin := old.role = 'admin' and old.status = 'active';
    new_is_active_admin := new.role = 'admin' and new.status = 'active';
  else
    old_is_active_admin := old.role = 'admin' and old.status = 'active';
  end if;

  if old_is_active_admin and not new_is_active_admin then
    -- An organization hard-delete cascades to memberships after the parent row
    -- is gone; there is no workspace invariant left to protect in that case.
    if not exists (
      select 1
      from public.organizations o
      where o.id = old.organization_id
    ) then
      return old;
    end if;

    update private.organization_admin_guards ag
    set active_admin_count = ag.active_admin_count - 1,
        updated_at = now()
    where ag.organization_id = old.organization_id
      and ag.active_admin_count > 1
    returning ag.active_admin_count into guard_count;

    if not found then
      raise exception 'Workspace must keep at least one active admin';
    end if;
  elsif new_is_active_admin and not old_is_active_admin then
    insert into private.organization_admin_guards (
      organization_id,
      active_admin_count,
      updated_at
    )
    values (new.organization_id, 1, now())
    on conflict (organization_id) do update set
      active_admin_count = private.organization_admin_guards.active_admin_count + 1,
      updated_at = now();
  end if;

  if tg_op = 'DELETE' then
    return old;
  end if;

  return new;
end;
$$;

drop trigger if exists enforce_last_active_workspace_admin on public.organization_members;
create trigger enforce_last_active_workspace_admin
after insert or update of organization_id, role, status or delete
on public.organization_members
for each row execute function private.enforce_last_active_workspace_admin();

create or replace function private.enforce_organization_member_seat_limit()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  admin_limit_value integer;
  staff_limit_value integer;
  occupied_count integer;
  reserved_count integer;
  role_limit integer;
  role_label text := initcap(new.role::text);
begin
  -- BEFORE INSERT runs before ON CONFLICT resolution. An existing membership
  -- means the prospective INSERT will not be stored; its actual DO UPDATE path
  -- fires this trigger again with OLD available and is validated normally.
  -- A plain duplicate INSERT still fails at the primary key constraint.
  if tg_op = 'INSERT' and exists (
    select 1
    from public.organization_members om
    where om.organization_id = new.organization_id
      and om.user_id = new.user_id
  ) then
    return new;
  end if;

  if new.status not in ('active', 'invited') then
    return new;
  end if;

  if not exists (
    select 1
    from public.organizations o
    where o.id = new.organization_id
      and o.archived_at is null
      and o.suspended_at is null
  ) then
    raise exception 'Workspace is unavailable or suspended';
  end if;

  -- Viewer seats are deliberately unlimited.
  if new.role::text not in ('admin', 'staff') then
    return new;
  end if;

  insert into public.plan_entitlements (organization_id)
  values (new.organization_id)
  on conflict (organization_id) do nothing;

  select pe.admin_limit, pe.staff_limit
  into admin_limit_value, staff_limit_value
  from public.plan_entitlements pe
  where pe.organization_id = new.organization_id
  for update;

  role_limit := case when new.role = 'admin' then admin_limit_value else staff_limit_value end;

  if tg_op = 'UPDATE' then
    select count(*)::integer
    into occupied_count
    from public.organization_members om
    where om.organization_id = new.organization_id
      and om.role = new.role
      and om.status in ('active', 'invited')
      and not (
        om.organization_id = old.organization_id
        and om.user_id = old.user_id
      );
  else
    select count(*)::integer
    into occupied_count
    from public.organization_members om
    where om.organization_id = new.organization_id
      and om.role = new.role
      and om.status in ('active', 'invited');
  end if;

  select coalesce(sum(greatest(oi.max_uses - oi.use_count, 0)), 0)::integer
  into reserved_count
  from public.organization_invites oi
  where oi.organization_id = new.organization_id
    and oi.role = new.role
    and oi.revoked_at is null
    and oi.expires_at > now()
    and oi.use_count < oi.max_uses;

  if occupied_count + reserved_count + 1 > role_limit then
    raise exception '% login limit reached for this workspace (%/% seats used or reserved)',
      role_label,
      occupied_count + reserved_count,
      role_limit;
  end if;

  return new;
end;
$$;

drop trigger if exists enforce_organization_member_seat_limit on public.organization_members;
create trigger enforce_organization_member_seat_limit
before insert or update of organization_id, user_id, role, status
on public.organization_members
for each row execute function private.enforce_organization_member_seat_limit();

create or replace function private.enforce_organization_invite_seat_limit()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  admin_limit_value integer;
  staff_limit_value integer;
  occupied_count integer;
  other_reserved_count integer;
  new_reservation_count integer := 0;
  role_limit integer;
  role_label text := initcap(new.role::text);
begin
  if new.revoked_at is null
     and new.expires_at > now()
     and new.use_count < new.max_uses then
    new_reservation_count := greatest(new.max_uses - new.use_count, 0);
  end if;

  if new_reservation_count = 0 or new.role::text not in ('admin', 'staff') then
    return new;
  end if;

  if not exists (
    select 1
    from public.organizations o
    where o.id = new.organization_id
      and o.archived_at is null
      and o.suspended_at is null
  ) then
    raise exception 'Workspace is unavailable or suspended';
  end if;

  insert into public.plan_entitlements (organization_id)
  values (new.organization_id)
  on conflict (organization_id) do nothing;

  select pe.admin_limit, pe.staff_limit
  into admin_limit_value, staff_limit_value
  from public.plan_entitlements pe
  where pe.organization_id = new.organization_id
  for update;

  role_limit := case when new.role = 'admin' then admin_limit_value else staff_limit_value end;

  select count(*)::integer
  into occupied_count
  from public.organization_members om
  where om.organization_id = new.organization_id
    and om.role = new.role
    and om.status in ('active', 'invited');

  if tg_op = 'UPDATE' then
    select coalesce(sum(greatest(oi.max_uses - oi.use_count, 0)), 0)::integer
    into other_reserved_count
    from public.organization_invites oi
    where oi.organization_id = new.organization_id
      and oi.role = new.role
      and oi.revoked_at is null
      and oi.expires_at > now()
      and oi.use_count < oi.max_uses
      and oi.id <> old.id;
  else
    select coalesce(sum(greatest(oi.max_uses - oi.use_count, 0)), 0)::integer
    into other_reserved_count
    from public.organization_invites oi
    where oi.organization_id = new.organization_id
      and oi.role = new.role
      and oi.revoked_at is null
      and oi.expires_at > now()
      and oi.use_count < oi.max_uses;
  end if;

  if new.email is not null and exists (
    select 1
    from public.organization_invites oi
    where oi.organization_id = new.organization_id
      and lower(oi.email) = lower(new.email)
      and oi.revoked_at is null
      and oi.expires_at > now()
      and oi.use_count < oi.max_uses
      and (tg_op <> 'UPDATE' or oi.id <> new.id)
  ) then
    raise exception 'An active invite already exists for this email';
  end if;

  if occupied_count + other_reserved_count + new_reservation_count > role_limit then
    raise exception '% login limit reached for this workspace (%/% seats used or reserved)',
      role_label,
      occupied_count + other_reserved_count,
      role_limit;
  end if;

  return new;
end;
$$;

drop trigger if exists enforce_organization_invite_seat_limit on public.organization_invites;
create trigger enforce_organization_invite_seat_limit
before insert or update of organization_id, email, role, max_uses, use_count, expires_at, revoked_at
on public.organization_invites
for each row execute function private.enforce_organization_invite_seat_limit();

create or replace function private.enforce_plan_entitlement_seat_floor()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  admin_required integer;
  staff_required integer;
begin
  -- INSERT ... ON CONFLICT still runs BEFORE INSERT triggers. If an entitlement
  -- already exists, the prospective default row will never be stored; defer to
  -- the conflict action (whose UPDATE path is validated separately).
  if tg_op = 'INSERT' and exists (
    select 1
    from public.plan_entitlements pe
    where pe.organization_id = new.organization_id
  ) then
    return new;
  end if;

  select
    count(*) filter (where om.role = 'admin' and om.status in ('active', 'invited'))::integer
      + coalesce((
          select sum(greatest(oi.max_uses - oi.use_count, 0))::integer
          from public.organization_invites oi
          where oi.organization_id = new.organization_id
            and oi.role = 'admin'
            and oi.revoked_at is null
            and oi.expires_at > now()
            and oi.use_count < oi.max_uses
        ), 0),
    count(*) filter (where om.role = 'staff' and om.status in ('active', 'invited'))::integer
      + coalesce((
          select sum(greatest(oi.max_uses - oi.use_count, 0))::integer
          from public.organization_invites oi
          where oi.organization_id = new.organization_id
            and oi.role = 'staff'
            and oi.revoked_at is null
            and oi.expires_at > now()
            and oi.use_count < oi.max_uses
        ), 0)
  into admin_required, staff_required
  from public.organization_members om
  where om.organization_id = new.organization_id;

  if new.admin_limit < coalesce(admin_required, 0) then
    raise exception 'Admin login limit cannot be below current usage (% seats used or reserved)', admin_required;
  end if;

  if new.staff_limit < coalesce(staff_required, 0) then
    raise exception 'Staff login limit cannot be below current usage (% seats used or reserved)', staff_required;
  end if;

  return new;
end;
$$;

drop trigger if exists enforce_plan_entitlement_seat_floor on public.plan_entitlements;
create trigger enforce_plan_entitlement_seat_floor
before insert or update of admin_limit, staff_limit
on public.plan_entitlements
for each row execute function private.enforce_plan_entitlement_seat_floor();

-- Serialize all Admin role changes on the workspace row before reading or
-- locking a member. This makes the last-admin check safe when two Admins try to
-- demote themselves (or each other) at the same time. The later member trigger
-- acquires the entitlement lock, preserving organization -> member ->
-- entitlement lock order.
create or replace function public.admin_update_workspace_member_role(
  p_organization_id uuid,
  p_user_id uuid,
  p_role public.member_role
)
returns uuid
language plpgsql
security definer
set search_path = ''
as $$
declare
  old_role public.member_role;
  target_status public.member_status;
  remaining_admins integer;
begin
  if auth.uid() is null then
    raise exception 'Not authenticated';
  end if;

  perform 1
  from public.organizations o
  where o.id = p_organization_id
    and o.archived_at is null
    and o.suspended_at is null
  for update;

  if not found then
    raise exception 'Workspace is unavailable or suspended';
  end if;

  -- Re-check authorization after acquiring the serialization lock. A caller
  -- who lost Admin access while waiting cannot continue with stale authority.
  if not private.is_org_admin(p_organization_id) then
    raise exception 'Admin access required';
  end if;

  select om.role, om.status
  into old_role, target_status
  from public.organization_members om
  where om.organization_id = p_organization_id
    and om.user_id = p_user_id
  for update;

  if not found then
    raise exception 'Member not found';
  end if;

  if old_role = 'admin' and target_status = 'active' and p_role <> 'admin' then
    select count(*)::integer
    into remaining_admins
    from public.organization_members om
    where om.organization_id = p_organization_id
      and om.user_id <> p_user_id
      and om.role = 'admin'
      and om.status = 'active';

    if remaining_admins = 0 then
      raise exception 'Workspace must keep at least one active admin';
    end if;
  end if;

  update public.organization_members om
  set role = p_role,
      updated_at = now()
  where om.organization_id = p_organization_id
    and om.user_id = p_user_id;

  insert into public.audit_events (
    organization_id,
    actor_user_id,
    actor_role,
    event_type,
    entity_type,
    entity_id,
    entity_label,
    action,
    before_data,
    after_data
  )
  values (
    p_organization_id,
    auth.uid(),
    'admin',
    'workspace',
    'organization_member',
    p_user_id,
    p_user_id::text,
    'update_member_role',
    jsonb_build_object('role', old_role, 'status', target_status),
    jsonb_build_object('role', p_role, 'status', target_status)
  );

  return p_user_id;
end;
$$;

create or replace function public.admin_set_workspace_member_status(
  p_organization_id uuid,
  p_user_id uuid,
  p_status public.member_status
)
returns uuid
language plpgsql
security definer
set search_path = ''
as $$
declare
  old_status public.member_status;
  target_role public.member_role;
  remaining_admins integer;
begin
  if auth.uid() is null then
    raise exception 'Not authenticated';
  end if;

  perform 1
  from public.organizations o
  where o.id = p_organization_id
    and o.archived_at is null
    and o.suspended_at is null
  for update;

  if not found then
    raise exception 'Workspace is unavailable or suspended';
  end if;

  if not private.is_org_admin(p_organization_id) then
    raise exception 'Admin access required';
  end if;

  select om.status, om.role
  into old_status, target_role
  from public.organization_members om
  where om.organization_id = p_organization_id
    and om.user_id = p_user_id
  for update;

  if not found then
    raise exception 'Member not found';
  end if;

  if target_role = 'admin' and p_status <> 'active' then
    select count(*)::integer
    into remaining_admins
    from public.organization_members om
    where om.organization_id = p_organization_id
      and om.user_id <> p_user_id
      and om.role = 'admin'
      and om.status = 'active';

    if remaining_admins = 0 then
      raise exception 'Workspace must keep at least one active admin';
    end if;
  end if;

  update public.organization_members om
  set status = p_status,
      disabled_at = case when p_status = 'disabled' then now() else null end,
      updated_at = now()
  where om.organization_id = p_organization_id
    and om.user_id = p_user_id;

  insert into public.audit_events (
    organization_id,
    actor_user_id,
    actor_role,
    event_type,
    entity_type,
    entity_id,
    entity_label,
    action,
    before_data,
    after_data
  )
  values (
    p_organization_id,
    auth.uid(),
    'admin',
    'workspace',
    'organization_member',
    p_user_id,
    p_user_id::text,
    'update_member_status',
    jsonb_build_object('status', old_status),
    jsonb_build_object('status', p_status)
  );

  return p_user_id;
end;
$$;

-- Reserve a seat when the invite is created. The invite trigger serializes the
-- check against the entitlement row, so simultaneous invitations cannot exceed
-- the configured limit.
create or replace function public.admin_invite_workspace_member(
  p_organization_id uuid,
  p_email text,
  p_role public.member_role default 'staff',
  p_expires_in_days integer default 14
)
returns table (
  invite_id uuid,
  token text,
  email text,
  role text,
  expires_at timestamptz
)
language plpgsql
security definer
set search_path = ''
as $$
declare
  raw_token text := encode(extensions.gen_random_bytes(24), 'hex');
  token_digest text := encode(extensions.digest(raw_token, 'sha256'), 'hex');
  new_id uuid;
  normalized_email text := lower(nullif(trim(p_email), ''));
  requested_role public.member_role := coalesce(p_role, 'staff');
  expiry timestamptz := now() + make_interval(days => greatest(1, least(coalesce(p_expires_in_days, 14), 90)));
begin
  if auth.uid() is null then
    raise exception 'Not authenticated';
  end if;

  -- Match the lock order used by role/status changes and invite acceptance.
  perform 1
  from public.organizations o
  where o.id = p_organization_id
    and o.archived_at is null
    and o.suspended_at is null
  for update;

  if not found then
    raise exception 'Workspace is unavailable or suspended';
  end if;

  if not private.is_org_admin(p_organization_id) then
    raise exception 'Admin access required';
  end if;

  if normalized_email is null then
    raise exception 'Email is required';
  end if;

  -- Never issue a role-changing invite to an account that is already active or
  -- pending in this workspace. Compare only a Google identity whose email is
  -- bound to auth.users.email; profile text alone is user-editable.
  if exists (
    select 1
    from public.organization_members om
    join auth.users u on u.id = om.user_id
    join auth.identities ai
      on ai.user_id = u.id
     and ai.provider = 'google'
     and lower(nullif(trim(ai.identity_data ->> 'email'), '')) = lower(nullif(trim(u.email), ''))
    where om.organization_id = p_organization_id
      and om.status in ('active', 'invited')
      and lower(nullif(trim(ai.identity_data ->> 'email'), '')) = normalized_email
  ) then
    raise exception 'This email is already an active or pending workspace member';
  end if;

  if exists (
    select 1
    from public.organization_invites oi
    where oi.organization_id = p_organization_id
      and lower(oi.email) = normalized_email
      and oi.revoked_at is null
      and oi.expires_at > now()
      and oi.use_count < oi.max_uses
  ) then
    raise exception 'An active invite already exists for this email';
  end if;

  insert into public.organization_invites (
    organization_id,
    email,
    role,
    token_hash,
    invite_token,
    expires_at,
    created_by
  )
  values (
    p_organization_id,
    normalized_email,
    requested_role,
    token_digest,
    raw_token,
    expiry,
    auth.uid()
  )
  returning id into new_id;

  insert into public.audit_events (
    organization_id,
    actor_user_id,
    actor_role,
    event_type,
    entity_type,
    entity_id,
    entity_label,
    action,
    after_data
  )
  values (
    p_organization_id,
    auth.uid(),
    'admin',
    'workspace',
    'organization_invite',
    new_id,
    normalized_email,
    'invite_member',
    jsonb_build_object('email', normalized_email, 'role', requested_role)
  );

  return query select new_id, raw_token, normalized_email, requested_role::text, expiry;
end;
$$;

-- Consume the reservation before inserting the active membership. If the seat
-- insert fails, the whole transaction rolls back and the invite remains valid.
create or replace function public.accept_workspace_invite(p_token text)
returns uuid
language plpgsql
security definer
set search_path = ''
as $$
declare
  token_digest text := encode(extensions.digest(coalesce(p_token, ''), 'sha256'), 'hex');
  invite_organization_id uuid;
  invite_row public.organization_invites%rowtype;
  existing_member public.organization_members%rowtype;
  member_exists boolean := false;
  remaining_admins integer;
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

  if user_email is null then
    raise exception 'Verified Google email required';
  end if;

  user_name := coalesce(user_name, user_email);

  -- Resolve the tenant without locking the invite, then acquire the shared
  -- per-workspace serialization lock before any invite/member/seat lock.
  select oi.organization_id
  into invite_organization_id
  from public.organization_invites oi
  where oi.token_hash = token_digest;

  if not found then
    raise exception 'Invalid invite code';
  end if;

  perform 1
  from public.organizations o
  where o.id = invite_organization_id
    and o.archived_at is null
    and o.suspended_at is null
  for update;

  if not found then
    raise exception 'Workspace is unavailable or suspended';
  end if;

  select oi.*
  into invite_row
  from public.organization_invites oi
  where oi.token_hash = token_digest
    and oi.organization_id = invite_organization_id
  for update of oi;

  if not found then
    raise exception 'Invalid invite code';
  end if;

  if invite_row.revoked_at is not null
     or invite_row.expires_at <= now()
     or invite_row.use_count >= invite_row.max_uses then
    raise exception 'Invite is no longer valid';
  end if;

  if invite_row.email is not null and lower(invite_row.email) <> user_email then
    raise exception 'This invite is for a different email address';
  end if;

  select om.*
  into existing_member
  from public.organization_members om
  where om.organization_id = invite_row.organization_id
    and om.user_id = auth.uid()
  for update;

  member_exists := found;

  if member_exists
     and existing_member.role = 'admin'
     and existing_member.status = 'active'
     and invite_row.role <> 'admin' then
    select count(*)::integer
    into remaining_admins
    from public.organization_members om
    where om.organization_id = invite_row.organization_id
      and om.user_id <> auth.uid()
      and om.role = 'admin'
      and om.status = 'active';

    if remaining_admins = 0 then
      raise exception 'Workspace must keep at least one active admin';
    end if;
  end if;

  insert into public.profiles (id, email, full_name, avatar_url)
  values (auth.uid(), user_email, user_name, user_avatar)
  on conflict (id) do update set
    email = excluded.email,
    full_name = coalesce(public.profiles.full_name, excluded.full_name),
    avatar_url = coalesce(excluded.avatar_url, public.profiles.avatar_url),
    updated_at = now();

  update public.organization_invites
  set use_count = use_count + 1,
      accepted_by = auth.uid(),
      accepted_at = coalesce(accepted_at, now()),
      updated_at = now()
  where id = invite_row.id;

  if member_exists then
    update public.organization_members om
    set role = invite_row.role,
        status = 'active',
        accepted_at = coalesce(om.accepted_at, now()),
        disabled_at = null,
        last_accessed_at = now(),
        updated_at = now()
    where om.organization_id = invite_row.organization_id
      and om.user_id = auth.uid();
  else
    insert into public.organization_members (
      organization_id,
      user_id,
      role,
      status,
      invited_by,
      accepted_at,
      disabled_at,
      last_accessed_at
    )
    values (
      invite_row.organization_id,
      auth.uid(),
      invite_row.role,
      'active',
      invite_row.created_by,
      now(),
      null,
      now()
    );
  end if;

  insert into public.user_workspace_preferences (user_id, last_organization_id)
  values (auth.uid(), invite_row.organization_id)
  on conflict (user_id) do update set
    last_organization_id = excluded.last_organization_id,
    updated_at = now();

  insert into public.audit_events (
    organization_id,
    actor_user_id,
    actor_role,
    event_type,
    entity_type,
    entity_id,
    entity_label,
    action,
    after_data
  )
  values (
    invite_row.organization_id,
    auth.uid(),
    invite_row.role::text,
    'workspace',
    'organization_member',
    auth.uid(),
    user_email,
    'accept_invite',
    jsonb_build_object('email', user_email, 'role', invite_row.role)
  );

  return invite_row.organization_id;
end;
$$;

-- The bootstrap RPC is called after every login. Avoid a membership UPSERT:
-- PostgreSQL runs INSERT triggers before resolving ON CONFLICT, which would
-- otherwise make seat checks observe a duplicate and could corrupt auxiliary
-- invariants. The claim row serializes first-time claims; the workspace row is
-- then locked before a single explicit membership UPDATE or INSERT.
create or replace function public.claim_bootstrap_admin()
returns uuid
language plpgsql
security definer
set search_path = ''
as $$
declare
  user_email text;
  claim_row public.bootstrap_admin_claims%rowtype;
  existing_member public.organization_members%rowtype;
  member_exists boolean := false;
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

  if user_email is null then
    raise exception 'Verified Google email required';
  end if;

  user_name := coalesce(user_name, user_email);

  select bac.*
  into claim_row
  from public.bootstrap_admin_claims bac
  join public.organizations o
    on o.id = bac.organization_id
   and o.archived_at is null
   and o.suspended_at is null
  where lower(bac.email) = user_email
    and bac.claimed_by is null
  limit 1
  for update of bac;

  if not found then
    select om.organization_id
    into claim_row.organization_id
    from public.organization_members om
    join public.organizations o
      on o.id = om.organization_id
     and o.archived_at is null
     and o.suspended_at is null
    where om.user_id = auth.uid()
      and om.status = 'active'
    order by om.created_at asc
    limit 1;

    return claim_row.organization_id;
  end if;

  perform 1
  from public.organizations o
  where o.id = claim_row.organization_id
    and o.archived_at is null
    and o.suspended_at is null
  for update;

  if not found then
    raise exception 'Workspace is unavailable or suspended';
  end if;

  insert into public.profiles (id, email, full_name, avatar_url)
  values (auth.uid(), user_email, user_name, user_avatar)
  on conflict (id) do update set
    email = excluded.email,
    full_name = excluded.full_name,
    avatar_url = excluded.avatar_url,
    updated_at = now();

  select om.*
  into existing_member
  from public.organization_members om
  where om.organization_id = claim_row.organization_id
    and om.user_id = auth.uid()
  for update;

  member_exists := found;

  if member_exists then
    update public.organization_members om
    set role = 'admin',
        status = 'active',
        disabled_at = null,
        updated_at = now()
    where om.organization_id = claim_row.organization_id
      and om.user_id = auth.uid();
  else
    insert into public.organization_members (organization_id, user_id, role, status)
    values (claim_row.organization_id, auth.uid(), 'admin', 'active');
  end if;

  update public.bootstrap_admin_claims bac
  set claimed_by = auth.uid(),
      claimed_at = now()
  where bac.id = claim_row.id;

  insert into public.audit_events (
    organization_id,
    actor_user_id,
    actor_role,
    event_type,
    entity_type,
    entity_id,
    entity_label,
    action,
    after_data
  )
  values (
    claim_row.organization_id,
    auth.uid(),
    'admin',
    'auth',
    'organization',
    claim_row.organization_id,
    'Bootstrap admin claim',
    'claim_admin',
    jsonb_build_object('email', user_email)
  );

  return claim_row.organization_id;
end;
$$;

-- Keep suspended workspaces out of normal workspace selection and update the
-- user's safe login/access activity whenever a workspace is selected.
create or replace function public.get_my_workspaces()
returns table (
  organization_id uuid,
  organization_name text,
  organization_icon text,
  organization_slug text,
  role text,
  status text,
  user_email text,
  full_name text,
  last_accessed_at timestamptz,
  is_last_workspace boolean,
  created_at timestamptz
)
language sql
security definer
set search_path = ''
as $$
  select
    o.id,
    o.name,
    o.icon,
    o.slug,
    om.role::text,
    om.status::text,
    p.email,
    p.full_name,
    om.last_accessed_at,
    coalesce(uwp.last_organization_id = o.id, false),
    om.created_at
  from public.organization_members om
  join public.organizations o
    on o.id = om.organization_id
   and o.archived_at is null
   and o.suspended_at is null
  left join public.profiles p on p.id = om.user_id
  left join public.user_workspace_preferences uwp on uwp.user_id = om.user_id
  where om.user_id = auth.uid()
    and om.status = 'active'
  order by
    coalesce(uwp.last_organization_id = o.id, false) desc,
    om.last_accessed_at desc nulls last,
    om.created_at asc;
$$;

create or replace function public.set_last_workspace(p_organization_id uuid)
returns uuid
language plpgsql
security definer
set search_path = ''
as $$
declare
  access_time timestamptz := clock_timestamp();
begin
  if auth.uid() is null then
    raise exception 'Not authenticated';
  end if;

  if not private.is_org_member(p_organization_id) then
    raise exception 'Workspace access required';
  end if;

  insert into public.user_workspace_preferences (user_id, last_organization_id)
  values (auth.uid(), p_organization_id)
  on conflict (user_id) do update set
    last_organization_id = excluded.last_organization_id,
    updated_at = now();

  update public.organization_members
  set last_accessed_at = access_time
  where organization_id = p_organization_id
    and user_id = auth.uid();

  insert into private.user_login_activity (user_id, last_login_at, updated_at)
  values (auth.uid(), access_time, access_time)
  on conflict (user_id) do update set
    last_login_at = greatest(private.user_login_activity.last_login_at, excluded.last_login_at),
    updated_at = excluded.updated_at;

  return p_organization_id;
end;
$$;

create or replace function public.get_workspace_seat_usage(p_organization_id uuid)
returns table (
  organization_id uuid,
  admin_limit integer,
  active_admin_count integer,
  invited_admin_count integer,
  reserved_admin_count integer,
  remaining_admin_count integer,
  staff_limit integer,
  active_staff_count integer,
  invited_staff_count integer,
  reserved_staff_count integer,
  remaining_staff_count integer,
  active_viewer_count integer
)
language plpgsql
security definer
set search_path = ''
as $$
begin
  if not private.is_org_member(p_organization_id) then
    raise exception 'Workspace access required';
  end if;

  return query
  with member_counts as (
    select
      count(*) filter (where om.role = 'admin' and om.status = 'active')::integer as active_admins,
      count(*) filter (where om.role = 'admin' and om.status = 'invited')::integer as invited_admins,
      count(*) filter (where om.role = 'staff' and om.status = 'active')::integer as active_staff,
      count(*) filter (where om.role = 'staff' and om.status = 'invited')::integer as invited_staff,
      count(*) filter (where om.role::text = 'viewer' and om.status = 'active')::integer as active_viewers
    from public.organization_members om
    where om.organization_id = p_organization_id
  ), invite_counts as (
    select
      coalesce(sum(greatest(oi.max_uses - oi.use_count, 0)) filter (where oi.role = 'admin'), 0)::integer as reserved_admins,
      coalesce(sum(greatest(oi.max_uses - oi.use_count, 0)) filter (where oi.role = 'staff'), 0)::integer as reserved_staff
    from public.organization_invites oi
    where oi.organization_id = p_organization_id
      and oi.revoked_at is null
      and oi.expires_at > now()
      and oi.use_count < oi.max_uses
  )
  select
    pe.organization_id,
    pe.admin_limit,
    mc.active_admins,
    mc.invited_admins,
    ic.reserved_admins,
    greatest(pe.admin_limit - mc.active_admins - mc.invited_admins - ic.reserved_admins, 0),
    pe.staff_limit,
    mc.active_staff,
    mc.invited_staff,
    ic.reserved_staff,
    greatest(pe.staff_limit - mc.active_staff - mc.invited_staff - ic.reserved_staff, 0),
    mc.active_viewers
  from public.plan_entitlements pe
  cross join member_counts mc
  cross join invite_counts ic
  where pe.organization_id = p_organization_id;
end;
$$;

create or replace function public.super_admin_list_customers()
returns table (
  organization_id uuid,
  organization_name text,
  organization_icon text,
  organization_slug text,
  status text,
  plan text,
  admin_limit integer,
  staff_limit integer,
  sku_limit integer,
  warehouse_limit integer,
  active_admin_count integer,
  invited_admin_count integer,
  reserved_admin_count integer,
  active_staff_count integer,
  invited_staff_count integer,
  reserved_staff_count integer,
  active_viewer_count integer,
  member_count integer,
  sku_count integer,
  warehouse_count integer,
  primary_admin_email text,
  primary_admin_name text,
  last_login_at timestamptz,
  created_at timestamptz,
  archived_at timestamptz
)
language plpgsql
security definer
set search_path = ''
as $$
begin
  if not private.is_platform_admin() then
    raise exception 'Aero Super Admin access required';
  end if;

  return query
  select
    o.id,
    o.name,
    o.icon,
    o.slug,
    case
      when o.archived_at is not null then 'archived'
      when o.suspended_at is not null then 'suspended'
      else 'active'
    end,
    pe.plan::text,
    pe.admin_limit,
    pe.staff_limit,
    pe.sku_limit,
    pe.location_limit,
    coalesce(mc.active_admins, 0),
    coalesce(mc.invited_admins, 0),
    coalesce(ic.reserved_admins, 0),
    coalesce(mc.active_staff, 0),
    coalesce(mc.invited_staff, 0),
    coalesce(ic.reserved_staff, 0),
    coalesce(mc.active_viewers, 0),
    coalesce(mc.active_members, 0),
    coalesce(sc.sku_total, 0),
    coalesce(lc.location_total, 0),
    primary_admin.email,
    primary_admin.full_name,
    login_activity.last_login_at,
    o.created_at,
    o.archived_at
  from public.organizations o
  join public.plan_entitlements pe on pe.organization_id = o.id
  left join lateral (
    select
      count(*) filter (where om.role = 'admin' and om.status = 'active')::integer as active_admins,
      count(*) filter (where om.role = 'admin' and om.status = 'invited')::integer as invited_admins,
      count(*) filter (where om.role = 'staff' and om.status = 'active')::integer as active_staff,
      count(*) filter (where om.role = 'staff' and om.status = 'invited')::integer as invited_staff,
      count(*) filter (where om.role::text = 'viewer' and om.status = 'active')::integer as active_viewers,
      count(*) filter (where om.status = 'active')::integer as active_members
    from public.organization_members om
    where om.organization_id = o.id
  ) mc on true
  left join lateral (
    select
      coalesce(sum(greatest(oi.max_uses - oi.use_count, 0)) filter (where oi.role = 'admin'), 0)::integer as reserved_admins,
      coalesce(sum(greatest(oi.max_uses - oi.use_count, 0)) filter (where oi.role = 'staff'), 0)::integer as reserved_staff
    from public.organization_invites oi
    where oi.organization_id = o.id
      and oi.revoked_at is null
      and oi.expires_at > now()
      and oi.use_count < oi.max_uses
  ) ic on true
  left join lateral (
    select count(*)::integer as sku_total
    from public.skus s
    where s.organization_id = o.id
      and s.is_active
      and s.archived_at is null
  ) sc on true
  left join lateral (
    select count(*)::integer as location_total
    from public.locations l
    where l.organization_id = o.id
      and l.archived_at is null
  ) lc on true
  left join lateral (
    select p.email, p.full_name
    from public.organization_members om
    left join public.profiles p on p.id = om.user_id
    where om.organization_id = o.id
      and om.role = 'admin'
      and om.status = 'active'
    order by om.created_at asc
    limit 1
  ) primary_admin on true
  left join lateral (
    select max(ula.last_login_at) as last_login_at
    from public.organization_members om
    join private.user_login_activity ula on ula.user_id = om.user_id
    where om.organization_id = o.id
      and om.status = 'active'
  ) login_activity on true
  order by o.created_at desc, o.id;
end;
$$;

create or replace function public.super_admin_update_workspace(
  p_organization_id uuid,
  p_status text default null,
  p_admin_limit integer default null,
  p_staff_limit integer default null
)
returns uuid
language plpgsql
security definer
set search_path = ''
as $$
declare
  organization_row public.organizations%rowtype;
  entitlement_row public.plan_entitlements%rowtype;
  next_status text := lower(nullif(trim(p_status), ''));
  next_admin_limit integer;
  next_staff_limit integer;
  before_state jsonb;
  after_state jsonb;
begin
  if not private.is_platform_admin() then
    raise exception 'Aero Super Admin access required';
  end if;

  if next_status is not null and next_status not in ('active', 'suspended') then
    raise exception 'Status must be active or suspended';
  end if;

  select o.*
  into organization_row
  from public.organizations o
  where o.id = p_organization_id
  for update;

  if not found then
    raise exception 'Workspace not found';
  end if;

  if organization_row.archived_at is not null then
    raise exception 'Archived workspaces cannot be changed from Aero Super Admin';
  end if;

  insert into public.plan_entitlements (organization_id)
  values (p_organization_id)
  on conflict (organization_id) do nothing;

  select pe.*
  into entitlement_row
  from public.plan_entitlements pe
  where pe.organization_id = p_organization_id
  for update;

  next_admin_limit := coalesce(p_admin_limit, entitlement_row.admin_limit);
  next_staff_limit := coalesce(p_staff_limit, entitlement_row.staff_limit);

  if next_admin_limit < 1 then
    raise exception 'Admin login limit must be at least 1';
  end if;

  if next_staff_limit < 0 then
    raise exception 'Staff login limit cannot be negative';
  end if;

  before_state := jsonb_build_object(
    'status', case when organization_row.suspended_at is null then 'active' else 'suspended' end,
    'admin_limit', entitlement_row.admin_limit,
    'staff_limit', entitlement_row.staff_limit
  );

  update public.plan_entitlements pe
  set admin_limit = next_admin_limit,
      staff_limit = next_staff_limit,
      updated_at = now()
  where pe.organization_id = p_organization_id;

  if next_status is not null then
    update public.organizations o
    set suspended_at = case when next_status = 'suspended' then now() else null end,
        updated_at = now()
    where o.id = p_organization_id;
  end if;

  after_state := jsonb_build_object(
    'status', coalesce(next_status, case when organization_row.suspended_at is null then 'active' else 'suspended' end),
    'admin_limit', next_admin_limit,
    'staff_limit', next_staff_limit
  );

  insert into private.platform_audit_events (
    actor_user_id,
    action,
    organization_id,
    before_data,
    after_data
  )
  values (
    auth.uid(),
    'update_workspace_access_and_limits',
    p_organization_id,
    before_state,
    after_state
  );

  return p_organization_id;
end;
$$;

create or replace function public.super_admin_set_platform_admin(
  p_email text,
  p_is_active boolean
)
returns uuid
language plpgsql
security definer
set search_path = ''
as $$
declare
  normalized_email text := lower(nullif(trim(p_email), ''));
  target_user_id uuid;
  active_admin_count integer;
begin
  if not private.is_platform_admin() then
    raise exception 'Aero Super Admin access required';
  end if;

  if normalized_email is null then
    raise exception 'Email is required';
  end if;

  perform pg_advisory_xact_lock(hashtextextended('aero-platform-admin-registry', 0));

  select u.id
  into target_user_id
  from auth.users u
  join auth.identities ai
    on ai.user_id = u.id
   and ai.provider = 'google'
  where lower(nullif(trim(u.email), '')) = normalized_email
    and lower(nullif(trim(ai.identity_data ->> 'email'), '')) = lower(nullif(trim(u.email), ''))
  order by ai.created_at asc
  limit 1;

  if target_user_id is null then
    raise exception 'A verified Google account with this email was not found';
  end if;

  if coalesce(p_is_active, false) then
    insert into private.platform_admins (
      user_id,
      is_active,
      granted_by,
      granted_at,
      revoked_by,
      revoked_at
    )
    values (target_user_id, true, auth.uid(), now(), null, null)
    on conflict (user_id) do update set
      is_active = true,
      granted_by = auth.uid(),
      granted_at = now(),
      revoked_by = null,
      revoked_at = null,
      updated_at = now();
  else
    select count(*)::integer
    into active_admin_count
    from private.platform_admins pa
    where pa.is_active
      and pa.revoked_at is null
      and pa.user_id <> target_user_id;

    if active_admin_count = 0 then
      raise exception 'Aero must keep at least one active Super Admin';
    end if;

    update private.platform_admins pa
    set is_active = false,
        revoked_by = auth.uid(),
        revoked_at = now(),
        updated_at = now()
    where pa.user_id = target_user_id
      and pa.is_active;

    if not found then
      raise exception 'Active Aero Super Admin not found';
    end if;
  end if;

  return target_user_id;
end;
$$;

-- Ordinary workspace admins retain only identity fields on organizations.
-- Suspension and entitlement changes are possible exclusively via audited
-- platform RPCs.
revoke update on table public.organizations from public, anon, authenticated;
grant update (name, icon, slug, default_country) on table public.organizations to authenticated;
revoke insert, update, delete on table public.plan_entitlements from public, anon, authenticated;
revoke insert, update, delete on table public.organization_members from public, anon, authenticated;

revoke all on function public.claim_platform_admin() from public, anon, authenticated;
revoke all on function public.is_aero_super_admin() from public, anon, authenticated;
revoke all on function public.record_user_login() from public, anon, authenticated;
revoke all on function public.get_workspace_seat_usage(uuid) from public, anon, authenticated;
revoke all on function public.super_admin_list_customers() from public, anon, authenticated;
revoke all on function public.super_admin_update_workspace(uuid, text, integer, integer) from public, anon, authenticated;
revoke all on function public.super_admin_set_platform_admin(text, boolean) from public, anon, authenticated;
revoke all on function public.admin_invite_workspace_member(uuid, text, public.member_role, integer) from public, anon, authenticated;
revoke all on function public.accept_workspace_invite(text) from public, anon, authenticated;
revoke all on function public.get_my_workspaces() from public, anon, authenticated;
revoke all on function public.set_last_workspace(uuid) from public, anon, authenticated;
revoke all on function public.adjust_stock(uuid, uuid, uuid, integer, text, text, integer) from public, anon, authenticated;
revoke all on function public.create_restock_request(uuid, uuid, uuid, integer, text) from public, anon, authenticated;
revoke all on function public.admin_record_partner_share_output(uuid, text) from public, anon, authenticated;
revoke all on function public.admin_update_workspace_member_role(uuid, uuid, public.member_role) from public, anon, authenticated;
revoke all on function public.admin_set_workspace_member_status(uuid, uuid, public.member_status) from public, anon, authenticated;
revoke all on function public.claim_bootstrap_admin() from public, anon, authenticated;

grant execute on function public.claim_platform_admin() to authenticated;
grant execute on function public.is_aero_super_admin() to authenticated;
grant execute on function public.record_user_login() to authenticated;
grant execute on function public.get_workspace_seat_usage(uuid) to authenticated;
grant execute on function public.super_admin_list_customers() to authenticated;
grant execute on function public.super_admin_update_workspace(uuid, text, integer, integer) to authenticated;
grant execute on function public.super_admin_set_platform_admin(text, boolean) to authenticated;
grant execute on function public.admin_invite_workspace_member(uuid, text, public.member_role, integer) to authenticated;
grant execute on function public.accept_workspace_invite(text) to authenticated;
grant execute on function public.get_my_workspaces() to authenticated;
grant execute on function public.set_last_workspace(uuid) to authenticated;
grant execute on function public.adjust_stock(uuid, uuid, uuid, integer, text, text, integer) to authenticated;
grant execute on function public.create_restock_request(uuid, uuid, uuid, integer, text) to authenticated;
grant execute on function public.admin_record_partner_share_output(uuid, text) to authenticated;
grant execute on function public.admin_update_workspace_member_role(uuid, uuid, public.member_role) to authenticated;
grant execute on function public.admin_set_workspace_member_status(uuid, uuid, public.member_status) to authenticated;
grant execute on function public.claim_bootstrap_admin() to authenticated;

notify pgrst, 'reload schema';

commit;

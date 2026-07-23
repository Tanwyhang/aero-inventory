-- Password-gated Aero Super Admin support.
--
-- These RPCs are intentionally callable only by Supabase service_role. The
-- password check lives in the Next.js server, so no anonymous/authenticated
-- client can call these functions directly from the browser.

create or replace function private.require_service_role()
returns void
language plpgsql
stable
security definer
set search_path = ''
as $$
begin
  if current_role <> 'service_role'
     and coalesce(current_setting('request.jwt.claim.role', true), '') <> 'service_role' then
    raise exception 'Service role access required';
  end if;
end;
$$;

revoke all on function private.require_service_role() from public, anon, authenticated;

create or replace function public.service_role_list_aero_customers()
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
  perform private.require_service_role();

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

create or replace function public.service_role_update_aero_customer(
  p_organization_id uuid,
  p_status text,
  p_admin_limit integer,
  p_staff_limit integer
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
  before_state jsonb;
  after_state jsonb;
begin
  perform private.require_service_role();

  if next_status is not null and next_status not in ('active', 'suspended') then
    raise exception 'Status must be active or suspended';
  end if;

  if p_admin_limit is null or p_admin_limit < 1 then
    raise exception 'Admin login limit must be at least 1';
  end if;

  if p_staff_limit is null or p_staff_limit < 0 then
    raise exception 'Staff login limit cannot be negative';
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

  before_state := jsonb_build_object(
    'status', case when organization_row.suspended_at is null then 'active' else 'suspended' end,
    'admin_limit', entitlement_row.admin_limit,
    'staff_limit', entitlement_row.staff_limit
  );

  update public.plan_entitlements pe
  set admin_limit = p_admin_limit,
      staff_limit = p_staff_limit,
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
    'admin_limit', p_admin_limit,
    'staff_limit', p_staff_limit
  );

  insert into private.platform_audit_events (
    action,
    organization_id,
    before_data,
    after_data,
    metadata
  )
  values (
    'password_update_workspace_access_and_limits',
    p_organization_id,
    before_state,
    after_state,
    jsonb_build_object('source', 'aero-admin-password')
  );

  return p_organization_id;
end;
$$;

revoke all on function public.service_role_list_aero_customers() from public, anon, authenticated;
revoke all on function public.service_role_update_aero_customer(uuid, text, integer, integer) from public, anon, authenticated;
grant execute on function public.service_role_list_aero_customers() to service_role;
grant execute on function public.service_role_update_aero_customer(uuid, text, integer, integer) to service_role;

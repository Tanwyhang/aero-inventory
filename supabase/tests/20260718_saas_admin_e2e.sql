-- Rollback-only production smoke test for Aero workspace seats, roles, tenant
-- isolation, suspension, and platform administration. This file must run only
-- after migration 20260718000300 has been applied.

begin;

set local statement_timeout = '30s';

insert into auth.users (
  id, aud, role, email, raw_app_meta_data, raw_user_meta_data,
  email_confirmed_at, created_at, updated_at, is_sso_user, is_anonymous
)
values
  ('10000000-0000-4000-8000-000000000001', 'authenticated', 'authenticated', 'aero-e2e-admin@example.invalid', '{"provider":"google","providers":["google"]}', '{"full_name":"Aero E2E Admin"}', now(), now(), now(), false, false),
  ('10000000-0000-4000-8000-000000000002', 'authenticated', 'authenticated', 'aero-e2e-staff@example.invalid', '{"provider":"google","providers":["google"]}', '{"full_name":"Aero E2E Staff"}', now(), now(), now(), false, false),
  ('10000000-0000-4000-8000-000000000003', 'authenticated', 'authenticated', 'aero-e2e-viewer@example.invalid', '{"provider":"google","providers":["google"]}', '{"full_name":"Aero E2E Viewer"}', now(), now(), now(), false, false),
  ('10000000-0000-4000-8000-000000000004', 'authenticated', 'authenticated', 'aero-e2e-outsider@example.invalid', '{"provider":"google","providers":["google"]}', '{"full_name":"Aero E2E Outsider"}', now(), now(), now(), false, false),
  ('10000000-0000-4000-8000-000000000005', 'authenticated', 'authenticated', 'aero-e2e-super@example.invalid', '{"provider":"google","providers":["google"]}', '{"full_name":"Aero E2E Super Admin"}', now(), now(), now(), false, false);

insert into auth.identities (provider_id, user_id, identity_data, provider, email, created_at, updated_at)
values
  ('aero-e2e-admin@example.invalid', '10000000-0000-4000-8000-000000000001', '{"sub":"10000000-0000-4000-8000-000000000001","email":"aero-e2e-admin@example.invalid","email_verified":true}', 'google', 'aero-e2e-admin@example.invalid', now(), now()),
  ('aero-e2e-staff@example.invalid', '10000000-0000-4000-8000-000000000002', '{"sub":"10000000-0000-4000-8000-000000000002","email":"aero-e2e-staff@example.invalid","email_verified":true}', 'google', 'aero-e2e-staff@example.invalid', now(), now()),
  ('aero-e2e-viewer@example.invalid', '10000000-0000-4000-8000-000000000003', '{"sub":"10000000-0000-4000-8000-000000000003","email":"aero-e2e-viewer@example.invalid","email_verified":true}', 'google', 'aero-e2e-viewer@example.invalid', now(), now()),
  ('aero-e2e-outsider@example.invalid', '10000000-0000-4000-8000-000000000004', '{"sub":"10000000-0000-4000-8000-000000000004","email":"aero-e2e-outsider@example.invalid","email_verified":true}', 'google', 'aero-e2e-outsider@example.invalid', now(), now()),
  ('aero-e2e-super@example.invalid', '10000000-0000-4000-8000-000000000005', '{"sub":"10000000-0000-4000-8000-000000000005","email":"aero-e2e-super@example.invalid","email_verified":true}', 'google', 'aero-e2e-super@example.invalid', now(), now());

insert into public.profiles (id, email, full_name)
values
  ('10000000-0000-4000-8000-000000000001', 'aero-e2e-admin@example.invalid', 'Aero E2E Admin'),
  ('10000000-0000-4000-8000-000000000002', 'aero-e2e-staff@example.invalid', 'Aero E2E Staff'),
  ('10000000-0000-4000-8000-000000000003', 'aero-e2e-viewer@example.invalid', 'Aero E2E Viewer'),
  ('10000000-0000-4000-8000-000000000004', 'aero-e2e-outsider@example.invalid', 'Aero E2E Outsider'),
  ('10000000-0000-4000-8000-000000000005', 'aero-e2e-super@example.invalid', 'Aero E2E Super Admin');

insert into public.organizations (id, name, icon, default_country, created_by)
values
  ('20000000-0000-4000-8000-000000000001', 'Aero E2E Workspace', 'A', 'MY', '10000000-0000-4000-8000-000000000001'),
  ('20000000-0000-4000-8000-000000000002', 'Aero E2E Other Tenant', 'B', 'MY', '10000000-0000-4000-8000-000000000004');

insert into public.plan_entitlements (organization_id, admin_limit, staff_limit)
values
  ('20000000-0000-4000-8000-000000000001', 1, 1),
  ('20000000-0000-4000-8000-000000000002', 1, 1);

insert into public.organization_members (organization_id, user_id, role, status, accepted_at)
values
  ('20000000-0000-4000-8000-000000000001', '10000000-0000-4000-8000-000000000001', 'admin', 'active', now()),
  ('20000000-0000-4000-8000-000000000001', '10000000-0000-4000-8000-000000000002', 'staff', 'active', now()),
  ('20000000-0000-4000-8000-000000000001', '10000000-0000-4000-8000-000000000003', 'viewer', 'active', now()),
  ('20000000-0000-4000-8000-000000000002', '10000000-0000-4000-8000-000000000004', 'admin', 'active', now());

insert into public.locations (id, organization_id, name, is_default)
values
  ('30000000-0000-4000-8000-000000000001', '20000000-0000-4000-8000-000000000001', 'Main Store', true),
  ('30000000-0000-4000-8000-000000000002', '20000000-0000-4000-8000-000000000002', 'Other Store', true);

insert into public.skus (id, organization_id, sku_code, name, low_stock_qty, max_stock_qty)
values ('40000000-0000-4000-8000-000000000001', '20000000-0000-4000-8000-000000000001', 'AERO-E2E-1', 'Aero E2E Product', 2, 20);

insert into public.inventory_levels (organization_id, sku_id, location_id, quantity)
values ('20000000-0000-4000-8000-000000000001', '40000000-0000-4000-8000-000000000001', '30000000-0000-4000-8000-000000000001', 5);

insert into private.platform_admins (user_id, is_active, granted_by, granted_at)
values ('10000000-0000-4000-8000-000000000005', true, '10000000-0000-4000-8000-000000000005', now());

-- Triggers must reject a second Staff seat and a direct sole-Admin demotion,
-- including writes that bypass the public RPC layer.
do $$
begin
  begin
    insert into public.organization_members (organization_id, user_id, role, status)
    values ('20000000-0000-4000-8000-000000000001', '10000000-0000-4000-8000-000000000004', 'staff', 'active');
    raise exception 'E2E_EXPECTED_STAFF_LIMIT_FAILURE';
  exception when others then
    if sqlerrm = 'E2E_EXPECTED_STAFF_LIMIT_FAILURE' then raise; end if;
    if position('Staff login limit reached' in sqlerrm) = 0 then
      raise exception 'Unexpected Staff limit error: %', sqlerrm;
    end if;
  end;

  begin
    update public.organization_members
    set role = 'viewer'
    where organization_id = '20000000-0000-4000-8000-000000000001'
      and user_id = '10000000-0000-4000-8000-000000000001';
    raise exception 'E2E_EXPECTED_LAST_ADMIN_FAILURE';
  exception when others then
    if sqlerrm = 'E2E_EXPECTED_LAST_ADMIN_FAILURE' then raise; end if;
    if position('keep at least one active admin' in lower(sqlerrm)) = 0 then
      raise exception 'Unexpected last-Admin error: %', sqlerrm;
    end if;
  end;
end;
$$;

-- A legacy/direct invite cannot be used by the sole Admin to self-demote.
insert into public.organization_invites (
  organization_id, email, role, token_hash, invite_token, expires_at, created_by
)
values (
  '20000000-0000-4000-8000-000000000001',
  'aero-e2e-admin@example.invalid',
  'viewer',
  encode(extensions.digest('aero-e2e-self-demote', 'sha256'), 'hex'),
  'aero-e2e-self-demote',
  now() + interval '1 day',
  '10000000-0000-4000-8000-000000000001'
);

select set_config('request.jwt.claim.sub', '10000000-0000-4000-8000-000000000001', true);
select set_config('request.jwt.claims', '{"sub":"10000000-0000-4000-8000-000000000001","role":"authenticated","email":"aero-e2e-admin@example.invalid","user_metadata":{"full_name":"Aero E2E Admin"}}', true);
set local role authenticated;

do $$
declare
  usage_row record;
begin
  select * into usage_row
  from public.get_workspace_seat_usage('20000000-0000-4000-8000-000000000001');

  if usage_row.active_admin_count <> 1
     or usage_row.active_staff_count <> 1
     or usage_row.active_viewer_count <> 1
     or usage_row.admin_limit <> 1
     or usage_row.staff_limit <> 1 then
    raise exception 'Workspace seat usage did not match the fixture';
  end if;

  begin
    perform public.admin_update_workspace_member_role(
      '20000000-0000-4000-8000-000000000001',
      '10000000-0000-4000-8000-000000000001',
      'viewer'
    );
    raise exception 'E2E_EXPECTED_ROLE_GUARD_FAILURE';
  exception when others then
    if sqlerrm = 'E2E_EXPECTED_ROLE_GUARD_FAILURE' then raise; end if;
    if position('keep at least one active admin' in lower(sqlerrm)) = 0 then
      raise exception 'Unexpected role guard error: %', sqlerrm;
    end if;
  end;

  begin
    perform public.admin_invite_workspace_member(
      '20000000-0000-4000-8000-000000000001',
      'aero-e2e-admin@example.invalid',
      'viewer',
      1
    );
    raise exception 'E2E_EXPECTED_EXISTING_MEMBER_FAILURE';
  exception when others then
    if sqlerrm = 'E2E_EXPECTED_EXISTING_MEMBER_FAILURE' then raise; end if;
    if position('already an active or pending workspace member' in lower(sqlerrm)) = 0 then
      raise exception 'Unexpected existing-member error: %', sqlerrm;
    end if;
  end;

  begin
    perform public.accept_workspace_invite('aero-e2e-self-demote');
    raise exception 'E2E_EXPECTED_SELF_DEMOTION_FAILURE';
  exception when others then
    if sqlerrm = 'E2E_EXPECTED_SELF_DEMOTION_FAILURE' then raise; end if;
    if position('keep at least one active admin' in lower(sqlerrm)) = 0 then
      raise exception 'Unexpected invite demotion error: %', sqlerrm;
    end if;
  end;
end;
$$;

reset role;

-- Staff can operate stock and restock within their tenant, but never across it.
select set_config('request.jwt.claim.sub', '10000000-0000-4000-8000-000000000002', true);
select set_config('request.jwt.claims', '{"sub":"10000000-0000-4000-8000-000000000002","role":"authenticated","email":"aero-e2e-staff@example.invalid","user_metadata":{"full_name":"Aero E2E Staff"}}', true);
set local role authenticated;

do $$
begin
  perform * from public.adjust_stock(
    '20000000-0000-4000-8000-000000000001',
    '40000000-0000-4000-8000-000000000001',
    '30000000-0000-4000-8000-000000000001',
    2,
    'Aero E2E staff adjustment',
    'Stock Adjustment',
    5
  );

  perform public.create_restock_request(
    '20000000-0000-4000-8000-000000000001',
    '40000000-0000-4000-8000-000000000001',
    '30000000-0000-4000-8000-000000000001',
    3,
    'Aero E2E restock'
  );

  if (select quantity from public.inventory_levels where sku_id = '40000000-0000-4000-8000-000000000001') <> 7 then
    raise exception 'Staff stock adjustment did not persist inside the test transaction';
  end if;

  begin
    perform * from public.adjust_stock(
      '20000000-0000-4000-8000-000000000002',
      '40000000-0000-4000-8000-000000000001',
      '30000000-0000-4000-8000-000000000001',
      1,
      null,
      'Stock Adjustment',
      null
    );
    raise exception 'E2E_EXPECTED_TENANT_FAILURE';
  exception when others then
    if sqlerrm = 'E2E_EXPECTED_TENANT_FAILURE' then raise; end if;
    if position('Admin or Staff access required' in sqlerrm) = 0 then
      raise exception 'Unexpected tenant-isolation error: %', sqlerrm;
    end if;
  end;

  begin
    perform * from public.super_admin_list_customers();
    raise exception 'E2E_EXPECTED_SUPER_ADMIN_FAILURE';
  exception when others then
    if sqlerrm = 'E2E_EXPECTED_SUPER_ADMIN_FAILURE' then raise; end if;
    if position('Aero Super Admin access required' in sqlerrm) = 0 then
      raise exception 'Unexpected Super Admin authorization error: %', sqlerrm;
    end if;
  end;

  perform public.record_user_login();
end;
$$;

reset role;

-- Viewer can read staff-safe inventory, but every mutation path is denied.
select set_config('request.jwt.claim.sub', '10000000-0000-4000-8000-000000000003', true);
select set_config('request.jwt.claims', '{"sub":"10000000-0000-4000-8000-000000000003","role":"authenticated","email":"aero-e2e-viewer@example.invalid","user_metadata":{"full_name":"Aero E2E Viewer"}}', true);
set local role authenticated;

do $$
declare
  visible_rows integer;
  affected_rows integer;
begin
  select count(*)::integer into visible_rows
  from public.get_staff_inventory_overview('20000000-0000-4000-8000-000000000001');

  if visible_rows <> 1 then
    raise exception 'Viewer could not read staff-safe inventory';
  end if;

  begin
    perform * from public.adjust_stock(
      '20000000-0000-4000-8000-000000000001',
      '40000000-0000-4000-8000-000000000001',
      '30000000-0000-4000-8000-000000000001',
      1,
      null,
      'Stock Adjustment',
      7
    );
    raise exception 'E2E_EXPECTED_VIEWER_STOCK_FAILURE';
  exception when others then
    if sqlerrm = 'E2E_EXPECTED_VIEWER_STOCK_FAILURE' then raise; end if;
    if position('Admin or Staff access required' in sqlerrm) = 0 then
      raise exception 'Unexpected Viewer stock error: %', sqlerrm;
    end if;
  end;

  begin
    perform public.create_restock_request(
      '20000000-0000-4000-8000-000000000001',
      '40000000-0000-4000-8000-000000000001',
      '30000000-0000-4000-8000-000000000001',
      1,
      null
    );
    raise exception 'E2E_EXPECTED_VIEWER_RESTOCK_FAILURE';
  exception when others then
    if sqlerrm = 'E2E_EXPECTED_VIEWER_RESTOCK_FAILURE' then raise; end if;
    if position('Admin or Staff access required' in sqlerrm) = 0 then
      raise exception 'Unexpected Viewer restock error: %', sqlerrm;
    end if;
  end;

  begin
    update public.skus
    set name = 'Viewer must not change this'
    where id = '40000000-0000-4000-8000-000000000001';
    get diagnostics affected_rows = row_count;
    if affected_rows <> 0 then
      raise exception 'Viewer bypassed SKU row-level security';
    end if;
  exception when insufficient_privilege then
    null;
  end;
end;
$$;

reset role;

-- Super Admin sees every workspace, edits limits, and suspends/reactivates it.
select set_config('request.jwt.claim.sub', '10000000-0000-4000-8000-000000000005', true);
select set_config('request.jwt.claims', '{"sub":"10000000-0000-4000-8000-000000000005","role":"authenticated","email":"aero-e2e-super@example.invalid","user_metadata":{"full_name":"Aero E2E Super Admin"}}', true);
set local role authenticated;

do $$
declare
  customer_row record;
begin
  if not public.is_aero_super_admin() then
    raise exception 'Platform Admin authorization was not recognized';
  end if;

  select * into customer_row
  from public.super_admin_list_customers()
  where organization_id = '20000000-0000-4000-8000-000000000001';

  if not found
     or customer_row.active_admin_count <> 1
     or customer_row.active_staff_count <> 1
     or customer_row.active_viewer_count <> 1 then
    raise exception 'Super Admin customer data did not match the fixture';
  end if;

  begin
    perform public.super_admin_update_workspace(
      '20000000-0000-4000-8000-000000000001',
      'active',
      1,
      0
    );
    raise exception 'E2E_EXPECTED_LIMIT_FLOOR_FAILURE';
  exception when others then
    if sqlerrm = 'E2E_EXPECTED_LIMIT_FLOOR_FAILURE' then raise; end if;
    if position('Staff login limit cannot be below current usage' in sqlerrm) = 0 then
      raise exception 'Unexpected limit-floor error: %', sqlerrm;
    end if;
  end;

  perform public.super_admin_update_workspace(
    '20000000-0000-4000-8000-000000000001',
    'suspended',
    1,
    2
  );

  select * into customer_row
  from public.super_admin_list_customers()
  where organization_id = '20000000-0000-4000-8000-000000000001';

  if customer_row.status <> 'suspended' or customer_row.staff_limit <> 2 then
    raise exception 'Super Admin suspension or limit update did not persist';
  end if;
end;
$$;

reset role;

-- Suspended tenants disappear from normal access and cannot mutate stock.
select set_config('request.jwt.claim.sub', '10000000-0000-4000-8000-000000000001', true);
select set_config('request.jwt.claims', '{"sub":"10000000-0000-4000-8000-000000000001","role":"authenticated","email":"aero-e2e-admin@example.invalid","user_metadata":{"full_name":"Aero E2E Admin"}}', true);
set local role authenticated;

do $$
begin
  if exists (
    select 1 from public.get_my_workspaces()
    where organization_id = '20000000-0000-4000-8000-000000000001'
  ) then
    raise exception 'Suspended workspace remained visible to its Admin';
  end if;

  begin
    perform * from public.adjust_stock(
      '20000000-0000-4000-8000-000000000001',
      '40000000-0000-4000-8000-000000000001',
      '30000000-0000-4000-8000-000000000001',
      1,
      null,
      'Stock Adjustment',
      7
    );
    raise exception 'E2E_EXPECTED_SUSPENSION_FAILURE';
  exception when others then
    if sqlerrm = 'E2E_EXPECTED_SUSPENSION_FAILURE' then raise; end if;
    if position('Admin or Staff access required' in sqlerrm) = 0 then
      raise exception 'Unexpected suspension error: %', sqlerrm;
    end if;
  end;
end;
$$;

reset role;

-- Guard state must always equal the real active-Admin count.
do $$
declare
  guard_count integer;
  actual_count integer;
begin
  select active_admin_count into guard_count
  from private.organization_admin_guards
  where organization_id = '20000000-0000-4000-8000-000000000001';

  select count(*)::integer into actual_count
  from public.organization_members
  where organization_id = '20000000-0000-4000-8000-000000000001'
    and role = 'admin'
    and status = 'active';

  if guard_count <> actual_count then
    raise exception 'Admin guard count (%) did not match active Admins (%)', guard_count, actual_count;
  end if;
end;
$$;

rollback;

select 'saas_admin_e2e_pass' as status;

-- The public RPCs already revoke EXECUTE from PUBLIC, anon, and authenticated,
-- and grant it only to service_role. That database privilege is the reliable
-- authorization boundary for PostgREST calls.
--
-- The previous helper inspected the legacy request.jwt.claim.role setting from
-- inside a SECURITY DEFINER function. Hosted PostgREST exposes the request JWT
-- as a JSON setting and the legacy lookup incorrectly rejected valid
-- service-role calls, taking the Super Admin page down.

create or replace function private.require_service_role()
returns void
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  jwt_role text := coalesce(
    nullif(current_setting('request.jwt.claims', true), '')::jsonb ->> 'role',
    nullif(current_setting('request.jwt', true), '')::jsonb ->> 'role',
    ''
  );
begin
  if jwt_role <> 'service_role' then
    raise exception 'Service role access required';
  end if;
end;
$$;

revoke all on function private.require_service_role() from public, anon, authenticated;
grant execute on function private.require_service_role() to service_role;

-- Reassert least-privilege access on the externally exposed RPCs.
revoke all on function public.service_role_list_aero_customers() from public, anon, authenticated;
revoke all on function public.service_role_update_aero_customer(uuid, text, integer, integer) from public, anon, authenticated;
grant execute on function public.service_role_list_aero_customers() to service_role;
grant execute on function public.service_role_update_aero_customer(uuid, text, integer, integer) to service_role;

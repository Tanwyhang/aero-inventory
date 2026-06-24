alter table public.organization_invites
  add column if not exists invite_token text;

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
  expiry timestamptz := now() + make_interval(days => greatest(1, least(coalesce(p_expires_in_days, 14), 90)));
begin
  if not private.is_org_admin(p_organization_id) then
    raise exception 'Admin access required';
  end if;

  if normalized_email is null then
    raise exception 'Email is required';
  end if;

  insert into public.organization_invites (organization_id, email, role, token_hash, invite_token, expires_at, created_by)
  values (p_organization_id, normalized_email, coalesce(p_role, 'staff'), token_digest, raw_token, expiry, auth.uid())
  returning id into new_id;

  insert into public.audit_events (organization_id, actor_user_id, actor_role, event_type, entity_type, entity_id, entity_label, action, after_data)
  values (p_organization_id, auth.uid(), 'admin', 'workspace', 'organization_invite', new_id, normalized_email, 'invite_member', jsonb_build_object('email', normalized_email, 'role', coalesce(p_role, 'staff')));

  return query select new_id, raw_token, normalized_email, coalesce(p_role, 'staff')::text, expiry;
end;
$$;

drop function if exists public.admin_list_workspace_invites(uuid);

create or replace function public.admin_list_workspace_invites(p_organization_id uuid)
returns table (
  id uuid,
  email text,
  role text,
  invite_token text,
  expires_at timestamptz,
  revoked_at timestamptz,
  accepted_at timestamptz,
  use_count integer,
  max_uses integer,
  created_at timestamptz
)
language sql
security definer
set search_path = ''
as $$
  select oi.id, oi.email, oi.role::text, oi.invite_token, oi.expires_at, oi.revoked_at, oi.accepted_at, oi.use_count, oi.max_uses, oi.created_at
  from public.organization_invites oi
  where oi.organization_id = p_organization_id
    and private.is_org_admin(p_organization_id)
  order by oi.created_at desc;
$$;

revoke all on function public.admin_list_workspace_invites(uuid) from public, anon;
grant execute on function public.admin_list_workspace_invites(uuid) to authenticated;

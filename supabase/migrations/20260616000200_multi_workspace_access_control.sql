alter table public.organizations
  add column if not exists slug text,
  add column if not exists created_by uuid references auth.users(id) on delete set null,
  add column if not exists archived_at timestamptz;

alter table public.organization_members
  add column if not exists invited_by uuid references auth.users(id) on delete set null,
  add column if not exists accepted_at timestamptz,
  add column if not exists disabled_at timestamptz,
  add column if not exists last_accessed_at timestamptz,
  add column if not exists updated_at timestamptz not null default now();

create unique index if not exists organizations_slug_active_uidx
  on public.organizations (lower(slug))
  where slug is not null and archived_at is null;

create index if not exists organization_members_org_role_status_idx
  on public.organization_members (organization_id, role, status);

create table if not exists public.user_workspace_preferences (
  user_id uuid primary key references auth.users(id) on delete cascade,
  last_organization_id uuid references public.organizations(id) on delete set null,
  updated_at timestamptz not null default now()
);

create table if not exists public.organization_invites (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations(id) on delete cascade,
  email text,
  role public.member_role not null default 'staff',
  token_hash text not null unique,
  max_uses integer not null default 1 check (max_uses > 0),
  use_count integer not null default 0 check (use_count >= 0),
  expires_at timestamptz not null default (now() + interval '14 days'),
  revoked_at timestamptz,
  created_by uuid references auth.users(id) on delete set null,
  accepted_by uuid references auth.users(id) on delete set null,
  accepted_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists organization_invites_org_idx on public.organization_invites (organization_id, created_at desc);
create index if not exists organization_invites_email_idx on public.organization_invites (lower(email)) where email is not null;
create index if not exists user_workspace_preferences_last_org_idx on public.user_workspace_preferences (last_organization_id);

alter table public.user_workspace_preferences enable row level security;
alter table public.organization_invites enable row level security;

drop policy if exists "users manage own workspace preference" on public.user_workspace_preferences;
create policy "users manage own workspace preference"
  on public.user_workspace_preferences
  for all
  to authenticated
  using (user_id = auth.uid())
  with check (user_id = auth.uid());

drop policy if exists "admins can read workspace invites" on public.organization_invites;
create policy "admins can read workspace invites"
  on public.organization_invites
  for select
  to authenticated
  using (private.is_org_admin(organization_id));

drop policy if exists "admins can manage workspace invites" on public.organization_invites;
create policy "admins can manage workspace invites"
  on public.organization_invites
  for all
  to authenticated
  using (private.is_org_admin(organization_id))
  with check (private.is_org_admin(organization_id));

drop trigger if exists touch_organization_members_updated_at on public.organization_members;
create trigger touch_organization_members_updated_at
  before update on public.organization_members
  for each row execute function private.touch_updated_at();

drop trigger if exists touch_user_workspace_preferences_updated_at on public.user_workspace_preferences;
create trigger touch_user_workspace_preferences_updated_at
  before update on public.user_workspace_preferences
  for each row execute function private.touch_updated_at();

drop trigger if exists touch_organization_invites_updated_at on public.organization_invites;
create trigger touch_organization_invites_updated_at
  before update on public.organization_invites
  for each row execute function private.touch_updated_at();

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
  join public.organizations o on o.id = om.organization_id
  left join public.profiles p on p.id = om.user_id
  left join public.user_workspace_preferences uwp on uwp.user_id = om.user_id
  where om.user_id = auth.uid()
    and om.status = 'active'
    and o.archived_at is null
  order by coalesce(uwp.last_organization_id = o.id, false) desc, om.last_accessed_at desc nulls last, om.created_at asc;
$$;

create or replace function public.get_my_membership()
returns table (
  organization_id uuid,
  organization_name text,
  organization_icon text,
  role text,
  user_email text,
  full_name text
)
language sql
security definer
set search_path = ''
as $$
  select w.organization_id, w.organization_name, w.organization_icon, w.role, w.user_email, w.full_name
  from public.get_my_workspaces() w
  limit 1;
$$;

create or replace function public.set_last_workspace(p_organization_id uuid)
returns uuid
language plpgsql
security definer
set search_path = ''
as $$
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
  set last_accessed_at = now()
  where organization_id = p_organization_id
    and user_id = auth.uid();

  return p_organization_id;
end;
$$;

create or replace function public.create_workspace(
  p_name text,
  p_icon text default 'Paw',
  p_default_country text default 'MY'
)
returns uuid
language plpgsql
security definer
set search_path = ''
as $$
declare
  org_id uuid;
  user_email text := lower(coalesce(auth.jwt() ->> 'email', ''));
  user_name text := coalesce(auth.jwt() -> 'user_metadata' ->> 'full_name', auth.jwt() -> 'user_metadata' ->> 'name', user_email);
  user_avatar text := auth.jwt() -> 'user_metadata' ->> 'avatar_url';
begin
  if auth.uid() is null then
    raise exception 'Not authenticated';
  end if;

  if nullif(trim(p_name), '') is null then
    raise exception 'Workspace name is required';
  end if;

  if p_default_country not in ('MY', 'TH') then
    raise exception 'Unsupported default country';
  end if;

  insert into public.profiles (id, email, full_name, avatar_url)
  values (auth.uid(), user_email, user_name, user_avatar)
  on conflict (id) do update set
    email = excluded.email,
    full_name = coalesce(public.profiles.full_name, excluded.full_name),
    avatar_url = coalesce(excluded.avatar_url, public.profiles.avatar_url),
    updated_at = now();

  insert into public.organizations (name, icon, default_country, created_by)
  values (trim(p_name), coalesce(nullif(trim(p_icon), ''), 'Paw'), p_default_country, auth.uid())
  returning id into org_id;

  insert into public.organization_members (organization_id, user_id, role, status, accepted_at, last_accessed_at)
  values (org_id, auth.uid(), 'admin', 'active', now(), now());

  insert into public.plan_entitlements (organization_id)
  values (org_id)
  on conflict (organization_id) do nothing;

  insert into public.locations (organization_id, name, is_default)
  values (org_id, 'Main Store', true);

  insert into public.user_workspace_preferences (user_id, last_organization_id)
  values (auth.uid(), org_id)
  on conflict (user_id) do update set last_organization_id = excluded.last_organization_id, updated_at = now();

  insert into public.audit_events (organization_id, actor_user_id, actor_role, event_type, entity_type, entity_id, entity_label, action, after_data)
  values (org_id, auth.uid(), 'admin', 'workspace', 'organization', org_id, trim(p_name), 'create_workspace', jsonb_build_object('name', trim(p_name)));

  return org_id;
end;
$$;

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

  insert into public.organization_invites (organization_id, email, role, token_hash, expires_at, created_by)
  values (p_organization_id, normalized_email, coalesce(p_role, 'staff'), token_digest, expiry, auth.uid())
  returning id into new_id;

  insert into public.audit_events (organization_id, actor_user_id, actor_role, event_type, entity_type, entity_id, entity_label, action, after_data)
  values (p_organization_id, auth.uid(), 'admin', 'workspace', 'organization_invite', new_id, normalized_email, 'invite_member', jsonb_build_object('email', normalized_email, 'role', coalesce(p_role, 'staff')));

  return query select new_id, raw_token, normalized_email, coalesce(p_role, 'staff')::text, expiry;
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
  user_email text := lower(coalesce(auth.jwt() ->> 'email', ''));
  user_name text := coalesce(auth.jwt() -> 'user_metadata' ->> 'full_name', auth.jwt() -> 'user_metadata' ->> 'name', user_email);
  user_avatar text := auth.jwt() -> 'user_metadata' ->> 'avatar_url';
begin
  if auth.uid() is null then
    raise exception 'Not authenticated';
  end if;

  select * into invite_row
  from public.organization_invites
  where token_hash = token_digest
  for update;

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

create or replace function public.admin_list_workspace_members(p_organization_id uuid)
returns table (
  user_id uuid,
  email text,
  full_name text,
  role text,
  status text,
  invited_by uuid,
  accepted_at timestamptz,
  disabled_at timestamptz,
  last_accessed_at timestamptz,
  created_at timestamptz
)
language sql
security definer
set search_path = ''
as $$
  select om.user_id, p.email, p.full_name, om.role::text, om.status::text, om.invited_by, om.accepted_at, om.disabled_at, om.last_accessed_at, om.created_at
  from public.organization_members om
  left join public.profiles p on p.id = om.user_id
  where om.organization_id = p_organization_id
    and private.is_org_admin(p_organization_id)
  order by om.role asc, om.created_at asc;
$$;

create or replace function public.admin_list_workspace_invites(p_organization_id uuid)
returns table (
  id uuid,
  email text,
  role text,
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
  select oi.id, oi.email, oi.role::text, oi.expires_at, oi.revoked_at, oi.accepted_at, oi.use_count, oi.max_uses, oi.created_at
  from public.organization_invites oi
  where oi.organization_id = p_organization_id
    and private.is_org_admin(p_organization_id)
  order by oi.created_at desc;
$$;

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
  remaining_admins integer;
begin
  if not private.is_org_admin(p_organization_id) then
    raise exception 'Admin access required';
  end if;

  select role into old_role
  from public.organization_members
  where organization_id = p_organization_id
    and user_id = p_user_id
    and status = 'active'
  for update;

  if not found then
    raise exception 'Member not found';
  end if;

  if old_role = 'admin' and p_role <> 'admin' then
    select count(*) into remaining_admins
    from public.organization_members
    where organization_id = p_organization_id
      and user_id <> p_user_id
      and role = 'admin'
      and status = 'active';

    if remaining_admins = 0 then
      raise exception 'Workspace must keep at least one active admin';
    end if;
  end if;

  update public.organization_members
  set role = p_role,
      updated_at = now()
  where organization_id = p_organization_id
    and user_id = p_user_id;

  insert into public.audit_events (organization_id, actor_user_id, actor_role, event_type, entity_type, entity_id, entity_label, action, before_data, after_data)
  values (p_organization_id, auth.uid(), 'admin', 'workspace', 'organization_member', p_user_id, p_user_id::text, 'update_member_role', jsonb_build_object('role', old_role), jsonb_build_object('role', p_role));

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
  if not private.is_org_admin(p_organization_id) then
    raise exception 'Admin access required';
  end if;

  select status, role into old_status, target_role
  from public.organization_members
  where organization_id = p_organization_id
    and user_id = p_user_id
  for update;

  if not found then
    raise exception 'Member not found';
  end if;

  if target_role = 'admin' and p_status <> 'active' then
    select count(*) into remaining_admins
    from public.organization_members
    where organization_id = p_organization_id
      and user_id <> p_user_id
      and role = 'admin'
      and status = 'active';

    if remaining_admins = 0 then
      raise exception 'Workspace must keep at least one active admin';
    end if;
  end if;

  update public.organization_members
  set status = p_status,
      disabled_at = case when p_status = 'disabled' then now() else null end,
      updated_at = now()
  where organization_id = p_organization_id
    and user_id = p_user_id;

  insert into public.audit_events (organization_id, actor_user_id, actor_role, event_type, entity_type, entity_id, entity_label, action, before_data, after_data)
  values (p_organization_id, auth.uid(), 'admin', 'workspace', 'organization_member', p_user_id, p_user_id::text, 'update_member_status', jsonb_build_object('status', old_status), jsonb_build_object('status', p_status));

  return p_user_id;
end;
$$;

create or replace function public.admin_revoke_workspace_invite(p_invite_id uuid)
returns uuid
language plpgsql
security definer
set search_path = ''
as $$
declare
  invite_row public.organization_invites%rowtype;
begin
  select * into invite_row
  from public.organization_invites
  where id = p_invite_id
  for update;

  if not found then
    raise exception 'Invite not found';
  end if;

  if not private.is_org_admin(invite_row.organization_id) then
    raise exception 'Admin access required';
  end if;

  update public.organization_invites
  set revoked_at = coalesce(revoked_at, now()), updated_at = now()
  where id = p_invite_id;

  insert into public.audit_events (organization_id, actor_user_id, actor_role, event_type, entity_type, entity_id, entity_label, action)
  values (invite_row.organization_id, auth.uid(), 'admin', 'workspace', 'organization_invite', p_invite_id, invite_row.email, 'revoke_invite');

  return p_invite_id;
end;
$$;

revoke all on function public.get_my_workspaces() from public, anon;
revoke all on function public.set_last_workspace(uuid) from public, anon;
revoke all on function public.create_workspace(text, text, text) from public, anon;
revoke all on function public.admin_invite_workspace_member(uuid, text, public.member_role, integer) from public, anon;
revoke all on function public.accept_workspace_invite(text) from public, anon;
revoke all on function public.admin_list_workspace_members(uuid) from public, anon;
revoke all on function public.admin_list_workspace_invites(uuid) from public, anon;
revoke all on function public.admin_update_workspace_member_role(uuid, uuid, public.member_role) from public, anon;
revoke all on function public.admin_set_workspace_member_status(uuid, uuid, public.member_status) from public, anon;
revoke all on function public.admin_revoke_workspace_invite(uuid) from public, anon;

grant execute on function public.get_my_workspaces() to authenticated;
grant execute on function public.set_last_workspace(uuid) to authenticated;
grant execute on function public.create_workspace(text, text, text) to authenticated;
grant execute on function public.admin_invite_workspace_member(uuid, text, public.member_role, integer) to authenticated;
grant execute on function public.accept_workspace_invite(text) to authenticated;
grant execute on function public.admin_list_workspace_members(uuid) to authenticated;
grant execute on function public.admin_list_workspace_invites(uuid) to authenticated;
grant execute on function public.admin_update_workspace_member_role(uuid, uuid, public.member_role) to authenticated;
grant execute on function public.admin_set_workspace_member_status(uuid, uuid, public.member_status) to authenticated;
grant execute on function public.admin_revoke_workspace_invite(uuid) to authenticated;

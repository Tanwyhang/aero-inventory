create type public.restock_request_status as enum ('open', 'acknowledged', 'ordered', 'resolved', 'cancelled');

create table public.restock_requests (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations(id) on delete cascade,
  sku_id uuid not null references public.skus(id) on delete restrict,
  location_id uuid not null references public.locations(id) on delete restrict,
  requested_by uuid not null references auth.users(id) on delete restrict,
  status public.restock_request_status not null default 'open',
  requested_qty integer check (requested_qty is null or requested_qty > 0),
  current_qty_snapshot integer not null check (current_qty_snapshot >= 0),
  low_stock_qty_snapshot integer not null check (low_stock_qty_snapshot >= 0),
  note text,
  created_at timestamptz not null default now(),
  acknowledged_at timestamptz,
  ordered_at timestamptz,
  resolved_at timestamptz
);

create table public.restock_request_events (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations(id) on delete cascade,
  restock_request_id uuid not null references public.restock_requests(id) on delete cascade,
  actor_user_id uuid not null references auth.users(id) on delete restrict,
  from_status public.restock_request_status,
  to_status public.restock_request_status,
  comment text,
  created_at timestamptz not null default now()
);

create index restock_requests_org_status_idx on public.restock_requests (organization_id, status, created_at desc);
create index restock_requests_requested_by_idx on public.restock_requests (requested_by);
create index restock_requests_sku_idx on public.restock_requests (sku_id);
create index restock_request_events_request_idx on public.restock_request_events (restock_request_id, created_at desc);
create index restock_request_events_org_idx on public.restock_request_events (organization_id, created_at desc);

alter table public.restock_requests enable row level security;
alter table public.restock_request_events enable row level security;

create policy "admins can read restock requests" on public.restock_requests for select to authenticated using (private.is_org_admin(organization_id));
create policy "staff can read own restock requests" on public.restock_requests for select to authenticated using (requested_by = (select auth.uid()) and private.is_org_member(organization_id));
create policy "admins can read restock request events" on public.restock_request_events for select to authenticated using (private.is_org_admin(organization_id));
create policy "staff can read own restock request events" on public.restock_request_events for select to authenticated using (
  private.is_org_member(organization_id)
  and exists (
    select 1 from public.restock_requests rr
    where rr.id = restock_request_id
      and rr.requested_by = (select auth.uid())
  )
);

create or replace function public.create_restock_request(
  p_sku_id uuid,
  p_location_id uuid,
  p_requested_qty integer default null,
  p_note text default null
)
returns uuid
language plpgsql
security definer
set search_path = ''
as $$
declare
  inv_row public.inventory_levels%rowtype;
  sku_row public.skus%rowtype;
  actor_role text;
  request_id uuid;
begin
  if auth.uid() is null then
    raise exception 'Not authenticated';
  end if;

  if p_requested_qty is not null and p_requested_qty <= 0 then
    raise exception 'Requested quantity must be positive';
  end if;

  select * into inv_row
  from public.inventory_levels
  where sku_id = p_sku_id
    and location_id = p_location_id;

  if not found then
    raise exception 'Inventory row not found';
  end if;

  if not private.is_org_member(inv_row.organization_id) then
    raise exception 'Not authorized';
  end if;

  select * into sku_row from public.skus where id = inv_row.sku_id;
  actor_role := private.member_role_for(inv_row.organization_id);

  insert into public.restock_requests (
    organization_id,
    sku_id,
    location_id,
    requested_by,
    requested_qty,
    current_qty_snapshot,
    low_stock_qty_snapshot,
    note
  ) values (
    inv_row.organization_id,
    inv_row.sku_id,
    inv_row.location_id,
    auth.uid(),
    p_requested_qty,
    inv_row.quantity,
    sku_row.low_stock_qty,
    nullif(trim(coalesce(p_note, '')), '')
  ) returning id into request_id;

  insert into public.restock_request_events (
    organization_id,
    restock_request_id,
    actor_user_id,
    from_status,
    to_status,
    comment
  ) values (
    inv_row.organization_id,
    request_id,
    auth.uid(),
    null,
    'open',
    nullif(trim(coalesce(p_note, '')), '')
  );

  insert into public.audit_events (
    organization_id,
    actor_user_id,
    actor_role,
    event_type,
    entity_type,
    entity_id,
    entity_label,
    action,
    after_data,
    metadata
  ) values (
    inv_row.organization_id,
    auth.uid(),
    actor_role,
    'restock',
    'restock_request',
    request_id,
    'Restock request',
    'create_restock_request',
    jsonb_build_object('status', 'open', 'requested_qty', p_requested_qty, 'note', p_note),
    jsonb_build_object('sku_id', inv_row.sku_id, 'location_id', inv_row.location_id, 'current_qty', inv_row.quantity, 'low_stock_qty', sku_row.low_stock_qty)
  );

  return request_id;
end;
$$;

create or replace function public.update_restock_request_status(
  p_request_id uuid,
  p_status public.restock_request_status,
  p_comment text default null
)
returns uuid
language plpgsql
security definer
set search_path = ''
as $$
declare
  request_row public.restock_requests%rowtype;
  previous_status public.restock_request_status;
  actor_role text;
begin
  if auth.uid() is null then
    raise exception 'Not authenticated';
  end if;

  select * into request_row
  from public.restock_requests
  where id = p_request_id
  for update;

  if not found then
    raise exception 'Restock request not found';
  end if;

  if not private.is_org_admin(request_row.organization_id) then
    raise exception 'Admin access required';
  end if;

  previous_status := request_row.status;
  actor_role := private.member_role_for(request_row.organization_id);

  update public.restock_requests
  set status = p_status,
      acknowledged_at = case when p_status = 'acknowledged' and acknowledged_at is null then now() else acknowledged_at end,
      ordered_at = case when p_status = 'ordered' and ordered_at is null then now() else ordered_at end,
      resolved_at = case when p_status in ('resolved', 'cancelled') and resolved_at is null then now() else resolved_at end
  where id = p_request_id;

  insert into public.restock_request_events (
    organization_id,
    restock_request_id,
    actor_user_id,
    from_status,
    to_status,
    comment
  ) values (
    request_row.organization_id,
    request_row.id,
    auth.uid(),
    previous_status,
    p_status,
    nullif(trim(coalesce(p_comment, '')), '')
  );

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
    after_data,
    metadata
  ) values (
    request_row.organization_id,
    auth.uid(),
    actor_role,
    'restock',
    'restock_request',
    request_row.id,
    'Restock request',
    'update_restock_request_status',
    jsonb_build_object('status', previous_status),
    jsonb_build_object('status', p_status),
    jsonb_build_object('comment', p_comment, 'sku_id', request_row.sku_id, 'location_id', request_row.location_id)
  );

  return request_row.id;
end;
$$;

revoke all on function public.create_restock_request(uuid, uuid, integer, text) from public, anon;
revoke all on function public.update_restock_request_status(uuid, public.restock_request_status, text) from public, anon;
grant execute on function public.create_restock_request(uuid, uuid, integer, text) to authenticated;
grant execute on function public.update_restock_request_status(uuid, public.restock_request_status, text) to authenticated;
;

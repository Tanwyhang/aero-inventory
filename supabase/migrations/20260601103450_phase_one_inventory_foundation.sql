create extension if not exists "pgcrypto" with schema extensions;

create type public.member_role as enum ('admin', 'staff');
create type public.member_status as enum ('active', 'invited', 'disabled');
create type public.plan_name as enum ('basic', 'custom');
create type public.movement_type as enum ('add', 'deduct', 'adjustment');

create schema if not exists private;

create table public.organizations (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  icon text not null default 'Paw',
  default_country text not null default 'MY' check (default_country in ('MY', 'TH')),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table public.profiles (
  id uuid primary key references auth.users(id) on delete cascade,
  email text,
  full_name text,
  avatar_url text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table public.organization_members (
  organization_id uuid not null references public.organizations(id) on delete cascade,
  user_id uuid not null references auth.users(id) on delete cascade,
  role public.member_role not null,
  status public.member_status not null default 'active',
  created_at timestamptz not null default now(),
  primary key (organization_id, user_id)
);

create table public.bootstrap_admin_claims (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations(id) on delete cascade,
  email text not null unique,
  claimed_by uuid references auth.users(id),
  claimed_at timestamptz,
  created_at timestamptz not null default now()
);

create table public.plan_entitlements (
  organization_id uuid primary key references public.organizations(id) on delete cascade,
  plan public.plan_name not null default 'basic',
  admin_limit integer not null default 1 check (admin_limit > 0),
  staff_limit integer not null default 1 check (staff_limit >= 0),
  sku_limit integer not null default 500 check (sku_limit > 0),
  location_limit integer not null default 1 check (location_limit > 0),
  excel_import_export_enabled boolean not null default false,
  barcode_enabled boolean not null default false,
  expiry_reminder_enabled boolean not null default false,
  advanced_report_enabled boolean not null default false,
  advanced_permission_enabled boolean not null default false,
  stock_transfer_enabled boolean not null default false,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table public.locations (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations(id) on delete cascade,
  name text not null,
  is_default boolean not null default false,
  archived_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create unique index locations_one_default_per_org on public.locations (organization_id) where is_default and archived_at is null;

create table public.suppliers (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations(id) on delete cascade,
  name text not null,
  notes text,
  archived_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table public.supplier_contacts (
  id uuid primary key default gen_random_uuid(),
  supplier_id uuid not null references public.suppliers(id) on delete cascade,
  organization_id uuid not null references public.organizations(id) on delete cascade,
  contact_name text,
  country text not null check (country in ('MY', 'TH')),
  phone_raw text not null,
  whatsapp_number text not null,
  is_primary boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create unique index supplier_contacts_one_primary_per_supplier on public.supplier_contacts (supplier_id) where is_primary;

create table public.skus (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations(id) on delete cascade,
  supplier_id uuid references public.suppliers(id) on delete set null,
  sku_code text not null,
  name text not null,
  variant text,
  photo_path text,
  low_stock_qty integer not null default 0 check (low_stock_qty >= 0),
  max_stock_qty integer not null default 0 check (max_stock_qty >= 0),
  is_active boolean not null default true,
  archived_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (organization_id, sku_code)
);

create table public.inventory_levels (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations(id) on delete cascade,
  sku_id uuid not null references public.skus(id) on delete cascade,
  location_id uuid not null references public.locations(id) on delete cascade,
  quantity integer not null default 0 check (quantity >= 0),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (sku_id, location_id)
);

create table public.stock_movements (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations(id) on delete cascade,
  sku_id uuid not null references public.skus(id) on delete restrict,
  location_id uuid not null references public.locations(id) on delete restrict,
  actor_user_id uuid not null references auth.users(id) on delete restrict,
  movement_type public.movement_type not null,
  quantity_delta integer not null check (quantity_delta <> 0),
  quantity_before integer not null check (quantity_before >= 0),
  quantity_after integer not null check (quantity_after >= 0),
  note text,
  created_at timestamptz not null default now()
);

create table public.audit_events (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations(id) on delete cascade,
  actor_user_id uuid references auth.users(id) on delete set null,
  actor_role text,
  event_type text not null,
  entity_type text not null,
  entity_id uuid,
  entity_label text,
  action text not null,
  before_data jsonb,
  after_data jsonb,
  metadata jsonb,
  ip_address text,
  user_agent text,
  created_at timestamptz not null default now()
);

create index organization_members_user_id_idx on public.organization_members (user_id);
create index locations_org_idx on public.locations (organization_id);
create index suppliers_org_idx on public.suppliers (organization_id);
create index supplier_contacts_org_idx on public.supplier_contacts (organization_id);
create index skus_org_active_idx on public.skus (organization_id, is_active);
create index inventory_levels_org_idx on public.inventory_levels (organization_id);
create index stock_movements_org_created_idx on public.stock_movements (organization_id, created_at desc);
create index stock_movements_actor_idx on public.stock_movements (actor_user_id);
create index audit_events_org_created_idx on public.audit_events (organization_id, created_at desc);
create index audit_events_actor_idx on public.audit_events (actor_user_id);
create index audit_events_entity_idx on public.audit_events (entity_type, entity_id);

create or replace function private.current_user_email()
returns text
language sql
stable
set search_path = ''
as $$
  select lower(coalesce(auth.jwt() ->> 'email', ''));
$$;

create or replace function private.member_role_for(target_org_id uuid)
returns text
language sql
stable
security definer
set search_path = ''
as $$
  select om.role::text
  from public.organization_members om
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
    where om.organization_id = target_org_id
      and om.user_id = auth.uid()
      and om.status = 'active'
      and om.role = 'admin'
  );
$$;

create or replace function private.touch_updated_at()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

create trigger touch_organizations_updated_at before update on public.organizations for each row execute function private.touch_updated_at();
create trigger touch_profiles_updated_at before update on public.profiles for each row execute function private.touch_updated_at();
create trigger touch_plan_entitlements_updated_at before update on public.plan_entitlements for each row execute function private.touch_updated_at();
create trigger touch_locations_updated_at before update on public.locations for each row execute function private.touch_updated_at();
create trigger touch_suppliers_updated_at before update on public.suppliers for each row execute function private.touch_updated_at();
create trigger touch_supplier_contacts_updated_at before update on public.supplier_contacts for each row execute function private.touch_updated_at();
create trigger touch_skus_updated_at before update on public.skus for each row execute function private.touch_updated_at();
create trigger touch_inventory_levels_updated_at before update on public.inventory_levels for each row execute function private.touch_updated_at();

alter table public.organizations enable row level security;
alter table public.profiles enable row level security;
alter table public.organization_members enable row level security;
alter table public.bootstrap_admin_claims enable row level security;
alter table public.plan_entitlements enable row level security;
alter table public.locations enable row level security;
alter table public.suppliers enable row level security;
alter table public.supplier_contacts enable row level security;
alter table public.skus enable row level security;
alter table public.inventory_levels enable row level security;
alter table public.stock_movements enable row level security;
alter table public.audit_events enable row level security;

create policy "members can read organizations" on public.organizations for select to authenticated using (private.is_org_member(id));
create policy "admins can update organizations" on public.organizations for update to authenticated using (private.is_org_admin(id)) with check (private.is_org_admin(id));

create policy "users can read own profile" on public.profiles for select to authenticated using (id = auth.uid());
create policy "users can insert own profile" on public.profiles for insert to authenticated with check (id = auth.uid());
create policy "users can update own profile" on public.profiles for update to authenticated using (id = auth.uid()) with check (id = auth.uid());

create policy "members can read own memberships" on public.organization_members for select to authenticated using (user_id = auth.uid() or private.is_org_admin(organization_id));

create policy "matching email can read unclaimed bootstrap claims" on public.bootstrap_admin_claims for select to authenticated using (claimed_by is null and lower(email) = private.current_user_email());
create policy "claimed admins can read own bootstrap claims" on public.bootstrap_admin_claims for select to authenticated using (claimed_by = auth.uid());

create policy "members can read entitlements" on public.plan_entitlements for select to authenticated using (private.is_org_member(organization_id));

create policy "members can read locations" on public.locations for select to authenticated using (private.is_org_member(organization_id));
create policy "admins can manage locations" on public.locations for all to authenticated using (private.is_org_admin(organization_id)) with check (private.is_org_admin(organization_id));

create policy "admins can manage suppliers" on public.suppliers for all to authenticated using (private.is_org_admin(organization_id)) with check (private.is_org_admin(organization_id));
create policy "admins can manage supplier contacts" on public.supplier_contacts for all to authenticated using (private.is_org_admin(organization_id)) with check (private.is_org_admin(organization_id));

create policy "admins can manage skus" on public.skus for all to authenticated using (private.is_org_admin(organization_id)) with check (private.is_org_admin(organization_id));
create policy "admins can read inventory levels" on public.inventory_levels for select to authenticated using (private.is_org_admin(organization_id));
create policy "admins can read stock movements" on public.stock_movements for select to authenticated using (private.is_org_admin(organization_id));
create policy "admins can read audit events" on public.audit_events for select to authenticated using (private.is_org_admin(organization_id));

create or replace function public.claim_bootstrap_admin()
returns uuid
language plpgsql
security definer
set search_path = ''
as $$
declare
  user_email text := lower(coalesce(auth.jwt() ->> 'email', ''));
  claim_row public.bootstrap_admin_claims%rowtype;
  user_name text := coalesce(auth.jwt() -> 'user_metadata' ->> 'full_name', auth.jwt() -> 'user_metadata' ->> 'name', user_email);
  user_avatar text := auth.jwt() -> 'user_metadata' ->> 'avatar_url';
begin
  if auth.uid() is null then
    raise exception 'Not authenticated';
  end if;

  select * into claim_row
  from public.bootstrap_admin_claims
  where lower(email) = user_email
    and claimed_by is null
  limit 1
  for update;

  if not found then
    select organization_id into claim_row.organization_id
    from public.organization_members
    where user_id = auth.uid()
      and status = 'active'
    limit 1;

    if claim_row.organization_id is null then
      raise exception 'No bootstrap claim found for this account';
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
    status = 'active';

  update public.bootstrap_admin_claims
  set claimed_by = auth.uid(), claimed_at = now()
  where id = claim_row.id;

  insert into public.audit_events (organization_id, actor_user_id, actor_role, event_type, entity_type, entity_id, entity_label, action, after_data)
  values (claim_row.organization_id, auth.uid(), 'admin', 'auth', 'organization', claim_row.organization_id, 'Bootstrap admin claim', 'claim_admin', jsonb_build_object('email', user_email));

  return claim_row.organization_id;
end;
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
  select o.id, o.name, o.icon, om.role::text, p.email, p.full_name
  from public.organization_members om
  join public.organizations o on o.id = om.organization_id
  left join public.profiles p on p.id = om.user_id
  where om.user_id = auth.uid()
    and om.status = 'active'
  order by om.created_at asc
  limit 1;
$$;

create or replace function public.get_staff_inventory_overview(p_organization_id uuid)
returns table (
  sku_id uuid,
  location_id uuid,
  product_name text,
  variant text,
  sku_code text,
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
  select s.id, il.location_id, s.name, s.variant, s.sku_code, il.quantity, s.low_stock_qty, s.max_stock_qty, l.name,
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

create or replace function public.get_admin_inventory_overview(p_organization_id uuid)
returns table (
  sku_id uuid,
  location_id uuid,
  product_name text,
  variant text,
  sku_code text,
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
  select s.id, il.location_id, s.name, s.variant, s.sku_code, il.quantity, s.low_stock_qty, s.max_stock_qty, l.name,
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

create or replace function public.adjust_stock(p_sku_id uuid, p_location_id uuid, p_delta integer, p_note text default null)
returns table (
  sku_id uuid,
  location_id uuid,
  quantity integer,
  movement_id uuid
)
language plpgsql
security definer
set search_path = ''
as $$
declare
  inv_row public.inventory_levels%rowtype;
  next_quantity integer;
  actor_role text;
  new_movement_id uuid;
begin
  if auth.uid() is null then
    raise exception 'Not authenticated';
  end if;

  if p_delta = 0 then
    raise exception 'Stock adjustment cannot be zero';
  end if;

  select * into inv_row
  from public.inventory_levels
  where sku_id = p_sku_id
    and location_id = p_location_id
  for update;

  if not found then
    raise exception 'Inventory row not found';
  end if;

  if not private.is_org_member(inv_row.organization_id) then
    raise exception 'Not authorized';
  end if;

  actor_role := private.member_role_for(inv_row.organization_id);
  next_quantity := inv_row.quantity + p_delta;

  if next_quantity < 0 then
    raise exception 'Stock cannot go below zero';
  end if;

  update public.inventory_levels
  set quantity = next_quantity, updated_at = now()
  where id = inv_row.id;

  insert into public.stock_movements (
    organization_id, sku_id, location_id, actor_user_id, movement_type,
    quantity_delta, quantity_before, quantity_after, note
  ) values (
    inv_row.organization_id, inv_row.sku_id, inv_row.location_id, auth.uid(),
    case when p_delta > 0 then 'add'::public.movement_type else 'deduct'::public.movement_type end,
    p_delta, inv_row.quantity, next_quantity, nullif(trim(coalesce(p_note, '')), '')
  ) returning id into new_movement_id;

  insert into public.audit_events (
    organization_id, actor_user_id, actor_role, event_type, entity_type, entity_id,
    entity_label, action, before_data, after_data, metadata
  ) values (
    inv_row.organization_id, auth.uid(), actor_role, 'stock', 'inventory_level', inv_row.id,
    'Stock adjustment', case when p_delta > 0 then 'add_stock' else 'deduct_stock' end,
    jsonb_build_object('quantity', inv_row.quantity),
    jsonb_build_object('quantity', next_quantity),
    jsonb_build_object('sku_id', inv_row.sku_id, 'location_id', inv_row.location_id, 'delta', p_delta, 'note', p_note, 'movement_id', new_movement_id)
  );

  return query select inv_row.sku_id, inv_row.location_id, next_quantity, new_movement_id;
end;
$$;

revoke all on function public.claim_bootstrap_admin() from anon;
revoke all on function public.get_my_membership() from anon;
revoke all on function public.get_staff_inventory_overview(uuid) from anon;
revoke all on function public.get_admin_inventory_overview(uuid) from anon;
revoke all on function public.adjust_stock(uuid, uuid, integer, text) from anon;
grant execute on function public.claim_bootstrap_admin() to authenticated;
grant execute on function public.get_my_membership() to authenticated;
grant execute on function public.get_staff_inventory_overview(uuid) to authenticated;
grant execute on function public.get_admin_inventory_overview(uuid) to authenticated;
grant execute on function public.adjust_stock(uuid, uuid, integer, text) to authenticated;

with org as (
  insert into public.organizations (id, name, icon, default_country)
  values ('00000000-0000-4000-8000-000000000001', 'Happy Paws Pet Store', 'Paw', 'MY')
  on conflict (id) do update set name = excluded.name
  returning id
), ent as (
  insert into public.plan_entitlements (organization_id, plan, admin_limit, staff_limit, sku_limit, location_limit)
  select id, 'basic', 1, 1, 500, 1 from org
  on conflict (organization_id) do nothing
), loc as (
  insert into public.locations (id, organization_id, name, is_default)
  select '00000000-0000-4000-8000-000000000101', id, 'Main Store', true from org
  on conflict (id) do update set name = excluded.name
), claim as (
  insert into public.bootstrap_admin_claims (organization_id, email)
  select id, 'wyhang2006gt@gmail.com' from org
  on conflict (email) do nothing
)
select 1;

insert into public.suppliers (id, organization_id, name, notes) values
  ('00000000-0000-4000-8000-000000000201', '00000000-0000-4000-8000-000000000001', 'PetSupply Co.', 'Malaysia dry food distributor'),
  ('00000000-0000-4000-8000-000000000202', '00000000-0000-4000-8000-000000000001', 'Whisker & Co.', 'Cat food supplier'),
  ('00000000-0000-4000-8000-000000000203', '00000000-0000-4000-8000-000000000001', 'Playful Pets Thailand', 'Toy supplier from Thailand')
on conflict (id) do update set name = excluded.name, notes = excluded.notes;

insert into public.supplier_contacts (id, supplier_id, organization_id, contact_name, country, phone_raw, whatsapp_number, is_primary) values
  ('00000000-0000-4000-8000-000000000301', '00000000-0000-4000-8000-000000000201', '00000000-0000-4000-8000-000000000001', 'Maya Torres', 'MY', '012-345 6789', '60123456789', true),
  ('00000000-0000-4000-8000-000000000302', '00000000-0000-4000-8000-000000000202', '00000000-0000-4000-8000-000000000001', 'Leo Grant', 'MY', '019-876 5432', '60198765432', true),
  ('00000000-0000-4000-8000-000000000303', '00000000-0000-4000-8000-000000000203', '00000000-0000-4000-8000-000000000001', 'Ari Chai', 'TH', '081-234-5678', '66812345678', true)
on conflict (id) do update set contact_name = excluded.contact_name, phone_raw = excluded.phone_raw, whatsapp_number = excluded.whatsapp_number;

insert into public.skus (id, organization_id, supplier_id, sku_code, name, variant, low_stock_qty, max_stock_qty) values
  ('00000000-0000-4000-8000-000000000401', '00000000-0000-4000-8000-000000000001', '00000000-0000-4000-8000-000000000201', 'DF-CH-2KG', 'Dog Food - Chicken', '2kg', 15, 60),
  ('00000000-0000-4000-8000-000000000402', '00000000-0000-4000-8000-000000000001', '00000000-0000-4000-8000-000000000202', 'CF-TU-1.5', 'Cat Food - Tuna', '1.5kg', 10, 30),
  ('00000000-0000-4000-8000-000000000403', '00000000-0000-4000-8000-000000000001', '00000000-0000-4000-8000-000000000203', 'RB-SM-001', 'Rubber Ball', 'Small', 8, 25),
  ('00000000-0000-4000-8000-000000000404', '00000000-0000-4000-8000-000000000001', '00000000-0000-4000-8000-000000000203', 'DL-MED-002', 'Dog Leash', 'Medium', 6, 20),
  ('00000000-0000-4000-8000-000000000405', '00000000-0000-4000-8000-000000000001', '00000000-0000-4000-8000-000000000202', 'CL-10L-001', 'Cat Litter', '10L', 10, 30),
  ('00000000-0000-4000-8000-000000000406', '00000000-0000-4000-8000-000000000001', '00000000-0000-4000-8000-000000000201', 'DT-BAC-200', 'Dog Treats - Bacon', '200g', 8, 20)
on conflict (id) do update set name = excluded.name, variant = excluded.variant, low_stock_qty = excluded.low_stock_qty, max_stock_qty = excluded.max_stock_qty;

insert into public.inventory_levels (organization_id, sku_id, location_id, quantity) values
  ('00000000-0000-4000-8000-000000000001', '00000000-0000-4000-8000-000000000401', '00000000-0000-4000-8000-000000000101', 45),
  ('00000000-0000-4000-8000-000000000001', '00000000-0000-4000-8000-000000000402', '00000000-0000-4000-8000-000000000101', 12),
  ('00000000-0000-4000-8000-000000000001', '00000000-0000-4000-8000-000000000403', '00000000-0000-4000-8000-000000000101', 0),
  ('00000000-0000-4000-8000-000000000001', '00000000-0000-4000-8000-000000000404', '00000000-0000-4000-8000-000000000101', 8),
  ('00000000-0000-4000-8000-000000000001', '00000000-0000-4000-8000-000000000405', '00000000-0000-4000-8000-000000000101', 22),
  ('00000000-0000-4000-8000-000000000001', '00000000-0000-4000-8000-000000000406', '00000000-0000-4000-8000-000000000101', 5)
on conflict (sku_id, location_id) do update set quantity = excluded.quantity;

insert into public.audit_events (organization_id, actor_role, event_type, entity_type, entity_id, entity_label, action, after_data) values
  ('00000000-0000-4000-8000-000000000001', 'system', 'seed', 'organization', '00000000-0000-4000-8000-000000000001', 'Happy Paws Pet Store', 'seed_demo_data', jsonb_build_object('source', 'phase_one_migration'));
;

# Supabase Implementation Checklist

This checklist describes the full Supabase-backed implementation for the Aero inventory app. It is intentionally detailed so the system can scale, remain maintainable, and avoid security gaps around supplier data, auditability, and role boundaries.

## Current Status Snapshot

Phase One is implemented as of the initial Supabase wiring pass.

Completed or materially covered:

- Google OAuth app flow is wired through Supabase.
- Demo admin bootstrap claim exists for `wyhang2006gt@gmail.com`.
- Core Phase One tables exist with RLS enabled.
- Demo organization, suppliers, supplier contacts, SKUs, inventory levels, entitlements, and bootstrap claim are seeded.
- Staff-safe inventory RPC exists and returns no supplier fields.
- Admin inventory RPC exists and includes supplier/WhatsApp fields.
- Atomic `adjust_stock` RPC exists and writes stock movement plus audit event.
- Dashboard is now Supabase-backed and role-aware.
- Admin `View as Staff` preview exists.
- `/sku` is admin-gated, though still backed by the old local UI and not complete CRUD.
- `/reports` exists with Phase One stock movement and audit lists.
- Lint and build pass after Phase One.
- Supabase advisors were run; anon RPC exposure was fixed for our Phase One RPCs.

Known remaining gaps:

- Real staff invites are not implemented.
- `restock_requests` and `restock_request_events` do not exist yet.
- Staff Ping Admin flow is not implemented.
- Admin restock queue/status workflow is not implemented.
- SKU manager still uses local state and is not wired to Supabase CRUD.
- Supplier manager UI is not implemented.
- SKU photo storage/upload is not implemented.
- Full CRUD audit coverage is not implemented.
- Store identity edits are not persisted yet.
- Basic plan limits are represented in data but not fully enforced by DB triggers/server actions.
- Database types are hand-trimmed for Phase One; full generated types should replace them after the schema stabilizes.
- Some performance advisor warnings remain around RLS init plans and unused-new indexes.

Recommended next implementation slice: Phase Two should build the Ping Admin/restock workflow first. This is the smallest missing product workflow that connects staff-safe operations, admin review, auditability, and reports without requiring SKU photo/storage work yet.

Phase Two target deliverables:

- Add `restock_request_status` enum if missing.
- Add `restock_requests` table.
- Add `restock_request_events` table.
- Add RLS for staff-safe request creation and admin management.
- Add `create_restock_request` RPC.
- Add `update_restock_request_status` RPC.
- Add server actions for creating/updating requests.
- Add Staff/Admin `Ping Admin` UI from the dashboard.
- Add admin restock queue on dashboard showing `pinged by <staff_name>`.
- Add restock request section to `/reports`.
- Ensure request creation/status changes write audit events.
- Run lint/build/advisors after completion.

## 0. Decisions Locked

- [ ] Auth uses Google OAuth through Supabase.
- [ ] Bootstrap admin email is `wyhang2006gt@gmail.com`.
- [ ] Demo seed is required.
- [ ] Staff can view inventory overview.
- [ ] Staff can add stock.
- [ ] Staff can deduct stock.
- [ ] Staff can ping admin.
- [ ] Staff cannot see supplier name.
- [ ] Staff cannot see supplier phone.
- [ ] Staff cannot see supplier ID.
- [ ] Staff cannot WhatsApp suppliers.
- [ ] Staff cannot CRUD SKUs.
- [ ] Staff cannot CRUD suppliers.
- [ ] Admin can CRUD SKUs.
- [ ] Admin can CRUD suppliers.
- [ ] Admin can WhatsApp suppliers.
- [ ] Admin sees full audit trail.
- [ ] App needs full operational audit trail.
- [ ] Supplier country support includes Malaysia `+60`.
- [ ] Supplier country support includes Thailand `+66`.
- [ ] One Google account means real staff testing needs `View as Staff` mode for now.

## 1. Supabase Dashboard Setup

- [ ] Enable Google provider in Supabase Auth.
- [ ] Configure Google OAuth Client ID.
- [ ] Configure Google OAuth Client Secret.
- [ ] Add Google Cloud callback URL: `https://mprpwxwzvjywyemyxcbb.supabase.co/auth/v1/callback`.
- [ ] Add local app redirect URL in Supabase: `http://localhost:3000/auth/callback`.
- [ ] Add future production redirect URL when domain exists.
- [ ] Confirm Supabase project URL is `https://mprpwxwzvjywyemyxcbb.supabase.co`.
- [ ] Confirm publishable key is available.
- [ ] Do not use service-role key in frontend.
- [ ] Do not store service-role key unless a future server-only admin function needs it.

## 2. App Dependencies

- [ ] Install `@supabase/supabase-js`.
- [ ] Install `@supabase/ssr`.
- [ ] Install `zod`.
- [ ] Avoid adding unnecessary state libraries.
- [ ] Keep Bun as package manager.
- [ ] Keep existing Tailwind and UI system.
- [ ] Add `.env.local.example`.
- [ ] Add `NEXT_PUBLIC_SUPABASE_URL`.
- [ ] Add `NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY`.
- [ ] Keep `.env*.local` ignored.

## 3. Supabase Client Structure

- [ ] Create browser Supabase client.
- [ ] Create server Supabase client.
- [ ] Type both clients with generated `Database` type.
- [ ] Create auth helper for current user.
- [ ] Create role helper for current organization membership.
- [ ] Create organization helper for selected/current org.
- [ ] Avoid `getSession()` for server authorization.
- [ ] Use `getUser()` or validated claims server-side.
- [ ] Ensure server data reads are not globally cached across users.
- [ ] Add auth proxy/session refresh file.
- [ ] Exclude static assets from proxy matcher.
- [ ] Redirect unauthenticated users to `/login`.
- [ ] Redirect users without membership to `/setup` or access-denied flow.

## 4. Database Types And Enums

- [ ] Create enum `member_role` with `admin`, `staff`.
- [ ] Create enum `member_status` with `active`, `invited`, `disabled`.
- [ ] Create enum `plan_name` with `basic`, `custom`.
- [ ] Create enum `movement_type` with `add`, `deduct`, `adjustment`.
- [ ] Create enum `restock_request_status` with `open`, `acknowledged`, `ordered`, `resolved`, `cancelled`.
- [ ] Create enum `audit_event_type` for operational event categories.
- [ ] Create enum `country_code` or constrained text for `MY`, `TH`.

## 5. Database Tables

- [ ] Create `organizations`.
- [ ] Create `profiles`.
- [ ] Create `organization_members`.
- [ ] Create `organization_invitations`.
- [ ] Create `bootstrap_admin_claims`.
- [ ] Create `plan_entitlements`.
- [ ] Create `locations`.
- [ ] Create `suppliers`.
- [ ] Create `supplier_contacts`.
- [ ] Create `skus`.
- [ ] Create `inventory_levels`.
- [ ] Create `stock_movements`.
- [ ] Create `restock_requests`.
- [ ] Create `restock_request_events`.
- [ ] Create `audit_events`.

## 6. Organization Fields

- [ ] Add `id uuid primary key`.
- [ ] Add `name text not null`.
- [ ] Add `icon text`.
- [ ] Add `default_country text not null default 'MY'`.
- [ ] Add `created_at timestamptz not null`.
- [ ] Add `updated_at timestamptz not null`.
- [ ] Add unique or sane constraints where needed.

## 7. Profile Fields

- [ ] Add `id uuid primary key references auth.users(id)`.
- [ ] Add `email text`.
- [ ] Add `full_name text`.
- [ ] Add `avatar_url text`.
- [ ] Add `created_at timestamptz not null`.
- [ ] Add `updated_at timestamptz not null`.
- [ ] Populate profile from Google user metadata.

## 8. Membership Fields

- [ ] Add `organization_id uuid not null`.
- [ ] Add `user_id uuid not null`.
- [ ] Add `role member_role not null`.
- [ ] Add `status member_status not null`.
- [ ] Add `created_at timestamptz not null`.
- [ ] Add unique index on `organization_id, user_id`.
- [ ] Add index on `user_id`.
- [ ] Add index on `organization_id`.
- [ ] Enforce only active members can access app data.

## 9. Invitation Fields

- [ ] Add `organization_id uuid not null`.
- [ ] Add `email text not null`.
- [ ] Add `role member_role not null default 'staff'`.
- [ ] Add `invited_by uuid`.
- [ ] Add `accepted_by uuid`.
- [ ] Add `accepted_at timestamptz`.
- [ ] Add `expires_at timestamptz`.
- [ ] Add `created_at timestamptz`.
- [ ] Add unique pending invite constraint per org/email.
- [ ] Enforce staff limit before creating invite.

## 10. Bootstrap Admin Claim Fields

- [ ] Add `organization_id uuid not null`.
- [ ] Add `email text not null`.
- [ ] Add `claimed_by uuid`.
- [ ] Add `claimed_at timestamptz`.
- [ ] Add `created_at timestamptz`.
- [ ] Seed `wyhang2006gt@gmail.com`.
- [ ] Ensure claim can only be used once.
- [ ] Ensure only matching Google email can claim.

## 11. Plan Entitlement Fields

- [ ] Add `organization_id uuid primary key`.
- [ ] Add `plan plan_name not null default 'basic'`.
- [ ] Add `admin_limit integer default 1`.
- [ ] Add `staff_limit integer default 1`.
- [ ] Add `sku_limit integer default 500`.
- [ ] Add `location_limit integer default 1`.
- [ ] Add `excel_import_export_enabled boolean default false`.
- [ ] Add `barcode_enabled boolean default false`.
- [ ] Add `expiry_reminder_enabled boolean default false`.
- [ ] Add `advanced_report_enabled boolean default false`.
- [ ] Add `advanced_permission_enabled boolean default false`.
- [ ] Add `stock_transfer_enabled boolean default false`.
- [ ] Add `created_at`.
- [ ] Add `updated_at`.

## 12. Location Fields

- [ ] Add `id uuid primary key`.
- [ ] Add `organization_id uuid not null`.
- [ ] Add `name text not null`.
- [ ] Add `is_default boolean not null default false`.
- [ ] Add `archived_at timestamptz`.
- [ ] Add `created_at`.
- [ ] Add `updated_at`.
- [ ] Enforce Basic location limit.
- [ ] Ensure one default location per org.

## 13. Supplier Fields

- [ ] Add `id uuid primary key`.
- [ ] Add `organization_id uuid not null`.
- [ ] Add `name text not null`.
- [ ] Add `notes text`.
- [ ] Add `archived_at timestamptz`.
- [ ] Add `created_at`.
- [ ] Add `updated_at`.
- [ ] Make table admin-only.
- [ ] Never expose to staff.

## 14. Supplier Contact Fields

- [ ] Add `id uuid primary key`.
- [ ] Add `supplier_id uuid not null`.
- [ ] Add `organization_id uuid not null`.
- [ ] Add `contact_name text`.
- [ ] Add `country text not null`.
- [ ] Add `phone_raw text not null`.
- [ ] Add `whatsapp_number text not null`.
- [ ] Add `is_primary boolean default true`.
- [ ] Add `created_at`.
- [ ] Add `updated_at`.
- [ ] Make table admin-only.
- [ ] Never expose to staff.
- [ ] Normalize Malaysia numbers.
- [ ] Normalize Thailand numbers.

## 15. SKU Fields

- [ ] Add `id uuid primary key`.
- [ ] Add `organization_id uuid not null`.
- [ ] Add `supplier_id uuid`.
- [ ] Add `sku_code text not null`.
- [ ] Add `name text not null`.
- [ ] Add `variant text`.
- [ ] Add `photo_path text`.
- [ ] Add `low_stock_qty integer not null default 0`.
- [ ] Add `max_stock_qty integer not null default 0`.
- [ ] Add `is_active boolean not null default true`.
- [ ] Add `archived_at timestamptz`.
- [ ] Add `created_at`.
- [ ] Add `updated_at`.
- [ ] Add unique index on `organization_id, sku_code`.
- [ ] Keep raw SKU table admin-only if it includes `supplier_id`.
- [ ] Staff must use safe overview RPC only.

## 16. Inventory Level Fields

- [ ] Add `id uuid primary key`.
- [ ] Add `organization_id uuid not null`.
- [ ] Add `sku_id uuid not null`.
- [ ] Add `location_id uuid not null`.
- [ ] Add `quantity integer not null default 0`.
- [ ] Add `created_at`.
- [ ] Add `updated_at`.
- [ ] Add unique index on `sku_id, location_id`.
- [ ] Add check `quantity >= 0`.
- [ ] No direct staff updates.
- [ ] Stock updates only through RPC.

## 17. Stock Movement Fields

- [ ] Add `id uuid primary key`.
- [ ] Add `organization_id uuid not null`.
- [ ] Add `sku_id uuid not null`.
- [ ] Add `location_id uuid not null`.
- [ ] Add `actor_user_id uuid not null`.
- [ ] Add `movement_type movement_type not null`.
- [ ] Add `quantity_delta integer not null`.
- [ ] Add `quantity_before integer not null`.
- [ ] Add `quantity_after integer not null`.
- [ ] Add `note text`.
- [ ] Add `created_at`.
- [ ] Add check `quantity_delta != 0`.
- [ ] Add index on `organization_id, created_at`.
- [ ] Add index on `sku_id`.
- [ ] Add index on `actor_user_id`.
- [ ] Treat as append-only.

## 18. Restock Request Fields

- [ ] Add `id uuid primary key`.
- [ ] Add `organization_id uuid not null`.
- [ ] Add `sku_id uuid not null`.
- [ ] Add `location_id uuid not null`.
- [ ] Add `requested_by uuid not null`.
- [ ] Add `status restock_request_status not null default 'open'`.
- [ ] Add `requested_qty integer`.
- [ ] Add `current_qty_snapshot integer not null`.
- [ ] Add `low_stock_qty_snapshot integer not null`.
- [ ] Add `note text`.
- [ ] Add `created_at`.
- [ ] Add `acknowledged_at`.
- [ ] Add `ordered_at`.
- [ ] Add `resolved_at`.
- [ ] Add index on `organization_id, status`.
- [ ] Add index on `requested_by`.
- [ ] Staff can create.
- [ ] Admin can manage status.
- [ ] Staff response must not include supplier info.

## 19. Restock Request Event Fields

- [ ] Add `id uuid primary key`.
- [ ] Add `organization_id uuid not null`.
- [ ] Add `restock_request_id uuid not null`.
- [ ] Add `actor_user_id uuid not null`.
- [ ] Add `from_status restock_request_status`.
- [ ] Add `to_status restock_request_status`.
- [ ] Add `comment text`.
- [ ] Add `created_at`.
- [ ] Append-only.

## 20. Audit Event Fields

- [ ] Add `id uuid primary key`.
- [ ] Add `organization_id uuid not null`.
- [ ] Add `actor_user_id uuid`.
- [ ] Add `actor_role text`.
- [ ] Add `event_type text not null`.
- [ ] Add `entity_type text not null`.
- [ ] Add `entity_id uuid`.
- [ ] Add `entity_label text`.
- [ ] Add `action text not null`.
- [ ] Add `before_data jsonb`.
- [ ] Add `after_data jsonb`.
- [ ] Add `metadata jsonb`.
- [ ] Add `ip_address text`.
- [ ] Add `user_agent text`.
- [ ] Add `created_at`.
- [ ] Add index on `organization_id, created_at`.
- [ ] Add index on `actor_user_id`.
- [ ] Add index on `entity_type, entity_id`.
- [ ] Make append-only.
- [ ] Admin can read.
- [ ] Staff cannot read supplier-sensitive audit rows.

## 21. RLS Foundation

- [ ] Enable RLS on all public app tables.
- [ ] Create private helper schema.
- [ ] Create helper `private.is_org_member(org_id)`.
- [ ] Create helper `private.is_org_admin(org_id)`.
- [ ] Create helper `private.member_role_for(org_id)`.
- [ ] Create helper `private.current_user_email()`.
- [ ] Keep helper functions outside exposed public API when possible.
- [ ] Set secure `search_path`.
- [ ] Revoke unnecessary function execute permissions.
- [ ] Grant only required RPCs to `authenticated`.
- [ ] Grant nothing sensitive to `anon`.

## 22. RLS Policies

- [ ] Organizations selectable by active members.
- [ ] Organizations updateable by admin only.
- [ ] Profiles selectable by org members where needed.
- [ ] Profiles updateable by own user.
- [ ] Membership selectable by active members.
- [ ] Membership manageable by admin only.
- [ ] Invitations manageable by admin only.
- [ ] Bootstrap claims selectable only by matching email during setup.
- [ ] Plan entitlements selectable by active members.
- [ ] Plan entitlements updateable only by backend/admin path.
- [ ] Locations selectable by active members.
- [ ] Locations manageable by admin only.
- [ ] Suppliers selectable by admin only.
- [ ] Supplier contacts selectable by admin only.
- [ ] SKUs selectable by admin only if supplier ID remains on row.
- [ ] Inventory levels selectable by admin directly.
- [ ] Staff inventory data served through safe RPC.
- [ ] Stock movements selectable by admin.
- [ ] Staff stock movement visibility limited to safe fields if exposed.
- [ ] Restock requests selectable by admin.
- [ ] Staff can select own restock requests without supplier details.
- [ ] Audit events selectable by admin only.
- [ ] Audit events insertable only through controlled functions/actions.

## 23. Staff-Safe RPC

- [ ] Create `get_staff_inventory_overview`.
- [ ] Validate authenticated user.
- [ ] Validate active org membership.
- [ ] Return only approved inventory fields.
- [ ] Return `sku_id`.
- [ ] Return `location_id`.
- [ ] Return product name.
- [ ] Return variant.
- [ ] Return SKU code.
- [ ] Return photo path or signed URL metadata.
- [ ] Return quantity.
- [ ] Return low stock threshold.
- [ ] Return max stock.
- [ ] Return low-stock boolean.
- [ ] Return out-of-stock boolean.
- [ ] Return location name.
- [ ] Do not return supplier ID.
- [ ] Do not return supplier name.
- [ ] Do not return supplier phone.
- [ ] Do not return contact name.
- [ ] Do not return WhatsApp URL.
- [ ] Do not return supplier notes.

## 24. Admin Inventory RPC

- [ ] Create `get_admin_inventory_overview`.
- [ ] Validate admin role.
- [ ] Return SKU fields.
- [ ] Return inventory fields.
- [ ] Return supplier fields.
- [ ] Return supplier contact fields.
- [ ] Return normalized WhatsApp number.
- [ ] Return low-stock state.
- [ ] Return restock request count if useful.
- [ ] Keep query indexed and predictable.

## 25. Stock Adjustment RPC

- [ ] Create `adjust_stock`.
- [ ] Parameters include `sku_id`.
- [ ] Parameters include `location_id`.
- [ ] Parameters include `delta`.
- [ ] Parameters include `note`.
- [ ] Validate authenticated user.
- [ ] Validate active member.
- [ ] Allow admin.
- [ ] Allow staff.
- [ ] Lock inventory row with `FOR UPDATE`.
- [ ] Reject `delta = 0`.
- [ ] Reject final quantity below zero.
- [ ] Compute quantity before.
- [ ] Compute quantity after.
- [ ] Update inventory level.
- [ ] Insert stock movement.
- [ ] Insert audit event.
- [ ] Return updated quantity and movement ID.
- [ ] Avoid supplier data in return payload for staff.

## 26. Restock RPCs

- [ ] Create `create_restock_request`.
- [ ] Validate active member.
- [ ] Allow admin.
- [ ] Allow staff.
- [ ] Snapshot current quantity.
- [ ] Snapshot low-stock threshold.
- [ ] Insert request.
- [ ] Insert request event.
- [ ] Insert audit event.
- [ ] Return request without supplier data.
- [ ] Create `update_restock_request_status`.
- [ ] Validate admin role.
- [ ] Update request status.
- [ ] Insert request event.
- [ ] Insert audit event.

## 27. CRUD Audit

- [ ] Audit SKU create.
- [ ] Audit SKU update.
- [ ] Audit SKU archive.
- [ ] Audit supplier create.
- [ ] Audit supplier update.
- [ ] Audit supplier archive.
- [ ] Audit supplier contact create.
- [ ] Audit supplier contact update.
- [ ] Audit supplier contact archive.
- [ ] Audit organization update.
- [ ] Audit location update.
- [ ] Audit member invite.
- [ ] Audit member activation.
- [ ] Audit member disable.
- [ ] Audit photo upload/change.
- [ ] Capture before and after data.
- [ ] Avoid exposing sensitive audit rows to staff.
- [ ] Keep audit append-only.

## 28. Plan Limit Enforcement

- [ ] Enforce max 1 admin for Basic.
- [ ] Enforce max 1 staff for Basic.
- [ ] Enforce max 500 active SKUs for Basic.
- [ ] Enforce max 1 active location for Basic.
- [ ] Enforce limits in server actions.
- [ ] Enforce limits in database triggers/functions.
- [ ] Return clear limit errors.
- [ ] Add future entitlement fields for add-ons.
- [ ] Keep add-on checks centralized.

## 29. Storage

- [ ] Create private bucket `sku-photos`.
- [ ] Restrict object paths by organization ID.
- [ ] Admin can upload.
- [ ] Admin can update.
- [ ] Admin can delete.
- [ ] Members can read allowed SKU photos.
- [ ] Staff can view photos through safe signed URLs.
- [ ] Never store supplier names in file paths.
- [ ] Use path `{organization_id}/{sku_id}/{file_id}`.
- [ ] Generate signed URLs server-side.
- [ ] Do not use public bucket URLs.
- [ ] Account for signed URL expiry.
- [ ] Add image host config only if using Next Image with remote URLs.

## 30. Demo Seed

- [ ] Seed organization `Happy Paws Pet Store`.
- [ ] Seed default icon.
- [ ] Seed default location `Main Store`.
- [ ] Seed Basic entitlements.
- [ ] Seed bootstrap admin claim for `wyhang2006gt@gmail.com`.
- [ ] Seed demo suppliers.
- [ ] Seed Malaysia supplier contact.
- [ ] Seed Thailand supplier contact.
- [ ] Seed demo pet SKUs.
- [ ] Seed SKU photos as placeholders or photo paths.
- [ ] Seed inventory levels.
- [ ] Seed low-stock thresholds.
- [ ] Seed stock movements.
- [ ] Seed restock requests.
- [ ] Seed audit events.
- [ ] Ensure seeded supplier data is admin-only.

## 31. App Routes

- [ ] Add `/login`.
- [ ] Add `/auth/callback`.
- [ ] Add `/setup`.
- [ ] Keep `/` as inventory dashboard.
- [ ] Keep `/sku` as admin SKU manager.
- [ ] Add `/reports`.
- [ ] Add access-denied state if user has no membership.
- [ ] Add loading states.
- [ ] Add error states.
- [ ] Add role-aware redirects.

## 32. Login UI

- [ ] Add `Continue with Google` button.
- [ ] Use Supabase OAuth sign-in.
- [ ] Set callback redirect to `/auth/callback`.
- [ ] Keep copy simple for non-technical users.
- [ ] Show `Use your company Google account.`
- [ ] Show error if unauthorized email.
- [ ] Avoid technical auth jargon.

## 33. Auth Callback

- [ ] Exchange OAuth code for session.
- [ ] Load Google user.
- [ ] Upsert profile.
- [ ] Check active membership.
- [ ] Check bootstrap admin claim.
- [ ] Claim demo org if email matches.
- [ ] Check pending staff invite.
- [ ] Activate staff invite if email matches.
- [ ] Redirect admin to `/`.
- [ ] Redirect staff to `/`.
- [ ] Redirect unrecognized users to access-denied/setup message.
- [ ] Audit bootstrap claim.
- [ ] Audit invite acceptance.

## 34. Role-Aware Dashboard

- [ ] Determine current user role server-side.
- [ ] Admin loads admin inventory data.
- [ ] Staff loads staff-safe inventory data.
- [ ] Admin sees supplier column.
- [ ] Staff does not see supplier column.
- [ ] Admin sees WhatsApp buttons.
- [ ] Staff does not see WhatsApp buttons.
- [ ] Admin sees restock queue.
- [ ] Staff sees ping button.
- [ ] Both can add stock.
- [ ] Both can deduct stock.
- [ ] Both see low-stock color square.
- [ ] Keep mobile horizontal scroll or improve to cards if needed.
- [ ] Keep design close to existing UI.

## 35. Stock Modal

- [ ] Add stock modal.
- [ ] Deduct stock modal.
- [ ] Quantity input required.
- [ ] Quantity must be positive.
- [ ] Note optional but encouraged.
- [ ] Show current stock.
- [ ] Show expected new stock.
- [ ] Prevent deduction below zero.
- [ ] Submit to server action.
- [ ] Server action calls `adjust_stock`.
- [ ] Refresh/revalidate dashboard.
- [ ] Show success toast/message.
- [ ] Show clear errors.

## 36. Ping Admin UI

- [ ] Staff sees `Ping Admin`.
- [ ] Admin also can create request if useful.
- [ ] Modal asks requested quantity optional.
- [ ] Modal asks note optional.
- [ ] Show current stock snapshot.
- [ ] Submit to server action/RPC.
- [ ] Create restock request.
- [ ] Create audit event.
- [ ] Admin queue shows `pinged by <staff_name>`.
- [ ] Admin can acknowledge.
- [ ] Admin can mark ordered.
- [ ] Admin can resolve.
- [ ] Admin can cancel.
- [ ] Status changes are audited.

## 37. SKU Manager

- [ ] Admin-only route access.
- [ ] Staff redirected away from `/sku`.
- [ ] Replace local `useState` CRUD.
- [ ] Load SKUs from Supabase.
- [ ] Add SKU form.
- [ ] Edit SKU form.
- [ ] Archive SKU action.
- [ ] Upload photo.
- [ ] Create supplier or select supplier.
- [ ] Set low-stock threshold.
- [ ] Set max-stock value.
- [ ] Set opening stock.
- [ ] Opening stock creates stock movement.
- [ ] Opening stock creates audit event.
- [ ] SKU updates create audit event.
- [ ] SKU archive preserves history.
- [ ] Enforce SKU limit.

## 38. Supplier Manager

- [ ] Add admin-only supplier UI.
- [ ] Can create supplier.
- [ ] Can edit supplier.
- [ ] Can archive supplier.
- [ ] Can edit contact name.
- [ ] Can edit country.
- [ ] Can edit phone.
- [ ] Can generate WhatsApp number.
- [ ] Can test WhatsApp link.
- [ ] Supplier updates audited.
- [ ] Supplier contacts audited.
- [ ] Staff cannot access route or data.

## 39. WhatsApp

- [ ] Keep local WhatsApp PNG.
- [ ] Admin button uses normalized WhatsApp number.
- [ ] Generate `https://wa.me/<number>?text=<encoded>`.
- [ ] Include product name in message.
- [ ] Include SKU code in message.
- [ ] Include current stock/low-stock info if useful.
- [ ] Do not generate WhatsApp links for staff.
- [ ] Do not send supplier number to staff.

## 40. Reports

- [ ] Admin-only `/reports`.
- [ ] Stock movement report.
- [ ] Restock request report.
- [ ] Audit event report.
- [ ] Filter by date range.
- [ ] Filter by SKU.
- [ ] Filter by actor.
- [ ] Filter by action.
- [ ] Filter by restock status.
- [ ] Show before/after stock.
- [ ] Show notes.
- [ ] Show actor display name.
- [ ] Hide supplier details unless admin.
- [ ] Keep advanced export gated for future add-on.

## 41. Store Identity

- [ ] Persist store name to `organizations`.
- [ ] Persist store icon to `organizations`.
- [ ] Admin can edit.
- [ ] Staff can view.
- [ ] Staff cannot edit.
- [ ] Changes audited.
- [ ] Keep existing visual style.

## 42. Navigation

- [ ] `Stock` links to `/`.
- [ ] `SKUs` links to `/sku`.
- [ ] `Reports` links to `/reports`.
- [ ] Staff does not see `SKUs`.
- [ ] Staff does not see supplier management.
- [ ] Staff may not see `Reports` unless safe version exists.
- [ ] Admin sees all allowed nav.
- [ ] Add logout control.

## 43. Server Actions

- [ ] Create auth actions.
- [ ] Create SKU actions.
- [ ] Create supplier actions.
- [ ] Create stock actions.
- [ ] Create restock request actions.
- [ ] Create organization actions.
- [ ] Validate all inputs with Zod.
- [ ] Validate role in every action.
- [ ] Never trust client role.
- [ ] Return typed success/error results.
- [ ] Revalidate affected routes.
- [ ] Include audit metadata where possible.

## 44. Validation

- [ ] Validate SKU code required.
- [ ] Validate product name required.
- [ ] Validate stock numbers are non-negative.
- [ ] Validate low stock threshold is non-negative.
- [ ] Validate max stock is non-negative.
- [ ] Validate supplier name required.
- [ ] Validate supplier country is MY or TH.
- [ ] Validate supplier phone can normalize.
- [ ] Validate stock delta positive from UI.
- [ ] Validate note max length.
- [ ] Validate restock requested qty if present.
- [ ] Validate files are images.
- [ ] Validate file size limit.

## 45. Error Handling

- [ ] Unauthorized user gets friendly message.
- [ ] Staff blocked from admin routes.
- [ ] Plan limit errors are human-readable.
- [ ] Stock below zero error is human-readable.
- [ ] Supplier phone normalization errors are human-readable.
- [ ] Upload errors are human-readable.
- [ ] OAuth callback errors are human-readable.
- [ ] Database errors are not leaked raw to users.
- [ ] Log enough context for debugging without sensitive supplier leakage to staff.

## 46. Maintainability

- [ ] Keep database access in small server modules.
- [ ] Keep validation schemas centralized.
- [ ] Keep role checks centralized.
- [ ] Keep phone normalization centralized.
- [ ] Keep entitlement checks centralized.
- [ ] Keep audit event creation centralized.
- [ ] Keep UI components role-aware but not security-critical.
- [ ] Prefer server-side filtering over client-side hiding.
- [ ] Use clear table and function names.
- [ ] Generate database types after schema changes.
- [ ] Avoid duplicating product types manually where generated types exist.

## 47. Scalability

- [ ] Tenant isolation by `organization_id`.
- [ ] Index every frequent foreign key.
- [ ] Index frequent filters.
- [ ] Keep stock updates atomic.
- [ ] Keep audit append-only.
- [ ] Archive instead of delete.
- [ ] Design entitlements to support add-ons.
- [ ] Keep location model ready for extra warehouses.
- [ ] Keep stock transfer add-on possible.
- [ ] Keep advanced reports add-on possible.
- [ ] Keep staff permission extension possible.
- [ ] Avoid hardcoded single-org assumptions except bootstrap seed.

## 48. Security Checks

- [ ] Verify no public table without RLS.
- [ ] Verify staff cannot query suppliers.
- [ ] Verify staff cannot query supplier contacts.
- [ ] Verify staff cannot query raw admin SKU data if supplier-linked.
- [ ] Verify staff-safe RPC returns no supplier data.
- [ ] Verify RPCs reject `anon`.
- [ ] Verify RPCs validate membership.
- [ ] Verify RPCs validate role.
- [ ] Verify storage bucket is private.
- [ ] Verify signed URLs only for org members.
- [ ] Verify service-role key is never exposed.
- [ ] Run Supabase security advisor.
- [ ] Fix advisor warnings we introduce.

## 49. Testing Checklist

- [ ] Build succeeds.
- [ ] Lint succeeds.
- [ ] Google login works locally.
- [ ] Bootstrap admin claim works.
- [ ] Unauthorized Google account is blocked.
- [ ] Admin dashboard loads.
- [ ] View-as-staff dashboard loads.
- [ ] Admin sees suppliers.
- [ ] Staff view does not receive suppliers.
- [ ] Admin WhatsApp link works.
- [ ] Staff has no WhatsApp link.
- [ ] Add stock works.
- [ ] Deduct stock works.
- [ ] Deduct below zero fails.
- [ ] Stock movement created.
- [ ] Audit event created.
- [ ] Ping admin works.
- [ ] Admin sees pinged by staff name.
- [ ] Admin can update request status.
- [ ] SKU create works.
- [ ] SKU edit works.
- [ ] SKU archive works.
- [ ] Supplier create works.
- [ ] Supplier edit works.
- [ ] Supplier archive works.
- [ ] Photo upload works.
- [ ] Signed photo display works.
- [ ] Reports load.
- [ ] Plan limit blocks 501st SKU.
- [ ] Staff cannot open `/sku`.
- [ ] Staff cannot open supplier management.
- [ ] Staff cannot query supplier tables through Supabase client.

## 50. Final Definition Of Done

- [ ] App is no longer hardcoded demo UI.
- [ ] Supabase is source of truth.
- [ ] Google OAuth works.
- [ ] Demo admin can claim demo org.
- [ ] Admin can operate full inventory system.
- [ ] Staff-safe mode exposes zero supplier information.
- [ ] Stock add/deduct is atomic and audited.
- [ ] CRUD operations are audited.
- [ ] SKU photos work through private storage.
- [ ] Reports show movement and audit history.
- [ ] Basic plan limits are enforced.
- [ ] Lint passes.
- [ ] Build passes.
- [ ] Supabase advisors are checked.
- [ ] Code remains modular enough for add-ons and scaling.

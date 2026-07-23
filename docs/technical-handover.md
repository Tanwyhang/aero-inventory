# Aero Technical Handover

## Executive Summary

Aero is a multi-workspace SKU and inventory management application built with Next.js App Router, Supabase Auth/Database/Storage, and a custom UI layer built on shadcn + Unlumen UI patterns.

The app is already in active production use, with the current product centered on:

- warehouse stock counting and adjustment
- admin-only SKU and category management
- staff-to-admin restock workflow
- partner share sheet creation/export
- tutorial/training flows using embedded demo replicas of the real UI
- workspace-based tenant isolation

This document is intended to let a new technical team continue the project without reconstructing context from code history.

## Current Environment

### Source Control

- GitHub repository: `https://github.com/Tanwyhang/aero-inventory`
- Main branch: `main`

### Production

- Primary production domain: `https://aerostocks.vercel.app`
- Linked Vercel project name: `aero-inventory`
- Vercel team scope: `tanwyhangs-projects`

### Database / Auth / Storage

- Supabase project ref: `mprpwxwzvjywyemyxcbb`
- Supabase URL: `https://mprpwxwzvjywyemyxcbb.supabase.co`
- Auth provider: Google OAuth via Supabase Auth
- Storage bucket used for SKU photos: `sku-photos`

### Local Runtime

- Framework: Next.js 16 App Router
- React: latest
- TypeScript: 5.x
- Styling: Tailwind CSS
- UI primitives: shadcn + custom components + Unlumen registry
- Charts: Recharts
- Validation: Zod
- Export: `xlsx`

## Repo Structure

### Core folders

- `src/app/`: route-level server pages, layout, manifest, route handlers
- `src/app/actions/`: server actions for auth, workspaces, stock, SKUs, partner share
- `src/components/`: all major page UIs and shared components
- `src/lib/`: auth/session/env/helpers
- `src/types/database.ts`: typed DB model and RPC signatures used by the app
- `supabase/migrations/`: source of truth for schema evolution and RPC behavior
- `supabase/seed.sql`: local seed data
- `docs/`: implementation notes and project context
- `public/`: static assets, including `aero-shortcut.svg`
- `design/`: source design/media assets used by the app

## Application Architecture

## High-level pattern

The app follows a fairly consistent pattern:

1. A route in `src/app/.../page.tsx` is a server component.
2. It calls `requireMembership()` to resolve the current authenticated user and selected workspace.
3. It loads workspace-scoped data from Supabase, usually through RPCs.
4. It passes the result into a large page-level client component.
5. Mutations happen through Next server actions in `src/app/actions/*`.
6. Server actions validate with Zod, re-check membership/role, call RPCs or direct table writes, then `revalidatePath(...)`.

This means the domain logic is split across:

- React page/component code for UX
- server actions for input validation and orchestration
- SQL migrations/RPCs for authorization-safe, tenant-scoped business logic

## Major Routes And Their Owners

### `/`

- File: `src/app/(stock)/page.tsx`
- Main component: `src/components/inventory-dashboard.tsx`
- Purpose:
  - stock overview
  - stock adjustment
  - low/out filtering
  - staff/admin split views
  - staff ping-admin flow
  - embedded admin restock preview

Behavior notes:

- Both staff and admin can access stock overview.
- Admin additionally gets supplier-aware inventory data and restock queue data.
- Stock photos are signed at request time using Supabase Storage signed URLs.

### `/sku`

- File: `src/app/sku/page.tsx`
- Main component: `src/components/admin-sku-manager.tsx`
- Purpose:
  - admin-only SKU create/update/archive
  - variation groups / grouped SKU display
  - category management
  - SKU photo upload and removal

Behavior notes:

- Route is admin-gated at the page level.
- Category reads are direct table reads; writes use RPCs.
- SKU CRUD is implemented via server actions that mostly call RPCs.

### `/restock`

- File: `src/app/restock/page.tsx`
- Main component: `RestockQueue` exported from `src/components/inventory-dashboard.tsx`
- Purpose:
  - admin-only queue for restock requests
  - supplier follow-up and request state management

### `/partner-share`

- File: `src/app/partner-share/page.tsx`
- Main component: `src/components/partner-share-manager.tsx`
- Purpose:
  - partner CRUD
  - partner share sheet CRUD
  - add/remove sheet items
  - partner export output logging
  - stock deduction after sending/completion
  - new auto-sync mode for live warehouse-linked share quantities

Recent implemented behavior:

- add-product modal now shows a scrollable, paginated quick-add SKU list
- clicking a product adds it instantly with `share_qty = 1`
- sheet-level `auto_sync_with_main_store` mode makes Share read-only and live-linked to inventory
- WhatsApp copy, Excel export, and stock deduction respect auto-sync behavior

### `/reports`

- File: `src/app/reports/page.tsx`
- Main components:
  - `src/components/reports-area-chart.tsx`
  - `src/components/reports-activity-lists.tsx`
- Purpose:
  - movement chart
  - stock movement history
  - audit trail
  - restock reporting

Behavior notes:

- Route is admin-only.
- This page is the main place where direct table reads are used rather than pure RPCs.

### `/workspaces`

- File: `src/app/workspaces/page.tsx`
- Purpose:
  - create workspace
  - accept invite
  - switch current workspace
  - manage workspace members/invites
  - update workspace identity

Behavior notes:

- This route is the entry point after login and workspace resolution.
- Workspace selection is persisted in both a Supabase preference (`set_last_workspace`) and an HTTP-only cookie.

### `/login`

- File: `src/app/login/page.tsx`
- Purpose:
  - Google sign-in entry point

### `/tutorial` and `/tutorial/embed`

- Files:
  - `src/app/tutorial/page.tsx`
  - `src/app/tutorial/embed/page.tsx`
- Main components:
  - `src/components/tutorial/tutorial-page.tsx`
  - `src/components/tutorial/tutorial-embed.tsx`
  - `src/components/tutorial/tutorial-guide-overlay.tsx`
  - `src/components/tutorial/tutorial-lessons.ts`
  - `src/components/tutorial/tutorial-demo-data.ts`

Purpose:

- interactive training using real components rendered with demo-only data
- fake cursor overlays and scripted steps using `data-tutorial` selectors
- selected lesson download now exports a standalone `.html` wrapper that opens that lesson

## Auth, Session, And Workspace Model

## Authentication flow

- Google sign-in starts in `src/app/actions/auth.ts`
- OAuth redirect returns to `/auth/callback`
- callback exchanges the `code` for a Supabase session and calls `claim_bootstrap_admin`

Relevant files:

- `src/app/actions/auth.ts`
- `src/app/auth/callback/route.ts`
- `src/lib/supabase/server.ts`
- `src/lib/supabase/proxy.ts`
- `src/proxy.ts`

Important note:

- There is duplicated OAuth callback handling logic in `src/app/(stock)/page.tsx` for `?code=...` in addition to `/auth/callback`. This appears to be legacy compatibility and should be reviewed before future auth changes.

## Workspace selection model

Workspace context is not derived purely from auth. The current workspace is selected per user.

Key behavior:

- cookie key: `aero:workspace-id`
- available workspaces loaded via RPC `get_my_workspaces`
- current workspace resolution order:
  - cookie-selected workspace
  - last workspace from preference
  - first active workspace

Relevant file:

- `src/lib/auth.ts`

Security note:

- `requireMembership()` is the main gate used across protected pages and server actions.
- Most routes and actions then additionally branch on `membership.role`.

## Supabase Data Model Overview

Core public tables represented in `src/types/database.ts`:

- `organizations`
- `profiles`
- `organization_members`
- `user_workspace_preferences`
- `organization_invites`
- `locations`
- `sku_variation_groups`
- `stock_movements`
- `audit_events`
- `restock_requests`
- `restock_request_events`
- `product_categories`
- `partners`
- `partner_share_sheets`
- `partner_share_items`

Core enums/type concepts:

- `admin` / `staff` roles
- restock statuses
- stock movement reasons
- `PartnerShareStatus = draft | confirmed | sent | completed`

## RPC-centric domains

Most operational behavior is implemented in SQL RPCs in `supabase/migrations/*.sql`.

High-value RPC groups include:

- auth/workspace
  - `claim_bootstrap_admin`
  - `get_my_workspaces`
  - `set_last_workspace`
  - `create_workspace`
  - `accept_workspace_invite`
  - admin invite/member RPCs
- stock/inventory
  - `get_staff_inventory_overview`
  - `get_admin_inventory_overview`
  - `adjust_stock`
- restock
  - `create_restock_request`
  - `update_restock_request_status`
  - `get_admin_restock_requests`
- SKU admin
  - `get_admin_sku_manager_rows`
  - `admin_create_sku`
  - `admin_update_sku`
  - `admin_archive_sku`
  - `admin_create_sku_variation_group`
  - `admin_update_sku_photo`
  - category RPCs
- partner share
  - `get_partner_share_page_data`
  - `get_partner_share_sheet_detail`
  - `admin_create_partner`
  - `admin_update_partner`
  - `admin_archive_partner`
  - `admin_create_partner_share_sheet`
  - `admin_add_partner_share_item`
  - `admin_update_partner_share_item`
  - `admin_remove_partner_share_item`
  - `admin_update_partner_share_status`
  - `admin_set_partner_share_auto_sync`
  - `admin_deduct_partner_share_stock`
  - `admin_record_partner_share_output`

## Database migration timeline

Notable migrations in chronological/product order:

- `20260601103450_phase_one_inventory_foundation.sql`
  - initial inventory/workspace/auth foundation
- `20260601110736_phase_two_restock_requests.sql`
  - restock request model
- `20260601111207_phase_two_admin_restock_overview_rpc.sql`
  - admin restock RPC
- `20260601113339_phase_three_admin_sku_crud.sql`
  - admin SKU management RPCs
- `20260601131314_phase_four_sku_photos.sql`
  - SKU photo support
- `20260615000100_partner_share_qty_and_categories.sql`
  - partner share and category foundation
- `20260616000100_partner_share_output_audit_and_deduct_guard.sql`
  - partner share output audit + guarded stock deduction
- `20260616000200_multi_workspace_access_control.sql`
  - multi-workspace hardening
- `20260618000100_fix_sku_category_and_category_edit.sql`
  - category fixes
- `20260619000100_admin_sku_manager_location_id.sql`
  - location-aware SKU manager data
- `20260624000100_stock_inventory_variation_metadata.sql`
  - grouped inventory/variation metadata
- `20260708000100_partner_share_auto_sync.sql`
  - new auto-sync mode for partner share sheets

## Server Action Map

### Auth

- `src/app/actions/auth.ts`
  - `signInWithGoogle`
  - `signOut`

### Workspaces

- `src/app/actions/workspaces.ts`
  - switch/create workspace
  - accept invite
  - update workspace identity
  - delete workspace
  - invite/revoke members
  - update member role/status

### Stock

- `src/app/actions/stock.ts`
  - `adjustStockAction`

### SKU management

- `src/app/actions/skus.ts`
  - create/update/archive SKU
  - create/update product category
  - create variation group
  - upload/remove SKU photo

### Partner share

- `src/app/actions/partner-share.ts`
  - partner CRUD
  - sheet CRUD/status changes
  - add/update/remove item
  - toggle auto-sync
  - deduct stock
  - output audit logging

## Storage / Media

## SKU photos

- bucket constant: `SKU_PHOTOS_BUCKET = "sku-photos"`
- signed URLs are generated per request in `src/lib/sku-photos.ts`
- page code should not assume photo URLs are stable, because they expire after 30 minutes

## PWA/shortcut icon

- manifest source: `src/app/manifest.ts`
- current maskable icon path: `/aero-shortcut.svg`
- static asset file: `public/aero-shortcut.svg`

Note:

- if the production icon appears stale after deployment, check both Vercel deploy status and asset caching at the CDN/browser layer.

## UI System Notes

Shared UX building blocks:

- `src/components/fluid-entry-surface.tsx`
  - animated glass-card shell used almost everywhere
- `src/components/app-sidebar.tsx`
  - main role-aware navigation
- `src/components/confirm-slide-sheet.tsx`
  - confirmation sheet pattern
- `src/components/ui/*`
  - shadcn-based primitives
- `src/components/ui/luma-spinner.tsx`
  - loading indicator used by some operations

Special UI pattern:

- the tutorial system reuses production components with demo data and blocks real writes in the iframe context
- many components include `data-tutorial` selectors and should be changed carefully because tutorial steps depend on them

## Environment Variables

Current example file: `.env.local.example`

Required public envs:

- `NEXT_PUBLIC_SUPABASE_URL`
- `NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY`
- `NEXT_PUBLIC_APP_URL`

Environment helper:

- `src/lib/env.ts`

Notes:

- app URL resolution falls back in this order:
  - `NEXT_PUBLIC_APP_URL`
  - `NEXT_PUBLIC_SITE_URL`
  - `VERCEL_URL`
  - local fallback `http://localhost:3000`

## Local Development Setup

## App

Install and run:

```bash
npm install
npm run dev
```

Verification commands:

```bash
npm run lint
npm run build
```

## Supabase local

Config file: `supabase/config.toml`

Useful commands:

```bash
supabase start
supabase db reset
supabase db push
```

Notes:

- local DB major version is set to Postgres 17
- local seed is enabled via `supabase/seed.sql`
- auth `site_url` in config is currently set to production `https://aerostocks.vercel.app`
- allowed auth redirect URLs already include localhost and Vercel preview patterns

## Deployment And Operations

## Vercel

The repo is linked to Vercel via `.vercel/project.json` and `.vercel/repo.json`.

Production deploy command pattern:

```bash
vercel deploy --prod -y --no-wait --scope tanwyhangs-projects
```

Recommended deployment sequence:

1. review code changes
2. run `npm run lint`
3. run `npm run build`
4. apply Supabase migrations
5. deploy to Vercel production
6. verify aliases and smoke test critical routes

## Supabase migration deployment

Apply remote migrations with:

```bash
supabase db push
```

Important:

- do not ship app code that depends on a new RPC or column before the remote migration is applied
- this project relies heavily on RPC shape stability; mismatches fail at runtime quickly

## Current Known Risks / Quirks

1. OAuth callback duplication

- callback logic lives both in `/auth/callback` and the stock page query-param branch
- future auth changes should consolidate this

2. Reports page is less RPC-driven than the rest

- it reads several tables directly and reconstructs joined context in TypeScript
- future RLS or schema changes can break reports unexpectedly

3. Tutorial coupling

- changing `data-tutorial` selectors or major UI interaction patterns can silently break lesson automation

4. Partner share auto-sync uses polling

- current implementation refreshes the page every 10 seconds when auto-sync is enabled
- it is simple and reliable, but not the most efficient

5. Variation/photo flows are multi-step

- some SKU variation creation and photo upload behavior is sequential and could leave partial progress if a later step fails
- if this area grows, consider stronger transactional boundaries or clearer recovery UX

6. Workspace writes are mixed-mode

- many domains use RPCs, but workspace identity update writes directly to `organizations`
- be careful if tightening DB permissions

7. Asset caching can hide deployment correctness

- especially for `aero-shortcut.svg`, verify the file from the deployed domain and force a cache-busting query param when needed

## Recently Implemented Features

The latest substantial product changes include:

- partner share add-product quick-add list
- partner share sheet auto-sync mode
- synced partner share export/deduction behavior
- selected tutorial lesson download as standalone HTML wrapper
- updated Aero shortcut icon in `public/aero-shortcut.svg`

Relevant commit area:

- partner share changes: server actions, manager UI, DB migration, types
- tutorial download change: `src/components/tutorial/tutorial-page.tsx`
- icon update: `public/aero-shortcut.svg`

## Open Product / Technical Work

The most useful active backlog document is:

- `docs/aero-fix-todo.md`

That file captures unresolved requests such as:

- max stock concept cleanup
- numeric input UX fixes
- category dropdown UX hardening
- mobile upload behavior
- additional loading/interaction polish
- favicon/branding cleanup

Historical foundation/planning context also exists in:

- `docs/supabase-implementation-checklist.md`

Be aware that some items in that checklist are now implemented even if the checklist still marks them as open. Treat it as historical planning context, not live truth.

## Recommended Engineering Rules For Continuation

1. Keep workspace scoping explicit.

- Every new direct read/write must be scoped by `organization_id` unless the RPC already guarantees tenant isolation.

2. Prefer RPCs for business-critical mutations.

- Especially for anything that needs audit logging, role checks, or cross-table updates.

3. Validate in server actions before RPC calls.

- Follow existing Zod-first patterns in `src/app/actions/*`.

4. Revalidate all affected routes.

- This codebase depends on `revalidatePath(...)` to keep server-rendered pages consistent.

5. Preserve tutorial selectors when editing UI.

- If selectors must change, update tutorial lessons and embed behavior in the same change.

6. Keep changes additive in the database first.

- Prefer non-destructive migrations until the team has verified no production flows rely on old columns or RPC behavior.

## Suggested First Tasks For A New Team

1. Read and verify these files first:

- `src/lib/auth.ts`
- `src/app/actions/workspaces.ts`
- `src/app/actions/skus.ts`
- `src/app/actions/partner-share.ts`
- `src/components/inventory-dashboard.tsx`
- `src/components/admin-sku-manager.tsx`
- `src/components/partner-share-manager.tsx`
- `src/types/database.ts`
- `supabase/migrations/20260615000100_partner_share_qty_and_categories.sql`
- `supabase/migrations/20260708000100_partner_share_auto_sync.sql`

2. Run a smoke test through these flows:

- Google login
- workspace selection
- stock adjustment
- create restock request
- SKU create/update with photo
- partner share add product / auto-sync / export
- tutorial lesson download

3. Decide whether to consolidate auth callback logic before larger auth work.

4. Decide whether reports should move toward dedicated RPCs for long-term stability.

## Final Notes

This project is already beyond scaffold stage. The critical architecture choice is that business rules are intentionally pushed into Supabase RPCs rather than implemented only in React/server actions. New engineers should not treat the frontend as the full source of truth for product behavior.

When changing any major flow, inspect all three layers:

- page/component UX
- server action orchestration
- SQL migration / RPC implementation

That is the main rule that will prevent regressions in Aero.

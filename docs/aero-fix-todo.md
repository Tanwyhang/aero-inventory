# Aero Fix Todo

This file captures the requested fixes in a bottom-up implementation order to avoid race conditions between database shape, server actions, shared UI, and page-level UX.

## Current Production Context

- Production URL: `https://aerostocks.vercel.app/`
- Supabase project ref: `mprpwxwzvjywyemyxcbb`
- Main app routes:
  - `/` stock dashboard: `src/app/page.tsx`, `src/components/inventory-dashboard.tsx`
  - `/sku` SKU admin: `src/app/sku/page.tsx`, `src/components/admin-sku-manager.tsx`
  - `/partner-share` partners/share sheets: `src/app/partner-share/page.tsx`, `src/components/partner-share-manager.tsx`
  - `/workspaces` workspace selector: `src/app/workspaces/page.tsx`
- Server actions:
  - stock: `src/app/actions/stock.ts`
  - SKU/category/photo: `src/app/actions/skus.ts`
  - partner share: `src/app/actions/partner-share.ts`
- Shared controls:
  - confirm modal: `src/components/confirm-slide-sheet.tsx`
  - slide confirmation: `src/components/ui/slide-button.tsx`
  - shadcn primitives: `src/components/ui/*`
- Database types: `src/types/database.ts`
- Existing database migrations live in `supabase/migrations/*`.

## Implementation Order

### 1. Database And RPC Foundation

These must land first because several UI issues depend on returned columns, RPC signatures, and schema behavior.

- [ ] Fix SKU save error: `column reference "category_id" is ambiguous`.
  - Source areas:
    - `supabase/migrations/20260615000100_partner_share_qty_and_categories.sql`
    - any later SKU/category RPC migration
    - `src/app/actions/skus.ts`
  - Likely cause: PL/pgSQL variable/parameter named `category_id` conflicts with table column `category_id`.
  - Fix approach: qualify all category references with table aliases or rename local variables, for example `v_category_id`.
  - Acceptance: creating/updating SKU with category works in production and no ambiguous column error appears.

- [ ] Remove the `max_stock_qty` product concept from app behavior.
  - Source areas:
    - schema/RPCs returning `max_stock_qty`: inventory overview RPCs, SKU manager RPCs.
    - `src/types/database.ts`
    - `src/components/inventory-dashboard.tsx`
    - `src/components/admin-sku-manager.tsx`
  - Product direction: there should be no max stock limit per SKU.
  - Keep `low_stock_qty`, but relabel/edit it as `Remaining threshold` or `Low at`.
  - DB caution: avoid destructive column drop unless safe. Prefer stop using it first; optional later migration can deprecate/drop after code no longer depends on it.
  - Acceptance: no UI shows `/ max`, max stock inputs disappear, stock progress no longer depends on `max_stock_qty`.

- [ ] Add proper SKU parent/variant model.
  - Requirement: SKUs should support product variants like Shopee.
  - Examples: parent product `ABC`, child variants `5 packs`, `10 packs`, different flavors, different packages.
  - Existing context:
    - `skus.variant` already exists as text.
    - `sku_variation_groups` and `skus.variation_group_id` appear in `supabase/migrations/20260602000100_stock_reason_price_variations.sql`.
  - Decide whether to use existing `sku_variation_groups` as parent grouping or add a clearer parent product table/parent SKU relation.
  - Acceptance:
    - SKU list displays parent rows with child variant rows underneath.
    - Each child variant remains a distinct sellable/inventory SKU.
    - Stock, restock, partner share, reports still operate on child SKU IDs.

- [ ] Update generated TypeScript database types after schema/RPC changes.
  - Source: `src/types/database.ts`
  - Acceptance: `npm run build` has no stale type errors.

### 2. Shared UI And Loading Primitives

Build these before updating pages so loading/disabled/optimistic behavior is consistent.

- [ ] Add/use a Luma-style spinner loading component.
  - Source target: likely `src/components/ui/luma-spinner.tsx` or equivalent.
  - Requirement: loading state is currently poor; pages feel frozen.
  - Use cases:
    - server action pending states.
    - SKU save/upload.
    - stock movement submit.
    - Partner Share output/status actions.
    - workspace switching/invite actions if easy.
  - Acceptance: any slow action visibly shows loading, not just frozen UI.

- [ ] Fix `SlideButton` logical/loading behavior.
  - Source:
    - `src/components/ui/slide-button.tsx`
    - `src/components/confirm-slide-sheet.tsx`
  - Current issue: when laggy, slider/slide confirmation gets stuck and does not show loading.
  - Requirement: make it optimistic/logically clear.
  - Suggested behavior:
    - once completed, immediately enter loading/submitting state.
    - disable further dragging/clicking while pending.
    - show Luma spinner or clear `Processing...` label.
    - reset only on error or after modal closes.
  - Acceptance: slow network/server action does not leave slider looking stuck.

- [ ] Prefer selectable controls over manual filling wherever feasible.
  - Applies especially to SKU forms, category, supplier/brand, locations, package/variant values.
  - Use shadcn dropdown/select patterns where requested.

### 3. Category Management UX

Do this before SKU form redesign because SKU form depends on category selector behavior.

- [ ] Replace free/manual category entry with dropdown + add option.
  - Source:
    - `src/components/admin-sku-manager.tsx`
    - `src/app/actions/skus.ts`
    - current category RPC/actions in Supabase migrations.
  - Requirement:
    - choose category from dropdown.
    - dropdown includes an `Add category` option.
    - allow category add/edit management.
    - use shadcn dropdown/select UI, not a raw/manual text pattern.
  - Acceptance:
    - admin can create/edit categories.
    - SKU create/update can select a category from dropdown.
    - no ambiguous `category_id` failure.

### 4. SKU Data Entry And Listing

- [ ] Fix stock rules fields with `0` prefix that cannot be backspaced.
  - Source: `src/components/admin-sku-manager.tsx`
  - Likely fields: low stock/remaining threshold and any numeric stock rule inputs.
  - Cause pattern: controlled number input stores a number instead of string, forcing `0` during editing.
  - Fix approach: store draft numeric inputs as strings; coerce/validate on submit.
  - Acceptance: users can clear the field, type a new value, and no leading `0` is forced.

- [ ] Mobile SKU image upload should open gallery, not camera.
  - Source: file input in `src/components/admin-sku-manager.tsx` or SKU photo subcomponent.
  - Check for `capture` attribute or camera-oriented accept config.
  - Fix approach: use `accept="image/*"` without `capture`.
  - Acceptance: on mobile, tapping upload opens photo library/gallery picker by default.

- [ ] Add SKU search/filter bar.
  - Source: `src/components/admin-sku-manager.tsx`
  - Search should match:
    - product name.
    - variant.
    - category.
    - SKU/ISKU code.
    - brand/supplier name.
  - Also allow category filtering via dropdown if practical.
  - Acceptance: SKU tab can quickly find SKUs by category, ISKU/SKU, brand/supplier, name, and variant.

- [ ] Implement parent/child SKU variant display.
  - Source: `src/components/admin-sku-manager.tsx`
  - Must follow DB/RPC changes from step 1.
  - Requirement: child variant rows should display under parent rows.
  - Example display:
    - Parent: `ABC`
    - Child rows: `5 packs`, `10 packs`, `Chicken flavor`, `Tuna flavor`
  - Acceptance: variants are visually grouped but remain individually editable/actionable SKUs.

- [ ] Remove max stock UI from SKU forms and rows.
  - Source:
    - `src/components/admin-sku-manager.tsx`
    - `src/app/actions/skus.ts`
  - Replace with easy-to-edit `Low at` / `Remaining threshold` only.
  - Acceptance: SKU form has no max stock field; low threshold is clear and editable.

### 5. Stock Dashboard And Stock Movement UX

- [ ] Fix stock movement exact movement field so negative values can be typed.
  - Source: `src/components/inventory-dashboard.tsx`
  - Current issue: exact Movement input cannot put negative value.
  - Requirement: exact movement field must allow signed values like `-5` while editing.
  - Important behavior:
    - slider still obeys valid stock range.
    - exact movement input can exceed slider bounds while typing but final submit must validate no negative resulting stock.
  - Likely fix: store movement draft as string and allow intermediate values such as `"-"`, `""`, `"-5"`.
  - Acceptance: user can type `-10` directly in Movement field.

- [ ] Remove max-stock-based progress from stock cards.
  - Source: `src/components/inventory-dashboard.tsx`
  - Current references include `row.max_stock_qty`, `/ {row.max_stock_qty}`, and progress ratios.
  - New logic should be based on remaining/low threshold, not max.
  - Acceptance: stock UI no longer implies a maximum cap.

- [ ] Make `Low at` / remaining threshold easy to edit.
  - Source candidates:
    - stock card quick edit in `src/components/inventory-dashboard.tsx`, or
    - SKU edit modal in `src/components/admin-sku-manager.tsx`.
  - Acceptance: admin can quickly adjust low-stock threshold without dealing with max stock.

### 6. Partner Share UI Cleanup

- [ ] Remove floating mobile WhatsApp / Excel / Confirm action bar that blocks view.
  - Source: `src/components/partner-share-manager.tsx`
  - Current area: bottom fixed action bar around lines with `fixed inset-x-3 bottom...`, containing WhatsApp, Excel, Confirm/Sent/Done/Locked buttons.
  - Requirement: remove floating blocking action buttons.
  - Replacement options:
    - move actions into sheet header/card.
    - use a compact overflow menu.
    - keep actions accessible but not fixed over content.
  - Acceptance: mobile Partner Share content is not blocked by floating actions.

### 7. Global Loading Coverage

- [ ] Add visible loading states across slow actions.
  - Source areas:
    - `src/components/admin-sku-manager.tsx`
    - `src/components/inventory-dashboard.tsx`
    - `src/components/partner-share-manager.tsx`
    - `src/components/workspace-action-button.tsx`
    - `src/components/add-workspace-shortcut-button.tsx` if needed.
  - Use Luma spinner from step 2.
  - Acceptance: users can always tell when save/upload/status/stock actions are in progress.

### 8. Branding

- [ ] Change favicon to Aero square logo.
  - Existing assets:
    - `design/logohorizontal.png` used on login.
    - `public/aero-shortcut.svg` added for workspace shortcut icon.
  - Source targets:
    - `src/app/icon.*` or `public/favicon.ico` depending current Next setup.
    - `src/app/layout.tsx` metadata if needed.
  - Acceptance: browser favicon shows Aero square logo on production.

### 9. Verification And Deployment

- [ ] Run local checks.
  - `npm run lint`
  - `npm run build`

- [ ] Verify database migrations/config.
  - Push migrations/config only after reviewing generated SQL.
  - Ensure `src/types/database.ts` matches remote schema.

- [ ] Test critical flows on production-like environment.
  - Google login first attempt.
  - Workspace selector.
  - SKU create/update with category and image upload.
  - SKU variant parent/child display.
  - Stock movement exact signed input.
  - Low threshold edit.
  - Partner Share mobile without blocking floating bar.
  - Slow action loading/slide confirmation behavior.

- [ ] Deploy to actual production, not preview.
  - Production target: `https://aerostocks.vercel.app/`
  - Command pattern: `vercel deploy . --prod -y --no-wait --scope tanwyhangs-projects`
  - Confirm `aerostocks.vercel.app` appears under deployment aliases.

## Notes For The Next AI/Engineer

- Do not change the bright lime brand color. Current desired lime is `#a7f900` in `src/app/globals.css`.
- Deploy requested changes to production, not only preview.
- Be careful with tenant isolation. Always scope direct table reads/mutations to selected `organization_id` where applicable.
- Avoid broad Supabase config pushes unless intended. Auth config was previously updated for production URL `https://aerostocks.vercel.app`.
- Prefer small migrations and additive compatibility when modifying persisted schema. Do not drop `max_stock_qty` until all code/RPCs no longer rely on it and data impact is understood.

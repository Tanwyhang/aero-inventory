import "server-only";

import { unstable_cache } from "next/cache";
import { z } from "zod";

import { createServiceRoleClient } from "@/lib/supabase/service-role";
import type { AeroSuperAdminCustomer } from "@/types/aero-admin";

export const AERO_ADMIN_CUSTOMERS_CACHE_TAG = "aero:admin:customers";

export type AeroAdminRpcError = {
  code?: string | null;
  message?: string | null;
  details?: string | null;
  hint?: string | null;
};

type AeroAdminRpcResult<T> = {
  data: T | null;
  error: AeroAdminRpcError | null;
};

type UntypedRpcClient = {
  rpc<T>(functionName: string, args?: Record<string, unknown>): PromiseLike<AeroAdminRpcResult<T>>;
};

const customerRowSchema = z.object({
  organization_id: z.string().uuid().optional(),
  workspace_id: z.string().uuid().optional(),
  id: z.string().uuid().optional(),
  organization_name: z.string().trim().min(1).max(200).optional(),
  name: z.string().trim().min(1).max(200).optional(),
  organization_icon: z.string().trim().max(100).nullable().optional(),
  organization_slug: z.string().trim().max(200).nullable().optional(),
  slug: z.string().trim().max(200).nullable().optional(),
  status: z.string().trim().toLowerCase().optional(),
  is_active: z.boolean().optional(),
  plan: z.string().trim().min(1).max(100),
  admin_limit: z.number().int().min(1).max(1_000),
  staff_limit: z.number().int().min(0).max(10_000),
  sku_limit: z.number().int().nonnegative(),
  warehouse_limit: z.number().int().nonnegative(),
  active_admin_count: z.number().int().nonnegative(),
  invited_admin_count: z.number().int().nonnegative(),
  reserved_admin_count: z.number().int().nonnegative(),
  active_staff_count: z.number().int().nonnegative(),
  invited_staff_count: z.number().int().nonnegative(),
  reserved_staff_count: z.number().int().nonnegative(),
  active_viewer_count: z.number().int().nonnegative(),
  member_count: z.number().int().nonnegative().optional(),
  sku_count: z.number().int().nonnegative(),
  warehouse_count: z.number().int().nonnegative(),
  primary_admin_email: z.string().email().nullable(),
  primary_admin_name: z.string().trim().max(200).nullable(),
  last_login_at: z.string().nullable(),
  created_at: z.string(),
  archived_at: z.string().nullable(),
}).passthrough();

export async function callAeroAdminRpc<T>(
  supabase: UntypedRpcClient,
  functionName: string,
  args?: Record<string, unknown>,
) {
  return supabase.rpc<T>(functionName, args);
}

export function parseAeroSuperAdminCustomers(value: unknown): AeroSuperAdminCustomer[] {
  const rows = z.array(customerRowSchema).parse(value ?? []);

  return rows.map((row) => {
    const organizationId = row.organization_id ?? row.workspace_id ?? row.id;
    const name = row.organization_name ?? row.name;

    if (!organizationId || !name) {
      throw new Error("Customer data is missing its workspace identity.");
    }

    const status = row.status === "archived"
      ? "archived"
      : row.status === "suspended" || row.status === "disabled" || row.is_active === false
        ? "suspended"
        : "active";

    return {
      organizationId,
      name,
      icon: row.organization_icon ?? null,
      slug: row.organization_slug ?? row.slug ?? null,
      status,
      plan: row.plan,
      adminLimit: row.admin_limit,
      staffLimit: row.staff_limit,
      skuLimit: row.sku_limit,
      warehouseLimit: row.warehouse_limit,
      activeAdminCount: row.active_admin_count,
      invitedAdminCount: row.invited_admin_count,
      reservedAdminCount: row.reserved_admin_count,
      activeStaffCount: row.active_staff_count,
      invitedStaffCount: row.invited_staff_count,
      reservedStaffCount: row.reserved_staff_count,
      activeViewerCount: row.active_viewer_count,
      memberCount: row.member_count ?? row.active_admin_count + row.active_staff_count + row.active_viewer_count,
      skuCount: row.sku_count,
      warehouseCount: row.warehouse_count,
      primaryAdminEmail: row.primary_admin_email,
      primaryAdminName: row.primary_admin_name,
      lastLoginAt: row.last_login_at,
      createdAt: row.created_at,
      archivedAt: row.archived_at,
    } satisfies AeroSuperAdminCustomer;
  });
}

export const getCachedAeroSuperAdminCustomers = unstable_cache(
  async () => {
    const supabase = createServiceRoleClient();
    const { data, error } = await callAeroAdminRpc<unknown>(supabase, "service_role_list_aero_customers");
    if (error) {
      console.error("Password Aero Super Admin customer list failed", {
        code: error.code ?? null,
        message: error.message ?? null,
      });
      throw new Error("Unable to load Aero customers.");
    }
    return parseAeroSuperAdminCustomers(data);
  },
  ["aero-admin-customers", "v1"],
  { revalidate: 60, tags: [AERO_ADMIN_CUSTOMERS_CACHE_TAG] },
);

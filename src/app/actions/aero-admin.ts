"use server";

import { revalidatePath, revalidateTag } from "next/cache";
import { redirect } from "next/navigation";
import { z } from "zod";

import { safeActionError } from "@/lib/action-error";
import { AERO_ADMIN_CUSTOMERS_CACHE_TAG, callAeroAdminRpc } from "@/lib/aero-admin-server";
import { hasAeroSuperAdminPasswordSession, isAeroSuperAdminPassword, setAeroSuperAdminPasswordSession } from "@/lib/aero-admin-password";
import { createServiceRoleClient } from "@/lib/supabase/service-role";

export type AeroAdminActionState = {
  status: "idle" | "success" | "error";
  message: string;
};

const updateWorkspaceSchema = z.object({
  organizationId: z.string().uuid(),
  adminLimit: z.coerce.number().int().min(1).max(1_000),
  staffLimit: z.coerce.number().int().min(0).max(10_000),
  status: z.enum(["active", "suspended"]),
});

async function verifySuperAdmin() {
  if (!(await hasAeroSuperAdminPasswordSession())) {
    return { supabase: null, authorized: false as const, reason: "session" as const };
  }

  return { supabase: createServiceRoleClient(), authorized: true as const, reason: null };
}

export async function unlockAeroAdminAction(formData: FormData) {
  const password = String(formData.get("password") ?? "");

  if (!isAeroSuperAdminPassword(password)) {
    redirect("/aero-admin?error=password");
  }

  await setAeroSuperAdminPasswordSession();
  redirect("/aero-admin");
}

export async function updateAeroCustomerAction(
  _previousState: AeroAdminActionState,
  formData: FormData,
): Promise<AeroAdminActionState> {
  const parsed = updateWorkspaceSchema.safeParse({
    organizationId: formData.get("organizationId"),
    adminLimit: formData.get("adminLimit"),
    staffLimit: formData.get("staffLimit"),
    status: formData.get("status"),
  });

  if (!parsed.success) {
    return {
      status: "error",
      message: "Enter valid login limits before saving.",
    };
  }

  const access = await verifySuperAdmin();
  if (!access.authorized) {
    return {
      status: "error",
      message: access.reason === "session" ? "Your session expired. Sign in again." : "You do not have permission to manage customers.",
    };
  }

  const { data, error } = await callAeroAdminRpc<string>(access.supabase, "service_role_update_aero_customer", {
    p_organization_id: parsed.data.organizationId,
    p_admin_limit: parsed.data.adminLimit,
    p_staff_limit: parsed.data.staffLimit,
    p_status: parsed.data.status,
  });

  if (error || !data) {
    if (/login limit cannot be below current usage/i.test(error?.message ?? "")) {
      return {
        status: "error",
        message: "Login limits cannot be lower than active, invited, or reserved seats.",
      };
    }

    return {
      status: "error",
      message: safeActionError(error ?? new Error("Workspace update returned no result."), "aero-admin.update-workspace", "Customer settings could not be saved."),
    };
  }

  revalidatePath("/aero-admin");
  revalidateTag(AERO_ADMIN_CUSTOMERS_CACHE_TAG);
  return { status: "success", message: "Customer settings saved." };
}

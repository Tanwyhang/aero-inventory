"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";

import { safeActionError } from "@/lib/action-error";
import { callAeroAdminRpc } from "@/lib/aero-admin-server";
import { isMissingSessionError } from "@/lib/auth";
import { createClient } from "@/lib/supabase/server";

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
  const supabase = await createClient();
  const { data: userData, error: userError } = await supabase.auth.getUser();

  if (userError && !isMissingSessionError(userError)) {
    console.error("Aero Super Admin action session lookup failed", {
      code: userError.code,
      message: userError.message,
    });
    return { supabase, authorized: false, reason: "verify" as const };
  }

  if (!userData.user) return { supabase, authorized: false, reason: "session" as const };

  const { data, error } = await callAeroAdminRpc<boolean>(supabase, "is_aero_super_admin");
  if (error) {
    console.error("Aero Super Admin action authorization failed", {
      userId: userData.user.id,
      code: error.code ?? null,
      message: error.message ?? null,
    });
    return { supabase, authorized: false, reason: "verify" as const };
  }

  return { supabase, authorized: data === true, reason: data === true ? null : "access" as const };
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

  const { data, error } = await callAeroAdminRpc<string>(access.supabase, "super_admin_update_workspace", {
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
  return { status: "success", message: "Customer settings saved." };
}

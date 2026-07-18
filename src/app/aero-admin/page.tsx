import { notFound, redirect } from "next/navigation";

import { AeroSuperAdminDashboard } from "@/components/aero-super-admin-dashboard";
import { callAeroAdminRpc, parseAeroSuperAdminCustomers } from "@/lib/aero-admin-server";
import { isMissingSessionError } from "@/lib/auth";
import { createClient } from "@/lib/supabase/server";

export default async function AeroAdminPage() {
  const supabase = await createClient();
  const { data: userData, error: userError } = await supabase.auth.getUser();

  if (userError && !isMissingSessionError(userError)) {
    console.error("Aero Super Admin session lookup failed", {
      code: userError.code,
      message: userError.message,
    });
    throw new Error("Unable to verify the current session.");
  }

  if (!userData.user) redirect("/login");

  const { error: claimError } = await callAeroAdminRpc<boolean>(supabase, "claim_platform_admin");
  if (claimError) {
    console.error("Aero Super Admin owner claim failed", {
      userId: userData.user.id,
      code: claimError.code ?? null,
      message: claimError.message ?? null,
    });
    throw new Error("Unable to verify Aero administration access.");
  }

  const { data: isSuperAdmin, error: accessError } = await callAeroAdminRpc<boolean>(supabase, "is_aero_super_admin");
  if (accessError) {
    console.error("Aero Super Admin access check failed", {
      userId: userData.user.id,
      code: accessError.code ?? null,
      message: accessError.message ?? null,
    });
    throw new Error("Unable to verify Aero administration access.");
  }

  if (isSuperAdmin !== true) notFound();

  const { data, error } = await callAeroAdminRpc<unknown>(supabase, "super_admin_list_customers");
  if (error) {
    console.error("Aero Super Admin customer list failed", {
      userId: userData.user.id,
      code: error.code ?? null,
      message: error.message ?? null,
    });
    throw new Error("Unable to load Aero customers.");
  }

  let customers;
  try {
    customers = parseAeroSuperAdminCustomers(data);
  } catch (parseError) {
    console.error("Aero Super Admin customer response was invalid", {
      userId: userData.user.id,
      name: parseError instanceof Error ? parseError.name : "UnknownError",
      message: parseError instanceof Error ? parseError.message : null,
    });
    throw new Error("Unable to load Aero customers.");
  }

  return <AeroSuperAdminDashboard customers={customers} accountEmail={userData.user.email ?? "Aero owner"} />;
}

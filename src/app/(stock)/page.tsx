import { redirect } from "next/navigation";

import { InventoryDashboard } from "@/components/inventory-dashboard";
import { requireMembership } from "@/lib/auth";
import { withSignedSkuPhotoUrls } from "@/lib/sku-photos";
import { createClient } from "@/lib/supabase/server";
import type { AdminInventoryRow, StaffInventoryRow } from "@/types/database";

export default async function Home({ searchParams }: { searchParams: Promise<{ code?: string }> }) {
  const params = await searchParams;

  if (params.code) {
    const supabase = await createClient();
    const { error } = await supabase.auth.exchangeCodeForSession(params.code);

    if (!error) {
      await supabase.rpc("claim_bootstrap_admin");
      redirect("/workspaces");
    }

    console.error("Supabase root OAuth callback failed", {
      message: error.message,
      hasCode: Boolean(params.code),
    });

    redirect("/login?error=callback");
  }

  const membership = await requireMembership();
  const supabase = await createClient();
  const [{ data: staffRows, error: staffError }, { data: adminRows, error: adminError }, { data: restockRequests, error: restockError }] = await Promise.all([
    supabase.rpc("get_staff_inventory_overview", { p_organization_id: membership.organization_id }),
    membership.role === "admin"
      ? supabase.rpc("get_admin_inventory_overview", { p_organization_id: membership.organization_id })
      : Promise.resolve({ data: [], error: null }),
    membership.role === "admin"
      ? supabase.rpc("get_admin_restock_requests", { p_organization_id: membership.organization_id })
      : Promise.resolve({ data: [], error: null }),
  ]);

  if (staffError || adminError || restockError) {
    console.error("Inventory overview failed to load", {
      workspaceId: membership.organization_id,
      staffCode: staffError?.code ?? null,
      adminCode: adminError?.code ?? null,
      restockCode: restockError?.code ?? null,
      staffMessage: staffError?.message ?? null,
      adminMessage: adminError?.message ?? null,
      restockMessage: restockError?.message ?? null,
    });
    throw new Error("Unable to load inventory.");
  }

  const [signedStaffRows, signedAdminRows] = await Promise.all([
    withSignedSkuPhotoUrls((staffRows ?? []) as StaffInventoryRow[]),
    withSignedSkuPhotoUrls((adminRows ?? []) as AdminInventoryRow[]),
  ]);

  return <InventoryDashboard membership={membership} staffRows={signedStaffRows} adminRows={signedAdminRows} restockRequests={restockRequests ?? []} />;
}

import { InventoryDashboard } from "@/components/inventory-dashboard";
import { requireMembership } from "@/lib/auth";
import { withSignedSkuPhotoUrls } from "@/lib/sku-photos";
import { createClient } from "@/lib/supabase/server";
import type { AdminInventoryRow, StaffInventoryRow } from "@/types/database";

export default async function Home() {
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
    throw new Error(staffError?.message ?? adminError?.message ?? restockError?.message ?? "Failed to load inventory");
  }

  const [signedStaffRows, signedAdminRows] = await Promise.all([
    withSignedSkuPhotoUrls((staffRows ?? []) as StaffInventoryRow[]),
    withSignedSkuPhotoUrls((adminRows ?? []) as AdminInventoryRow[]),
  ]);

  return <InventoryDashboard membership={membership} staffRows={signedStaffRows} adminRows={signedAdminRows} restockRequests={restockRequests ?? []} />;
}

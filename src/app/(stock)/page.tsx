import { redirect } from "next/navigation";

import { LazyInventoryDashboard } from "@/components/lazy-page-components";
import { getRequestAccessToken, requireMembership } from "@/lib/auth";
import { getCachedActiveRestockCount, getCachedAdminInventory, getCachedStaffInventory } from "@/lib/cached-data";
import { withSignedSkuPhotoUrls } from "@/lib/sku-photos";
import { createClient } from "@/lib/supabase/server";

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
  const accessToken = await getRequestAccessToken();
  if (!accessToken) redirect("/login");

  const dashboardMembership = {
    organization_id: membership.organization_id,
    organization_name: membership.organization_name,
    organization_icon: membership.organization_icon,
    role: membership.role,
  };

  if (membership.role === "admin") {
    const [adminRows, restockCount] = await Promise.all([
      getCachedAdminInventory(membership.organization_id, accessToken),
      getCachedActiveRestockCount(membership.organization_id, accessToken),
    ]);
    const signedAdminRows = await withSignedSkuPhotoUrls(adminRows);

    return <LazyInventoryDashboard membership={dashboardMembership} staffRows={[]} adminRows={signedAdminRows} restockCount={restockCount} />;
  }

  const staffRows = await getCachedStaffInventory(membership.organization_id, accessToken);
  const signedStaffRows = await withSignedSkuPhotoUrls(staffRows);

  return <LazyInventoryDashboard membership={dashboardMembership} staffRows={signedStaffRows} adminRows={[]} restockCount={0} />;
}

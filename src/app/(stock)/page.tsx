import { redirect } from "next/navigation";

import { LazyInventoryDashboard } from "@/components/lazy-page-components";
import { getRequestAccessToken, requireMembership } from "@/lib/auth";
import { getCachedAdminInventory, getCachedRestockRequests, getCachedStaffInventory } from "@/lib/cached-data";
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

  const [staffRows, adminRows, restockRequests] = await Promise.all([
    getCachedStaffInventory(membership.organization_id, accessToken),
    membership.role === "admin"
      ? getCachedAdminInventory(membership.organization_id, accessToken)
      : Promise.resolve([]),
    membership.role === "admin"
      ? getCachedRestockRequests(membership.organization_id, accessToken)
      : Promise.resolve([]),
  ]);

  const [signedStaffRows, signedAdminRows] = await Promise.all([
    withSignedSkuPhotoUrls(staffRows),
    withSignedSkuPhotoUrls(adminRows),
  ]);

  return <LazyInventoryDashboard membership={membership} staffRows={signedStaffRows} adminRows={signedAdminRows} restockRequests={restockRequests} />;
}

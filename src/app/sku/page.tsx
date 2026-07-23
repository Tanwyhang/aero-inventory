import { FluidEntrySurface } from "@/components/fluid-entry-surface";
import { LazyAdminSkuManager } from "@/components/lazy-page-components";
import { redirect } from "next/navigation";

import { getRequestAccessToken, requireMembership } from "@/lib/auth";
import { getCachedProductCategories, getCachedRestockRequests, getCachedSkuManagerRows } from "@/lib/cached-data";
import { withSignedSkuPhotoUrls } from "@/lib/sku-photos";

export default async function SkuPage() {
  const membership = await requireMembership();

  if (membership.role !== "admin") {
    return (
      <main className="grid min-h-screen place-items-center bg-white px-5 text-black">
        <FluidEntrySurface className="max-w-lg rounded-3xl border border-white/50 bg-white/70 backdrop-blur-2xl" contentClassName="p-8 text-center">
          <h1 className="text-3xl font-black tracking-[-0.05em]">Admin access required</h1>
          <p className="mt-3 font-semibold text-zinc-600">Staff can update stock from the inventory overview, but SKU management is restricted.</p>
        </FluidEntrySurface>
      </main>
    );
  }

  const accessToken = await getRequestAccessToken();
  if (!accessToken) redirect("/login");

  const [data, restockRequests, categories] = await Promise.all([
    getCachedSkuManagerRows(membership.organization_id, accessToken),
    getCachedRestockRequests(membership.organization_id, accessToken),
    getCachedProductCategories(membership.organization_id, accessToken),
  ]);

  const rows = await withSignedSkuPhotoUrls(data);

  return <LazyAdminSkuManager membership={membership} rows={rows} categories={categories} restockCount={restockRequests.length} />;
}

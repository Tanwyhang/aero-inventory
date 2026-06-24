import { AdminSkuManager } from "@/components/admin-sku-manager";
import { FluidEntrySurface } from "@/components/fluid-entry-surface";
import { requireMembership } from "@/lib/auth";
import { withSignedSkuPhotoUrls } from "@/lib/sku-photos";
import { createClient } from "@/lib/supabase/server";
import type { AdminSkuManagerRow } from "@/types/database";

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

  const supabase = await createClient();
  const [{ data, error }, { data: restockRequests, error: restockError }, { data: categories, error: categoriesError }] = await Promise.all([
    supabase.rpc("get_admin_sku_manager_rows", { p_organization_id: membership.organization_id }),
    supabase.rpc("get_admin_restock_requests", { p_organization_id: membership.organization_id }),
    supabase
      .from("product_categories")
      .select("id, name")
      .eq("organization_id", membership.organization_id)
      .is("archived_at", null)
      .order("name", { ascending: true }),
  ]);

  if (error || restockError || categoriesError) {
    throw new Error(error?.message ?? restockError?.message ?? categoriesError?.message ?? "Failed to load SKUs");
  }

  const rows = await withSignedSkuPhotoUrls((data ?? []) as AdminSkuManagerRow[]);

  return <AdminSkuManager membership={membership} rows={rows} categories={categories ?? []} restockCount={(restockRequests ?? []).length} />;
}

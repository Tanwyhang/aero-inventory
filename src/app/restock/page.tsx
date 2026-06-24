import { redirect } from "next/navigation";

import { AppSidebar } from "@/components/app-sidebar";
import { RestockQueue } from "@/components/inventory-dashboard";
import { requireMembership } from "@/lib/auth";
import { createClient } from "@/lib/supabase/server";
import type { AdminInventoryRow, RestockRequestRow } from "@/types/database";

export default async function RestockPage() {
  const membership = await requireMembership();

  if (membership.role !== "admin") {
    redirect("/");
  }

  const supabase = await createClient();
  const [{ data: adminRows, error: adminError }, { data: restockRequests, error: restockError }] = await Promise.all([
    supabase.rpc("get_admin_inventory_overview", { p_organization_id: membership.organization_id }),
    supabase.rpc("get_admin_restock_requests", { p_organization_id: membership.organization_id }),
  ]);

  if (adminError || restockError) {
    throw new Error(adminError?.message ?? restockError?.message ?? "Failed to load restock requests");
  }

  return (
    <main className="min-h-screen overflow-x-hidden bg-white pb-[calc(6rem+env(safe-area-inset-bottom))] text-black lg:pb-0">
      <div className="min-h-screen lg:pl-[242px]">
        <AppSidebar active="restock" role="admin" restockCount={(restockRequests ?? []).length} />

        <section className="px-3 py-4 sm:px-8 sm:py-8 lg:px-7 xl:px-8">
          <header>
            <h1 className="text-2xl font-black tracking-[-0.055em] sm:text-[44px]">Restock</h1>
            <p className="mt-1.5 max-w-xl text-xs font-semibold text-zinc-500 sm:mt-2 sm:text-sm">Contact suppliers and clear active restock requests from one dedicated workflow.</p>
          </header>

          <RestockQueue requests={(restockRequests ?? []) as RestockRequestRow[]} rows={(adminRows ?? []) as AdminInventoryRow[]} />
        </section>
      </div>
    </main>
  );
}

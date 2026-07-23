import { redirect } from "next/navigation";

import { AppSidebar } from "@/components/app-sidebar";
import { LazyRestockQueue } from "@/components/lazy-page-components";
import { getRequestAccessToken, requireMembership } from "@/lib/auth";
import { getCachedAdminInventory, getCachedRestockRequests } from "@/lib/cached-data";

export default async function RestockPage() {
  const membership = await requireMembership();

  if (membership.role !== "admin") {
    redirect("/");
  }

  const accessToken = await getRequestAccessToken();
  if (!accessToken) redirect("/login");

  const [adminRows, restockRequests] = await Promise.all([
    getCachedAdminInventory(membership.organization_id, accessToken),
    getCachedRestockRequests(membership.organization_id, accessToken),
  ]);

  return (
    <main className="min-h-screen overflow-x-hidden bg-white pb-[calc(6rem+env(safe-area-inset-bottom))] text-black lg:pb-0">
      <div className="min-h-screen lg:pl-[242px]">
        <AppSidebar active="restock" role="admin" workspaceName={membership.organization_name} restockCount={restockRequests.length} />

        <section className="px-3 py-4 sm:px-8 sm:py-8 lg:px-7 xl:px-8">
          <header>
            <h1 className="text-2xl font-black tracking-[-0.055em] sm:text-[44px]">Restock</h1>
            <p className="mt-1.5 max-w-xl text-xs font-semibold text-zinc-500 sm:mt-2 sm:text-sm">Contact suppliers and clear active restock requests from one dedicated workflow.</p>
          </header>

          <LazyRestockQueue requests={restockRequests} rows={adminRows} />
        </section>
      </div>
    </main>
  );
}

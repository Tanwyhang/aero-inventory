import { redirect } from "next/navigation";

import { AppSidebar } from "@/components/app-sidebar";
import { FluidEntrySurface } from "@/components/fluid-entry-surface";
import { LazyReportsActivityLists, LazyReportsAreaChart } from "@/components/lazy-page-components";
import type { ReportAudit, ReportMovement, ReportRestock } from "@/components/reports-activity-lists";
import type { ReportsAreaDatum } from "@/components/reports-area-chart";
import { getRequestAccessToken, requireMembership } from "@/lib/auth";
import {
  getCachedAdminInventory,
  getCachedReportActivity,
  getCachedReportReferences,
  getCachedRestockRequests,
  type ReportAuditEventRow,
  type ReportMovementRow,
} from "@/lib/cached-data";
import { withSignedSkuPhotoUrls } from "@/lib/sku-photos";

function memberRole(role: string | null | undefined): "admin" | "staff" | null {
  if (role === "admin" || role === "staff") return role;
  return null;
}

function getMovementChartData(movements: { created_at: string; quantity_delta: number }[]): ReportsAreaDatum[] {
  const now = new Date();
  const months = Array.from({ length: 6 }, (_, index) => {
    const date = new Date(now.getFullYear(), now.getMonth() - 5 + index, 1);

    return {
      key: `${date.getFullYear()}-${date.getMonth()}`,
      month: date.toLocaleString("en", { month: "short" }),
      movement: 0,
    };
  });

  for (const movement of movements) {
    const date = new Date(movement.created_at);
    const key = `${date.getFullYear()}-${date.getMonth()}`;
    const bucket = months.find((month) => month.key === key);

    if (bucket) {
      bucket.movement += Math.abs(movement.quantity_delta);
    }
  }

  return months.map(({ month, movement }) => ({ month, movement }));
}

export default async function ReportsPage() {
  const membership = await requireMembership();

  if (membership.role !== "admin") {
    return (
      <main className="grid min-h-screen place-items-center bg-white px-5 text-black">
        <FluidEntrySurface className="max-w-lg rounded-3xl border border-white/50 bg-white/70 backdrop-blur-2xl" contentClassName="p-8 text-center">
          <h1 className="text-3xl font-black tracking-[-0.05em]">Reports are admin-only</h1>
          <p className="mt-3 font-semibold text-zinc-600">Your staff account can update inventory from the stock overview.</p>
        </FluidEntrySurface>
      </main>
    );
  }

  const accessToken = await getRequestAccessToken();
  if (!accessToken) redirect("/login");

  const [{ movements, auditEvents }, restockRows, adminRows, references] = await Promise.all([
    getCachedReportActivity(membership.organization_id, accessToken),
    getCachedRestockRequests(membership.organization_id, accessToken),
    getCachedAdminInventory(membership.organization_id, accessToken),
    getCachedReportReferences(membership.organization_id, accessToken),
  ]);

  const movementRows = movements as ReportMovementRow[];
  const auditRows = auditEvents as ReportAuditEventRow[];
  const actorById = new Map(references.members.map((actor) => [actor.user_id, actor]));
  const locationById = new Map(references.locations.map((location) => [location.id, location]));
  const movementChartData = getMovementChartData(movementRows);
  const inventoryRows = await withSignedSkuPhotoUrls(adminRows);
  const inventoryBySku = new Map(inventoryRows.map((row) => [row.sku_id, row]));
  const reportMovements: ReportMovement[] = movementRows.slice(0, 20).map((movement) => {
    const row = inventoryBySku.get(movement.sku_id);
    const actor = actorById.get(movement.actor_user_id);
    const actorName = actor?.full_name || actor?.email || "Unknown user";

    return {
      id: movement.id,
      skuId: movement.sku_id,
      skuCode: row?.sku_code ?? "Unknown SKU",
      productName: row?.product_name ?? "Stock movement",
      photoUrl: row?.photo_url ?? null,
      movementType: movement.movement_type,
      quantityDelta: movement.quantity_delta,
      quantityBefore: movement.quantity_before,
      quantityAfter: movement.quantity_after,
      reason: movement.reason ?? "Stock Adjustment",
      locationId: movement.location_id,
      locationName: locationById.get(movement.location_id)?.name ?? row?.location_name ?? "Unknown warehouse",
      actorRole: memberRole(actor?.role),
      actorName,
      note: movement.note,
      createdAt: movement.created_at,
    };
  });
  const reportRestocks: ReportRestock[] = restockRows.map((request) => {
    const row = inventoryBySku.get(request.sku_id);

    return {
      id: request.id,
      skuId: request.sku_id,
      skuCode: request.sku_code,
      productName: request.product_name,
      photoUrl: row?.photo_url ?? null,
      status: request.status,
      requestedQty: request.requested_qty,
      currentQty: request.current_qty_snapshot,
      lowStockQty: request.low_stock_qty_snapshot,
      requestedBy: request.requested_by_name || request.requested_by_email || "Unknown staff",
      note: request.note,
      createdAt: request.created_at,
    };
  });
  const reportAudits: ReportAudit[] = auditRows.map((event) => {
    const actor = event.actor_user_id ? actorById.get(event.actor_user_id) : null;

    return {
      id: event.id,
      action: event.action,
      eventType: event.event_type,
      entityType: event.entity_type,
      entityLabel: event.entity_label,
      actorRole: memberRole(event.actor_role) ?? memberRole(actor?.role),
      actorName: actor?.full_name || actor?.email || null,
      createdAt: event.created_at,
      beforeData: event.before_data,
      afterData: event.after_data,
      metadata: event.metadata,
    };
  });

  return (
    <main className="min-h-screen overflow-x-hidden bg-white pb-[calc(6rem+env(safe-area-inset-bottom))] text-black lg:pb-0">
      <div className="min-h-screen lg:pl-[242px]">
        <AppSidebar active="reports" role="admin" workspaceName={membership.organization_name} restockCount={restockRows.length} />
        <section className="px-3 py-4 sm:px-8 sm:py-8 lg:px-7 xl:px-8">
          <h1 className="text-2xl font-black tracking-[-0.055em] sm:text-[44px]">Reports</h1>
          <p className="mt-1.5 text-sm font-semibold text-zinc-500 sm:text-base">Operational stock, restock, and audit trail.</p>

          <LazyReportsAreaChart data={movementChartData} />

          <LazyReportsActivityLists movements={reportMovements} restocks={reportRestocks} audits={reportAudits} />
        </section>
      </div>
    </main>
  );
}

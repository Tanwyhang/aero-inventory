import { AppSidebar } from "@/components/app-sidebar";
import { FluidEntrySurface } from "@/components/fluid-entry-surface";
import { ReportsActivityLists, type ReportAudit, type ReportMovement, type ReportRestock } from "@/components/reports-activity-lists";
import { ReportsAreaChart, type ReportsAreaDatum } from "@/components/reports-area-chart";
import { requireMembership } from "@/lib/auth";
import { withSignedSkuPhotoUrls } from "@/lib/sku-photos";
import { createClient } from "@/lib/supabase/server";
import type { AdminInventoryRow, RestockRequestRow, StockAdjustmentReason } from "@/types/database";

type MovementRow = {
  id: string;
  sku_id: string;
  location_id: string;
  actor_user_id: string;
  movement_type: string;
  quantity_delta: number;
  quantity_before: number;
  quantity_after: number;
  reason: StockAdjustmentReason | null;
  note: string | null;
  created_at: string;
};

type AuditEventRow = {
  id: string;
  event_type: string;
  entity_type: string;
  action: string;
  entity_label: string | null;
  actor_user_id: string | null;
  actor_role: string | null;
  before_data: unknown;
  after_data: unknown;
  metadata: unknown;
  created_at: string;
};

function uniqueStrings(values: Array<string | null | undefined>) {
  return Array.from(new Set(values.filter((value): value is string => Boolean(value))));
}

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

  const supabase = await createClient();
  const [{ data: movements }, { data: auditEvents }, { data: restockRequests }, { data: adminRows, error: adminRowsError }] = await Promise.all([
    supabase
      .from("stock_movements")
      .select("id, sku_id, location_id, actor_user_id, movement_type, quantity_delta, quantity_before, quantity_after, reason, note, created_at")
      .order("created_at", { ascending: false })
      .limit(200),
    supabase
      .from("audit_events")
      .select("id, event_type, entity_type, action, entity_label, actor_user_id, actor_role, before_data, after_data, metadata, created_at")
      .order("created_at", { ascending: false })
      .limit(20),
    supabase.rpc("get_admin_restock_requests", { p_organization_id: membership.organization_id }),
    supabase.rpc("get_admin_inventory_overview", { p_organization_id: membership.organization_id }),
  ]);

  if (adminRowsError) {
    throw new Error(adminRowsError.message);
  }

  const restockRows = (restockRequests ?? []) as RestockRequestRow[];
  const movementRows = (movements ?? []) as MovementRow[];
  const auditRows = (auditEvents ?? []) as AuditEventRow[];
  const actorIds = uniqueStrings([...movementRows.map((movement) => movement.actor_user_id), ...auditRows.map((event) => event.actor_user_id)]);
  const locationIds = uniqueStrings(movementRows.map((movement) => movement.location_id));
  const [{ data: actorProfiles }, { data: actorMemberships }, { data: locations }] = await Promise.all([
    actorIds.length > 0 ? supabase.from("profiles").select("id, full_name, email").in("id", actorIds) : Promise.resolve({ data: [], error: null }),
    actorIds.length > 0 ? supabase.from("organization_members").select("user_id, role").eq("organization_id", membership.organization_id).in("user_id", actorIds) : Promise.resolve({ data: [], error: null }),
    locationIds.length > 0 ? supabase.from("locations").select("id, name").eq("organization_id", membership.organization_id).in("id", locationIds) : Promise.resolve({ data: [], error: null }),
  ]);
  const actorProfileById = new Map((actorProfiles ?? []).map((profile) => [profile.id, profile]));
  const actorRoleById = new Map((actorMemberships ?? []).map((actor) => [actor.user_id, memberRole(actor.role)]));
  const locationById = new Map((locations ?? []).map((location) => [location.id, location]));
  const movementChartData = getMovementChartData(movementRows);
  const inventoryRows = await withSignedSkuPhotoUrls((adminRows ?? []) as AdminInventoryRow[]);
  const inventoryBySku = new Map(inventoryRows.map((row) => [row.sku_id, row]));
  const reportMovements: ReportMovement[] = movementRows.slice(0, 20).map((movement) => {
    const row = inventoryBySku.get(movement.sku_id);
    const actorProfile = actorProfileById.get(movement.actor_user_id);
    const actorName = actorProfile?.full_name || actorProfile?.email || "Unknown user";

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
      actorRole: actorRoleById.get(movement.actor_user_id) ?? null,
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
    const actorProfile = event.actor_user_id ? actorProfileById.get(event.actor_user_id) : null;

    return {
      id: event.id,
      action: event.action,
      eventType: event.event_type,
      entityType: event.entity_type,
      entityLabel: event.entity_label,
      actorRole: memberRole(event.actor_role) ?? (event.actor_user_id ? actorRoleById.get(event.actor_user_id) ?? null : null),
      actorName: actorProfile?.full_name || actorProfile?.email || null,
      createdAt: event.created_at,
      beforeData: event.before_data,
      afterData: event.after_data,
      metadata: event.metadata,
    };
  });

  return (
    <main className="min-h-screen bg-white pb-24 text-black lg:pb-0">
      <div className="min-h-screen lg:pl-[242px]">
        <AppSidebar active="reports" role="admin" restockCount={restockRows.length} />
        <section className="px-4 py-5 sm:px-8 sm:py-8 lg:px-7 xl:px-8">
          <h1 className="text-4xl font-black tracking-[-0.055em] sm:text-[44px]">Reports</h1>
          <p className="mt-2 text-base font-semibold text-zinc-500">Operational stock, restock, and audit trail.</p>

          <ReportsAreaChart data={movementChartData} />

          <ReportsActivityLists movements={reportMovements} restocks={reportRestocks} audits={reportAudits} />
        </section>
      </div>
    </main>
  );
}

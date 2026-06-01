import { AppSidebar } from "@/components/app-sidebar";
import { FluidEntrySurface } from "@/components/fluid-entry-surface";
import { requireMembership } from "@/lib/auth";
import { createClient } from "@/lib/supabase/server";
import type { RestockRequestRow } from "@/types/database";

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
  const [{ data: movements }, { data: auditEvents }, { data: restockRequests }] = await Promise.all([
    supabase
      .from("stock_movements")
      .select("id, movement_type, quantity_delta, quantity_before, quantity_after, note, created_at")
      .order("created_at", { ascending: false })
      .limit(20),
    supabase
      .from("audit_events")
      .select("id, event_type, entity_type, action, entity_label, created_at")
      .order("created_at", { ascending: false })
      .limit(20),
    supabase.rpc("get_admin_restock_requests", { p_organization_id: membership.organization_id }),
  ]);
  const restockRows = (restockRequests ?? []) as RestockRequestRow[];

  return (
    <main className="min-h-screen bg-white text-black">
      <div className="min-h-screen lg:pl-[242px]">
        <AppSidebar active="reports" role="admin" />
        <section className="px-5 py-8 sm:px-8 lg:px-7 xl:px-8">
          <h1 className="text-4xl font-black tracking-[-0.055em] sm:text-[44px]">Reports</h1>
          <p className="mt-2 text-base font-semibold text-zinc-500">Operational stock, restock, and audit trail.</p>

          <div className="mt-8 grid gap-6 xl:grid-cols-3">
            <FluidEntrySurface entryDelay={0} className="rounded-3xl border border-white/50 bg-white/60 backdrop-blur-2xl" contentClassName="p-6">
              <h2 className="text-2xl font-black tracking-[-0.05em]">Stock Movements</h2>
              <div className="mt-5 grid gap-3">
                {(movements ?? []).map((movement) => (
                  <div key={movement.id} className="liquid-width-enter rounded-lg border border-white/40 bg-white/40 p-4 backdrop-blur-lg">
                    <div className="flex items-center justify-between gap-4">
                      <div className="font-bold capitalize">{movement.movement_type} {movement.quantity_delta}</div>
                      <div className="text-sm font-semibold text-zinc-500">{new Date(movement.created_at).toLocaleString()}</div>
                    </div>
                    <div className="mt-2 text-sm font-semibold text-zinc-600">{movement.quantity_before} → {movement.quantity_after}</div>
                    {movement.note ? <div className="mt-2 text-sm font-medium text-zinc-500">{movement.note}</div> : null}
                  </div>
                ))}
              </div>
            </FluidEntrySurface>

            <FluidEntrySurface entryDelay={0.08} className="rounded-3xl border border-white/50 bg-white/60 backdrop-blur-2xl" contentClassName="p-6">
              <h2 className="text-2xl font-black tracking-[-0.05em]">Restock Requests</h2>
              <div className="mt-5 grid gap-3">
                {restockRows.map((request) => (
                  <div key={request.id} className="liquid-width-enter rounded-lg border border-white/40 bg-white/40 p-4 backdrop-blur-lg">
                    <div className="flex items-center justify-between gap-4">
                      <div className="font-bold">{request.product_name}</div>
                      <div className="text-sm font-semibold capitalize text-zinc-500">{request.status}</div>
                    </div>
                    <div className="mt-2 text-sm font-semibold text-zinc-600">
                      {request.sku_code} · pinged by {request.requested_by_name || request.requested_by_email || "Unknown staff"}
                    </div>
                    <div className="mt-2 text-sm font-semibold text-zinc-500">
                      Stock {request.current_qty_snapshot} · Low threshold {request.low_stock_qty_snapshot}
                      {request.requested_qty ? ` · Requested ${request.requested_qty}` : ""}
                    </div>
                    {request.note ? <div className="mt-2 text-sm font-medium text-zinc-500">{request.note}</div> : null}
                  </div>
                ))}
              </div>
            </FluidEntrySurface>

            <FluidEntrySurface entryDelay={0.16} className="rounded-3xl border border-white/50 bg-white/60 backdrop-blur-2xl" contentClassName="p-6">
              <h2 className="text-2xl font-black tracking-[-0.05em]">Audit Events</h2>
              <div className="mt-5 grid gap-3">
                {(auditEvents ?? []).map((event) => (
                  <div key={event.id} className="liquid-width-enter rounded-lg border border-white/40 bg-white/40 p-4 backdrop-blur-lg">
                    <div className="flex items-center justify-between gap-4">
                      <div className="font-bold">{event.action}</div>
                      <div className="text-sm font-semibold text-zinc-500">{new Date(event.created_at).toLocaleString()}</div>
                    </div>
                    <div className="mt-2 text-sm font-semibold text-zinc-600">{event.event_type} · {event.entity_type}</div>
                    {event.entity_label ? <div className="mt-2 text-sm font-medium text-zinc-500">{event.entity_label}</div> : null}
                  </div>
                ))}
              </div>
            </FluidEntrySurface>
          </div>
        </section>
      </div>
    </main>
  );
}

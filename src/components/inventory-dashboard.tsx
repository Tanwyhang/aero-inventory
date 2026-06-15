"use client";

import Image from "next/image";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { FormEvent, useMemo, useState } from "react";
import { motion } from "motion/react";
import {
  ArrowUpDown,
  Check,
  ChevronDown,
  ChevronLeft,
  ChevronRight,
  Menu,
  Minus,
  Package,
  Plus,
  Search,
  ShieldCheck,
  TriangleAlert,
  X,
} from "lucide-react";

import { adjustStockAction } from "@/app/actions/stock";
import { createRestockRequestAction, updateRestockStatusAction } from "@/app/actions/restock";
import { signOut } from "@/app/actions/auth";
import { AppSidebar } from "@/components/app-sidebar";
import { ConfirmSlideSheet } from "@/components/confirm-slide-sheet";
import { FluidEntrySurface } from "@/components/fluid-entry-surface";
import { StoreIdentityEditor } from "@/components/store-identity-editor";
import { Button } from "@/components/ui/button";
import { toast } from "@/components/ui/toast";
import { WhatsAppLink } from "@/components/whatsapp-link";
import { DEFAULT_STOCK_ADJUSTMENT_REASON, STOCK_ADJUSTMENT_REASONS, type StockAdjustmentReason } from "@/lib/stock-reasons";
import { cn } from "@/lib/utils";
import type { AdminInventoryRow, Membership, RestockRequestRow, RestockStatus, StaffInventoryRow } from "@/types/database";

type InventoryRow = StaffInventoryRow | AdminInventoryRow;

function isAdminRow(row: InventoryRow): row is AdminInventoryRow {
  return "supplier_name" in row;
}

export function ProductThumb({ label, photoUrl, eager = false }: { label: string; photoUrl?: string | null; eager?: boolean }) {
  const fadeMask = "linear-gradient(to right, black 0%, black 48%, rgba(0,0,0,0.65) 68%, transparent 100%)";
  const washMask = "linear-gradient(to right, rgba(0,0,0,0.5) 0%, rgba(0,0,0,0.25) 54%, transparent 100%)";

  return (
    <div className="relative h-full min-h-[72px] w-28 shrink-0 overflow-hidden bg-white text-xl font-black sm:w-36">
      {photoUrl ? (
        <>
          <Image
            src={photoUrl}
            alt=""
            aria-hidden="true"
            fill
            loading={eager ? "eager" : "lazy"}
            sizes="160px"
            className="scale-125 object-cover opacity-20 blur-2xl saturate-125"
            style={{ WebkitMaskImage: washMask, maskImage: washMask }}
          />
          <Image
            src={photoUrl}
            alt=""
            aria-hidden="true"
            fill
            loading={eager ? "eager" : "lazy"}
            sizes="160px"
            className="object-cover"
            style={{ WebkitMaskImage: fadeMask, maskImage: fadeMask }}
          />
        </>
      ) : (
        <div className="grid size-full place-items-center bg-gradient-to-r from-lime via-lime/40 to-white text-3xl text-black/80">{label.slice(0, 1)}</div>
      )}
    </div>
  );
}

function stockColor(stock: number, maxStock: number) {
  const ratio = maxStock > 0 ? Math.max(0, Math.min(stock / maxStock, 1)) : 0;
  const hue = Math.round(ratio * 115);

  return `hsl(${hue} 94% 48%)`;
}

function stockRatio(stock: number, maxStock: number) {
  return maxStock > 0 ? Math.max(0, Math.min(stock / maxStock, 1)) : 0;
}

function stockCardBorder(row: InventoryRow) {
  if (row.is_out_of_stock) return "border-red-500";
  if (row.is_low_stock) return "border-orange";
  return "border-border";
}

function stockStatus(row: InventoryRow) {
  if (row.is_out_of_stock) return { label: "Out", className: "bg-red-50 text-red-600 ring-red-100" };
  if (row.is_low_stock) return { label: "Low", className: "bg-orange/10 text-orange ring-orange/15" };
  return { label: "Good", className: "bg-lime/20 text-black ring-lime/30" };
}

function AdjustmentDialog({
  row,
  direction,
  onClose,
}: {
  row: InventoryRow;
  direction: "add" | "deduct";
  onClose: () => void;
}) {
  const router = useRouter();
  const [quantity, setQuantity] = useState("1");
  const [reason, setReason] = useState<StockAdjustmentReason>(DEFAULT_STOCK_ADJUSTMENT_REASON);
  const [note, setNote] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [confirmError, setConfirmError] = useState<string | null>(null);
  const [isConfirming, setIsConfirming] = useState(false);
  const [isPending, setIsPending] = useState(false);
  const signedDelta = direction === "add" ? Number(quantity) : -Number(quantity);
  const nextStock = Number.isFinite(signedDelta) ? row.quantity + signedDelta : row.quantity;

  function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setError(null);
    setConfirmError(null);
    setIsConfirming(true);
  }

  async function confirmStockMovement() {
    setConfirmError(null);
    setIsPending(true);
    const result = await adjustStockAction({
      skuId: row.sku_id,
      locationId: row.location_id,
      direction,
      quantity: Number(quantity),
      reason,
      note,
    });

    setIsPending(false);

    if (!result.ok) {
      const message = result.error ?? "Stock update failed.";
      setConfirmError(message);
      toast.error("Stock update failed", { description: message });
      throw new Error(message);
    }

    toast.success("Stock movement recorded", {
      description: `${row.product_name}: ${direction === "add" ? "+" : "-"}${quantity} (${reason})`,
    });
    onClose();
    router.refresh();
  }

  return (
    <div className="fixed inset-0 z-50 grid items-end bg-black/45 p-0 sm:place-items-center sm:px-4 sm:py-8" onClick={onClose}>
      <div className="w-full max-w-lg" onClick={(event) => event.stopPropagation()}>
        <FluidEntrySurface className="max-h-[92dvh] max-w-lg rounded-t-3xl border border-white/50 bg-white/90 backdrop-blur-2xl sm:rounded-3xl" contentClassName="max-h-[92dvh] overflow-y-auto p-5 sm:p-6">
          <form onSubmit={handleSubmit}>
          <div className="flex items-start justify-between gap-4">
            <div>
              <h2 className="text-2xl font-black tracking-[-0.05em]">
                {direction === "add" ? "Add Stock" : "Deduct Stock"}
              </h2>
              <p className="mt-1 text-sm font-semibold text-zinc-500">{row.product_name} · {row.sku_code}</p>
            </div>
            <button type="button" onClick={onClose} className="grid size-10 place-items-center rounded-lg border border-border">
              <X className="size-5" />
            </button>
          </div>

          <div className="mt-6 grid gap-4">
            <label className="grid gap-2 text-sm font-bold text-zinc-600">
              Quantity
              <input min={1} required type="number" value={quantity} onChange={(event) => setQuantity(event.target.value)} className="h-12 rounded-lg border border-border px-4 text-lg font-bold outline-none focus:ring-2 focus:ring-lime" />
            </label>
            <label className="grid gap-2 text-sm font-bold text-zinc-600">
              Reason
              <select required value={reason} onChange={(event) => setReason(event.target.value as StockAdjustmentReason)} className="h-12 rounded-lg border border-border bg-white px-4 text-base font-bold outline-none focus:ring-2 focus:ring-lime">
                {STOCK_ADJUSTMENT_REASONS.map((item) => (
                  <option key={item} value={item}>{item}</option>
                ))}
              </select>
            </label>
            <label className="grid gap-2 text-sm font-bold text-zinc-600">
              Note
              <textarea value={note} onChange={(event) => setNote(event.target.value)} maxLength={500} className="min-h-24 rounded-lg border border-border px-4 py-3 font-semibold outline-none focus:ring-2 focus:ring-lime" placeholder="Optional notes for admin" />
            </label>
            <div className="rounded-xl bg-zinc-50 p-4 text-sm font-semibold text-zinc-600">
              Current stock: <span className="text-black">{row.quantity}</span> · After change: <span className={nextStock < 0 ? "text-red-600" : "text-black"}>{Number.isFinite(nextStock) ? nextStock : row.quantity}</span>
            </div>
            {error ? <div className="rounded-lg border border-red-200 bg-red-50 px-4 py-3 text-sm font-bold text-red-700">{error}</div> : null}
          </div>

          <div className="mt-6 flex flex-col-reverse gap-3 sm:flex-row sm:justify-end">
            <Button type="button" variant="outline" onClick={onClose} className="h-12 rounded-lg bg-white px-6 text-base font-bold hover:bg-white">Cancel</Button>
            <Button disabled={isPending} className="h-12 rounded-lg bg-lime px-6 text-base font-bold text-black hover:bg-lime disabled:opacity-60">
              Review Movement
            </Button>
          </div>
          </form>
        </FluidEntrySurface>
        <p className="mt-3 text-center text-xs font-bold text-white/80">Click anywhere to close</p>
      </div>
      {isConfirming ? (
        <ConfirmSlideSheet
          title={direction === "add" ? "Confirm Add Stock" : "Confirm Deduct Stock"}
          description="This stock movement will be written to the audit trail and inventory history."
          records={[
            { label: "Product", value: row.product_name },
            { label: "SKU", value: row.sku_code },
            { label: "Movement", value: direction === "add" ? `+${quantity}` : `-${quantity}` },
            { label: "Reason", value: reason },
            { label: "Before", value: row.quantity },
            { label: "After", value: Number.isFinite(nextStock) ? nextStock : row.quantity },
            { label: "Note", value: note },
          ]}
          error={confirmError}
          onCancel={() => setIsConfirming(false)}
          onConfirm={confirmStockMovement}
        />
      ) : null}
    </div>
  );
}

function PingDialog({ row, onClose }: { row: InventoryRow; onClose: () => void }) {
  const router = useRouter();
  const [requestedQty, setRequestedQty] = useState("");
  const [note, setNote] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [confirmError, setConfirmError] = useState<string | null>(null);
  const [isConfirming, setIsConfirming] = useState(false);
  const [isPending, setIsPending] = useState(false);

  function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setError(null);
    setConfirmError(null);
    setIsConfirming(true);
  }

  async function confirmRestockRequest() {
    setConfirmError(null);
    setIsPending(true);
    const result = await createRestockRequestAction({
      skuId: row.sku_id,
      locationId: row.location_id,
      requestedQty,
      note,
    });

    setIsPending(false);

    if (!result.ok) {
      const message = result.error ?? "Request failed.";
      setConfirmError(message);
      toast.error("Restock request failed", { description: message });
      throw new Error(message);
    }

    toast.success("Restock request recorded", {
      description: `${row.product_name}: need ${requestedQty || "restock"}`,
    });
    onClose();
    router.refresh();
  }

  return (
    <div className="fixed inset-0 z-50 grid items-end bg-black/45 p-0 sm:place-items-center sm:px-4 sm:py-8" onClick={onClose}>
      <div className="w-full max-w-lg" onClick={(event) => event.stopPropagation()}>
        <FluidEntrySurface className="max-h-[92dvh] max-w-lg rounded-t-3xl border border-white/50 bg-white/90 backdrop-blur-2xl sm:rounded-3xl" contentClassName="max-h-[92dvh] overflow-y-auto p-5 sm:p-6">
          <form onSubmit={handleSubmit}>
          <div className="flex items-start justify-between gap-4">
            <div>
              <h2 className="text-2xl font-black tracking-[-0.05em]">Ping Admin</h2>
              <p className="mt-1 text-sm font-semibold text-zinc-500">{row.product_name} · current stock {row.quantity}</p>
            </div>
            <button type="button" onClick={onClose} className="grid size-10 place-items-center rounded-lg border border-border">
              <X className="size-5" />
            </button>
          </div>
          <div className="mt-6 grid gap-4">
            <label className="grid gap-2 text-sm font-bold text-zinc-600">
              Requested Quantity
              <input min={1} type="number" value={requestedQty} onChange={(event) => setRequestedQty(event.target.value)} className="h-12 rounded-lg border border-border px-4 text-lg font-bold outline-none focus:ring-2 focus:ring-lime" placeholder="Optional" />
            </label>
            <label className="grid gap-2 text-sm font-bold text-zinc-600">
              Note
              <textarea value={note} onChange={(event) => setNote(event.target.value)} maxLength={500} className="min-h-24 rounded-lg border border-border px-4 py-3 font-semibold outline-none focus:ring-2 focus:ring-lime" placeholder="Tell admin what needs attention" />
            </label>
            {error ? <div className="rounded-lg border border-red-200 bg-red-50 px-4 py-3 text-sm font-bold text-red-700">{error}</div> : null}
          </div>
          <div className="mt-6 flex flex-col-reverse gap-3 sm:flex-row sm:justify-end">
            <Button type="button" variant="outline" onClick={onClose} className="h-12 rounded-lg bg-white px-6 text-base font-bold hover:bg-white">Cancel</Button>
            <Button disabled={isPending} className="h-12 rounded-lg bg-lime px-6 text-base font-bold text-black hover:bg-lime disabled:opacity-60">
              Review Ping
            </Button>
          </div>
          </form>
        </FluidEntrySurface>
        <p className="mt-3 text-center text-xs font-bold text-white/80">Click anywhere to close</p>
      </div>
      {isConfirming ? (
        <ConfirmSlideSheet
          title="Confirm Admin Ping"
          description="This restock request will be recorded for admin follow-up."
          records={[
            { label: "Product", value: row.product_name },
            { label: "SKU", value: row.sku_code },
            { label: "Current Stock", value: row.quantity },
            { label: "Low Alert", value: row.low_stock_qty },
            { label: "Requested", value: requestedQty || "Restock" },
            { label: "Note", value: note },
          ]}
          error={confirmError}
          onCancel={() => setIsConfirming(false)}
          onConfirm={confirmRestockRequest}
        />
      ) : null}
    </div>
  );
}

export function RestockQueue({ requests, rows }: { requests: RestockRequestRow[]; rows: AdminInventoryRow[] }) {
  const router = useRouter();
  const [pendingId, setPendingId] = useState<string | null>(null);
  const [confirmation, setConfirmation] = useState<{ request: RestockRequestRow; status: RestockStatus; label: string } | null>(null);
  const [confirmError, setConfirmError] = useState<string | null>(null);

  async function updateStatus(requestId: string, status: RestockStatus) {
    setPendingId(requestId);
    const result = await updateRestockStatusAction({ requestId, status });
    setPendingId(null);

    if (!result.ok) {
      const message = result.error ?? "Status update failed.";
      setConfirmError(message);
      toast.error("Status update failed", { description: message });
      throw new Error(message);
    }

    toast.success("Restock status recorded", { description: `Request marked ${status}.` });
    setConfirmation(null);
    router.refresh();
  }

  function nextAction(status: RestockStatus) {
    if (status === "ordered") return { label: "Mark Resolved", status: "resolved" as const };
    if (status === "open" || status === "acknowledged") return { label: "Mark Ordered", status: "ordered" as const };
    return null;
  }

  return (
    <FluidEntrySurface className="mt-8 rounded-3xl border border-white/50 bg-white/60 backdrop-blur-2xl" contentClassName="p-4 sm:p-5">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h2 className="text-xl font-black tracking-[-0.05em]">Restock Follow-Up</h2>
          <p className="mt-1 text-sm font-semibold text-zinc-500">Contact supplier, then clear the request.</p>
        </div>
        <div className="rounded-full bg-black px-3 py-1 text-xs font-black uppercase tracking-[0.12em] text-lime">{requests.length} active</div>
      </div>
      {requests.length === 0 ? (
        <div className="mt-4 rounded-2xl border border-white/60 bg-white/65 p-6 text-sm font-bold text-zinc-500 backdrop-blur-lg">No active restock requests.</div>
      ) : (
        <div className="mt-4 grid gap-3">
          {requests.map((request) => {
          const row = rows.find((item) => item.sku_id === request.sku_id);
          const action = nextAction(request.status);

          return (
            <div key={request.id} className="liquid-width-enter grid gap-3 rounded-3xl border border-white/60 bg-white/70 p-3 shadow-sm shadow-black/5 backdrop-blur-lg md:grid-cols-[minmax(0,1fr)_auto_auto] md:items-center md:gap-4 md:p-4 md:shadow-none">
              <div className="flex items-start justify-between gap-3 md:block">
                <div className="min-w-0 md:min-w-[220px]">
                  <div className="line-clamp-2 text-base font-black leading-tight tracking-[-0.04em] md:truncate">{request.product_name}</div>
                  <div className="mt-1 flex flex-wrap gap-1 text-xs font-bold text-zinc-500">
                    <span className="rounded-full bg-zinc-100 px-2 py-0.5">{request.sku_code}</span>
                    <span className="rounded-full bg-black px-2 py-0.5 capitalize text-lime">{request.status}</span>
                  </div>
                </div>
                <div className="shrink-0 rounded-2xl bg-zinc-100 px-3 py-2 text-center text-xs font-black text-zinc-600 md:mt-2 md:inline-block md:rounded-full md:px-2.5 md:py-1">
                  <div className="text-[10px] uppercase tracking-[0.1em] text-zinc-400 md:hidden">Stock</div>
                  {request.current_qty_snapshot}/{request.low_stock_qty_snapshot}
                </div>
              </div>
              <div className="min-w-0 text-sm font-semibold text-zinc-600">
                <div className="font-bold text-black">Need {request.requested_qty ?? "restock"}</div>
                <div className="mt-0.5 text-xs font-bold text-zinc-500">Requested by {request.requested_by_name || request.requested_by_email || "Staff"}</div>
                {request.note ? <div className="mt-1 line-clamp-2 font-medium text-zinc-500">{request.note.replace("[demo] ", "")}</div> : null}
              </div>
              <div className="grid grid-cols-[1fr_48px_48px] gap-2 md:w-[300px] md:grid-cols-[1fr_44px_44px]">
                {row?.whatsapp_number ? (
                  <WhatsAppLink phone={row.whatsapp_number} product={request.product_name} supplier={row.supplier_name ?? undefined} label="WhatsApp" className="h-12 rounded-2xl bg-[#25D366] px-3 text-xs font-black text-white hover:bg-[#25D366] md:h-11 md:rounded-lg" />
                ) : (
                  <Button type="button" disabled className="h-12 rounded-2xl bg-zinc-200 px-3 text-xs font-black text-zinc-500 md:h-11 md:rounded-lg">No Contact</Button>
                )}
                {action ? (
                  <Button type="button" aria-label={action.label} title={action.label} disabled={pendingId === request.id} onClick={() => { setConfirmError(null); setConfirmation({ request, status: action.status, label: action.label }); }} className="h-12 rounded-2xl bg-lime px-0 text-black hover:bg-lime disabled:opacity-60 md:h-11 md:rounded-lg">
                    <Check className="size-5" />
                  </Button>
                ) : (
                  <Button type="button" aria-label="Settled" disabled className="h-12 rounded-2xl bg-zinc-200 px-0 text-zinc-500 md:h-11 md:rounded-lg">
                    <Check className="size-5" />
                  </Button>
                )}
                <Button type="button" aria-label="Discard request" title="Discard request" disabled={pendingId === request.id} onClick={() => { setConfirmError(null); setConfirmation({ request, status: "cancelled", label: "Discard Request" }); }} className="h-12 rounded-2xl border border-border bg-white px-0 text-black hover:bg-white disabled:opacity-60 md:h-11 md:rounded-lg">
                  <X className="size-5" />
                </Button>
              </div>
            </div>
          );
          })}
        </div>
      )}
      {confirmation ? (
        <ConfirmSlideSheet
          title={confirmation.label}
          description="This restock status change will be recorded for audit and reporting."
          records={[
            { label: "Product", value: confirmation.request.product_name },
            { label: "SKU", value: confirmation.request.sku_code },
            { label: "From", value: confirmation.request.status },
            { label: "To", value: confirmation.status },
            { label: "Need", value: confirmation.request.requested_qty ?? "Restock" },
            { label: "Requested By", value: confirmation.request.requested_by_name || confirmation.request.requested_by_email || "Staff" },
            { label: "Note", value: confirmation.request.note?.replace("[demo] ", "") },
          ]}
          error={confirmError}
          onCancel={() => setConfirmation(null)}
          onConfirm={() => updateStatus(confirmation.request.id, confirmation.status)}
        />
      ) : null}
    </FluidEntrySurface>
  );
}

export function InventoryDashboard({
  membership,
  adminRows,
  staffRows,
  restockRequests,
}: {
  membership: Membership;
  adminRows: AdminInventoryRow[];
  staffRows: StaffInventoryRow[];
  restockRequests: RestockRequestRow[];
}) {
  const [sortDirection, setSortDirection] = useState<"asc" | "desc">("desc");
  const [query, setQuery] = useState("");
  const [stockFilter, setStockFilter] = useState<"all" | "low" | "out">("all");
  const [viewAsStaff, setViewAsStaff] = useState(false);
  const [isStatsOpen, setIsStatsOpen] = useState(true);
  const [isMobileMenuOpen, setIsMobileMenuOpen] = useState(false);
  const [adjustment, setAdjustment] = useState<{ row: InventoryRow; direction: "add" | "deduct" } | null>(null);
  const [ping, setPing] = useState<InventoryRow | null>(null);
  const isAdmin = membership.role === "admin";
  const effectiveRole = isAdmin && viewAsStaff ? "staff" : membership.role;
  const rows: InventoryRow[] = effectiveRole === "admin" ? adminRows : staffRows;
  const filteredRows = useMemo(() => {
    return rows
      .filter((row) => `${row.product_name} ${row.sku_code}`.toLowerCase().includes(query.toLowerCase()))
      .filter((row) => {
        if (stockFilter === "low") return row.is_low_stock && !row.is_out_of_stock;
        if (stockFilter === "out") return row.is_out_of_stock;
        return true;
      })
      .sort((a, b) => (sortDirection === "asc" ? a.quantity - b.quantity : b.quantity - a.quantity));
  }, [query, rows, sortDirection, stockFilter]);
  const total = rows.length;
  const inStock = rows.filter((row) => row.quantity > row.low_stock_qty).length;
  const lowStock = rows.filter((row) => row.is_low_stock && !row.is_out_of_stock).length;
  const outOfStock = rows.filter((row) => row.is_out_of_stock).length;
  const stats = [
    { label: "Total Products", value: total, icon: Package, fill: "fill-lime" },
    { label: "In Stock", value: inStock, icon: Check, fill: "fill-none" },
    { label: "Low Stock", value: lowStock, icon: TriangleAlert, fill: "fill-orange" },
    { label: "Out of Stock", value: outOfStock, icon: X, fill: "fill-red-500" },
  ];

  return (
    <main className="min-h-screen bg-white pb-24 text-black lg:pb-0">
      <div className="min-h-screen lg:pl-[242px]">
        <AppSidebar active="stock" role={effectiveRole} restockCount={restockRequests.length} showStaffToggle={isAdmin} isViewingAsStaff={viewAsStaff} onToggleStaffView={() => setViewAsStaff((current) => !current)} />

        <section className="px-4 py-5 sm:px-8 sm:py-8 lg:px-7 xl:px-8">
          <header className="flex items-start justify-between gap-4">
            <div>
              <StoreIdentityEditor initialName={membership.organization_name} initialIcon={membership.organization_icon} workspaceId={membership.organization_id} readOnly={effectiveRole !== "admin"} />
              <div className="mt-3 hidden items-center gap-2 rounded-full bg-zinc-100 px-4 py-2 text-sm font-bold text-zinc-600 sm:inline-flex">
                <ShieldCheck className="size-4" />
                {effectiveRole === "admin" ? "Admin view" : "Staff-safe view"}
              </div>
            </div>

            <button
              type="button"
              onClick={() => setIsMobileMenuOpen(true)}
              className="grid size-12 shrink-0 place-items-center rounded-2xl border border-border bg-white text-black shadow-sm shadow-black/5 sm:hidden"
              aria-label="Open page menu"
            >
              <Menu className="size-6" />
            </button>

            <div className="hidden flex-col gap-3 sm:flex sm:items-end">
              {isAdmin ? (
                <Button type="button" variant="outline" onClick={() => setViewAsStaff((current) => !current)} className="h-11 rounded-lg border-border bg-white px-5 text-sm font-bold hover:bg-white lg:hidden">
                  {viewAsStaff ? "Admin View" : "View as Staff"}
                </Button>
              ) : null}
              {effectiveRole === "admin" ? (
                <Button asChild className="h-[60px] rounded-lg bg-lime px-7 text-lg font-bold text-black hover:bg-lime">
                  <Link href="/sku">
                    <Plus className="size-6" />
                    Add Product
                  </Link>
                </Button>
              ) : null}
              <form action={signOut}>
                <Button variant="ghost" className="h-10 px-4 text-sm font-bold hover:bg-zinc-100">Sign out</Button>
              </form>
            </div>
          </header>

          <FluidEntrySurface className="mt-8 rounded-3xl border border-white/50 bg-white/60 backdrop-blur-2xl">
            <button type="button" onClick={() => setIsStatsOpen((current) => !current)} className="flex w-full items-center justify-between gap-4 px-5 py-3 text-left">
              <div className="flex flex-wrap items-center gap-x-4 gap-y-1 text-sm font-black text-zinc-500">
                <span className="text-black">Overview</span>
                <span>{total} products</span>
                <span>{lowStock} low</span>
                <span>{outOfStock} out</span>
              </div>
              <span className="flex items-center gap-2 text-xs font-black uppercase tracking-[0.14em] text-zinc-400">
                {isStatsOpen ? "Hide" : "Show"}
                <ChevronDown className={cn("size-4 transition-transform", isStatsOpen && "rotate-180")} />
              </span>
            </button>
            {isStatsOpen ? (
              <div className="grid gap-4 border-t border-border px-7 py-5 md:grid-cols-4">
                {stats.map((stat, index) => {
                  const Icon = stat.icon;

                  return (
                    <div key={stat.label} className={cn("flex items-center justify-between gap-4 md:justify-start md:gap-5", index > 0 && "md:border-l md:border-border md:pl-7")}>
                      <Icon className={cn("size-10 shrink-0 stroke-black stroke-[1.8] text-black", stat.fill)} />
                      <div className="text-right md:text-left">
                        <div className="text-sm font-semibold tracking-[-0.03em] text-zinc-500">{stat.label}</div>
                        <div className="text-3xl font-black tracking-[-0.06em] md:mt-1">{stat.value}</div>
                      </div>
                    </div>
                  );
                })}
              </div>
            ) : null}
          </FluidEntrySurface>

          <FluidEntrySurface className="mt-6 rounded-3xl border border-white/50 bg-white/60 backdrop-blur-2xl" contentClassName="p-4">
            <div className="grid gap-3 xl:grid-cols-[1fr_auto_auto] xl:items-center">
              <label className="flex h-14 items-center gap-4 rounded-xl border border-border bg-zinc-50 px-4">
                <Search className="size-5 shrink-0" />
                <input value={query} onChange={(event) => setQuery(event.target.value)} className="h-full min-w-0 flex-1 bg-transparent text-base font-semibold text-black outline-none placeholder:text-zinc-500" placeholder="Search product or SKU" />
              </label>
              <div className="flex rounded-xl border border-border bg-zinc-50 p-1">
                {(["all", "low", "out"] as const).map((filter) => (
                  <button key={filter} type="button" onClick={() => setStockFilter(filter)} className={cn("relative h-11 overflow-hidden rounded-lg px-4 text-sm font-black capitalize transition", stockFilter === filter ? "text-white" : "text-zinc-500 hover:text-black")}>
                    {stockFilter === filter ? (
                      <motion.span
                        layoutId="stock-filter-active-pill"
                        className="absolute inset-0 rounded-lg bg-black"
                        transition={{ duration: 0.36, ease: [0.22, 1, 0.36, 1] }}
                      />
                    ) : null}
                    <span className="relative z-10">{filter === "all" ? "All" : filter}</span>
                  </button>
                ))}
              </div>
              <Button type="button" variant="outline" className="h-14 rounded-xl border-border bg-white px-5 text-sm font-black hover:bg-white" onClick={() => setSortDirection(sortDirection === "asc" ? "desc" : "asc")}>
                <ArrowUpDown className="size-4" />
                Stock {sortDirection === "asc" ? "low to high" : "high to low"}
              </Button>
            </div>
          </FluidEntrySurface>

          <div className="mt-5 grid gap-4">
            {filteredRows.map((row, index) => {
              const ratio = stockRatio(row.quantity, row.max_stock_qty);
              const percentage = Math.round(ratio * 100);
              const status = stockStatus(row);

              return (
                <FluidEntrySurface key={`${row.sku_id}-${row.location_id}`} entryDelay={Math.min(index * 0.07, 0.42)} className="rounded-3xl border border-white/50 bg-white/65 backdrop-blur-2xl transition-colors hover:border-zinc-300/80">
                  <div className="p-3 xl:hidden">
                    <div className="flex items-start gap-3">
                      <div className="relative size-16 shrink-0 overflow-hidden rounded-2xl border border-white bg-white ring-1 ring-black/5">
                        {row.photo_url ? (
                          <Image src={row.photo_url} alt={row.product_name} fill loading={index === 0 ? "eager" : "lazy"} sizes="64px" className="object-cover" />
                        ) : (
                          <div className="grid size-full place-items-center bg-lime text-2xl font-black text-black/80">{row.product_name.slice(0, 1)}</div>
                        )}
                      </div>
                      <div className="min-w-0 flex-1 pt-0.5">
                        <div className="flex items-start justify-between gap-2">
                          <div className="min-w-0">
                            <h2 className="line-clamp-2 text-lg font-black leading-[1.05] tracking-[-0.055em]">{row.product_name}</h2>
                            <div className="mt-2 flex flex-wrap gap-1 text-[11px] font-bold text-zinc-500">
                              {row.variant ? <span className="rounded-full bg-zinc-100 px-2 py-0.5">{row.variant}</span> : null}
                              <span className="rounded-full bg-zinc-100 px-2 py-0.5">{row.sku_code}</span>
                            </div>
                          </div>
                          <span className={cn("shrink-0 rounded-full px-2.5 py-1 text-[11px] font-black uppercase tracking-[0.1em] ring-1", status.className)}>{status.label}</span>
                        </div>
                      </div>
                    </div>

                    <div className={cn("mt-3 rounded-2xl border-2 bg-zinc-50 p-3", stockCardBorder(row))}>
                      <div className="flex items-end justify-between gap-3">
                        <div>
                          <div className="text-[11px] font-black uppercase tracking-[0.14em] text-zinc-400">Current Stock</div>
                          <div className="mt-1 flex items-end gap-2">
                            <span className="text-[38px] font-black leading-none tracking-[-0.08em]">{row.quantity}</span>
                            <span className="pb-1.5 text-xs font-black text-zinc-400">/ {row.max_stock_qty}</span>
                          </div>
                        </div>
                        <div className="text-right text-xs font-black text-zinc-500">Low at {row.low_stock_qty}</div>
                      </div>
                      <div className="mt-3 h-2 overflow-hidden rounded-full bg-white ring-1 ring-border">
                        <div className="h-full rounded-full" style={{ width: `${percentage}%`, backgroundColor: stockColor(row.quantity, row.max_stock_qty) }} />
                      </div>
                      <div className="mt-3 grid grid-cols-2 gap-2">
                        <Button type="button" variant="outline" aria-label={`Deduct stock for ${row.product_name}`} className="h-12 rounded-xl border-lime bg-white text-sm font-black hover:bg-white" onClick={() => setAdjustment({ row, direction: "deduct" })}>
                          <Minus className="size-4" />
                          Deduct
                        </Button>
                        <Button type="button" aria-label={`Add stock for ${row.product_name}`} className="h-12 rounded-xl bg-lime text-sm font-black text-black hover:bg-lime" onClick={() => setAdjustment({ row, direction: "add" })}>
                          <Plus className="size-4" />
                          Add
                        </Button>
                      </div>
                    </div>

                    <div className="mt-3 rounded-2xl border border-border bg-white p-3">
                      {effectiveRole === "admin" && isAdminRow(row) ? (
                        <div className="flex items-center justify-between gap-3">
                          <div className="min-w-0">
                            <div className="truncate text-sm font-black tracking-[-0.035em]">{row.supplier_name ?? "No supplier"}</div>
                            <div className="mt-0.5 text-xs font-bold text-zinc-500">{row.phone_raw ?? "No phone number"}</div>
                          </div>
                          {row.whatsapp_number ? (
                            <WhatsAppLink phone={row.whatsapp_number} product={row.product_name} supplier={row.supplier_name ?? undefined} label="WhatsApp" className="h-11 shrink-0 rounded-xl bg-[#25D366] px-4 text-xs font-black text-white hover:bg-[#25D366]" />
                          ) : null}
                        </div>
                      ) : (
                        <div className="flex items-center justify-between gap-3">
                          <div>
                            <div className="text-xs font-black uppercase tracking-[0.14em] text-zinc-500">Need help?</div>
                            <div className="mt-1 text-base font-black tracking-[-0.045em]">Ping admin</div>
                          </div>
                          <Button type="button" variant="outline" className="h-11 rounded-xl bg-white px-4 text-xs font-black hover:bg-white" onClick={() => setPing(row)}>Ping</Button>
                        </div>
                      )}
                    </div>
                  </div>

                  <div className="hidden xl:grid xl:grid-cols-[144px_minmax(240px,1fr)_210px_260px] xl:items-stretch">
                    <ProductThumb label={row.product_name} photoUrl={row.photo_url} eager={index === 0} />

                    <div className="flex min-w-0 items-center px-2.5 py-2 sm:px-3">
                      <div className="min-w-0 pr-2">
                        <h2 className="truncate text-lg font-black tracking-[-0.055em] sm:text-xl">{row.product_name}</h2>
                        <div className="mt-1 flex flex-wrap gap-1 text-[11px] font-bold text-zinc-500">
                          {row.variant ? <span className="rounded-md bg-zinc-100 px-2 py-0.5">{row.variant}</span> : null}
                          <span className="rounded-md bg-zinc-100 px-2 py-0.5">{row.sku_code}</span>
                        </div>
                      </div>
                    </div>

                    <div className={cn("col-span-2 m-2 mt-0 rounded-lg border-2 bg-zinc-50 p-2 xl:col-span-1 xl:m-2 xl:ml-0", stockCardBorder(row))}>
                      <div>
                        <div>
                          <div className="flex items-end gap-2">
                            <span className="text-[30px] font-black leading-none tracking-[-0.08em]">{row.quantity}</span>
                            <span className="pb-1 text-[11px] font-black text-zinc-400">/ {row.max_stock_qty}</span>
                          </div>
                        </div>
                      </div>
                      <div className="mt-1.5 h-1.5 overflow-hidden rounded-full bg-white ring-1 ring-border">
                        <div className="h-full rounded-full" style={{ width: `${percentage}%`, backgroundColor: stockColor(row.quantity, row.max_stock_qty) }} />
                      </div>
                      <div className="mt-2 grid grid-cols-2 gap-1.5">
                        <Button type="button" variant="outline" aria-label={`Deduct stock for ${row.product_name}`} className="h-10 rounded-md border-lime bg-white text-sm font-black hover:bg-white xl:h-8" onClick={() => setAdjustment({ row, direction: "deduct" })}>
                          <Minus className="size-4" />
                        </Button>
                        <Button type="button" aria-label={`Add stock for ${row.product_name}`} className="h-10 rounded-md bg-lime text-sm font-black text-black hover:bg-lime xl:h-8" onClick={() => setAdjustment({ row, direction: "add" })}>
                          <Plus className="size-4" />
                        </Button>
                      </div>
                    </div>

                    <div className="col-span-2 mx-2 mb-2 rounded-lg border border-border bg-white p-2 xl:col-span-1 xl:m-2 xl:ml-0 xl:bg-zinc-50">
                      {effectiveRole === "admin" && isAdminRow(row) ? (
                        <>
                          <div className="truncate text-base font-black tracking-[-0.045em]">{row.supplier_name ?? "No supplier"}</div>
                          <div className="text-[11px] font-bold text-zinc-500">{row.phone_raw ?? "No phone number"}</div>
                          <div className="mt-2">
                            {row.whatsapp_number ? (
                              <WhatsAppLink phone={row.whatsapp_number} product={row.product_name} supplier={row.supplier_name ?? undefined} className="h-10 w-full rounded-md bg-[#25D366] px-3 text-xs font-black text-white hover:bg-[#25D366] xl:h-8" />
                            ) : null}
                          </div>
                        </>
                      ) : (
                        <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between xl:flex-col xl:items-stretch">
                          <div>
                            <div className="text-xs font-black uppercase tracking-[0.14em] text-zinc-500">Need help?</div>
                            <div className="mt-2 text-xl font-black tracking-[-0.045em]">Ping admin</div>
                            <div className="mt-1 text-sm font-bold text-zinc-500">Supplier details hidden for staff.</div>
                          </div>
                          <Button type="button" variant="outline" className="h-10 rounded-md bg-white px-3 text-xs font-black hover:bg-white xl:h-8" onClick={() => setPing(row)}>Ping Admin</Button>
                        </div>
                      )}
                    </div>
                  </div>
                </FluidEntrySurface>
              );
            })}
          </div>

          <FluidEntrySurface className="mt-5 rounded-3xl border border-white/50 bg-white/60 backdrop-blur-2xl" contentClassName="flex flex-col gap-5 px-6 py-4 sm:flex-row sm:items-center sm:justify-between">
            <div className="text-base font-bold text-zinc-500">Showing {filteredRows.length} of {rows.length} products</div>
            <div className="flex items-center gap-4">
              <Button variant="outline" size="icon" className="size-12 rounded-xl border-border bg-white hover:bg-white"><ChevronLeft className="size-5" /></Button>
              <Button size="icon" className="size-12 rounded-xl bg-black text-lg font-bold text-white hover:bg-black">1</Button>
              <Button variant="outline" size="icon" className="size-12 rounded-xl border-border bg-white hover:bg-white"><ChevronRight className="size-5" /></Button>
            </div>
          </FluidEntrySurface>
        </section>
      </div>

      {adjustment ? <AdjustmentDialog row={adjustment.row} direction={adjustment.direction} onClose={() => setAdjustment(null)} /> : null}
      {ping ? <PingDialog row={ping} onClose={() => setPing(null)} /> : null}
      {isMobileMenuOpen ? (
        <div className="fixed inset-0 z-50 grid items-end bg-black/45 sm:hidden" onClick={() => setIsMobileMenuOpen(false)}>
          <div className="rounded-t-3xl border border-white/50 bg-white p-4 shadow-2xl" onClick={(event) => event.stopPropagation()}>
            <div className="mx-auto mb-4 h-1.5 w-12 rounded-full bg-zinc-200" />
            <div className="flex items-center gap-2 rounded-2xl bg-zinc-100 px-4 py-3 text-sm font-black text-zinc-600">
              <ShieldCheck className="size-5" />
              {effectiveRole === "admin" ? "Admin view" : "Staff-safe view"}
            </div>
            <div className="mt-4 grid gap-3">
              {isAdmin ? (
                <Button
                  type="button"
                  variant="outline"
                  onClick={() => {
                    setViewAsStaff((current) => !current);
                    setIsMobileMenuOpen(false);
                  }}
                  className="h-14 rounded-2xl border-border bg-white px-5 text-base font-black hover:bg-white"
                >
                  {viewAsStaff ? "Admin View" : "View as Staff"}
                </Button>
              ) : null}
              {effectiveRole === "admin" ? (
                <Button asChild className="h-14 rounded-2xl bg-lime px-5 text-base font-black text-black hover:bg-lime" onClick={() => setIsMobileMenuOpen(false)}>
                  <Link href="/sku">
                    <Plus className="size-5" />
                    Add Product
                  </Link>
                </Button>
              ) : null}
              <form action={signOut}>
                <Button variant="ghost" className="h-14 w-full justify-start rounded-2xl px-5 text-base font-black hover:bg-zinc-100">Sign out</Button>
              </form>
            </div>
          </div>
        </div>
      ) : null}
    </main>
  );
}

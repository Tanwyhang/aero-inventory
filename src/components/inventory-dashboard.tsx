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
import { Input } from "@/components/ui/input";
import { LumaSpinner } from "@/components/ui/luma-spinner";
import { NativeSelect, NativeSelectOption } from "@/components/ui/native-select";
import { Textarea } from "@/components/ui/textarea";
import { toast } from "@/components/ui/toast";
import { WhatsAppLink } from "@/components/whatsapp-link";
import { DEFAULT_STOCK_ADJUSTMENT_REASON, STOCK_ADJUSTMENT_REASONS, type StockAdjustmentReason } from "@/lib/stock-reasons";
import { cn } from "@/lib/utils";
import type { AdminInventoryRow, Membership, RestockRequestRow, RestockStatus, StaffInventoryRow } from "@/types/database";

type InventoryRow = StaffInventoryRow | AdminInventoryRow;
type StockMovementMode = "absolute" | "relative";
type StockMovementDirection = "add" | "deduct";
type StockFilter = "all" | "low" | "out";
type StockAdjustmentTarget = { row: InventoryRow; direction: StockMovementDirection };

type StockGroupEntry = {
  type: "group";
  id: string;
  productName: string;
  variationName: string;
  rows: InventoryRow[];
  totalQuantity: number;
  totalLowStock: number;
  isLowStock: boolean;
  isOutOfStock: boolean;
  photoUrl?: string | null;
  autoExpanded: boolean;
};

type StockListEntry = StockGroupEntry | { type: "sku"; row: InventoryRow };

const STAFF_VIEW_STORAGE_KEY = "aero:view-as-staff";

function isAdminRow(row: InventoryRow): row is AdminInventoryRow {
  return "supplier_name" in row;
}

export function ProductThumb({ label, photoUrl, eager = false }: { label: string; photoUrl?: string | null; eager?: boolean }) {
  const fadeMask = "linear-gradient(to right, black 0%, black 48%, rgba(0,0,0,0.65) 68%, transparent 100%)";
  const washMask = "linear-gradient(to right, rgba(0,0,0,0.5) 0%, rgba(0,0,0,0.25) 54%, transparent 100%)";

  return (
    <div className="relative h-full min-h-14 w-20 shrink-0 overflow-hidden bg-white text-xl font-black">
      {photoUrl ? (
        <>
          <Image
            src={photoUrl}
            alt=""
            aria-hidden="true"
            fill
            loading={eager ? "eager" : "lazy"}
            sizes="80px"
            className="scale-125 object-cover opacity-20 blur-2xl saturate-125"
            style={{ WebkitMaskImage: washMask, maskImage: washMask }}
          />
          <Image
            src={photoUrl}
            alt=""
            aria-hidden="true"
            fill
            loading={eager ? "eager" : "lazy"}
            sizes="80px"
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

function stockColor(stock: number, lowStock: number) {
  if (stock <= 0) return "hsl(0 84% 55%)";
  if (lowStock <= 0) return "hsl(115 94% 48%)";
  const ratio = Math.max(0, Math.min(stock / lowStock, 1));
  const hue = Math.round(ratio * 35 + 35);

  return `hsl(${hue} 94% 48%)`;
}

function stockRatio(stock: number, lowStock: number) {
  if (lowStock <= 0) return stock > 0 ? 1 : 0;
  return Math.max(0, Math.min(stock / lowStock, 1));
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

function groupStatus(entry: StockGroupEntry) {
  if (entry.isOutOfStock) return { label: "Check", className: "bg-red-50 text-red-600 ring-red-100" };
  if (entry.isLowStock) return { label: "Low", className: "bg-orange/10 text-orange ring-orange/15" };
  return { label: "Good", className: "bg-lime/20 text-black ring-lime/30" };
}

function rowMatchesFilter(row: InventoryRow, filter: StockFilter) {
  if (filter === "low") return row.is_low_stock && !row.is_out_of_stock;
  if (filter === "out") return row.is_out_of_stock;
  return true;
}

function rowSearchText(row: InventoryRow) {
  return [
    row.product_name,
    row.variant,
    row.sku_code,
    row.category_name,
    row.variation_name,
    row.location_name,
    isAdminRow(row) ? row.supplier_name : null,
    isAdminRow(row) ? row.contact_name : null,
    isAdminRow(row) ? row.phone_raw : null,
  ]
    .filter(Boolean)
    .join(" ")
    .toLowerCase();
}

function groupParentSearchText(rows: InventoryRow[]) {
  const first = rows[0];
  if (!first) return "";

  return [
    first.product_name,
    first.category_name,
    first.variation_name,
    first.location_name,
    isAdminRow(first) ? first.supplier_name : null,
    isAdminRow(first) ? first.contact_name : null,
  ]
    .filter(Boolean)
    .join(" ")
    .toLowerCase();
}

function buildStockEntries(rows: InventoryRow[], query: string, stockFilter: StockFilter, sortDirection: "asc" | "desc"): StockListEntry[] {
  const normalizedQuery = query.trim().toLowerCase();
  const grouped = new Map<string, InventoryRow[]>();
  const singles: InventoryRow[] = [];

  for (const row of rows) {
    if (!row.variation_group_id) {
      singles.push(row);
      continue;
    }

    const groupRows = grouped.get(row.variation_group_id) ?? [];
    groupRows.push(row);
    grouped.set(row.variation_group_id, groupRows);
  }

  const entries: StockListEntry[] = [];

  for (const [id, groupRows] of grouped) {
    const parentMatchesSearch = !normalizedQuery || groupParentSearchText(groupRows).includes(normalizedQuery);
    const childMatchesSearch = !normalizedQuery || groupRows.some((row) => rowSearchText(row).includes(normalizedQuery));
    const matchesFilter = groupRows.some((row) => rowMatchesFilter(row, stockFilter));

    if (!matchesFilter || (!parentMatchesSearch && !childMatchesSearch)) continue;

    const first = groupRows[0];
    const totalQuantity = groupRows.reduce((sum, row) => sum + row.quantity, 0);
    const totalLowStock = groupRows.reduce((sum, row) => sum + row.low_stock_qty, 0);
    const sortedRows = [...groupRows].sort((a, b) => `${a.variant ?? ""} ${a.sku_code}`.localeCompare(`${b.variant ?? ""} ${b.sku_code}`));

    entries.push({
      type: "group",
      id,
      productName: first?.product_name ?? "Product group",
      variationName: first?.variation_name ?? "Variants",
      rows: sortedRows,
      totalQuantity,
      totalLowStock,
      isLowStock: groupRows.some((row) => row.is_low_stock && !row.is_out_of_stock),
      isOutOfStock: groupRows.some((row) => row.is_out_of_stock),
      photoUrl: groupRows.find((row) => row.photo_url)?.photo_url ?? first?.photo_url,
      autoExpanded: Boolean(normalizedQuery && childMatchesSearch),
    });
  }

  for (const row of singles) {
    if (!rowMatchesFilter(row, stockFilter)) continue;
    if (normalizedQuery && !rowSearchText(row).includes(normalizedQuery)) continue;
    entries.push({ type: "sku", row });
  }

  return [...entries].sort((a, b) => {
    const aStock = a.type === "group" ? a.totalQuantity : a.row.quantity;
    const bStock = b.type === "group" ? b.totalQuantity : b.row.quantity;
    return sortDirection === "asc" ? aStock - bStock : bStock - aStock;
  });
}

function AdjustmentDialog({
  row,
  direction: initialDirection,
  onClose,
}: {
  row: InventoryRow;
  direction: StockMovementDirection;
  onClose: () => void;
}) {
  const router = useRouter();
  const [mode, setMode] = useState<StockMovementMode>("absolute");
  const [relativeDirection, setRelativeDirection] = useState<StockMovementDirection>(initialDirection);
  const [movementDraft, setMovementDraft] = useState(String(row.quantity));
  const [reason, setReason] = useState<StockAdjustmentReason>(DEFAULT_STOCK_ADJUSTMENT_REASON);
  const [note, setNote] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [isPending, setIsPending] = useState(false);
  const parsedMovement = Number(movementDraft);
  const hasValidMovement = Number.isFinite(parsedMovement) && Number.isInteger(parsedMovement);
  const signedQuantity = hasValidMovement
    ? mode === "absolute"
      ? parsedMovement - row.quantity
      : parsedMovement < 0
        ? parsedMovement
        : relativeDirection === "deduct"
          ? -parsedMovement
          : parsedMovement
    : 0;
  const nextStock = row.quantity + signedQuantity;
  const adjustmentLabel = signedQuantity > 0 ? `+${signedQuantity}` : String(signedQuantity);
  const actionLabel = signedQuantity >= 0 ? "Add Stock" : "Deduct Stock";

  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setError(null);
    if (!hasValidMovement) {
      setError("Enter a whole stock number.");
      return;
    }
    if (mode === "absolute" && parsedMovement < 0) {
      setError("Target stock cannot be below zero.");
      return;
    }
    if (signedQuantity === 0) {
      setError(mode === "absolute" ? "Target stock is already current stock." : "Enter a stock movement.");
      return;
    }
    if (nextStock < 0) {
      setError("Stock cannot go below zero.");
      return;
    }

    const stockNote = mode === "absolute" ? [note.trim(), `Stock manually set to ${parsedMovement} (Adjustment: ${adjustmentLabel})`].filter(Boolean).join("\n") : note.trim();
    if (stockNote.length > 500) {
      setError("Note is too long after adding the stock adjustment audit note.");
      return;
    }

    setIsPending(true);
    const result = await adjustStockAction({
      skuId: row.sku_id,
      locationId: row.location_id,
      movement: signedQuantity,
      reason,
      note: stockNote,
    });

    setIsPending(false);

    if (!result.ok) {
      const message = result.error ?? "Stock update failed.";
      setError(message);
      toast.error("Stock update failed", { description: message });
      return;
    }

    toast.success("Stock movement recorded", {
      description: `${row.product_name}: ${adjustmentLabel} (${reason})`,
    });
    onClose();
    router.refresh();
  }

  return (
    <div className="fixed inset-0 z-50 grid place-items-center overscroll-contain bg-black/45 px-4 py-[calc(1rem+env(safe-area-inset-top))] pb-[calc(1rem+env(safe-area-inset-bottom))]" onClick={onClose}>
      <div className="w-full max-w-[22rem] sm:max-w-lg" onClick={(event) => event.stopPropagation()}>
        <FluidEntrySurface className="max-h-[calc(100dvh-env(safe-area-inset-top)-env(safe-area-inset-bottom)-2rem)] rounded-2xl border border-white/50 bg-white/90 backdrop-blur-2xl sm:rounded-3xl" contentClassName="max-h-[calc(100dvh-env(safe-area-inset-top)-env(safe-area-inset-bottom)-2rem)] overflow-y-auto p-4 sm:p-6">
          <form onSubmit={handleSubmit}>
          <div className="flex items-start justify-between gap-4">
            <div>
               <h2 className="text-xl font-black tracking-[-0.05em] sm:text-2xl">
                 Stock Movement
              </h2>
              <p className="mt-1 text-sm font-semibold text-zinc-500">{row.product_name} · {row.sku_code}</p>
            </div>
             <button type="button" onClick={onClose} className="grid size-9 place-items-center rounded-lg border border-border sm:size-10" aria-label="Close stock movement">
               <X className="size-4 sm:size-5" />
            </button>
          </div>

           <div className="mt-4 grid gap-3 sm:mt-6 sm:gap-4">
             <div className="grid grid-cols-2 rounded-xl border border-border bg-zinc-50 p-1">
               {(["absolute", "relative"] as const).map((item) => (
                 <button
                   key={item}
                   type="button"
                   onClick={() => {
                     setMode(item);
                     setMovementDraft(item === "absolute" ? String(row.quantity) : "0");
                     setError(null);
                   }}
                   className={cn("h-11 rounded-lg px-3 text-xs font-black uppercase tracking-[0.1em] transition sm:text-sm", mode === item ? "bg-black text-lime" : "text-zinc-500 hover:text-black")}
                 >
                   {item === "absolute" ? "Set New Total" : "Adjust Qty"}
                 </button>
               ))}
             </div>

             <div className="rounded-2xl border border-border bg-zinc-50 p-3 sm:p-4">
               <div className="flex items-center justify-between gap-3">
                 <div>
                   <div className="text-xs font-black uppercase tracking-[0.12em] text-zinc-400">Movement</div>
                    <div className={cn("mt-1 text-3xl font-black tracking-[-0.08em] sm:text-4xl", signedQuantity < 0 ? "text-red-600" : "text-black")}>{signedQuantity > 0 ? "+" : ""}{signedQuantity}</div>
                 </div>
                 <div className="text-right text-sm font-black text-zinc-500">
                   <div>Current {row.quantity}</div>
                   <div className={nextStock < 0 ? "text-red-600" : "text-black"}>After {nextStock}</div>
                 </div>
               </div>
             </div>
             {mode === "relative" ? (
               <div className="grid grid-cols-2 gap-2">
                 {(["add", "deduct"] as const).map((item) => (
                   <button
                     key={item}
                     type="button"
                     onClick={() => setRelativeDirection(item)}
                     className={cn("flex h-11 items-center justify-center gap-2 rounded-xl border text-sm font-black transition", relativeDirection === item ? "border-black bg-black text-lime" : "border-border bg-white text-zinc-600")}
                   >
                     {item === "add" ? <Plus className="size-4" /> : <Minus className="size-4" />}
                     {item === "add" ? "Add" : "Deduct"}
                   </button>
                 ))}
               </div>
             ) : null}
             <label className="grid gap-2 text-sm font-bold text-zinc-600">
               {mode === "absolute" ? "Target Stock" : "Movement Quantity"}
                <Input required min={mode === "absolute" ? 0 : undefined} name="stock-movement" inputMode="numeric" type="number" value={movementDraft} onChange={(event) => setMovementDraft(event.target.value)} className="h-12 rounded-lg text-lg font-bold" />
             </label>
            <label className="grid gap-2 text-sm font-bold text-zinc-600">
              Reason
              <NativeSelect required name="stock-reason" value={reason} onChange={(event) => setReason(event.target.value as StockAdjustmentReason)} className="h-12 rounded-lg bg-white text-base font-bold">
                {STOCK_ADJUSTMENT_REASONS.map((item) => (
                  <NativeSelectOption key={item} value={item}>{item}</NativeSelectOption>
                ))}
              </NativeSelect>
            </label>
            <label className="grid gap-2 text-sm font-bold text-zinc-600">
              Note
              <Textarea name="stock-note" value={note} onChange={(event) => setNote(event.target.value)} maxLength={500} autoComplete="off" className="min-h-24 rounded-lg font-semibold" placeholder="Optional notes for admin" />
            </label>
             <div className="rounded-xl bg-zinc-50 p-4 text-sm font-semibold text-zinc-600">
               Auto detected: <span className="text-black">{actionLabel}</span>
               {mode === "absolute" ? <span className="block pt-1 text-xs text-zinc-500">Audit note will include: Stock manually set to {hasValidMovement ? parsedMovement : "-"} (Adjustment: {adjustmentLabel})</span> : null}
             </div>
            {error ? <div className="rounded-lg border border-red-200 bg-red-50 px-4 py-3 text-sm font-bold text-red-700">{error}</div> : null}
          </div>

           <div className="mt-5 flex flex-col-reverse gap-2 sm:mt-6 sm:flex-row sm:justify-end sm:gap-3">
             <Button type="button" variant="outline" onClick={onClose} className="h-11 rounded-lg bg-white px-5 text-sm font-bold hover:bg-white sm:h-12 sm:px-6 sm:text-base">Cancel</Button>
              <Button type="submit" disabled={isPending} className="h-11 rounded-lg bg-lime px-5 text-sm font-bold text-black hover:bg-lime disabled:opacity-60 sm:h-12 sm:px-6 sm:text-base">
                {isPending ? <LumaSpinner label="Saving movement" /> : null}
                {isPending ? "Saving..." : "Confirm Adjustment"}
              </Button>
           </div>
           </form>
         </FluidEntrySurface>
         <p className="mt-3 text-center text-xs font-bold text-white/80">Click anywhere to close</p>
       </div>
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
    <div className="fixed inset-0 z-50 grid place-items-center overscroll-contain bg-black/45 px-4 py-[calc(1rem+env(safe-area-inset-top))] pb-[calc(1rem+env(safe-area-inset-bottom))]" onClick={onClose}>
      <div className="w-full max-w-[22rem] sm:max-w-lg" onClick={(event) => event.stopPropagation()}>
        <FluidEntrySurface className="max-h-[calc(100dvh-env(safe-area-inset-top)-env(safe-area-inset-bottom)-2rem)] rounded-2xl border border-white/50 bg-white/90 backdrop-blur-2xl sm:rounded-3xl" contentClassName="max-h-[calc(100dvh-env(safe-area-inset-top)-env(safe-area-inset-bottom)-2rem)] overflow-y-auto p-4 sm:p-6">
          <form onSubmit={handleSubmit}>
          <div className="flex items-start justify-between gap-4">
            <div>
              <h2 className="text-xl font-black tracking-[-0.05em] sm:text-2xl">Ping Admin</h2>
              <p className="mt-1 text-sm font-semibold text-zinc-500">{row.product_name} · current stock {row.quantity}</p>
            </div>
            <button type="button" onClick={onClose} className="grid size-9 place-items-center rounded-lg border border-border sm:size-10" aria-label="Close admin ping">
              <X className="size-4 sm:size-5" />
            </button>
          </div>
          <div className="mt-4 grid gap-3 sm:mt-6 sm:gap-4">
            <label className="grid gap-2 text-sm font-bold text-zinc-600">
              Requested Quantity
              <Input name="requested-quantity" inputMode="numeric" min={1} type="number" value={requestedQty} onChange={(event) => setRequestedQty(event.target.value)} className="h-12 rounded-lg text-lg font-bold" placeholder="Optional" />
            </label>
            <label className="grid gap-2 text-sm font-bold text-zinc-600">
              Note
              <Textarea name="restock-note" value={note} onChange={(event) => setNote(event.target.value)} maxLength={500} autoComplete="off" className="min-h-24 rounded-lg font-semibold" placeholder="Tell admin what needs attention" />
            </label>
            {error ? <div className="rounded-lg border border-red-200 bg-red-50 px-4 py-3 text-sm font-bold text-red-700">{error}</div> : null}
          </div>
          <div className="mt-5 flex flex-col-reverse gap-2 sm:mt-6 sm:flex-row sm:justify-end sm:gap-3">
            <Button type="button" variant="outline" onClick={onClose} className="h-11 rounded-lg bg-white px-5 text-sm font-bold hover:bg-white sm:h-12 sm:px-6 sm:text-base">Cancel</Button>
            <Button disabled={isPending} className="h-11 rounded-lg bg-lime px-5 text-sm font-bold text-black hover:bg-lime disabled:opacity-60 sm:h-12 sm:px-6 sm:text-base">
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
              { label: "Low at", value: row.low_stock_qty },
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
    <FluidEntrySurface className="mt-6 rounded-2xl border border-white/50 bg-white/60 backdrop-blur-2xl sm:mt-8 sm:rounded-3xl" contentClassName="p-3 sm:p-5">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h2 className="text-lg font-black tracking-[-0.05em] sm:text-xl">Restock Follow-Up</h2>
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
            <div key={request.id} className="liquid-width-enter grid gap-2.5 rounded-2xl border border-white/60 bg-white/70 p-2.5 shadow-sm shadow-black/5 backdrop-blur-lg md:grid-cols-[minmax(260px,1fr)_minmax(190px,230px)_300px] md:items-center md:gap-4 md:p-4 md:shadow-none">
              <div className="min-w-0">
                <div className="min-w-0 md:min-w-[220px]">
                  <div className="line-clamp-2 text-sm font-black leading-tight tracking-[-0.04em] md:truncate md:text-base">{request.product_name}</div>
                  <div className="mt-1 flex flex-wrap gap-1 text-xs font-bold text-zinc-500">
                    <span className="rounded-full bg-zinc-100 px-2 py-0.5">{request.sku_code}</span>
                    <span className="rounded-full bg-black px-2 py-0.5 capitalize text-lime">{request.status}</span>
                  </div>
                </div>
                <div className="mt-2 rounded-xl border border-border bg-zinc-50 p-2.5 md:mt-3 md:max-w-[280px] md:p-2.5">
                  <div className="flex items-center justify-between gap-3 text-xs font-black">
                    <span className="uppercase tracking-[0.12em] text-zinc-400">Stock</span>
                    <span className="text-zinc-600">Now {request.current_qty_snapshot} · Low {request.low_stock_qty_snapshot}</span>
                  </div>
                  <div className="mt-2 h-2 overflow-hidden rounded-full bg-white ring-1 ring-border">
                    <div
                      className="h-full rounded-full"
                      style={{
                        width: `${Math.max(0, Math.min(request.current_qty_snapshot / Math.max(request.low_stock_qty_snapshot, 1), 1)) * 100}%`,
                        backgroundColor: stockColor(request.current_qty_snapshot, Math.max(request.low_stock_qty_snapshot, 1)),
                      }}
                    />
                  </div>
                </div>
              </div>
              <div className="min-w-0 text-sm font-semibold text-zinc-600">
                <div className="grid grid-cols-[72px_minmax(0,1fr)] items-baseline gap-2 font-bold text-black">
                  <span className="text-xs uppercase tracking-[0.12em] text-zinc-400">Need</span>
                  <span>{request.requested_qty ?? "restock"}</span>
                </div>
                <div className="mt-0.5 grid grid-cols-[72px_minmax(0,1fr)] gap-2 text-xs font-bold text-zinc-500">
                  <span className="uppercase tracking-[0.12em] text-zinc-400">By</span>
                  <span className="min-w-0 truncate">{request.requested_by_name || request.requested_by_email || "Staff"}</span>
                </div>
                {request.note ? <div className="mt-1 line-clamp-2 font-medium text-zinc-500">{request.note.replace("[demo] ", "")}</div> : null}
              </div>
              <div className="grid grid-cols-[1fr_42px_42px] gap-1.5 md:w-[300px] md:grid-cols-[1fr_44px_44px] md:gap-2">
                {row?.whatsapp_number ? (
                  <WhatsAppLink phone={row.whatsapp_number} product={request.product_name} supplier={row.supplier_name ?? undefined} label="WhatsApp" className="h-10 rounded-xl bg-[#25D366] px-3 text-[11px] font-black text-white hover:bg-[#25D366] md:h-11 md:rounded-lg md:text-xs" />
                ) : (
                  <Button type="button" disabled className="h-10 rounded-xl bg-zinc-200 px-3 text-[11px] font-black text-zinc-500 md:h-11 md:rounded-lg md:text-xs">No Contact</Button>
                )}
                {action ? (
                  <Button type="button" aria-label={action.label} title={action.label} disabled={pendingId === request.id} onClick={() => { setConfirmError(null); setConfirmation({ request, status: action.status, label: action.label }); }} className="h-10 rounded-xl bg-lime px-0 text-black hover:bg-lime disabled:opacity-60 md:h-11 md:rounded-lg">
                    <Check className="size-4 md:size-5" />
                  </Button>
                ) : (
                  <Button type="button" aria-label="Settled" disabled className="h-10 rounded-xl bg-zinc-200 px-0 text-zinc-500 md:h-11 md:rounded-lg">
                    <Check className="size-4 md:size-5" />
                  </Button>
                )}
                <Button type="button" aria-label="Discard request" title="Discard request" disabled={pendingId === request.id} onClick={() => { setConfirmError(null); setConfirmation({ request, status: "cancelled", label: "Discard Request" }); }} className="h-10 rounded-xl border border-border bg-white px-0 text-black hover:bg-white disabled:opacity-60 md:h-11 md:rounded-lg">
                  <X className="size-4 md:size-5" />
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

function StockRowCard({
  row,
  index,
  effectiveRole,
  nested = false,
  onAdjust,
  onPing,
}: {
  row: InventoryRow;
  index: number;
  effectiveRole: "admin" | "staff";
  nested?: boolean;
  onAdjust: (target: StockAdjustmentTarget) => void;
  onPing: (row: InventoryRow) => void;
}) {
  const ratio = stockRatio(row.quantity, row.low_stock_qty);
  const percentage = Math.round(ratio * 100);
  const status = stockStatus(row);

  return (
    <FluidEntrySurface key={`${row.sku_id}-${row.location_id}`} entryDelay={nested ? 0 : Math.min(index * 0.04, 0.28)} className={cn("rounded-lg border border-zinc-200 bg-white transition-colors hover:border-zinc-300", nested && "shadow-sm shadow-black/5")}>
      <div className="p-1.5 xl:hidden">
        <div className="flex items-start gap-2">
          <div className="relative size-9 shrink-0 overflow-hidden rounded-md border border-zinc-200 bg-white ring-1 ring-black/5 sm:size-10">
            {row.photo_url ? (
              <Image src={row.photo_url} alt={row.product_name} fill loading={!nested && index === 0 ? "eager" : "lazy"} sizes="64px" className="object-cover" />
            ) : (
              <div className="grid size-full place-items-center bg-lime text-2xl font-black text-black/80">{row.product_name.slice(0, 1)}</div>
            )}
          </div>
          <div className="min-w-0 flex-1">
            <div className="flex items-start justify-between gap-2">
              <div className="min-w-0">
                <h2 className="line-clamp-1 text-sm font-black tracking-[-0.035em] sm:text-base">{row.product_name}</h2>
                <div className="mt-0.5 flex flex-wrap gap-1 text-[10px] font-bold text-zinc-500">
                  {row.variant ? <span className="rounded-full bg-zinc-100 px-2 py-0.5">{row.variant}</span> : null}
                  <span className="rounded-full bg-zinc-100 px-2 py-0.5">{row.sku_code}</span>
                </div>
              </div>
              <span className={cn("shrink-0 rounded-full px-2 py-0.5 text-[10px] font-black uppercase tracking-[0.1em] ring-1", status.className)}>{status.label}</span>
            </div>
          </div>
        </div>

        <div className={cn("mt-1.5 rounded-md border bg-zinc-50 p-1.5", stockCardBorder(row))}>
          <div className="flex items-end justify-between gap-3">
            <div>
              <div className="text-[10px] font-black uppercase tracking-[0.14em] text-zinc-400">Current Stock</div>
              <div className="flex items-end gap-2">
                <span className="text-xl font-black leading-none tracking-[-0.08em] sm:text-2xl">{row.quantity}</span>
              </div>
            </div>
            <div className="text-right text-xs font-black text-zinc-500">Low at {row.low_stock_qty}</div>
          </div>
          <div className="mt-2 h-1.5 overflow-hidden rounded-full bg-white ring-1 ring-border">
            <div className="h-full rounded-full" style={{ width: `${percentage}%`, backgroundColor: stockColor(row.quantity, row.low_stock_qty) }} />
          </div>
          <div className="mt-1.5 grid grid-cols-2 gap-1.5">
            <Button type="button" variant="outline" aria-label={`Deduct stock for ${row.product_name}`} className="h-8 rounded-md border-lime bg-white text-xs font-black hover:bg-white" onClick={() => onAdjust({ row, direction: "deduct" })}>
              <Minus className="size-4" />
              Deduct
            </Button>
            <Button type="button" aria-label={`Add stock for ${row.product_name}`} className="h-8 rounded-md bg-lime text-xs font-black text-black hover:bg-lime" onClick={() => onAdjust({ row, direction: "add" })}>
              <Plus className="size-4" />
              Add
            </Button>
          </div>
        </div>

        <div className="mt-1.5 rounded-md border border-border bg-white p-1.5">
          {effectiveRole === "admin" && isAdminRow(row) ? (
            <div className="flex items-center justify-between gap-3">
              <div className="min-w-0">
                <div className="truncate text-sm font-black tracking-[-0.035em]">{row.supplier_name ?? "No supplier"}</div>
                <div className="mt-0.5 text-xs font-bold text-zinc-500">{row.phone_raw ?? "No phone number"}</div>
              </div>
              {row.whatsapp_number ? (
                <WhatsAppLink phone={row.whatsapp_number} product={row.product_name} supplier={row.supplier_name ?? undefined} label="WhatsApp" className="h-8 shrink-0 rounded-md bg-[#25D366] px-3 text-[11px] font-black text-white hover:bg-[#25D366]" />
              ) : null}
            </div>
          ) : (
            <div className="flex items-center justify-between gap-3">
              <div>
                <div className="text-xs font-black uppercase tracking-[0.14em] text-zinc-500">Need help?</div>
                <div className="mt-1 text-base font-black tracking-[-0.045em]">Ping admin</div>
              </div>
              <Button type="button" variant="outline" className="h-8 rounded-md bg-white px-3 text-xs font-black hover:bg-white" onClick={() => onPing(row)}>Ping</Button>
            </div>
          )}
        </div>
      </div>

      <div className="hidden xl:grid xl:grid-cols-[88px_minmax(220px,1fr)_150px_210px] xl:items-stretch">
        <ProductThumb label={row.product_name} photoUrl={row.photo_url} eager={!nested && index === 0} />

        <div className="flex min-w-0 items-center px-2 py-1.5">
          <div className="min-w-0 pr-2">
            <h2 className="truncate text-base font-black tracking-[-0.045em]">{row.product_name}</h2>
            <div className="mt-0.5 flex flex-wrap gap-1 text-[10px] font-bold text-zinc-500">
              {row.variant ? <span className="rounded-md bg-zinc-100 px-2 py-0.5">{row.variant}</span> : null}
              <span className="rounded-md bg-zinc-100 px-2 py-0.5">{row.sku_code}</span>
            </div>
          </div>
        </div>

        <div className={cn("col-span-2 m-1.5 mt-0 rounded-md border bg-zinc-50 p-1.5 xl:col-span-1 xl:m-1.5 xl:ml-0", stockCardBorder(row))}>
          <div>
            <div>
              <div className="flex items-end gap-2">
                <span className="text-xl font-black leading-none tracking-[-0.08em]">{row.quantity}</span>
              </div>
              <div className="mt-0.5 text-[11px] font-bold text-zinc-500">Low at {row.low_stock_qty}</div>
            </div>
          </div>
          <div className="mt-1.5 h-1.5 overflow-hidden rounded-full bg-white ring-1 ring-border">
            <div className="h-full rounded-full" style={{ width: `${percentage}%`, backgroundColor: stockColor(row.quantity, row.low_stock_qty) }} />
          </div>
          <div className="mt-2 grid grid-cols-2 gap-1.5">
            <Button type="button" variant="outline" aria-label={`Deduct stock for ${row.product_name}`} className="h-10 rounded-md border-lime bg-white text-sm font-black hover:bg-white xl:h-7" onClick={() => onAdjust({ row, direction: "deduct" })}>
              <Minus className="size-4" />
            </Button>
            <Button type="button" aria-label={`Add stock for ${row.product_name}`} className="h-10 rounded-md bg-lime text-sm font-black text-black hover:bg-lime xl:h-7" onClick={() => onAdjust({ row, direction: "add" })}>
              <Plus className="size-4" />
            </Button>
          </div>
        </div>

        <div className="col-span-2 mx-1.5 mb-1.5 rounded-md border border-border bg-white p-1.5 xl:col-span-1 xl:m-1.5 xl:ml-0 xl:bg-zinc-50">
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
              <Button type="button" variant="outline" className="h-10 rounded-md bg-white px-3 text-xs font-black hover:bg-white xl:h-8" onClick={() => onPing(row)}>Ping Admin</Button>
            </div>
          )}
        </div>
      </div>
    </FluidEntrySurface>
  );
}

function StockGroupCard({
  entry,
  index,
  effectiveRole,
  isExpanded,
  onToggle,
  onAdjust,
  onPing,
}: {
  entry: StockGroupEntry;
  index: number;
  effectiveRole: "admin" | "staff";
  isExpanded: boolean;
  onToggle: () => void;
  onAdjust: (target: StockAdjustmentTarget) => void;
  onPing: (row: InventoryRow) => void;
}) {
  const percentage = Math.round(stockRatio(entry.totalQuantity, entry.totalLowStock) * 100);
  const status = groupStatus(entry);
  const borderClassName = entry.isOutOfStock ? "border-red-500" : entry.isLowStock ? "border-orange" : "border-border";
  const primarySupplier = entry.rows.find(isAdminRow);

  return (
    <FluidEntrySurface entryDelay={Math.min(index * 0.04, 0.28)} className="overflow-hidden rounded-lg border border-zinc-200 bg-white transition-colors hover:border-zinc-300" contentClassName="p-0">
      <button type="button" onClick={onToggle} className="grid w-full gap-2 p-2 text-left sm:p-2.5 xl:grid-cols-[88px_minmax(220px,1fr)_190px_210px] xl:items-stretch">
        <div className="flex min-w-0 items-start gap-2 xl:contents">
          <div className="relative size-10 shrink-0 overflow-hidden rounded-md border border-zinc-200 bg-white ring-1 ring-black/5 xl:size-auto xl:min-h-14">
            {entry.photoUrl ? (
              <Image src={entry.photoUrl} alt={entry.productName} fill loading={index === 0 ? "eager" : "lazy"} sizes="88px" className="object-cover" />
            ) : (
              <div className="grid size-full place-items-center bg-lime text-2xl font-black text-black/80">{entry.productName.slice(0, 1)}</div>
            )}
          </div>
          <div className="min-w-0 xl:flex xl:items-center xl:px-2 xl:py-1.5">
            <div className="min-w-0">
              <div className="flex flex-wrap items-center gap-1.5">
                <span className="rounded-md bg-black px-2 py-0.5 text-[10px] font-black uppercase tracking-[0.12em] text-lime">Main SKU</span>
                <span className={cn("rounded-full px-2 py-0.5 text-[10px] font-black uppercase tracking-[0.1em] ring-1", status.className)}>{status.label}</span>
              </div>
              <h2 className="mt-1 line-clamp-1 text-sm font-black tracking-[-0.035em] sm:text-base xl:text-base">{entry.productName}</h2>
              <div className="mt-0.5 flex flex-wrap gap-1 text-[10px] font-bold text-zinc-500">
                <span className="rounded-md bg-zinc-100 px-2 py-0.5">{entry.variationName}</span>
                <span className="rounded-md bg-zinc-100 px-2 py-0.5">{entry.rows.length} variants</span>
              </div>
            </div>
          </div>
        </div>

        <div className={cn("rounded-md border bg-zinc-50 p-1.5", borderClassName)}>
          <div className="flex items-start justify-between gap-3">
            <div>
              <div className="text-[10px] font-black uppercase tracking-[0.14em] text-zinc-400">Total Stock</div>
              <div className="flex items-end gap-2">
                <span className="text-xl font-black leading-none tracking-[-0.08em]">{entry.totalQuantity}</span>
              </div>
              <div className="mt-0.5 text-[11px] font-bold text-zinc-500">Low total {entry.totalLowStock}</div>
            </div>
            <ChevronDown className={cn("mt-1 size-5 shrink-0 transition-transform", isExpanded && "rotate-180")} />
          </div>
          <div className="mt-1.5 h-1.5 overflow-hidden rounded-full bg-white ring-1 ring-border">
            <div className="h-full rounded-full" style={{ width: `${percentage}%`, backgroundColor: stockColor(entry.totalQuantity, entry.totalLowStock) }} />
          </div>
        </div>

        <div className="rounded-md border border-border bg-white p-1.5 xl:bg-zinc-50">
          {effectiveRole === "admin" && primarySupplier ? (
            <>
              <div className="truncate text-base font-black tracking-[-0.045em]">{primarySupplier.supplier_name ?? "No supplier"}</div>
              <div className="text-[11px] font-bold text-zinc-500">{primarySupplier.phone_raw ?? "No phone number"}</div>
            </>
          ) : (
            <>
              <div className="text-xs font-black uppercase tracking-[0.14em] text-zinc-500">Variants</div>
              <div className="mt-1 text-sm font-black tracking-[-0.035em]">Tap to {isExpanded ? "hide" : "view"} child SKUs</div>
            </>
          )}
        </div>
      </button>

      {isExpanded ? (
        <div className="grid gap-2 border-t border-zinc-100 bg-zinc-50 p-2 sm:p-3">
          {entry.rows.map((row, childIndex) => (
            <StockRowCard key={`${entry.id}-${row.sku_id}-${row.location_id}`} row={row} index={childIndex} effectiveRole={effectiveRole} nested onAdjust={onAdjust} onPing={onPing} />
          ))}
        </div>
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
  const [viewAsStaff, setViewAsStaff] = useState(() => {
    if (typeof window === "undefined") return false;
    return window.localStorage.getItem(STAFF_VIEW_STORAGE_KEY) === "true";
  });
  const [isStatsOpen, setIsStatsOpen] = useState(false);
  const [isMobileMenuOpen, setIsMobileMenuOpen] = useState(false);
  const [adjustment, setAdjustment] = useState<StockAdjustmentTarget | null>(null);
  const [ping, setPing] = useState<InventoryRow | null>(null);
  const [expandedGroups, setExpandedGroups] = useState<Set<string>>(() => new Set());
  const isAdmin = membership.role === "admin";
  const effectiveRole = isAdmin && viewAsStaff ? "staff" : membership.role;
  const rows: InventoryRow[] = effectiveRole === "admin" ? adminRows : staffRows;
  const stockEntries = useMemo(() => buildStockEntries(rows, query, stockFilter, sortDirection), [query, rows, sortDirection, stockFilter]);
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

  function toggleStaffView() {
    setViewAsStaff((current) => {
      const next = !current;
      window.localStorage.setItem(STAFF_VIEW_STORAGE_KEY, String(next));
      return next;
    });
  }

  function toggleGroup(groupId: string) {
    setExpandedGroups((current) => {
      const next = new Set(current);
      if (next.has(groupId)) next.delete(groupId);
      else next.add(groupId);
      return next;
    });
  }

  return (
    <main className="min-h-screen overflow-x-hidden bg-white pb-[calc(6rem+env(safe-area-inset-bottom))] text-black lg:pb-0">
      <div className="min-h-screen lg:pl-[242px]">
        <AppSidebar active="stock" role={effectiveRole} restockCount={restockRequests.length} showStaffToggle={isAdmin} isViewingAsStaff={viewAsStaff} onToggleStaffView={toggleStaffView} />

        <section className="px-3 py-4 sm:px-8 sm:py-8 lg:px-7 xl:px-8">
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
                <Button type="button" variant="outline" onClick={toggleStaffView} className="h-11 rounded-lg border-border bg-white px-5 text-sm font-bold hover:bg-white lg:hidden">
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

          <FluidEntrySurface className="mt-6 rounded-2xl border border-white/50 bg-white/60 backdrop-blur-2xl sm:mt-8 sm:rounded-3xl" contentClassName="p-3 sm:p-4">
            <div className="grid gap-3 xl:grid-cols-[1fr_auto_auto] xl:items-center">
              <label className="flex h-12 items-center gap-3 rounded-xl border border-border bg-zinc-50 px-3 sm:h-14 sm:gap-4 sm:px-4">
                <Search className="size-5 shrink-0" />
                <input value={query} onChange={(event) => setQuery(event.target.value)} className="h-full min-w-0 flex-1 bg-transparent text-base font-semibold text-black outline-none placeholder:text-zinc-500" placeholder="Search product or SKU" />
              </label>
              <div className="grid grid-cols-3 rounded-xl border border-border bg-zinc-50 p-1">
                {(["all", "low", "out"] as const).map((filter) => (
                  <button key={filter} type="button" onClick={() => setStockFilter(filter)} className={cn("relative h-11 overflow-hidden rounded-lg px-3 text-sm font-black capitalize transition", stockFilter === filter ? "text-white" : "text-zinc-500 hover:text-black")}>
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
              <Button type="button" variant="outline" className="h-12 rounded-xl border-border bg-white px-4 text-sm font-black hover:bg-white sm:h-14 sm:px-5" onClick={() => setSortDirection(sortDirection === "asc" ? "desc" : "asc")}>
                <ArrowUpDown className="size-4" />
                <span className="sm:hidden">Sort: {sortDirection === "asc" ? "Low" : "High"}</span>
                <span className="hidden sm:inline">Stock {sortDirection === "asc" ? "low to high" : "high to low"}</span>
              </Button>
            </div>
          </FluidEntrySurface>

          <FluidEntrySurface className="mt-4 rounded-2xl border border-white/50 bg-white/60 backdrop-blur-2xl sm:mt-6 sm:rounded-3xl">
            <button type="button" onClick={() => setIsStatsOpen((current) => !current)} className="flex w-full items-center justify-between gap-3 px-4 py-2.5 text-left sm:gap-4 sm:px-5 sm:py-3">
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
              <div className="grid gap-3 border-t border-border px-4 py-3 sm:gap-4 sm:px-7 sm:py-5 md:grid-cols-4">
                {stats.map((stat, index) => {
                  const Icon = stat.icon;

                  return (
                    <div key={stat.label} className={cn("flex items-center justify-between gap-4 md:justify-start md:gap-5", index > 0 && "md:border-l md:border-border md:pl-7")}>
                        <Icon className={cn("size-8 shrink-0 stroke-black stroke-[1.8] text-black sm:size-10", stat.fill)} />
                      <div className="text-right md:text-left">
                        <div className="text-sm font-semibold tracking-[-0.03em] text-zinc-500">{stat.label}</div>
                         <div className="text-2xl font-black tracking-[-0.06em] sm:text-3xl md:mt-1">{stat.value}</div>
                      </div>
                    </div>
                  );
                })}
              </div>
            ) : null}
          </FluidEntrySurface>

          <div className="mt-3 grid gap-2 sm:mt-4 sm:gap-3">
            {stockEntries.map((entry, index) => {
              if (entry.type === "group") {
                return (
                  <StockGroupCard
                    key={entry.id}
                    entry={entry}
                    index={index}
                    effectiveRole={effectiveRole}
                    isExpanded={entry.autoExpanded || expandedGroups.has(entry.id)}
                    onToggle={() => toggleGroup(entry.id)}
                    onAdjust={setAdjustment}
                    onPing={setPing}
                  />
                );
              }

              return <StockRowCard key={`${entry.row.sku_id}-${entry.row.location_id}`} row={entry.row} index={index} effectiveRole={effectiveRole} onAdjust={setAdjustment} onPing={setPing} />;
            })}
          </div>

          <FluidEntrySurface className="mt-4 rounded-2xl border border-white/50 bg-white/60 backdrop-blur-2xl sm:mt-5 sm:rounded-3xl" contentClassName="flex flex-col gap-3 px-4 py-3 sm:flex-row sm:items-center sm:justify-between sm:gap-5 sm:px-6 sm:py-4">
            <div className="text-base font-bold text-zinc-500">Showing {stockEntries.length} product groups from {rows.length} SKUs</div>
            <div className="hidden items-center gap-4 sm:flex">
              <Button variant="outline" size="icon" aria-label="Previous page" className="size-12 rounded-xl border-border bg-white hover:bg-white"><ChevronLeft className="size-5" /></Button>
              <Button size="icon" className="size-12 rounded-xl bg-black text-lg font-bold text-white hover:bg-black">1</Button>
              <Button variant="outline" size="icon" aria-label="Next page" className="size-12 rounded-xl border-border bg-white hover:bg-white"><ChevronRight className="size-5" /></Button>
            </div>
          </FluidEntrySurface>
        </section>
      </div>

      {adjustment ? <AdjustmentDialog row={adjustment.row} direction={adjustment.direction} onClose={() => setAdjustment(null)} /> : null}
      {ping ? <PingDialog row={ping} onClose={() => setPing(null)} /> : null}
      {isMobileMenuOpen ? (
        <div className="fixed inset-0 z-50 grid items-end overscroll-contain bg-black/45 pb-[env(safe-area-inset-bottom)] sm:hidden" onClick={() => setIsMobileMenuOpen(false)}>
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
                    toggleStaffView();
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
              <Button asChild variant="outline" className="h-14 justify-start rounded-2xl border-dashed border-zinc-300 bg-white px-5 text-base font-black hover:bg-white" onClick={() => setIsMobileMenuOpen(false)}>
                <Link href="/workspaces">Workspaces</Link>
              </Button>
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

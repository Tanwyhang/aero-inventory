"use client";

import Image from "next/image";
import { useRouter } from "next/navigation";
import { FormEvent, useEffect, useState } from "react";
import { Check, Clipboard, Download, Lock, MoreHorizontal, PackagePlus, Pencil, Plus, Send, Trash2, X } from "lucide-react";

import {
  addPartnerShareItemAction,
  createPartnerShareSheetAction,
  deductPartnerShareStockAction,
  recordPartnerShareOutputAction,
  removePartnerShareItemAction,
  savePartnerAction,
  updatePartnerShareAutoSyncAction,
  updatePartnerShareItemAction,
  updatePartnerShareStatusAction,
} from "@/app/actions/partner-share";
import { AppSidebar } from "@/components/app-sidebar";
import { ConfirmSlideSheet, type ConfirmationRecord } from "@/components/confirm-slide-sheet";
import { FluidEntrySurface } from "@/components/fluid-entry-surface";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { LumaSpinner } from "@/components/ui/luma-spinner";
import { NativeSelect, NativeSelectOption } from "@/components/ui/native-select";
import { Textarea } from "@/components/ui/textarea";
import { toast } from "@/components/ui/toast";
import { cn } from "@/lib/utils";
import type {
  AdminInventoryRow,
  Membership,
  PartnerRow,
  PartnerSharePageData,
  PartnerShareSheetDetail,
  PartnerShareStatus,
  StaffInventoryRow,
} from "@/types/database";

type InventoryRow = AdminInventoryRow | StaffInventoryRow;
type Modal = "partner" | "sheet" | "item" | "edit-item" | null;
type PartnerShareItem = PartnerShareSheetDetail["items"][number];

const STAFF_VIEW_STORAGE_KEY = "aero:view-as-staff";
const PRODUCT_PAGE_SIZE = 12;
const AUTO_SYNC_REFRESH_MS = 10000;

type PendingConfirmation = {
  title: string;
  description: string;
  records: ConfirmationRecord[];
  onConfirm: () => Promise<void>;
};

const statusLabels: Record<PartnerShareStatus, string> = {
  draft: "Draft",
  confirmed: "Confirmed",
  sent: "Sent",
  completed: "Completed",
};

function today() {
  return new Date().toISOString().slice(0, 10);
}

function productLabel(row: { product_name: string; variant?: string | null }) {
  return row.variant ? `${row.product_name} ${row.variant}` : row.product_name;
}

function formatDate(value: string) {
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return value;
  return date.toLocaleDateString("en-GB");
}

function statusClassName(status: PartnerShareStatus) {
  if (status === "draft") return "bg-zinc-100 text-zinc-700";
  if (status === "confirmed") return "bg-blue-100 text-blue-800";
  if (status === "sent") return "bg-orange/15 text-orange";
  return "bg-lime/30 text-black";
}

function statusDotClassName(status: PartnerShareStatus) {
  if (status === "draft") return "bg-zinc-300";
  if (status === "confirmed") return "bg-blue-500";
  if (status === "sent") return "bg-orange";
  return "bg-lime";
}

function inventoryKey(skuId: string, locationId: string) {
  return `${skuId}:${locationId}`;
}

function toWhatsAppText(detail: PartnerShareSheetDetail, getShareQty: (item: PartnerShareItem) => number) {
  const lines = detail.items.map((item, index) => `${index + 1}. ${productLabel(item)} - ${getShareQty(item)} pcs`);
  return [
    `${detail.sheet.partner_name} 拿货数量`,
    "",
    ...lines,
    "",
    `From: ${detail.sheet.source_shop_name}`,
    `Date: ${formatDate(detail.sheet.share_date)}`,
  ].join("\n");
}

async function exportExcel(detail: PartnerShareSheetDetail, getShareQty: (item: PartnerShareItem) => number, getCurrentStock: (item: PartnerShareItem) => number) {
  const XLSX = await import("xlsx");
  const rows = detail.items.map((item) => ({
    "Partner Name": detail.sheet.partner_name,
    "Product Name": productLabel(item),
    SKU: item.sku_code,
    Category: item.category_name ?? "",
    Supplier: item.supplier_name ?? "",
    "Current Stock": getCurrentStock(item),
    "Share Qty": getShareQty(item),
    Remark: item.remark ?? "",
    Date: formatDate(detail.sheet.share_date),
    "Prepared By": detail.sheet.prepared_by_name ?? "",
    Status: statusLabels[detail.sheet.status],
    "Approved By": detail.sheet.approved_by_name ?? "",
  }));
  const worksheet = XLSX.utils.json_to_sheet(rows);
  const workbook = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(workbook, worksheet, "Partner Share Qty");
  XLSX.writeFile(workbook, `partner-share-${detail.sheet.partner_name.toLowerCase().replace(/[^a-z0-9]+/g, "-")}-${detail.sheet.share_date}.xlsx`);
}

export function PartnerShareManager({
  membership,
  pageData,
  details,
  inventoryRows,
  restockCount = 0,
}: {
  membership: Membership;
  pageData: PartnerSharePageData;
  details: PartnerShareSheetDetail[];
  inventoryRows: InventoryRow[];
  restockCount?: number;
}) {
  const router = useRouter();
  const isAdmin = membership.role === "admin";
  const [viewAsStaff, setViewAsStaff] = useState(() => {
    if (typeof window === "undefined") return false;
    return window.localStorage.getItem(STAFF_VIEW_STORAGE_KEY) === "true";
  });
  const [selectedSheetId, setSelectedSheetId] = useState(details[0]?.sheet.id ?? "");
  const [modal, setModal] = useState<Modal>(null);
  const [partnerDraft, setPartnerDraft] = useState({ partnerId: "", name: "", contactName: "", phoneRaw: "", notes: "" });
  const [sheetDraft, setSheetDraft] = useState({ partnerId: pageData.partners[0]?.id ?? "", locationId: inventoryRows[0]?.location_id ?? "", shareDate: today() });
  const [itemDraft, setItemDraft] = useState({ itemId: "", skuId: inventoryRows[0]?.sku_id ?? "", shareQty: "1", remark: "" });
  const [sheetQuery, setSheetQuery] = useState("");
  const [statusFilter, setStatusFilter] = useState<PartnerShareStatus | "all">("all");
  const [productQuery, setProductQuery] = useState("");
  const [productPage, setProductPage] = useState(0);
  const [inlineShareDraft, setInlineShareDraft] = useState<Record<string, string>>({});
  const [isSheetSwitcherOpen, setIsSheetSwitcherOpen] = useState(false);
  const [confirmation, setConfirmation] = useState<PendingConfirmation | null>(null);
  const [confirmError, setConfirmError] = useState<string | null>(null);
  const [isPending, setIsPending] = useState(false);
  const selectedDetail = details.find((detail) => detail.sheet.id === selectedSheetId) ?? details[0] ?? null;
  const selectedSheet = selectedDetail?.sheet ?? null;
  const effectiveRole = isAdmin && viewAsStaff ? "staff" : membership.role;
  const canManage = effectiveRole === "admin";
  const isAutoSync = Boolean(selectedSheet?.auto_sync_with_main_store);
  const isLocked = !canManage || selectedSheet?.status === "completed";
  const isShareReadOnly = isLocked || isAutoSync;
  const locationRows = Array.from(new Map(inventoryRows.map((row) => [row.location_id, row])).values());
  const sheetRows = selectedSheet ? inventoryRows.filter((row) => row.location_id === selectedSheet.location_id) : inventoryRows;
  const inventoryBySku = new Map(sheetRows.map((row) => [inventoryKey(row.sku_id, row.location_id), row]));
  const selectedSkuIds = new Set(selectedDetail?.items.map((item) => inventoryKey(item.sku_id, item.location_id)) ?? []);
  const filteredSheets = pageData.sheets.filter((sheet) => {
    const matchesQuery = `${sheet.partner_name} ${sheet.location_name} ${sheet.source_shop_name}`.toLowerCase().includes(sheetQuery.toLowerCase());
    const matchesStatus = statusFilter === "all" || sheet.status === statusFilter;
    return matchesQuery && matchesStatus;
  });
  const filteredProductRows = sheetRows.filter((row) => `${row.product_name} ${row.variant ?? ""} ${row.sku_code} ${row.category_name ?? ""}`.toLowerCase().includes(productQuery.toLowerCase()));
  const productPageCount = Math.max(1, Math.ceil(filteredProductRows.length / PRODUCT_PAGE_SIZE));
  const activeProductPage = Math.min(productPage, productPageCount - 1);
  const paginatedProductRows = filteredProductRows.slice(activeProductPage * PRODUCT_PAGE_SIZE, (activeProductPage + 1) * PRODUCT_PAGE_SIZE);

  function liveStockForItem(item: PartnerShareItem) {
    return inventoryBySku.get(inventoryKey(item.sku_id, item.location_id))?.quantity ?? item.current_stock_snapshot;
  }

  function shareQtyForItem(item: PartnerShareItem) {
    if (!selectedSheet?.auto_sync_with_main_store) return item.share_qty;
    return liveStockForItem(item);
  }

  const totalShareQty = selectedDetail?.items.reduce((sum, item) => sum + shareQtyForItem(item), 0) ?? 0;

  useEffect(() => {
    if (!selectedSheet?.auto_sync_with_main_store) return;

    const timer = window.setInterval(() => {
      router.refresh();
    }, AUTO_SYNC_REFRESH_MS);

    return () => window.clearInterval(timer);
  }, [router, selectedSheet?.auto_sync_with_main_store, selectedSheet?.id]);

  function closeModal() {
    setModal(null);
    setConfirmError(null);
    setProductQuery("");
    setProductPage(0);
  }

  function toggleStaffView() {
    setViewAsStaff((current) => {
      const next = !current;
      window.localStorage.setItem(STAFF_VIEW_STORAGE_KEY, String(next));
      return next;
    });
  }

  async function execute(title: string, action: () => Promise<{ ok: boolean; error?: string }>, success: string) {
    setIsPending(true);
    setConfirmError(null);
    const result = await action();
    setIsPending(false);

    if (!result.ok) {
      const message = result.error ?? "Action failed.";
      setConfirmError(message);
      toast.error(title, { description: message });
      throw new Error(message);
    }

    toast.success(success);
    setConfirmation(null);
    closeModal();
    router.refresh();
  }

  function ask(title: string, description: string, records: ConfirmationRecord[], onConfirm: () => Promise<void>) {
    setConfirmError(null);
    setConfirmation({ title, description, records, onConfirm });
  }

  function openPartner(partner?: PartnerRow) {
    setPartnerDraft(partner ? {
      partnerId: partner.id,
      name: partner.name,
      contactName: partner.contact_name ?? "",
      phoneRaw: partner.phone_raw ?? "",
      notes: partner.notes ?? "",
    } : { partnerId: "", name: "", contactName: "", phoneRaw: "", notes: "" });
    setModal("partner");
  }

  function submitPartner(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    ask(partnerDraft.partnerId ? "Confirm Partner Update" : "Confirm New Partner", "This partner change will be recorded in the audit trail.", [
      { label: "Partner", value: partnerDraft.name },
      { label: "Contact", value: partnerDraft.contactName || partnerDraft.phoneRaw },
      { label: "Approved By", value: membership.full_name || membership.user_email },
    ], () => execute("Partner save failed", () => savePartnerAction(partnerDraft), partnerDraft.partnerId ? "Partner updated" : "Partner created"));
  }

  function submitSheet(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const partner = pageData.partners.find((item) => item.id === sheetDraft.partnerId);
    const location = locationRows.find((item) => item.location_id === sheetDraft.locationId);
    ask("Confirm New Share Sheet", "This creates a draft Partner Share Qty sheet.", [
      { label: "Partner", value: partner?.name },
      { label: "Source Shop", value: membership.organization_name },
      { label: "Location", value: location?.location_name },
      { label: "Date", value: formatDate(sheetDraft.shareDate) },
      { label: "Prepared By", value: membership.full_name || membership.user_email },
    ], () => execute("Sheet creation failed", () => createPartnerShareSheetAction(sheetDraft), "Partner share sheet created"));
  }

  function submitItem(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (modal === "item") return;
    if (!selectedSheet) return;
    const row = sheetRows.find((item) => item.sku_id === itemDraft.skuId);
    ask(modal === "edit-item" ? "Confirm Item Update" : "Confirm Add Product", "This product quantity change will be recorded.", [
      { label: "Product", value: row?.product_name ?? selectedDetail?.items.find((item) => item.id === itemDraft.itemId)?.product_name },
      { label: "Share Qty", value: itemDraft.shareQty },
      { label: "Remark", value: itemDraft.remark },
      { label: "Approved By", value: membership.full_name || membership.user_email },
    ], () => execute(
      "Item save failed",
      () => modal === "edit-item"
        ? updatePartnerShareItemAction({ itemId: itemDraft.itemId, shareQty: Number(itemDraft.shareQty), remark: itemDraft.remark })
        : addPartnerShareItemAction({ sheetId: selectedSheet.id, skuId: itemDraft.skuId, shareQty: Number(itemDraft.shareQty), remark: itemDraft.remark }),
      modal === "edit-item" ? "Item updated" : "Product added",
    ));
  }

  function openItemModal() {
    setItemDraft({ itemId: "", skuId: sheetRows[0]?.sku_id ?? "", shareQty: "1", remark: "" });
    setProductQuery("");
    setProductPage(0);
    setModal("item");
  }

  async function quickAddProduct(row: InventoryRow) {
    if (!selectedSheet || isPending) return;
    if (selectedSkuIds.has(inventoryKey(row.sku_id, row.location_id))) {
      toast.error("Product already added to this sheet");
      return;
    }

    await execute(
      "Add product failed",
      () => addPartnerShareItemAction({ sheetId: selectedSheet.id, skuId: row.sku_id, shareQty: 1, remark: "" }),
      "Product added",
    );
  }

  function submitInlineShareQty(item: PartnerShareItem) {
    const nextValue = inlineShareDraft[item.id] ?? String(item.share_qty);
    const nextQty = Number(nextValue);

    if (nextQty === item.share_qty) return;
    if (!Number.isInteger(nextQty) || nextQty <= 0) {
      setInlineShareDraft((draft) => ({ ...draft, [item.id]: String(item.share_qty) }));
      toast.error("Enter a valid share quantity");
      return;
    }

    ask("Confirm Share Qty Update", "This inline quantity change will be recorded.", [
      { label: "Product", value: productLabel(item) },
      { label: "Current Share Qty", value: item.share_qty },
      { label: "New Share Qty", value: nextQty },
      { label: "Approved By", value: membership.full_name || membership.user_email },
    ], () => execute(
      "Share qty update failed",
      () => updatePartnerShareItemAction({ itemId: item.id, shareQty: nextQty, remark: item.remark ?? "" }),
      "Share quantity updated",
    ));
  }

  function changeInlineShareQty(item: PartnerShareItem, nextQty: number) {
    if (isShareReadOnly || nextQty === item.share_qty || nextQty <= 0) return;

    ask("Confirm Share Qty Update", "This quantity change will be recorded.", [
      { label: "Product", value: productLabel(item) },
      { label: "Current Share Qty", value: item.share_qty },
      { label: "New Share Qty", value: nextQty },
      { label: "Approved By", value: membership.full_name || membership.user_email },
    ], () => execute(
      "Share qty update failed",
      () => updatePartnerShareItemAction({ itemId: item.id, shareQty: nextQty, remark: item.remark ?? "" }),
      "Share quantity updated",
    ));
  }

  function changeStatus(status: PartnerShareStatus) {
    if (!selectedSheet) return;
    ask(`Confirm Mark ${statusLabels[status]}`, "This status approval will record the approving admin.", [
      { label: "Partner", value: selectedSheet.partner_name },
      { label: "Current Status", value: statusLabels[selectedSheet.status] },
      { label: "New Status", value: statusLabels[status] },
      { label: "Approved By", value: membership.full_name || membership.user_email },
    ], () => execute("Status update failed", () => updatePartnerShareStatusAction({ sheetId: selectedSheet.id, status }), `Marked ${statusLabels[status]}`));
  }

  function toggleAutoSync(nextValue: boolean) {
    if (!selectedSheet || isLocked) return;

    ask(
      nextValue ? "Enable Auto-Sync" : "Disable Auto-Sync",
      nextValue ? "Share quantities will mirror live warehouse stock and become read-only." : "Share quantities will become manually editable again.",
      [
        { label: "Partner", value: selectedSheet.partner_name },
        { label: "Auto-Sync", value: nextValue ? "On" : "Off" },
        { label: "Approved By", value: membership.full_name || membership.user_email },
      ],
      () => execute(
        "Auto-sync update failed",
        () => updatePartnerShareAutoSyncAction({ sheetId: selectedSheet.id, autoSyncWithMainStore: nextValue }),
        nextValue ? "Auto-sync enabled" : "Auto-sync disabled",
      ),
    );
  }

  function deductStock() {
    if (!selectedDetail) return;
    ask("Confirm Stock Deduct", "This will deduct every Share Qty from real inventory and cannot be repeated.", [
      { label: "Partner", value: selectedDetail.sheet.partner_name },
      { label: "Items", value: selectedDetail.items.length },
      { label: "Total Qty", value: totalShareQty },
      { label: "Approved By", value: membership.full_name || membership.user_email },
    ], () => execute("Stock deduct failed", () => deductPartnerShareStockAction(selectedDetail.sheet.id), "Stock deducted"));
  }

  async function copyWhatsApp() {
    if (!selectedDetail) return;
    await navigator.clipboard.writeText(toWhatsAppText(selectedDetail, shareQtyForItem));
    const result = await recordPartnerShareOutputAction({ sheetId: selectedDetail.sheet.id, outputType: "whatsapp_copy" });
    if (!result.ok) toast.error("Copy audit failed", { description: result.error });
    toast.success("WhatsApp text copied");
  }

  async function downloadExcel() {
    if (!selectedDetail) return;
    await exportExcel(selectedDetail, shareQtyForItem, liveStockForItem);
    const result = await recordPartnerShareOutputAction({ sheetId: selectedDetail.sheet.id, outputType: "excel_export" });
    if (!result.ok) toast.error("Export audit failed", { description: result.error });
    else toast.success("Excel exported");
  }

  return (
    <main className="min-h-screen overflow-x-hidden bg-white pb-[calc(11rem+env(safe-area-inset-bottom))] text-black lg:pb-0">
      <div className="min-h-screen lg:pl-[242px]">
        <AppSidebar active="partner" role={effectiveRole} restockCount={restockCount} showStaffToggle={isAdmin} isViewingAsStaff={viewAsStaff} onToggleStaffView={toggleStaffView} />
        <section className="px-3 py-4 sm:px-8 sm:py-8 lg:px-7 xl:px-8">
          <header className="flex flex-row items-center justify-between gap-3">
            <div>
              <h1 className="text-2xl font-black tracking-[-0.055em] sm:text-3xl">Partner Share Qty</h1>
              <p className="mt-1 hidden max-w-2xl text-xs font-semibold text-zinc-500 sm:block sm:text-sm">Manage partner share sheets and export quantities.</p>
            </div>
            {canManage ? (
              <div className="flex items-center gap-2">
                <Button type="button" data-tutorial="partner-new-sheet" onClick={() => setModal("sheet")} disabled={pageData.partners.length === 0 || inventoryRows.length === 0} className="h-9 rounded-lg bg-lime px-3 text-xs font-bold text-black hover:bg-lime sm:px-4"><Plus className="size-4" />New Sheet</Button>
                <Button type="button" data-tutorial="partner-new-partner" variant="outline" onClick={() => openPartner()} className="hidden h-9 rounded-lg bg-white px-3 text-xs font-bold hover:bg-white sm:inline-flex sm:px-4"><Plus className="size-4" />New Partner</Button>
                <Button type="button" data-tutorial="partner-new-partner" variant="outline" onClick={() => openPartner()} className="h-9 rounded-lg bg-white px-2 text-xs font-bold hover:bg-white sm:hidden" aria-label="New partner"><MoreHorizontal className="size-4" /></Button>
              </div>
            ) : null}
          </header>

          {selectedDetail ? (
            <FluidEntrySurface className="mt-4 rounded-2xl border border-white/50 bg-white/70 backdrop-blur-2xl xl:hidden" contentClassName="p-3">
              <div className="flex items-start justify-between gap-3">
                <div className="min-w-0">
                  <div className="text-[10px] font-black uppercase tracking-[0.14em] text-zinc-400">Current Sheet</div>
                  <div className="mt-1 flex flex-wrap items-center gap-2">
                    <h2 className="truncate text-xl font-black tracking-[-0.055em]">{selectedDetail.sheet.partner_name}</h2>
                    <span className={cn("rounded-full px-2.5 py-1 text-[11px] font-black", statusClassName(selectedDetail.sheet.status))}>{statusLabels[selectedDetail.sheet.status]}</span>
                  </div>
                  <p className="mt-1 text-xs font-semibold text-zinc-500">{selectedDetail.sheet.source_shop_name} · {selectedDetail.sheet.location_name}</p>
                  <p className="mt-0.5 text-[11px] font-bold text-zinc-400">{formatDate(selectedDetail.sheet.share_date)} · Prepared by {selectedDetail.sheet.prepared_by_name ?? "-"}</p>
                </div>
               </div>
               <div className="mt-3 grid grid-cols-2 gap-2">
                 <Button type="button" variant="outline" onClick={() => setIsSheetSwitcherOpen(true)} className="h-10 rounded-xl bg-white text-xs font-black hover:bg-white">Switch Sheet</Button>
                 {canManage && selectedDetail.sheet.status !== "completed" ? <Button type="button" onClick={openItemModal} className="h-10 rounded-xl bg-black text-xs font-black text-white hover:bg-black"><Plus className="size-4" />Add Product</Button> : null}
               </div>
               <label className={cn("mt-3 flex items-center gap-2 rounded-xl border border-border bg-white px-3 py-2 text-xs font-bold text-zinc-700", isLocked && "opacity-60")}> 
                 <input type="checkbox" checked={isAutoSync} onChange={(event) => toggleAutoSync(event.target.checked)} disabled={isLocked || isPending} className="size-4 accent-lime" />
                 <span>Auto-Sync with Main Store SKU</span>
               </label>
               <div className="mt-3 rounded-xl bg-zinc-50 px-3 py-2 text-xs font-black text-zinc-600">{selectedDetail.items.length} products · {totalShareQty} pcs total</div>
             </FluidEntrySurface>
          ) : null}

          <div className="mt-4 grid gap-4 sm:gap-5 xl:mt-5 xl:grid-cols-[300px_1fr]">
            <FluidEntrySurface className="hidden rounded-2xl border border-zinc-200 bg-white xl:block" contentClassName="p-3">
              <div className="flex items-center justify-between gap-3 px-1">
                <h2 className="text-xs font-black uppercase tracking-[0.14em] text-zinc-400">Sheets</h2>
                <span className="text-xs font-black tabular-nums text-zinc-400">{pageData.sheets.length}</span>
              </div>
              <div className="mt-3 grid gap-2">
                <input data-tutorial="partner-search" value={sheetQuery} onChange={(event) => setSheetQuery(event.target.value)} className="h-9 rounded-lg border border-zinc-200 bg-zinc-50 px-3 text-xs font-semibold outline-none focus:border-zinc-300 focus:bg-white focus:ring-2 focus:ring-lime" placeholder="Search sheets" />
                <select value={statusFilter} onChange={(event) => setStatusFilter(event.target.value as PartnerShareStatus | "all")} className="h-9 rounded-lg border border-zinc-200 bg-zinc-50 px-3 text-xs font-semibold text-zinc-700 outline-none focus:border-zinc-300 focus:bg-white focus:ring-2 focus:ring-lime">
                  <option value="all">All status</option>
                  {Object.entries(statusLabels).map(([value, label]) => <option key={value} value={value}>{label}</option>)}
                </select>
              </div>
              <div className="mt-3 divide-y divide-zinc-100 overflow-hidden rounded-xl border border-zinc-100 bg-white">
                {pageData.partners.length === 0 ? <div className="p-4 text-sm font-semibold text-zinc-500">Create a partner first.</div> : null}
                {pageData.partners.length > 0 && pageData.sheets.length === 0 ? <div className="p-4 text-sm font-semibold text-zinc-500">No sheets yet.</div> : null}
                {pageData.sheets.length > 0 && filteredSheets.length === 0 ? <div className="p-4 text-sm font-semibold text-zinc-500">No matching sheets.</div> : null}
                {filteredSheets.map((sheet) => (
                  <button key={sheet.id} type="button" onClick={() => setSelectedSheetId(sheet.id)} className={cn("group w-full px-3 py-2.5 text-left transition hover:bg-zinc-50", selectedSheet?.id === sheet.id && "bg-lime/15 hover:bg-lime/20")}>
                    <div className="flex items-center gap-3">
                      <span className={cn("size-2 shrink-0 rounded-full", statusDotClassName(sheet.status))} />
                      <div className="min-w-0 flex-1">
                        <div className="truncate text-sm font-black tracking-[-0.02em] text-zinc-950">{sheet.partner_name}</div>
                        <div className="mt-0.5 truncate text-[11px] font-semibold text-zinc-500">{formatDate(sheet.share_date)} · {sheet.item_count} items · {sheet.total_share_qty} pcs</div>
                      </div>
                      <span className="shrink-0 text-[11px] font-bold text-zinc-400">{statusLabels[sheet.status]}</span>
                    </div>
                  </button>
                ))}
              </div>

              {canManage ? <button type="button" onClick={() => openPartner()} className="mt-3 inline-flex items-center gap-1 px-1 text-xs font-semibold text-zinc-400 underline-offset-4 hover:text-zinc-700 hover:underline"><MoreHorizontal className="size-4" />Partners</button> : null}
            </FluidEntrySurface>

            <div className="grid gap-5">
              {selectedDetail ? (
                <FluidEntrySurface data-tutorial="partner-sheet" className="rounded-2xl border border-white/50 bg-white/70 backdrop-blur-2xl sm:rounded-3xl" contentClassName="p-3 sm:p-5">
                  <div className="flex flex-col gap-3 lg:flex-row lg:items-start lg:justify-between">
                    <div className="min-w-0">
                      <div className="flex flex-wrap items-center gap-2">
                        <h2 className="text-xl font-black tracking-[-0.055em] sm:text-2xl">{selectedDetail.sheet.partner_name}</h2>
                        <span className={cn("rounded-full px-3 py-1 text-xs font-black", statusClassName(selectedDetail.sheet.status))}>{statusLabels[selectedDetail.sheet.status]}</span>
                        {selectedDetail.sheet.stock_deducted_at ? <span className="rounded-full bg-red-50 px-3 py-1 text-xs font-black text-red-600">Stock Deducted</span> : null}
                      </div>
                      <p className="mt-1 text-xs font-semibold text-zinc-500 sm:text-sm">{selectedDetail.sheet.source_shop_name} · {selectedDetail.sheet.location_name}</p>
                      <p className="mt-0.5 text-[11px] font-bold text-zinc-400 sm:text-xs">{formatDate(selectedDetail.sheet.share_date)} · Prepared by {selectedDetail.sheet.prepared_by_name ?? "-"}</p>
                    </div>
                    <div className="hidden grid-cols-2 gap-2 sm:flex sm:flex-wrap sm:justify-end xl:flex">
                      <label className={cn("flex h-8 items-center gap-2 rounded-lg border border-border bg-white px-2.5 text-[11px] font-bold text-zinc-700", isLocked && "opacity-60")}> 
                        <input type="checkbox" checked={isAutoSync} onChange={(event) => toggleAutoSync(event.target.checked)} disabled={isLocked || isPending} className="size-3.5 accent-lime" />
                        <span>Auto-Sync with Main Store SKU</span>
                      </label>
                      {canManage && selectedDetail.sheet.status !== "completed" ? <Button type="button" data-tutorial="partner-add-product" onClick={openItemModal} className="h-8 rounded-lg bg-black px-2.5 text-[11px] font-bold text-white hover:bg-black"><PackagePlus className="size-3.5" />Add Product</Button> : null}
                      <Button type="button" variant="outline" onClick={copyWhatsApp} className="h-8 rounded-lg bg-white px-2.5 text-[11px] font-bold hover:bg-white"><Clipboard className="size-3.5" />WhatsApp</Button>
                      <Button type="button" variant="outline" onClick={downloadExcel} className="h-8 rounded-lg bg-white px-2.5 text-[11px] font-bold hover:bg-white"><Download className="size-3.5" />Excel</Button>
                      {canManage && selectedDetail.sheet.status === "draft" ? <Button type="button" onClick={() => changeStatus("confirmed")} className="h-8 rounded-lg bg-blue-600 px-2.5 text-[11px] text-white hover:bg-blue-600"><Check className="size-3.5" />Confirm</Button> : null}
                      {canManage && selectedDetail.sheet.status === "confirmed" ? <Button type="button" onClick={() => changeStatus("sent")} className="h-8 rounded-lg bg-orange px-2.5 text-[11px] text-white hover:bg-orange"><Send className="size-3.5" />Mark Sent</Button> : null}
                      {canManage && selectedDetail.sheet.status === "sent" ? <Button type="button" onClick={() => changeStatus("completed")} className="h-8 rounded-lg bg-lime px-2.5 text-[11px] text-black hover:bg-lime"><Check className="size-3.5" />Complete</Button> : null}
                      {canManage && !selectedDetail.sheet.stock_deducted_at && (selectedDetail.sheet.status === "sent" || selectedDetail.sheet.status === "completed") ? <Button type="button" onClick={deductStock} variant="outline" className="h-8 rounded-lg bg-white px-2.5 text-[11px] font-bold hover:bg-white">Deduct Stock</Button> : null}
                    </div>
                  </div>

                  <div className="mt-4 flex flex-wrap gap-2 rounded-xl border border-border bg-zinc-50 px-3 py-2 text-xs font-black text-zinc-600 sm:rounded-2xl">
                    <span>{selectedDetail.items.length} products</span>
                    <span>·</span>
                    <span>{totalShareQty} pcs total</span>
                    <span>·</span>
                    <span>{statusLabels[selectedDetail.sheet.status]}</span>
                    {isAutoSync ? <><span>·</span><span>Live synced</span></> : null}
                    <span>·</span>
                    <span>Approved by {selectedDetail.sheet.approved_by_name ?? "-"}</span>
                  </div>

                  <div className="mt-4 grid gap-3 sm:hidden">
                    <h3 className="px-1 text-xs font-black uppercase tracking-[0.14em] text-zinc-400">Products</h3>
                    {selectedDetail.items.map((item) => (
                      <div key={item.id} className="rounded-2xl border border-border bg-white p-3 shadow-sm shadow-black/5">
                        <div className="flex items-start gap-3">
                          <div className="relative grid size-12 shrink-0 place-items-center overflow-hidden rounded-xl bg-lime text-base font-black">
                            {item.photo_url ? <Image src={item.photo_url} alt={item.product_name} fill sizes="48px" className="object-cover" /> : item.product_name.slice(0, 1)}
                          </div>
                          <div className="min-w-0 flex-1">
                            <div className="line-clamp-2 text-base font-black leading-tight tracking-[-0.04em]" title={productLabel(item)}>{productLabel(item)}</div>
                            <div className="mt-1 text-xs font-bold text-zinc-500">{item.sku_code} · {item.category_name ?? "No category"}</div>
                          </div>
                        </div>
                        <div className="mt-3 grid grid-cols-[1fr_auto] items-center gap-3 rounded-xl bg-zinc-50 p-3">
                          <div>
                            <div className="text-[10px] font-black uppercase tracking-[0.14em] text-zinc-400">Stock</div>
                            <div className="mt-1 text-xl font-black tracking-[-0.06em]">{liveStockForItem(item)}</div>
                          </div>
                          <div className="text-right">
                            <div className="text-[10px] font-black uppercase tracking-[0.14em] text-zinc-400">Share Qty</div>
                            {isShareReadOnly ? <div className="mt-1 text-xl font-black tracking-[-0.06em]">{shareQtyForItem(item)}</div> : (
                              <div className="mt-1 grid grid-cols-[36px_52px_36px] overflow-hidden rounded-xl border border-border bg-white">
                                <button type="button" onClick={() => changeInlineShareQty(item, item.share_qty - 1)} className="grid h-10 place-items-center text-lg font-black disabled:opacity-40" disabled={item.share_qty <= 1}>-</button>
                                <div className="grid h-10 place-items-center border-x border-border text-base font-black tabular-nums">{item.share_qty}</div>
                                <button type="button" onClick={() => changeInlineShareQty(item, item.share_qty + 1)} className="grid h-10 place-items-center text-lg font-black">+</button>
                              </div>
                            )}
                          </div>
                        </div>
                        {item.remark ? <div className="mt-3 rounded-xl border border-border bg-white px-3 py-2 text-xs font-semibold text-zinc-600">{item.remark}</div> : null}
                        {!isShareReadOnly ? (
                          <div className="mt-3 grid grid-cols-2 gap-2">
                            <Button type="button" variant="outline" onClick={() => { setItemDraft({ itemId: item.id, skuId: item.sku_id, shareQty: String(item.share_qty), remark: item.remark ?? "" }); setModal("edit-item"); }} className="h-9 rounded-xl bg-white text-xs font-black hover:bg-white"><Pencil className="size-3.5" />Edit</Button>
                            <Button type="button" onClick={() => ask("Confirm Remove Product", "This removes the product from this share sheet.", [{ label: "Product", value: productLabel(item) }, { label: "Share Qty", value: item.share_qty }, { label: "Approved By", value: membership.full_name || membership.user_email }], () => execute("Remove failed", () => removePartnerShareItemAction(item.id), "Product removed"))} className="h-9 rounded-xl bg-red-500 text-xs font-black text-white hover:bg-red-500"><Trash2 className="size-3.5" />Remove</Button>
                          </div>
                        ) : null}
                      </div>
                    ))}
                  </div>

                  <div className="mt-4 hidden overflow-hidden rounded-2xl border border-border bg-white/80 sm:block">
                    <table className="w-full table-fixed border-collapse text-left text-xs">
                      <colgroup>
                        <col className="w-[27%]" />
                        <col className="w-[13%]" />
                        <col className="w-[12%]" />
                        <col className="w-[7%]" />
                        <col className="w-[9%]" />
                        <col className="w-[18%]" />
                        <col className="w-[14%]" />
                      </colgroup>
                      <thead className="bg-black text-white">
                          <tr className="h-9">
                          <th className="px-2 text-[11px] font-black">Product</th>
                          <th className="px-2 text-[11px] font-black">SKU</th>
                          <th className="px-2 text-[11px] font-black">Category</th>
                          <th className="px-2 text-[11px] font-black">Stock</th>
                          <th className="px-2 text-[11px] font-black">Share</th>
                          <th className="px-2 text-[11px] font-black">Remark</th>
                          <th className="px-2 text-[11px] font-black">Actions</th>
                        </tr>
                      </thead>
                      <tbody>
                        {selectedDetail.items.map((item) => (
                          <tr key={item.id} className="border-t border-border align-middle">
                            <td className="px-2 py-2">
                              <div className="flex min-w-0 items-center gap-2">
                                <div className="relative grid size-8 shrink-0 place-items-center overflow-hidden rounded-lg bg-lime text-xs font-black">
                                  {item.photo_url ? <Image src={item.photo_url} alt={item.product_name} fill sizes="32px" className="object-cover" /> : item.product_name.slice(0, 1)}
                                </div>
                                <div className="min-w-0 truncate font-black tracking-[-0.02em]" title={productLabel(item)}>{productLabel(item)}</div>
                              </div>
                            </td>
                            <td className="truncate px-2 py-2 font-bold" title={item.sku_code}>{item.sku_code}</td>
                            <td className="truncate px-2 py-2 font-bold text-zinc-600" title={item.category_name ?? "No category"}>{item.category_name ?? "-"}</td>
                            <td className="px-2 py-1.5 font-black tabular-nums">{liveStockForItem(item)}</td>
                            <td className="px-2 py-1.5">
                              {isShareReadOnly ? <span className="font-black tabular-nums">{shareQtyForItem(item)}</span> : <input data-tutorial="partner-share-qty" aria-label={`Share qty for ${productLabel(item)}`} type="number" min={1} inputMode="numeric" value={inlineShareDraft[item.id] ?? String(item.share_qty)} onChange={(event) => setInlineShareDraft((draft) => ({ ...draft, [item.id]: event.target.value }))} onBlur={() => submitInlineShareQty(item)} onKeyDown={(event) => { if (event.key === "Enter") event.currentTarget.blur(); }} className="h-7 w-16 rounded-md border border-border bg-white px-1 text-center font-black tabular-nums outline-none focus:ring-2 focus:ring-lime" />}
                            </td>
                            <td className="truncate px-2 py-2 font-semibold text-zinc-600" title={item.remark ?? "-"}>{item.remark ?? "-"}</td>
                            <td className="px-2 py-2">
                              {isShareReadOnly ? <span className="inline-flex items-center gap-1 text-[11px] font-black text-zinc-400"><Lock className="size-3" />Read only</span> : (
                                <div className="flex flex-wrap gap-1">
                                  <Button type="button" variant="outline" onClick={() => { setItemDraft({ itemId: item.id, skuId: item.sku_id, shareQty: String(item.share_qty), remark: item.remark ?? "" }); setModal("edit-item"); }} className="h-7 rounded-md bg-white px-2 text-[11px] font-bold hover:bg-white"><Pencil className="size-3" />Edit</Button>
                                  <Button type="button" onClick={() => ask("Confirm Remove Product", "This removes the product from this share sheet.", [{ label: "Product", value: productLabel(item) }, { label: "Share Qty", value: item.share_qty }, { label: "Approved By", value: membership.full_name || membership.user_email }], () => execute("Remove failed", () => removePartnerShareItemAction(item.id), "Product removed"))} className="h-7 rounded-md bg-red-500 px-2 text-[11px] font-bold text-white hover:bg-red-500"><Trash2 className="size-3" />Remove</Button>
                                </div>
                              )}
                            </td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>

                </FluidEntrySurface>
              ) : (
                <FluidEntrySurface className="rounded-3xl border border-white/50 bg-white/70 backdrop-blur-2xl" contentClassName="p-8 text-center">
                  <h2 className="text-3xl font-black tracking-[-0.055em]">No Sheet Selected</h2>
                  <p className="mt-2 font-semibold text-zinc-500">Create a partner and sheet to start.</p>
                </FluidEntrySurface>
              )}
            </div>
          </div>
        </section>
      </div>

      {modal ? (
        <div className="fixed inset-0 z-50 grid place-items-center overscroll-contain bg-black/45 px-4 py-[calc(1rem+env(safe-area-inset-top))] pb-[calc(1rem+env(safe-area-inset-bottom))]" onClick={closeModal}>
          <FluidEntrySurface data-tutorial="partner-modal" className="max-h-[calc(100dvh-env(safe-area-inset-top)-env(safe-area-inset-bottom)-2rem)] rounded-2xl border border-white/50 bg-white shadow-2xl sm:rounded-3xl" contentClassName="max-h-[calc(100dvh-env(safe-area-inset-top)-env(safe-area-inset-bottom)-2rem)] overflow-y-auto p-4 sm:p-5" wrapperClassName="w-full max-w-[22rem] sm:max-w-2xl" onClick={(event) => event.stopPropagation()}>
            <div className="flex items-start justify-between gap-4">
              <div>
                <h3 className="text-2xl font-black tracking-[-0.05em]">{modal === "partner" ? "Partner" : modal === "sheet" ? "Share Sheet" : modal === "edit-item" ? "Edit Product" : "Add Product"}</h3>
                <p className="mt-1 text-sm font-bold text-zinc-500">{modal === "item" ? "Tap any SKU below to add it instantly with 1 pc." : "Every save requires confirmation."}</p>
              </div>
              <button type="button" onClick={closeModal} className="grid size-10 place-items-center rounded-xl border border-border" aria-label="Close partner form"><X className="size-5" /></button>
            </div>
            {modal === "partner" ? (
              <form onSubmit={submitPartner} className="mt-5 grid gap-4">
                <Input data-tutorial="partner-modal-name" required name="partner-name" autoComplete="off" value={partnerDraft.name} onChange={(event) => setPartnerDraft((draft) => ({ ...draft, name: event.target.value }))} className="h-12 rounded-xl font-bold" placeholder="Partner name" />
                <Input name="partner-contact" autoComplete="off" value={partnerDraft.contactName} onChange={(event) => setPartnerDraft((draft) => ({ ...draft, contactName: event.target.value }))} className="h-12 rounded-xl font-bold" placeholder="Contact name" />
                <Input name="partner-phone" type="tel" inputMode="tel" autoComplete="off" value={partnerDraft.phoneRaw} onChange={(event) => setPartnerDraft((draft) => ({ ...draft, phoneRaw: event.target.value }))} className="h-12 rounded-xl font-bold" placeholder="WhatsApp / phone" />
                <Textarea name="partner-notes" autoComplete="off" value={partnerDraft.notes} onChange={(event) => setPartnerDraft((draft) => ({ ...draft, notes: event.target.value }))} className="min-h-24 rounded-xl font-bold" placeholder="Notes" />
                <Button data-tutorial="partner-modal-review" className="h-12 rounded-xl bg-black font-bold text-white hover:bg-black">Review Partner</Button>
              </form>
            ) : null}
            {modal === "sheet" ? (
              <form onSubmit={submitSheet} className="mt-5 grid gap-4">
                <NativeSelect required name="share-partner" value={sheetDraft.partnerId} onChange={(event) => setSheetDraft((draft) => ({ ...draft, partnerId: event.target.value }))} className="h-12 rounded-xl bg-white font-bold">
                  {pageData.partners.map((partner) => <NativeSelectOption key={partner.id} value={partner.id}>{partner.name}</NativeSelectOption>)}
                </NativeSelect>
                <NativeSelect required name="share-location" value={sheetDraft.locationId} onChange={(event) => setSheetDraft((draft) => ({ ...draft, locationId: event.target.value }))} className="h-12 rounded-xl bg-white font-bold">
                  {locationRows.map((row) => <NativeSelectOption key={row.location_id} value={row.location_id}>{row.location_name}</NativeSelectOption>)}
                </NativeSelect>
                <Input data-tutorial="partner-modal-date" required name="share-date" type="date" value={sheetDraft.shareDate} onChange={(event) => setSheetDraft((draft) => ({ ...draft, shareDate: event.target.value }))} className="h-12 rounded-xl font-bold" />
                <Button data-tutorial="partner-modal-review" className="h-12 rounded-xl bg-black font-bold text-white hover:bg-black">Review Sheet</Button>
              </form>
            ) : null}
            {modal === "item" || modal === "edit-item" ? (
               <form onSubmit={submitItem} className="mt-5 grid gap-4">
                 {modal === "item" ? (
                   <>
                     <Input data-tutorial="partner-modal-product-search" name="product-search" autoComplete="off" value={productQuery} onChange={(event) => { setProductQuery(event.target.value); setProductPage(0); }} className="h-12 rounded-xl font-bold" placeholder="Search product, SKU, category" />
                     <div data-tutorial="partner-modal-product-list" className="overflow-hidden rounded-2xl border border-border bg-zinc-50">
                       <div className="max-h-[22rem] overflow-y-auto p-2">
                         <div className="grid gap-2">
                           {paginatedProductRows.length === 0 ? <div className="rounded-xl bg-white px-3 py-6 text-center text-sm font-semibold text-zinc-500">No matching active SKUs.</div> : null}
                           {paginatedProductRows.map((row) => {
                             const disabled = selectedSkuIds.has(inventoryKey(row.sku_id, row.location_id));
                             return (
                               <button
                                 key={inventoryKey(row.sku_id, row.location_id)}
                                 type="button"
                                 data-tutorial="partner-modal-product-row"
                                 onClick={() => quickAddProduct(row)}
                                 disabled={disabled || isPending}
                                 className={cn("rounded-xl border border-zinc-200 bg-white px-3 py-3 text-left transition hover:border-black", disabled && "cursor-not-allowed border-zinc-100 bg-zinc-100 text-zinc-400 hover:border-zinc-100")}
                               >
                                 <div className="flex items-start justify-between gap-3">
                                   <div className="min-w-0">
                                     <div className="truncate text-sm font-black tracking-[-0.02em]" title={productLabel(row)}>{productLabel(row)}</div>
                                     <div className="mt-1 text-xs font-semibold text-zinc-500">{row.sku_code} · {row.category_name ?? "No category"}</div>
                                   </div>
                                   <div className="shrink-0 text-right">
                                     <div className="text-xs font-black tabular-nums text-zinc-950">{row.quantity}</div>
                                     <div className="text-[10px] font-bold uppercase tracking-[0.14em] text-zinc-400">stock</div>
                                   </div>
                                 </div>
                                 <div className="mt-2 text-[11px] font-bold text-zinc-500">{disabled ? "Already on this sheet" : "Click to add instantly with 1 pc"}</div>
                               </button>
                             );
                           })}
                         </div>
                       </div>
                       <div className="flex items-center justify-between border-t border-border bg-white px-3 py-2 text-xs font-bold text-zinc-500">
                          <span>Page {activeProductPage + 1} of {productPageCount}</span>
                          <div className="flex items-center gap-2">
                            <Button type="button" variant="outline" onClick={() => setProductPage(Math.max(0, activeProductPage - 1))} disabled={activeProductPage === 0} className="h-8 rounded-lg bg-white px-2 text-[11px] font-bold hover:bg-white">Prev</Button>
                            <Button type="button" variant="outline" onClick={() => setProductPage(Math.min(productPageCount - 1, activeProductPage + 1))} disabled={activeProductPage >= productPageCount - 1} className="h-8 rounded-lg bg-white px-2 text-[11px] font-bold hover:bg-white">Next</Button>
                          </div>
                        </div>
                     </div>
                   </>
                 ) : null}
                 {modal === "edit-item" ? (
                   <>
                     <Input data-tutorial="partner-modal-share-qty" required name="share-qty" inputMode="numeric" min={1} type="number" value={itemDraft.shareQty} onChange={(event) => setItemDraft((draft) => ({ ...draft, shareQty: event.target.value }))} className="h-12 rounded-xl font-bold" placeholder="Share qty" />
                     <Textarea name="share-remark" autoComplete="off" value={itemDraft.remark} onChange={(event) => setItemDraft((draft) => ({ ...draft, remark: event.target.value }))} className="min-h-24 rounded-xl font-bold" placeholder="Remark" />
                     <Button data-tutorial="partner-modal-review" className="h-12 rounded-xl bg-black font-bold text-white hover:bg-black">Review Product</Button>
                   </>
                 ) : null}
               </form>
             ) : null}
          </FluidEntrySurface>
        </div>
      ) : null}

      {isSheetSwitcherOpen ? (
        <div className="fixed inset-0 z-50 grid items-end overscroll-contain bg-black/45 pb-[env(safe-area-inset-bottom)] xl:hidden" onClick={() => setIsSheetSwitcherOpen(false)}>
          <div className="max-h-[82dvh] rounded-t-3xl border border-white/50 bg-white p-4 shadow-2xl" onClick={(event) => event.stopPropagation()}>
            <div className="mx-auto mb-4 h-1.5 w-12 rounded-full bg-zinc-200" />
            <div className="flex items-start justify-between gap-4">
              <div>
                <h2 className="text-xl font-black tracking-[-0.05em]">Choose Sheet</h2>
                <p className="mt-1 text-xs font-semibold text-zinc-500">Switch the active partner share sheet.</p>
              </div>
              <button type="button" onClick={() => setIsSheetSwitcherOpen(false)} className="grid size-9 place-items-center rounded-xl border border-border" aria-label="Close sheet switcher"><X className="size-4" /></button>
            </div>
            <div className="mt-4 grid gap-2">
              <Input value={sheetQuery} onChange={(event) => setSheetQuery(event.target.value)} className="h-10 rounded-xl bg-zinc-50 text-sm font-semibold" placeholder="Search sheets" />
              <NativeSelect value={statusFilter} onChange={(event) => setStatusFilter(event.target.value as PartnerShareStatus | "all")} className="h-10 rounded-xl bg-zinc-50 text-sm font-semibold">
                <NativeSelectOption value="all">All status</NativeSelectOption>
                {Object.entries(statusLabels).map(([value, label]) => <NativeSelectOption key={value} value={value}>{label}</NativeSelectOption>)}
              </NativeSelect>
            </div>
            <div className="mt-4 max-h-[48dvh] overflow-y-auto rounded-2xl border border-zinc-100 bg-white">
              {filteredSheets.length === 0 ? <div className="p-4 text-sm font-semibold text-zinc-500">No matching sheets.</div> : null}
              {filteredSheets.map((sheet) => (
                <button key={sheet.id} type="button" onClick={() => { setSelectedSheetId(sheet.id); setIsSheetSwitcherOpen(false); }} className={cn("w-full border-b border-zinc-100 px-3 py-3 text-left transition last:border-b-0 hover:bg-zinc-50", selectedSheet?.id === sheet.id && "bg-lime/15 hover:bg-lime/20")}>
                  <div className="flex items-center gap-3">
                    <span className={cn("size-2 shrink-0 rounded-full", statusDotClassName(sheet.status))} />
                    <div className="min-w-0 flex-1">
                      <div className="truncate text-base font-black tracking-[-0.04em] text-zinc-950">{sheet.partner_name}</div>
                      <div className="mt-1 truncate text-xs font-semibold text-zinc-500">{formatDate(sheet.share_date)} · {sheet.item_count} items · {sheet.total_share_qty} pcs</div>
                    </div>
                    <span className="shrink-0 text-[11px] font-bold text-zinc-400">{statusLabels[sheet.status]}</span>
                  </div>
                </button>
              ))}
            </div>
          </div>
        </div>
      ) : null}

      {confirmation ? (
        <ConfirmSlideSheet
          title={confirmation.title}
          description={confirmation.description}
          records={confirmation.records}
          error={confirmError}
          onCancel={() => setConfirmation(null)}
          onConfirm={confirmation.onConfirm}
        />
      ) : null}

      {isPending ? (
        <div className="pointer-events-none fixed inset-x-0 top-0 z-[60] flex justify-center pt-[calc(0.75rem+env(safe-area-inset-top))]">
          <LumaSpinner className="size-14" label="Saving partner share" />
        </div>
      ) : null}
    </main>
  );
}

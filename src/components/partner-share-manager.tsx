"use client";

import Image from "next/image";
import { useRouter } from "next/navigation";
import { FormEvent, useState } from "react";
import { Check, Clipboard, Download, Lock, PackagePlus, Pencil, Plus, Send, Trash2, X } from "lucide-react";

import {
  addPartnerShareItemAction,
  createPartnerShareSheetAction,
  deductPartnerShareStockAction,
  removePartnerShareItemAction,
  savePartnerAction,
  updatePartnerShareItemAction,
  updatePartnerShareStatusAction,
} from "@/app/actions/partner-share";
import { AppSidebar } from "@/components/app-sidebar";
import { ConfirmSlideSheet, type ConfirmationRecord } from "@/components/confirm-slide-sheet";
import { FluidEntrySurface } from "@/components/fluid-entry-surface";
import { Button } from "@/components/ui/button";
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

function toWhatsAppText(detail: PartnerShareSheetDetail) {
  const lines = detail.items.map((item, index) => `${index + 1}. ${productLabel(item)} - ${item.share_qty} pcs`);
  return [
    `${detail.sheet.partner_name} 拿货数量`,
    "",
    ...lines,
    "",
    `From: ${detail.sheet.source_shop_name}`,
    `Date: ${formatDate(detail.sheet.share_date)}`,
  ].join("\n");
}

async function exportExcel(detail: PartnerShareSheetDetail) {
  const XLSX = await import("xlsx");
  const rows = detail.items.map((item) => ({
    "Partner Name": detail.sheet.partner_name,
    "Product Name": productLabel(item),
    SKU: item.sku_code,
    Category: item.category_name ?? "",
    Supplier: item.supplier_name ?? "",
    "Current Stock": item.current_stock_snapshot,
    "Share Qty": item.share_qty,
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
  const [selectedSheetId, setSelectedSheetId] = useState(details[0]?.sheet.id ?? "");
  const [modal, setModal] = useState<Modal>(null);
  const [partnerDraft, setPartnerDraft] = useState({ partnerId: "", name: "", contactName: "", phoneRaw: "", notes: "" });
  const [sheetDraft, setSheetDraft] = useState({ partnerId: pageData.partners[0]?.id ?? "", locationId: inventoryRows[0]?.location_id ?? "", shareDate: today() });
  const [itemDraft, setItemDraft] = useState({ itemId: "", skuId: inventoryRows[0]?.sku_id ?? "", shareQty: "1", remark: "" });
  const [confirmation, setConfirmation] = useState<PendingConfirmation | null>(null);
  const [confirmError, setConfirmError] = useState<string | null>(null);
  const [isPending, setIsPending] = useState(false);
  const selectedDetail = details.find((detail) => detail.sheet.id === selectedSheetId) ?? details[0] ?? null;
  const selectedSheet = selectedDetail?.sheet ?? null;
  const isLocked = !isAdmin || selectedSheet?.status === "completed";
  const locationRows = Array.from(new Map(inventoryRows.map((row) => [row.location_id, row])).values());
  const sheetRows = selectedSheet ? inventoryRows.filter((row) => row.location_id === selectedSheet.location_id) : inventoryRows;

  function closeModal() {
    setModal(null);
    setConfirmError(null);
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

  function changeStatus(status: PartnerShareStatus) {
    if (!selectedSheet) return;
    ask(`Confirm Mark ${statusLabels[status]}`, "This status approval will record the approving admin.", [
      { label: "Partner", value: selectedSheet.partner_name },
      { label: "Current Status", value: statusLabels[selectedSheet.status] },
      { label: "New Status", value: statusLabels[status] },
      { label: "Approved By", value: membership.full_name || membership.user_email },
    ], () => execute("Status update failed", () => updatePartnerShareStatusAction({ sheetId: selectedSheet.id, status }), `Marked ${statusLabels[status]}`));
  }

  function deductStock() {
    if (!selectedDetail) return;
    ask("Confirm Stock Deduct", "This will deduct every Share Qty from real inventory and cannot be repeated.", [
      { label: "Partner", value: selectedDetail.sheet.partner_name },
      { label: "Items", value: selectedDetail.items.length },
      { label: "Total Qty", value: selectedDetail.items.reduce((sum, item) => sum + item.share_qty, 0) },
      { label: "Approved By", value: membership.full_name || membership.user_email },
    ], () => execute("Stock deduct failed", () => deductPartnerShareStockAction(selectedDetail.sheet.id), "Stock deducted"));
  }

  async function copyWhatsApp() {
    if (!selectedDetail) return;
    await navigator.clipboard.writeText(toWhatsAppText(selectedDetail));
    toast.success("WhatsApp text copied");
  }

  return (
    <main className="min-h-screen bg-white pb-24 text-black lg:pb-0">
      <div className="min-h-screen lg:pl-[242px]">
        <AppSidebar active="partner" role={membership.role} restockCount={restockCount} />
        <section className="px-4 py-5 sm:px-8 sm:py-8 lg:px-7 xl:px-8">
          <header className="flex flex-col gap-5 sm:flex-row sm:items-start sm:justify-between">
            <div>
              <h1 className="text-4xl font-black tracking-[-0.055em] sm:text-[44px]">Partner Share Qty</h1>
              <p className="mt-2 max-w-2xl text-sm font-semibold text-zinc-500">合作商家拿货表. Admin edits, staff read-only.</p>
            </div>
            {isAdmin ? (
              <div className="flex flex-wrap gap-2">
                <Button type="button" onClick={() => openPartner()} className="h-12 rounded-xl bg-black px-5 font-bold text-white hover:bg-black"><Plus className="size-5" />Partner</Button>
                <Button type="button" onClick={() => setModal("sheet")} disabled={pageData.partners.length === 0 || inventoryRows.length === 0} className="h-12 rounded-xl bg-lime px-5 font-bold text-black hover:bg-lime"><Plus className="size-5" />Sheet</Button>
              </div>
            ) : null}
          </header>

          <div className="mt-7 grid gap-5 xl:grid-cols-[360px_1fr]">
            <FluidEntrySurface className="rounded-3xl border border-white/50 bg-white/70 backdrop-blur-2xl" contentClassName="p-4">
              <div className="flex items-center justify-between gap-3">
                <h2 className="text-2xl font-black tracking-[-0.05em]">Sheets</h2>
                <span className="rounded-full bg-black px-3 py-1 text-xs font-black text-lime">{pageData.sheets.length}</span>
              </div>
              <div className="mt-4 grid gap-2">
                {pageData.sheets.length === 0 ? <div className="rounded-2xl bg-zinc-50 p-4 text-sm font-bold text-zinc-500">No partner share sheets yet.</div> : null}
                {pageData.sheets.map((sheet) => (
                  <button key={sheet.id} type="button" onClick={() => setSelectedSheetId(sheet.id)} className={cn("rounded-2xl border p-4 text-left transition", selectedSheet?.id === sheet.id ? "border-black bg-black text-white" : "border-border bg-white hover:bg-zinc-50")}>
                    <div className="flex items-center justify-between gap-3">
                      <div className="min-w-0">
                        <div className="truncate text-lg font-black tracking-[-0.04em]">{sheet.partner_name}</div>
                        <div className={cn("mt-1 text-xs font-bold", selectedSheet?.id === sheet.id ? "text-white/65" : "text-zinc-500")}>{formatDate(sheet.share_date)} · {sheet.item_count} items · {sheet.total_share_qty} pcs</div>
                      </div>
                      <span className={cn("shrink-0 rounded-full px-2.5 py-1 text-[11px] font-black", statusClassName(sheet.status))}>{statusLabels[sheet.status]}</span>
                    </div>
                  </button>
                ))}
              </div>
            </FluidEntrySurface>

            <div className="grid gap-5">
              {selectedDetail ? (
                <FluidEntrySurface className="rounded-3xl border border-white/50 bg-white/70 backdrop-blur-2xl" contentClassName="p-5">
                  <div className="flex flex-col gap-4 lg:flex-row lg:items-start lg:justify-between">
                    <div>
                      <div className="flex flex-wrap items-center gap-2">
                        <h2 className="text-3xl font-black tracking-[-0.055em]">{selectedDetail.sheet.partner_name}</h2>
                        <span className={cn("rounded-full px-3 py-1 text-xs font-black", statusClassName(selectedDetail.sheet.status))}>{statusLabels[selectedDetail.sheet.status]}</span>
                        {selectedDetail.sheet.stock_deducted_at ? <span className="rounded-full bg-red-50 px-3 py-1 text-xs font-black text-red-600">Stock Deducted</span> : null}
                      </div>
                      <p className="mt-2 text-sm font-semibold text-zinc-500">From {selectedDetail.sheet.source_shop_name} · {selectedDetail.sheet.location_name} · {formatDate(selectedDetail.sheet.share_date)}</p>
                      <p className="mt-1 text-xs font-bold text-zinc-400">Prepared by {selectedDetail.sheet.prepared_by_name ?? "-"} · Approved by {selectedDetail.sheet.approved_by_name ?? "-"}</p>
                    </div>
                    <div className="flex flex-wrap gap-2">
                      <Button type="button" variant="outline" onClick={copyWhatsApp} className="h-11 rounded-xl bg-white px-4 font-bold hover:bg-white"><Clipboard className="size-4" />WhatsApp</Button>
                      <Button type="button" variant="outline" onClick={() => exportExcel(selectedDetail)} className="h-11 rounded-xl bg-white px-4 font-bold hover:bg-white"><Download className="size-4" />Excel</Button>
                      {isAdmin && selectedDetail.sheet.status !== "completed" ? <Button type="button" onClick={() => setModal("item")} className="h-11 rounded-xl bg-black px-4 font-bold text-white hover:bg-black"><PackagePlus className="size-4" />Product</Button> : null}
                    </div>
                  </div>

                  {isAdmin ? (
                    <div className="mt-5 flex flex-wrap gap-2">
                      {selectedDetail.sheet.status === "draft" ? <Button type="button" onClick={() => changeStatus("confirmed")} className="rounded-xl bg-blue-600 text-white hover:bg-blue-600"><Check className="size-4" />Confirm</Button> : null}
                      {selectedDetail.sheet.status === "confirmed" ? <Button type="button" onClick={() => changeStatus("sent")} className="rounded-xl bg-orange text-white hover:bg-orange"><Send className="size-4" />Mark Sent</Button> : null}
                      {selectedDetail.sheet.status === "sent" ? <Button type="button" onClick={() => changeStatus("completed")} className="rounded-xl bg-lime text-black hover:bg-lime"><Check className="size-4" />Complete</Button> : null}
                      {!selectedDetail.sheet.stock_deducted_at ? <Button type="button" onClick={deductStock} variant="outline" className="rounded-xl bg-white font-bold hover:bg-white">Deduct Stock</Button> : null}
                    </div>
                  ) : null}

                  <div className="mt-6 overflow-x-auto rounded-2xl border border-border">
                    <table className="w-full min-w-[900px] border-collapse text-left">
                      <thead className="bg-black text-white">
                        <tr className="h-12">
                          <th className="px-4 text-sm font-bold">Product</th>
                          <th className="px-4 text-sm font-bold">SKU</th>
                          <th className="px-4 text-sm font-bold">Category</th>
                          <th className="px-4 text-sm font-bold">Stock</th>
                          <th className="px-4 text-sm font-bold">Share Qty</th>
                          <th className="px-4 text-sm font-bold">Remark</th>
                          <th className="px-4 text-sm font-bold">Actions</th>
                        </tr>
                      </thead>
                      <tbody>
                        {selectedDetail.items.map((item) => (
                          <tr key={item.id} className="border-t border-border">
                            <td className="px-4 py-3">
                              <div className="flex items-center gap-3">
                                <div className="relative grid size-12 shrink-0 place-items-center overflow-hidden rounded-xl bg-lime font-black">
                                  {item.photo_url ? <Image src={item.photo_url} alt={item.product_name} fill sizes="48px" className="object-cover" /> : item.product_name.slice(0, 1)}
                                </div>
                                <div className="font-black tracking-[-0.03em]">{productLabel(item)}</div>
                              </div>
                            </td>
                            <td className="px-4 py-3 font-bold">{item.sku_code}</td>
                            <td className="px-4 py-3 font-bold text-zinc-600">{item.category_name ?? "-"}</td>
                            <td className="px-4 py-3 font-bold">{item.current_stock_snapshot}</td>
                            <td className="px-4 py-3 text-lg font-black">{item.share_qty}</td>
                            <td className="px-4 py-3 font-semibold text-zinc-600">{item.remark ?? "-"}</td>
                            <td className="px-4 py-3">
                              {isLocked ? <span className="inline-flex items-center gap-1 text-xs font-black text-zinc-400"><Lock className="size-3" />Read only</span> : (
                                <div className="flex gap-2">
                                  <Button type="button" variant="outline" onClick={() => { setItemDraft({ itemId: item.id, skuId: item.sku_id, shareQty: String(item.share_qty), remark: item.remark ?? "" }); setModal("edit-item"); }} className="h-9 rounded-lg bg-white px-3 text-xs font-bold hover:bg-white"><Pencil className="size-3" />Edit</Button>
                                  <Button type="button" onClick={() => ask("Confirm Remove Product", "This removes the product from this share sheet.", [{ label: "Product", value: productLabel(item) }, { label: "Share Qty", value: item.share_qty }, { label: "Approved By", value: membership.full_name || membership.user_email }], () => execute("Remove failed", () => removePartnerShareItemAction(item.id), "Product removed"))} className="h-9 rounded-lg bg-red-500 px-3 text-xs font-bold text-white hover:bg-red-500"><Trash2 className="size-3" />Remove</Button>
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
        <div className="fixed inset-0 z-50 grid items-end bg-black/45 p-0 sm:place-items-center sm:px-4" onClick={closeModal}>
          <FluidEntrySurface className="max-w-2xl rounded-t-3xl border border-white/50 bg-white shadow-2xl sm:rounded-3xl" contentClassName="p-5" wrapperClassName="w-full max-w-2xl" onClick={(event) => event.stopPropagation()}>
            <div className="flex items-start justify-between gap-4">
              <div>
                <h3 className="text-2xl font-black tracking-[-0.05em]">{modal === "partner" ? "Partner" : modal === "sheet" ? "Share Sheet" : modal === "edit-item" ? "Edit Product" : "Add Product"}</h3>
                <p className="mt-1 text-sm font-bold text-zinc-500">Every save requires confirmation.</p>
              </div>
              <button type="button" onClick={closeModal} className="grid size-10 place-items-center rounded-xl border border-border"><X className="size-5" /></button>
            </div>
            {modal === "partner" ? (
              <form onSubmit={submitPartner} className="mt-5 grid gap-4">
                <input required value={partnerDraft.name} onChange={(event) => setPartnerDraft((draft) => ({ ...draft, name: event.target.value }))} className="h-12 rounded-xl border border-border px-4 font-bold outline-none focus:ring-2 focus:ring-lime" placeholder="Partner name" />
                <input value={partnerDraft.contactName} onChange={(event) => setPartnerDraft((draft) => ({ ...draft, contactName: event.target.value }))} className="h-12 rounded-xl border border-border px-4 font-bold outline-none focus:ring-2 focus:ring-lime" placeholder="Contact name" />
                <input value={partnerDraft.phoneRaw} onChange={(event) => setPartnerDraft((draft) => ({ ...draft, phoneRaw: event.target.value }))} className="h-12 rounded-xl border border-border px-4 font-bold outline-none focus:ring-2 focus:ring-lime" placeholder="WhatsApp / phone" />
                <textarea value={partnerDraft.notes} onChange={(event) => setPartnerDraft((draft) => ({ ...draft, notes: event.target.value }))} className="min-h-24 rounded-xl border border-border px-4 py-3 font-bold outline-none focus:ring-2 focus:ring-lime" placeholder="Notes" />
                <Button className="h-12 rounded-xl bg-black font-bold text-white hover:bg-black">Review Partner</Button>
              </form>
            ) : null}
            {modal === "sheet" ? (
              <form onSubmit={submitSheet} className="mt-5 grid gap-4">
                <select required value={sheetDraft.partnerId} onChange={(event) => setSheetDraft((draft) => ({ ...draft, partnerId: event.target.value }))} className="h-12 rounded-xl border border-border bg-white px-4 font-bold outline-none focus:ring-2 focus:ring-lime">
                  {pageData.partners.map((partner) => <option key={partner.id} value={partner.id}>{partner.name}</option>)}
                </select>
                <select required value={sheetDraft.locationId} onChange={(event) => setSheetDraft((draft) => ({ ...draft, locationId: event.target.value }))} className="h-12 rounded-xl border border-border bg-white px-4 font-bold outline-none focus:ring-2 focus:ring-lime">
                  {locationRows.map((row) => <option key={row.location_id} value={row.location_id}>{row.location_name}</option>)}
                </select>
                <input required type="date" value={sheetDraft.shareDate} onChange={(event) => setSheetDraft((draft) => ({ ...draft, shareDate: event.target.value }))} className="h-12 rounded-xl border border-border px-4 font-bold outline-none focus:ring-2 focus:ring-lime" />
                <Button className="h-12 rounded-xl bg-black font-bold text-white hover:bg-black">Review Sheet</Button>
              </form>
            ) : null}
            {modal === "item" || modal === "edit-item" ? (
              <form onSubmit={submitItem} className="mt-5 grid gap-4">
                {modal === "item" ? (
                  <select required value={itemDraft.skuId} onChange={(event) => setItemDraft((draft) => ({ ...draft, skuId: event.target.value }))} className="h-12 rounded-xl border border-border bg-white px-4 font-bold outline-none focus:ring-2 focus:ring-lime">
                    {sheetRows.map((row) => <option key={row.sku_id} value={row.sku_id}>{productLabel(row)} · {row.sku_code} · {row.quantity} stock</option>)}
                  </select>
                ) : null}
                <input required min={1} type="number" value={itemDraft.shareQty} onChange={(event) => setItemDraft((draft) => ({ ...draft, shareQty: event.target.value }))} className="h-12 rounded-xl border border-border px-4 font-bold outline-none focus:ring-2 focus:ring-lime" placeholder="Share qty" />
                <textarea value={itemDraft.remark} onChange={(event) => setItemDraft((draft) => ({ ...draft, remark: event.target.value }))} className="min-h-24 rounded-xl border border-border px-4 py-3 font-bold outline-none focus:ring-2 focus:ring-lime" placeholder="Remark" />
                <Button className="h-12 rounded-xl bg-black font-bold text-white hover:bg-black">Review Product</Button>
              </form>
            ) : null}
          </FluidEntrySurface>
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

      {isPending ? <div className="fixed inset-x-0 top-0 z-[60] h-1 bg-lime" /> : null}
    </main>
  );
}

"use client";

import Image from "next/image";
import { useState } from "react";
import { X } from "lucide-react";

import { FluidEntrySurface } from "@/components/fluid-entry-surface";
import { cn } from "@/lib/utils";
import type { StockAdjustmentReason } from "@/types/database";

type ActorRole = "admin" | "staff" | null;

export type ReportMovement = {
  id: string;
  skuId: string;
  skuCode: string;
  productName: string;
  photoUrl?: string | null;
  movementType: string;
  quantityDelta: number;
  quantityBefore: number;
  quantityAfter: number;
  reason: StockAdjustmentReason;
  locationId: string;
  locationName: string;
  actorRole: ActorRole;
  actorName: string;
  note: string | null;
  createdAt: string;
};

export type ReportRestock = {
  id: string;
  skuId: string;
  skuCode: string;
  productName: string;
  photoUrl?: string | null;
  status: string;
  requestedQty: number | null;
  currentQty: number;
  lowStockQty: number;
  requestedBy: string;
  note: string | null;
  createdAt: string;
};

export type ReportAudit = {
  id: string;
  action: string;
  eventType: string;
  entityType: string;
  entityLabel: string | null;
  actorRole: ActorRole;
  actorName: string | null;
  createdAt: string;
  beforeData: unknown;
  afterData: unknown;
  metadata: unknown;
};

type Detail =
  | { title: string; kind: "Stock Movement"; rows: { label: string; value: unknown }[]; photoUrl?: string | null; label: string }
  | { title: string; kind: "Restock Request"; rows: { label: string; value: unknown }[]; photoUrl?: string | null; label: string }
  | { title: string; kind: "Audit Event"; rows: { label: string; value: unknown }[]; label: string };

function cleanNote(note: string | null) {
  return note?.replace("[demo] ", "") ?? null;
}

function formatValue(value: unknown) {
  if (value === null || value === undefined || value === "") return "-";
  if (typeof value === "string" || typeof value === "number" || typeof value === "boolean") return String(value);
  return JSON.stringify(value, null, 2);
}

function shortUuid(id: string) {
  return id.slice(0, 8);
}

function formatSignedQuantity(quantity: number) {
  return quantity > 0 ? `+${quantity}` : String(quantity);
}

function actorRoleClassName(role: ActorRole) {
  if (role === "admin") return "text-violet-700";
  if (role === "staff") return "text-blue-700";
  return "text-zinc-500";
}

function actorLabelText(role: ActorRole, name: string | null) {
  return role ? `${role} ${name ?? "Unknown user"}` : name ?? "Unknown user";
}

function ActorLabel({ role, name }: { role: ActorRole; name: string | null }) {
  return (
    <span className="whitespace-nowrap">
      {role ? <span className={cn("font-black", actorRoleClassName(role))}>{role}</span> : null}
      {role ? " " : null}
      <span>{name ?? "Unknown user"}</span>
    </span>
  );
}

function TinyThumb({ label, photoUrl }: { label: string; photoUrl?: string | null }) {
  return (
    <div className="relative size-8 shrink-0 overflow-hidden rounded-lg border border-white bg-white ring-1 ring-black/5">
      {photoUrl ? (
        <Image src={photoUrl} alt="" aria-hidden="true" fill loading="lazy" sizes="32px" className="object-cover" />
      ) : (
        <div className="grid size-full place-items-center bg-lime text-sm font-black text-black/75">{label.slice(0, 1)}</div>
      )}
    </div>
  );
}

function ReportRow({ thumb, primary, secondary, badge, onClick }: { thumb?: React.ReactNode; primary: string; secondary: string; badge?: React.ReactNode; onClick: () => void }) {
  return (
    <button type="button" onClick={onClick} className="liquid-width-enter flex h-12 w-full items-center gap-3 rounded-xl border border-white/50 bg-white/55 px-2.5 text-left backdrop-blur-lg transition hover:bg-white/80">
      {thumb}
      <div className="min-w-0 flex-1">
        <div className="truncate text-sm font-black tracking-[-0.03em]">{primary}</div>
        <div className="truncate text-xs font-bold text-zinc-500">{secondary}</div>
      </div>
      {badge ? <div className="shrink-0 rounded-full bg-zinc-100 px-2 py-0.5 text-[11px] font-black capitalize text-zinc-600">{badge}</div> : null}
    </button>
  );
}

function DetailModal({ detail, onClose }: { detail: Detail; onClose: () => void }) {
  return (
    <div className="fixed inset-0 z-50 grid place-items-center bg-black/45 px-4 backdrop-blur-sm" role="dialog" aria-modal="true">
      <div className="w-full max-w-2xl overflow-hidden rounded-3xl border border-white/50 bg-white shadow-2xl">
        <div className="flex items-start justify-between gap-4 border-b border-border p-5">
          <div className="flex min-w-0 items-center gap-3">
            {"photoUrl" in detail ? <TinyThumb label={detail.label} photoUrl={detail.photoUrl} /> : <TinyThumb label={detail.label} />}
            <div className="min-w-0">
              <div className="text-xs font-black uppercase tracking-[0.14em] text-zinc-400">{detail.kind}</div>
              <h3 className="truncate text-2xl font-black tracking-[-0.05em]">{detail.title}</h3>
            </div>
          </div>
          <button type="button" onClick={onClose} className="grid size-9 shrink-0 place-items-center rounded-full bg-zinc-100 text-black hover:bg-zinc-200" aria-label="Close detail">
            <X className="size-5" />
          </button>
        </div>
        <div className="max-h-[70vh] overflow-y-auto p-5">
          <div className="grid gap-3">
            {detail.rows.map((row) => {
              const value = formatValue(row.value);
              return (
                <div key={row.label} className="rounded-2xl border border-border bg-zinc-50 p-3">
                  <div className="text-[11px] font-black uppercase tracking-[0.12em] text-zinc-400">{row.label}</div>
                  <pre className={cn("mt-1 whitespace-pre-wrap break-words font-sans text-sm font-semibold text-zinc-700", value.length > 120 && "text-xs")}>{value}</pre>
                </div>
              );
            })}
          </div>
        </div>
      </div>
    </div>
  );
}

export function ReportsActivityLists({ movements, restocks, audits }: { movements: ReportMovement[]; restocks: ReportRestock[]; audits: ReportAudit[] }) {
  const [detail, setDetail] = useState<Detail | null>(null);

  return (
    <>
      <div className="mt-8 grid gap-6 xl:grid-cols-3">
        <FluidEntrySurface entryDelay={0} className="rounded-3xl border border-white/50 bg-white/60 backdrop-blur-2xl" contentClassName="p-5">
          <h2 className="text-2xl font-black tracking-[-0.05em]">Stock Movements</h2>
          <div className="mt-4 grid gap-2">
            {movements.map((movement) => (
              <ReportRow
                key={movement.id}
                thumb={<TinyThumb label={movement.productName} photoUrl={movement.photoUrl} />}
                primary={`SA ${shortUuid(movement.id)}`}
                secondary={`${formatSignedQuantity(movement.quantityDelta)} · ${movement.locationName} · ${movement.reason}`}
                badge={<ActorLabel role={movement.actorRole} name={movement.actorName} />}
                onClick={() => setDetail({
                  kind: "Stock Movement",
                  title: movement.productName,
                  label: movement.productName,
                  photoUrl: movement.photoUrl,
                  rows: [
                    { label: "Action ID", value: movement.id },
                    { label: "SKU ID", value: movement.skuId },
                    { label: "SKU Code", value: movement.skuCode },
                    { label: "Reason", value: movement.reason },
                    { label: "Quantity Change", value: formatSignedQuantity(movement.quantityDelta) },
                    { label: "Movement", value: movement.movementType },
                    { label: "Warehouse", value: movement.locationName },
                    { label: "User", value: actorLabelText(movement.actorRole, movement.actorName) },
                    { label: "Status", value: "Completed" },
                    { label: "Quantity Before", value: movement.quantityBefore },
                    { label: "Quantity After", value: movement.quantityAfter },
                    { label: "Created At", value: new Date(movement.createdAt).toLocaleString() },
                    { label: "Note", value: cleanNote(movement.note) },
                  ],
                })}
              />
            ))}
          </div>
        </FluidEntrySurface>

        <FluidEntrySurface entryDelay={0.08} className="rounded-3xl border border-white/50 bg-white/60 backdrop-blur-2xl" contentClassName="p-5">
          <h2 className="text-2xl font-black tracking-[-0.05em]">Restock Requests</h2>
          <div className="mt-4 grid gap-2">
            {restocks.map((request) => (
              <ReportRow
                key={request.id}
                thumb={<TinyThumb label={request.productName} photoUrl={request.photoUrl} />}
                primary={request.skuCode}
                secondary={`${request.status} · need ${request.requestedQty ?? "restock"}`}
                badge={`${request.currentQty}/${request.lowStockQty}`}
                onClick={() => setDetail({
                  kind: "Restock Request",
                  title: request.productName,
                  label: request.productName,
                  photoUrl: request.photoUrl,
                  rows: [
                    { label: "Request ID", value: request.id },
                    { label: "SKU ID", value: request.skuId },
                    { label: "SKU Code", value: request.skuCode },
                    { label: "Status", value: request.status },
                    { label: "Requested Qty", value: request.requestedQty },
                    { label: "Stock Proof", value: `Current ${request.currentQty} · Low threshold ${request.lowStockQty}` },
                    { label: "Requested By", value: request.requestedBy },
                    { label: "Created At", value: new Date(request.createdAt).toLocaleString() },
                    { label: "Note", value: cleanNote(request.note) },
                  ],
                })}
              />
            ))}
          </div>
        </FluidEntrySurface>

        <FluidEntrySurface entryDelay={0.16} className="rounded-3xl border border-white/50 bg-white/60 backdrop-blur-2xl" contentClassName="p-5">
          <h2 className="text-2xl font-black tracking-[-0.05em]">Audit Events</h2>
          <div className="mt-4 grid gap-2">
            {audits.map((event) => (
              <ReportRow
                key={event.id}
                thumb={<TinyThumb label={event.action} />}
                primary={event.action}
                secondary={`${event.eventType} · ${event.entityType}`}
                badge={event.actorRole || event.actorName ? <ActorLabel role={event.actorRole} name={event.actorName} /> : new Date(event.createdAt).toLocaleDateString()}
                onClick={() => setDetail({
                  kind: "Audit Event",
                  title: event.action,
                  label: event.action,
                  rows: [
                    { label: "Audit ID", value: event.id },
                    { label: "Action", value: event.action },
                    { label: "Event Type", value: event.eventType },
                    { label: "Entity Type", value: event.entityType },
                    { label: "Entity Label", value: event.entityLabel },
                    { label: "User", value: actorLabelText(event.actorRole, event.actorName) },
                    { label: "Created At", value: new Date(event.createdAt).toLocaleString() },
                    { label: "Before Data", value: event.beforeData },
                    { label: "After Data", value: event.afterData },
                    { label: "Metadata", value: event.metadata },
                  ],
                })}
              />
            ))}
          </div>
        </FluidEntrySurface>
      </div>
      {detail ? <DetailModal detail={detail} onClose={() => setDetail(null)} /> : null}
    </>
  );
}

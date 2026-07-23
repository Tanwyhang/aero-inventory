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

type ListKey = "movements" | "restocks" | "audits";

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
    <span className="whitespace-normal sm:whitespace-nowrap">
      {role ? <span className={cn("font-black", actorRoleClassName(role))}>{role}</span> : null}
      {role ? " " : null}
      <span>{name ?? "Unknown user"}</span>
    </span>
  );
}

function TinyThumb({ label, photoUrl }: { label: string; photoUrl?: string | null }) {
  return (
    <div className="relative size-8 shrink-0 overflow-hidden rounded-lg border border-white bg-white ring-1 ring-black/5 sm:size-8 sm:rounded-lg">
      {photoUrl ? (
        <Image src={photoUrl} alt="" aria-hidden="true" fill loading="lazy" quality={60} sizes="32px" className="object-cover" />
      ) : (
        <div className="grid size-full place-items-center bg-lime text-sm font-black text-black/75">{label.slice(0, 1)}</div>
      )}
    </div>
  );
}

function ReportRow({ thumb, primary, secondary, badge, onClick }: { thumb?: React.ReactNode; primary: string; secondary: string; badge?: React.ReactNode; onClick?: () => void }) {
  const content = (
    <>
      {thumb}
      <div className="min-w-0 flex-1">
        <div className="truncate text-sm font-black tracking-[-0.035em]">{primary}</div>
        <div className="mt-0.5 line-clamp-2 text-[11px] font-bold leading-snug text-zinc-500 sm:text-xs">{secondary}</div>
        {badge ? <div className="mt-1.5 inline-flex max-w-full rounded-full bg-zinc-100 px-2 py-0.5 text-[10px] font-black capitalize leading-tight text-zinc-600 sm:mt-2 sm:text-[11px]">{badge}</div> : null}
      </div>
    </>
  );

  const className = "liquid-width-enter flex min-h-[64px] w-full items-start gap-2.5 rounded-xl border border-white/50 bg-white/65 px-2.5 py-2.5 text-left shadow-sm shadow-black/5 backdrop-blur-lg transition hover:bg-white/80 sm:min-h-[76px] sm:rounded-xl sm:px-2.5 sm:py-3 sm:shadow-none";

  if (!onClick) {
    return <div className={className}>{content}</div>;
  }

  return (
    <button type="button" onClick={onClick} className={className}>
      {content}
    </button>
  );
}

function ListModal({ title, children, onClose }: { title: string; children: React.ReactNode; onClose: () => void }) {
  return (
    <div className="fixed inset-0 z-50 grid place-items-center overscroll-contain bg-black/45 px-4 py-[calc(1rem+env(safe-area-inset-top))] pb-[calc(1rem+env(safe-area-inset-bottom))] backdrop-blur-sm" onClick={onClose} role="dialog" aria-modal="true">
      <FluidEntrySurface data-tutorial="reports-modal" className="max-h-[calc(100dvh-env(safe-area-inset-top)-env(safe-area-inset-bottom)-2rem)] rounded-2xl border border-white/50 bg-white shadow-2xl sm:rounded-3xl" contentClassName="min-h-0" wrapperClassName="w-full max-w-[22rem] sm:max-w-2xl" onClick={(event) => event.stopPropagation()}>
        <div className="border-b border-border p-4 sm:p-5">
          <div className="text-xs font-black uppercase tracking-[0.14em] text-zinc-400">Report Records</div>
          <h3 className="mt-1 text-xl font-black tracking-[-0.05em] sm:text-2xl">{title}</h3>
          <p className="mt-1 text-xs font-bold text-zinc-500">Tap a record for details. Tap outside to close.</p>
        </div>
        <div className="max-h-[calc(100dvh-env(safe-area-inset-top)-env(safe-area-inset-bottom)-8rem)] overflow-y-auto p-3 sm:p-4">
          <div className="grid gap-2">{children}</div>
        </div>
      </FluidEntrySurface>
    </div>
  );
}

function DetailModal({ detail, onClose }: { detail: Detail; onClose: () => void }) {
  return (
    <div className="fixed inset-0 z-50 grid place-items-center overscroll-contain bg-black/45 px-4 py-[calc(1rem+env(safe-area-inset-top))] pb-[calc(1rem+env(safe-area-inset-bottom))] backdrop-blur-sm" role="dialog" aria-modal="true" onClick={onClose}>
      <FluidEntrySurface data-tutorial="reports-detail-modal" className="max-h-[calc(100dvh-env(safe-area-inset-top)-env(safe-area-inset-bottom)-2rem)] rounded-2xl border border-white/50 bg-white shadow-2xl sm:rounded-3xl" contentClassName="min-h-0" wrapperClassName="w-full max-w-[22rem] sm:max-w-2xl" onClick={(event) => event.stopPropagation()}>
        <div className="flex items-start justify-between gap-3 border-b border-border p-4 sm:gap-4 sm:p-5">
          <div className="flex min-w-0 items-center gap-3">
            {"photoUrl" in detail ? <TinyThumb label={detail.label} photoUrl={detail.photoUrl} /> : <TinyThumb label={detail.label} />}
            <div className="min-w-0">
              <div className="text-xs font-black uppercase tracking-[0.14em] text-zinc-400">{detail.kind}</div>
              <h3 className="truncate text-xl font-black tracking-[-0.05em] sm:text-2xl">{detail.title}</h3>
            </div>
          </div>
          <button type="button" onClick={onClose} className="grid size-9 shrink-0 place-items-center rounded-full bg-zinc-100 text-black hover:bg-zinc-200" aria-label="Close detail">
            <X className="size-5" />
          </button>
        </div>
        <div className="max-h-[calc(100dvh-env(safe-area-inset-top)-env(safe-area-inset-bottom)-8rem)] overflow-y-auto p-4 sm:p-5">
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
      </FluidEntrySurface>
    </div>
  );
}

export function ReportsActivityLists({ movements, restocks, audits }: { movements: ReportMovement[]; restocks: ReportRestock[]; audits: ReportAudit[] }) {
  const [detail, setDetail] = useState<Detail | null>(null);
  const [openList, setOpenList] = useState<ListKey | null>(null);
  const previewCount = 4;

  return (
    <>
      <div className="mt-5 grid gap-3 sm:mt-8 sm:gap-6 xl:grid-cols-3">
        <FluidEntrySurface data-tutorial="reports-movements-card" entryDelay={0} className="rounded-2xl border border-white/50 bg-white/60 backdrop-blur-2xl transition hover:border-zinc-300/80 sm:rounded-3xl" contentClassName="p-3 sm:p-5" role="button" tabIndex={0} onClick={() => setOpenList("movements")} onKeyDown={(event) => event.key === "Enter" && setOpenList("movements")}>
          <div className="flex items-start justify-between gap-3">
            <h2 className="text-lg font-black tracking-[-0.05em] sm:text-2xl">Stock Movements</h2>
            <span className="rounded-full bg-black px-3 py-1 text-xs font-black text-lime">{movements.length}</span>
          </div>
          <div className="mt-4 grid gap-2">
            {movements.slice(0, previewCount).map((movement) => (
              <div key={movement.id}>
                <ReportRow
                  thumb={<TinyThumb label={movement.productName} photoUrl={movement.photoUrl} />}
                  primary={`SA ${shortUuid(movement.id)}`}
                  secondary={`${formatSignedQuantity(movement.quantityDelta)} · ${movement.locationName} · ${movement.reason}`}
                  badge={<ActorLabel role={movement.actorRole} name={movement.actorName} />}
                />
              </div>
            ))}
          </div>
          {movements.length > previewCount ? <div className="mt-3 text-center text-xs font-black uppercase tracking-[0.14em] text-zinc-400">Tap to view all</div> : null}
        </FluidEntrySurface>

        <FluidEntrySurface data-tutorial="reports-restocks-card" entryDelay={0.08} className="rounded-2xl border border-white/50 bg-white/60 backdrop-blur-2xl transition hover:border-zinc-300/80 sm:rounded-3xl" contentClassName="p-3 sm:p-5" role="button" tabIndex={0} onClick={() => setOpenList("restocks")} onKeyDown={(event) => event.key === "Enter" && setOpenList("restocks")}>
          <div className="flex items-start justify-between gap-3">
            <h2 className="text-lg font-black tracking-[-0.05em] sm:text-2xl">Restock Requests</h2>
            <span className="rounded-full bg-black px-3 py-1 text-xs font-black text-lime">{restocks.length}</span>
          </div>
          <div className="mt-4 grid gap-2">
            {restocks.slice(0, previewCount).map((request) => (
              <div key={request.id}>
                <ReportRow
                  thumb={<TinyThumb label={request.productName} photoUrl={request.photoUrl} />}
                  primary={request.skuCode}
                  secondary={`${request.status} · need ${request.requestedQty ?? "restock"}`}
                  badge={`${request.currentQty}/${request.lowStockQty}`}
                />
              </div>
            ))}
          </div>
          {restocks.length > previewCount ? <div className="mt-3 text-center text-xs font-black uppercase tracking-[0.14em] text-zinc-400">Tap to view all</div> : null}
        </FluidEntrySurface>

        <FluidEntrySurface data-tutorial="reports-audits-card" entryDelay={0.16} className="rounded-2xl border border-white/50 bg-white/60 backdrop-blur-2xl transition hover:border-zinc-300/80 sm:rounded-3xl" contentClassName="p-3 sm:p-5" role="button" tabIndex={0} onClick={() => setOpenList("audits")} onKeyDown={(event) => event.key === "Enter" && setOpenList("audits")}>
          <div className="flex items-start justify-between gap-3">
            <h2 className="text-lg font-black tracking-[-0.05em] sm:text-2xl">Audit Events</h2>
            <span className="rounded-full bg-black px-3 py-1 text-xs font-black text-lime">{audits.length}</span>
          </div>
          <div className="mt-4 grid gap-2">
            {audits.slice(0, previewCount).map((event) => (
              <div key={event.id}>
                <ReportRow
                  thumb={<TinyThumb label={event.action} />}
                  primary={event.action}
                  secondary={`${event.eventType} · ${event.entityType}`}
                  badge={event.actorRole || event.actorName ? <ActorLabel role={event.actorRole} name={event.actorName} /> : new Date(event.createdAt).toLocaleDateString()}
                />
              </div>
            ))}
          </div>
          {audits.length > previewCount ? <div className="mt-3 text-center text-xs font-black uppercase tracking-[0.14em] text-zinc-400">Tap to view all</div> : null}
        </FluidEntrySurface>
      </div>
      {openList === "movements" ? (
        <ListModal title="Stock Movements" onClose={() => setOpenList(null)}>
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
        </ListModal>
      ) : null}
      {openList === "restocks" ? (
        <ListModal title="Restock Requests" onClose={() => setOpenList(null)}>
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
        </ListModal>
      ) : null}
      {openList === "audits" ? (
        <ListModal title="Audit Events" onClose={() => setOpenList(null)}>
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
        </ListModal>
      ) : null}
      {detail ? <DetailModal detail={detail} onClose={() => setDetail(null)} /> : null}
    </>
  );
}

"use client";

import { X } from "lucide-react";

import { FluidEntrySurface } from "@/components/fluid-entry-surface";
import { SlideButton } from "@/components/ui/slide-button";

export type ConfirmationRecord = {
  label: string;
  value: string | number | null | undefined;
};

export function ConfirmSlideSheet({
  title,
  description,
  records,
  error,
  onCancel,
  onConfirm,
}: {
  title: string;
  description: string;
  records: ConfirmationRecord[];
  error?: string | null;
  onCancel: () => void;
  onConfirm: () => void | Promise<void>;
}) {
  return (
    <div className="fixed inset-0 z-[70] grid items-end bg-black/45 p-0 sm:place-items-center sm:px-4 sm:py-8" onClick={onCancel}>
      <div className="w-full max-w-lg" onClick={(event) => event.stopPropagation()}>
        <FluidEntrySurface className="max-h-[92dvh] max-w-lg rounded-t-3xl border border-white/50 bg-white/95 backdrop-blur-2xl sm:rounded-3xl" contentClassName="max-h-[92dvh] overflow-y-auto p-5 sm:p-6">
          <div className="flex items-start justify-between gap-4">
            <div>
              <div className="text-xs font-black uppercase tracking-[0.14em] text-zinc-400">Confirm Record</div>
              <h2 className="mt-1 text-2xl font-black tracking-[-0.05em]">{title}</h2>
              <p className="mt-2 text-sm font-bold text-zinc-500">{description}</p>
            </div>
            <button type="button" onClick={onCancel} className="grid size-10 shrink-0 place-items-center rounded-xl border border-border bg-white" aria-label="Close confirmation">
              <X className="size-5" />
            </button>
          </div>

          <div className="mt-5 grid gap-2 rounded-2xl border border-border bg-zinc-50 p-3">
            {records.map((record) => (
              <div key={record.label} className="flex items-start justify-between gap-4 border-b border-border py-2 last:border-b-0">
                <div className="text-xs font-black uppercase tracking-[0.12em] text-zinc-400">{record.label}</div>
                <div className="max-w-[62%] text-right text-sm font-black text-black">{record.value || "-"}</div>
              </div>
            ))}
          </div>

          {error ? <div className="mt-4 rounded-xl border border-border bg-white px-4 py-3 text-sm font-black text-black">{error}</div> : null}

          <div className="mt-6 flex justify-center">
            <SlideButton onComplete={onConfirm} />
          </div>
        </FluidEntrySurface>
      </div>
    </div>
  );
}

"use client";

import { X } from "lucide-react";

import { FluidEntrySurface } from "@/components/fluid-entry-surface";
import { Dialog, DialogContent, DialogDescription, DialogTitle } from "@/components/ui/dialog";
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
    <Dialog open onOpenChange={(open) => !open && onCancel()}>
      <DialogContent showCloseButton={false} className="z-[70] w-full max-w-[22rem] border-0 bg-transparent p-0 shadow-none sm:max-w-lg">
        <FluidEntrySurface className="max-h-[calc(100dvh-env(safe-area-inset-top)-env(safe-area-inset-bottom)-2rem)] rounded-2xl border border-white/50 bg-white/95 backdrop-blur-2xl sm:rounded-3xl" contentClassName="max-h-[calc(100dvh-env(safe-area-inset-top)-env(safe-area-inset-bottom)-2rem)] overflow-y-auto p-4 sm:p-6">
          <div className="flex items-start justify-between gap-4">
            <div>
              <div className="text-xs font-black uppercase tracking-[0.14em] text-zinc-400">Confirm Record</div>
              <DialogTitle className="mt-1 text-xl font-black tracking-[-0.05em] sm:text-2xl">{title}</DialogTitle>
              <DialogDescription className="mt-1.5 text-xs font-bold text-zinc-500 sm:text-sm">{description}</DialogDescription>
            </div>
            <button type="button" onClick={onCancel} className="grid size-9 shrink-0 place-items-center rounded-xl border border-border bg-white sm:size-10" aria-label="Close confirmation">
              <X className="size-4 sm:size-5" />
            </button>
          </div>

          <div className="mt-4 grid gap-1 rounded-2xl border border-border bg-zinc-50 p-2.5 sm:mt-5 sm:gap-2 sm:p-3">
            {records.map((record) => (
              <div key={record.label} className="grid gap-1 border-b border-border py-2 last:border-b-0 sm:flex sm:items-start sm:justify-between sm:gap-4">
                <div className="text-[10px] font-black uppercase tracking-[0.12em] text-zinc-400 sm:text-xs">{record.label}</div>
                <div className="break-words text-xs font-black text-black sm:max-w-[62%] sm:text-right sm:text-sm">{record.value || "-"}</div>
              </div>
            ))}
          </div>

          {error ? <div className="mt-4 rounded-xl border border-border bg-white px-4 py-3 text-sm font-black text-black">{error}</div> : null}

          <div className="mt-4 flex justify-center sm:mt-6">
            <SlideButton onComplete={onConfirm} />
          </div>
        </FluidEntrySurface>
      </DialogContent>
    </Dialog>
  );
}

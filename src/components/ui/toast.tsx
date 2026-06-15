"use client";

import { Toaster as Sonner, toast } from "sonner";

export function Toaster() {
  return (
    <Sonner
      position="top-center"
      visibleToasts={3}
      toastOptions={{
        classNames: {
          toast: "rounded-3xl border border-white/60 bg-white/95 p-4 text-black shadow-2xl shadow-black/15 backdrop-blur-2xl",
          title: "text-sm font-black tracking-[-0.03em] text-black",
          description: "text-xs font-bold text-zinc-500",
          success: "border-lime/40",
          error: "border-black/20",
        },
      }}
    />
  );
}

export { toast };

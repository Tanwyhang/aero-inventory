"use client";

import { useEffect } from "react";

import { Button } from "@/components/ui/button";

export default function AppError({
  error,
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  useEffect(() => {
    console.error("Aero route render failed", {
      digest: error.digest ?? null,
      name: error.name,
    });
  }, [error]);

  return (
    <main className="grid min-h-screen place-items-center bg-zinc-50 px-5 text-black">
      <section
        role="alert"
        aria-live="assertive"
        className="w-full max-w-lg rounded-3xl border border-zinc-200 bg-white p-7 text-center shadow-sm sm:p-10"
      >
        <p className="text-xs font-black uppercase tracking-[0.16em] text-zinc-400">Unable to load</p>
        <h1 className="mt-2 text-3xl font-black tracking-[-0.05em]">Something went wrong</h1>
        <p className="mt-3 text-sm font-semibold text-zinc-600">
          Aero could not load this page. Check your connection, then try again.
        </p>
        {error.digest ? <p className="mt-3 text-xs font-bold text-zinc-400">Reference {error.digest}</p> : null}
        <Button type="button" onClick={reset} className="mt-6 h-11 rounded-xl bg-black px-6 font-black text-white hover:bg-black">
          Retry
        </Button>
      </section>
    </main>
  );
}

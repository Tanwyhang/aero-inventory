"use client";

import { useEffect, useState } from "react";

import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";

type SkeletonPage = "stock" | "partner" | "restock" | "skus" | "reports" | "tutorial";

const pageCopy: Record<SkeletonPage, { title: string; description: string }> = {
  stock: {
    title: "Stock",
    description: "Loading current inventory, grouped variants, and restock actions.",
  },
  partner: {
    title: "Partner Share",
    description: "Loading partner sheets, products, and share quantities.",
  },
  restock: {
    title: "Restock",
    description: "Loading supplier follow-ups and active restock requests.",
  },
  skus: {
    title: "SKUs",
    description: "Loading product records, categories, and variant groups.",
  },
  reports: {
    title: "Reports",
    description: "Loading operational stock, restock, and audit history.",
  },
  tutorial: {
    title: "Tutorial",
    description: "Loading guided lessons and the embedded demo app.",
  },
};

function StatSkeleton() {
  return (
    <div className="rounded-3xl border border-zinc-200 bg-white p-4 shadow-sm">
      <Skeleton className="h-3 w-20 rounded-full" />
      <Skeleton className="mt-4 h-8 w-24 rounded-xl" />
      <Skeleton className="mt-5 h-2 w-full rounded-full" />
    </div>
  );
}

function RowSkeleton({ compact = false }: { compact?: boolean }) {
  return (
    <div className="flex items-center gap-4 rounded-3xl border border-zinc-200 bg-white p-4 shadow-sm">
      <Skeleton className="size-14 shrink-0 rounded-2xl" />
      <div className="min-w-0 flex-1">
        <Skeleton className="h-4 w-3/4 rounded-full" />
        <Skeleton className="mt-3 h-3 w-1/2 rounded-full" />
      </div>
      <div className="hidden min-w-28 sm:block">
        <Skeleton className="h-4 w-20 rounded-full" />
        <Skeleton className="mt-3 h-2 w-full rounded-full" />
      </div>
      {compact ? null : <Skeleton className="hidden h-10 w-28 rounded-xl md:block" />}
    </div>
  );
}

function ChartSkeleton() {
  return (
    <div className="rounded-[2rem] border border-zinc-200 bg-white p-5 shadow-sm">
      <div className="flex items-center justify-between gap-4">
        <div>
          <Skeleton className="h-4 w-36 rounded-full" />
          <Skeleton className="mt-3 h-3 w-56 rounded-full" />
        </div>
        <Skeleton className="h-10 w-24 rounded-xl" />
      </div>
      <div className="mt-8 flex h-48 items-end gap-3">
        {[42, 66, 50, 82, 58, 74, 92, 64].map((height, index) => (
          <Skeleton key={index} className="flex-1 rounded-t-2xl" style={{ height: `${height}%` }} />
        ))}
      </div>
    </div>
  );
}

function NavigationSkeleton() {
  return (
    <>
      <aside aria-hidden="true" className="hidden border-r border-border bg-white lg:fixed lg:inset-y-0 lg:left-0 lg:z-30 lg:flex lg:w-[242px] lg:flex-col lg:px-4 lg:py-8">
        <Skeleton className="mx-auto mt-4 h-9 w-32 rounded-xl" />
        <Skeleton className="mt-12 h-12 w-full rounded-xl" />
        <div className="mt-6 grid gap-4">
          {Array.from({ length: 6 }, (_, index) => <Skeleton key={index} className="h-14 w-full rounded-xl" />)}
        </div>
      </aside>
      <div aria-hidden="true" className="fixed inset-x-3 bottom-[calc(0.75rem+env(safe-area-inset-bottom))] z-40 grid grid-cols-6 gap-1 rounded-3xl border border-border bg-white/95 p-1.5 shadow-2xl shadow-black/15 lg:hidden">
        {Array.from({ length: 6 }, (_, index) => <Skeleton key={index} className="h-14 rounded-2xl" />)}
      </div>
    </>
  );
}

export function PageLoadingSkeleton({ page }: { page: SkeletonPage }) {
  const [timedOut, setTimedOut] = useState(false);
  const copy = pageCopy[page];
  const showChart = page === "reports";
  const showStats = page === "stock" || page === "partner" || page === "skus";

  useEffect(() => {
    const timer = window.setTimeout(() => setTimedOut(true), 10_000);
    return () => window.clearTimeout(timer);
  }, []);

  if (timedOut) {
    return (
      <main className="grid min-h-screen place-items-center bg-zinc-50 px-5 text-black">
        <section role="alert" aria-live="assertive" className="w-full max-w-lg rounded-3xl border border-zinc-200 bg-white p-7 text-center shadow-sm sm:p-10">
          <p className="text-xs font-black uppercase tracking-[0.16em] text-zinc-400">Loading timed out</p>
          <h1 className="mt-2 text-3xl font-black tracking-[-0.05em]">{copy.title} could not load</h1>
          <p className="mt-3 text-sm font-semibold text-zinc-600">Check your connection and reload this page. Your saved data has not been changed.</p>
          <Button type="button" onClick={() => window.location.reload()} className="mt-6 h-11 rounded-xl bg-black px-6 font-black text-white hover:bg-black">
            Reload
          </Button>
        </section>
      </main>
    );
  }

  return (
    <main aria-busy="true" className="min-h-screen overflow-x-hidden bg-white pb-[calc(6rem+env(safe-area-inset-bottom))] text-black lg:pb-0">
      <div className="min-h-screen lg:pl-[242px]">
        <NavigationSkeleton />

        <section className="px-3 py-4 sm:px-8 sm:py-8 lg:px-7 xl:px-8">
          <header className="flex flex-col gap-5 sm:flex-row sm:items-end sm:justify-between">
            <div>
              <p role="status" aria-live="polite" className="text-xs font-black uppercase tracking-[0.18em] text-zinc-400">Loading…</p>
              <h1 className="mt-1 text-2xl font-black tracking-[-0.055em] sm:text-[44px]">{copy.title}</h1>
              <p className="mt-1.5 max-w-xl text-xs font-semibold text-zinc-500 sm:mt-2 sm:text-sm">{copy.description}</p>
            </div>
            <Skeleton className="h-11 w-full rounded-2xl sm:w-64" />
          </header>

          {showStats ? (
            <div className="mt-6 grid gap-3 sm:grid-cols-3">
              <StatSkeleton />
              <StatSkeleton />
              <StatSkeleton />
            </div>
          ) : null}

          <div className="mt-6 rounded-[2rem] border border-zinc-200 bg-zinc-50/70 p-3 sm:p-4">
            <div className="mb-4 flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
              <Skeleton className="h-11 w-full rounded-2xl sm:max-w-sm" />
              <div className="flex gap-2">
                <Skeleton className="h-10 w-20 rounded-xl" />
                <Skeleton className="h-10 w-20 rounded-xl" />
                <Skeleton className="h-10 w-20 rounded-xl" />
              </div>
            </div>

            {showChart ? <ChartSkeleton /> : null}

            <div className="mt-4 grid gap-3">
              {Array.from({ length: showChart ? 5 : 7 }, (_, index) => (
                <RowSkeleton key={index} compact={page === "restock"} />
              ))}
            </div>
          </div>
        </section>
      </div>
    </main>
  );
}

"use client";

import Image from "next/image";
import { startTransition, useCallback, useEffect, useMemo, useOptimistic } from "react";
import { useRouter } from "next/navigation";
import { ArrowLeft, BarChart3, BookOpen, Box, Eye, Handshake, Package, RotateCcw } from "lucide-react";
import { motion } from "motion/react";

import aeroLogo from "../../design/logoword.png";
import { cn } from "@/lib/utils";

const navItems = [
  { label: "Stock", href: "/", icon: Box, key: "stock" },
  { label: "Partner", href: "/partner-share", icon: Handshake, key: "partner" },
  { label: "Restock", href: "/restock", icon: RotateCcw, key: "restock" },
  { label: "SKUs", href: "/sku", icon: Package, key: "skus" },
  { label: "Reports", href: "/reports", icon: BarChart3, key: "reports" },
  { label: "Tutorial", href: "/tutorial", icon: BookOpen, key: "tutorial" },
] as const;

type NavKey = (typeof navItems)[number]["key"];

export function AppSidebar({
  active,
  role = "admin",
  showStaffToggle = false,
  isViewingAsStaff = false,
  onToggleStaffView,
  restockCount = 0,
}: {
  active: NavKey;
  role?: "admin" | "staff";
  showStaffToggle?: boolean;
  isViewingAsStaff?: boolean;
  onToggleStaffView?: () => void;
  restockCount?: number;
}) {
  const router = useRouter();
  const [optimisticActive, setOptimisticActive] = useOptimistic(active, (_current, next: NavKey) => next);
  const visibleNavItems = useMemo(() => (role === "admin" ? navItems : navItems.filter((item) => item.key === "stock" || item.key === "partner" || item.key === "tutorial")), [role]);

  const navigateOptimistically = useCallback((item: (typeof navItems)[number]) => {
    startTransition(() => {
      setOptimisticActive(item.key);

      if (item.key === active) return;

      router.push(item.href);
    });
  }, [active, router, setOptimisticActive]);

  useEffect(() => {
    function handleKeyDown(event: KeyboardEvent) {
      if (event.key.toLowerCase() !== "t" || event.metaKey || event.ctrlKey || event.altKey) return;
      if (!window.matchMedia("(min-width: 1024px)").matches) return;

      const target = event.target as HTMLElement | null;
      if (target?.closest("input, textarea, select, [contenteditable='true']")) return;

      event.preventDefault();
      const currentIndex = visibleNavItems.findIndex((item) => item.key === optimisticActive);
      const nextItem = visibleNavItems[(currentIndex + 1) % visibleNavItems.length];
      navigateOptimistically(nextItem);
    }

    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, [navigateOptimistically, optimisticActive, visibleNavItems]);

  return (
    <>
    <aside className="hidden border-b border-border bg-white px-4 py-5 lg:fixed lg:inset-y-0 lg:left-0 lg:z-30 lg:flex lg:h-screen lg:w-[242px] lg:flex-col lg:border-b-0 lg:border-r">
      <div className="hidden w-full flex-col items-center gap-4 pt-6 lg:flex">
        <Image src={aeroLogo} alt="Aero" className="h-auto w-32" priority />
      </div>

      <button
        type="button"
        onClick={() => router.push("/workspaces")}
        className="mt-10 hidden w-full items-center gap-3 rounded-xl border border-dashed border-zinc-300 bg-zinc-50 px-4 py-3 text-left text-sm font-black text-zinc-600 transition hover:border-black hover:bg-white hover:text-black lg:flex"
      >
        <ArrowLeft className="size-4" />
        Switch workspace
      </button>

      <nav className="flex w-full gap-2 overflow-x-auto lg:mt-6 lg:flex-col lg:gap-4 lg:overflow-visible">
        {visibleNavItems.map((item) => {
          const Icon = item.icon;

          return (
            <button
              key={item.label}
              type="button"
              data-tutorial={`nav-${item.key}`}
              onClick={() => navigateOptimistically(item)}
              className={cn(
                "relative flex min-w-fit items-center gap-4 overflow-hidden rounded-xl px-4 py-3 text-left text-[15px] font-semibold transition lg:min-w-0 lg:px-5 lg:py-4",
                optimisticActive === item.key ? "text-lime" : "text-black hover:bg-zinc-100",
              )}
            >
              {optimisticActive === item.key ? (
                <motion.span
                  layoutId="sidebar-active-pill"
                  className="absolute inset-0 rounded-xl bg-black"
                  transition={{ duration: 0.36, ease: [0.22, 1, 0.36, 1] }}
                />
              ) : null}
              <Icon className="relative z-10 size-6 stroke-[2.1]" />
              <span className="relative z-10">{item.label}</span>
              {item.key === "restock" && restockCount > 0 ? (
                <span className={cn(
                  "relative z-10 ml-auto grid min-w-6 place-items-center rounded-full px-2 py-0.5 text-xs font-black",
                  optimisticActive === item.key ? "bg-lime text-black" : "bg-black text-lime",
                )}>
                  {restockCount}
                </span>
              ) : null}
            </button>
          );
        })}
      </nav>

      {showStaffToggle ? (
        <div className="mt-auto hidden pt-6 lg:block">
          <button
            type="button"
            onClick={onToggleStaffView}
            className="flex w-full items-center gap-3 rounded-xl border border-border bg-white px-4 py-3 text-left text-sm font-bold text-black transition hover:bg-zinc-100"
          >
            <Eye className="size-5" />
            {isViewingAsStaff ? "Admin View" : "View as Staff"}
          </button>
        </div>
      ) : null}
    </aside>
    <nav className="fixed inset-x-3 bottom-[calc(0.75rem+env(safe-area-inset-bottom))] z-40 flex gap-1 rounded-3xl border border-border bg-white/95 p-1.5 shadow-2xl shadow-black/15 backdrop-blur-xl lg:hidden">
      {visibleNavItems.map((item) => {
        const Icon = item.icon;

        return (
          <button
            key={item.label}
            type="button"
            data-tutorial={`nav-${item.key}`}
            onClick={() => navigateOptimistically(item)}
            className={cn(
              "relative flex min-h-14 flex-1 flex-col items-center justify-center gap-1 overflow-hidden rounded-2xl px-1 text-[10px] font-black transition",
              optimisticActive === item.key ? "text-lime" : "text-zinc-600",
            )}
          >
            {optimisticActive === item.key ? (
              <motion.span
                layoutId="mobile-nav-active-pill"
                  className="absolute inset-0 rounded-2xl bg-black"
                transition={{ duration: 0.36, ease: [0.22, 1, 0.36, 1] }}
              />
            ) : null}
            <span className="relative z-10">
              <Icon className="size-5 stroke-[2.2]" />
              {item.key === "restock" && restockCount > 0 ? (
                <span className={cn(
                  "absolute -right-2 -top-2 grid min-w-5 place-items-center rounded-full px-1 text-[10px] font-black",
                  optimisticActive === item.key ? "bg-lime text-black" : "bg-black text-lime",
                )}>
                  {restockCount}
                </span>
              ) : null}
            </span>
            <span className="relative z-10 truncate">{item.label}</span>
          </button>
        );
      })}
    </nav>
    </>
  );
}

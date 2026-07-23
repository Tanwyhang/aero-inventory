"use client";

import Image from "next/image";
import Link from "next/link";
import { startTransition, useCallback, useEffect, useMemo, useOptimistic } from "react";
import { useRouter } from "next/navigation";
import { ArrowLeft, BarChart3, BookOpen, Box, Eye, Handshake, Package, RotateCcw } from "lucide-react";
import { motion } from "motion/react";

import aeroLogo from "../../design/logoword.webp";
import { cn } from "@/lib/utils";
import type { MemberRole } from "@/types/database";

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
  workspaceName,
}: {
  active: NavKey;
  role?: MemberRole;
  showStaffToggle?: boolean;
  isViewingAsStaff?: boolean;
  onToggleStaffView?: () => void;
  restockCount?: number;
  workspaceName?: string;
}) {
  const router = useRouter();
  const [optimisticActive, setOptimisticActive] = useOptimistic(active, (_current, next: NavKey) => next);
  const visibleNavItems = useMemo(() => (role === "admin" ? navItems : navItems.filter((item) => item.key === "stock" || item.key === "partner" || item.key === "tutorial")), [role]);

  const activateOptimistically = useCallback((item: (typeof navItems)[number]) => {
    startTransition(() => setOptimisticActive(item.key));
  }, [setOptimisticActive]);

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
    <aside className="contents lg:fixed lg:inset-y-0 lg:left-0 lg:z-30 lg:flex lg:h-screen lg:w-[242px] lg:flex-col lg:border-r lg:border-border lg:bg-white lg:px-4 lg:py-5">
      <div className="hidden w-full flex-col items-center gap-4 pt-6 lg:flex">
        <Image src={aeroLogo} alt="Aero" className="h-auto w-32" priority />
      </div>

      <Link
        href="/workspaces"
        prefetch={true}
        className="mt-10 hidden w-full items-center gap-3 rounded-xl border border-dashed border-zinc-300 bg-zinc-50 px-4 py-3 text-left text-sm font-black text-zinc-600 transition hover:border-black hover:bg-white hover:text-black lg:flex"
      >
        <ArrowLeft className="size-4 shrink-0" aria-hidden="true" />
        <span className="min-w-0">
          <span className="block truncate text-black">{workspaceName ?? "Workspaces"}</span>
          <span className="mt-0.5 block text-[11px] font-bold capitalize text-zinc-500">{role} · Switch workspace</span>
        </span>
      </Link>

      <nav aria-label="Primary navigation" className="fixed inset-x-3 bottom-[calc(0.75rem+env(safe-area-inset-bottom))] z-40 flex gap-1 rounded-3xl border border-border bg-white/95 p-1.5 shadow-2xl shadow-black/15 backdrop-blur-xl lg:static lg:z-auto lg:mt-6 lg:w-full lg:flex-col lg:gap-4 lg:rounded-none lg:border-0 lg:bg-transparent lg:p-0 lg:shadow-none lg:backdrop-blur-none">
        {visibleNavItems.map((item) => {
          const Icon = item.icon;

          return (
            <Link
              key={item.label}
              href={item.href}
              prefetch={true}
              aria-current={optimisticActive === item.key ? "page" : undefined}
              data-tutorial={`nav-${item.key}`}
              onClick={() => activateOptimistically(item)}
              className={cn(
                "relative flex min-h-14 min-w-0 flex-1 flex-col items-center justify-center gap-1 overflow-hidden rounded-2xl px-1 text-[10px] font-black text-zinc-600 transition lg:min-h-0 lg:w-full lg:flex-none lg:flex-row lg:justify-start lg:gap-4 lg:rounded-xl lg:px-5 lg:py-4 lg:text-left lg:text-[15px] lg:font-semibold lg:text-black",
                optimisticActive === item.key ? "text-lime" : "hover:bg-zinc-100",
              )}
            >
              {optimisticActive === item.key ? (
                <motion.span
                  layoutId="navigation-active-pill"
                  className="absolute inset-0 rounded-2xl bg-black lg:rounded-xl"
                  transition={{ duration: 0.36, ease: [0.22, 1, 0.36, 1] }}
                />
              ) : null}
              <span className="relative z-10">
                <Icon className="size-5 stroke-[2.2] lg:size-6 lg:stroke-[2.1]" aria-hidden="true" />
                {item.key === "restock" && restockCount > 0 ? (
                  <span className={cn(
                    "absolute -right-2 -top-2 grid min-w-5 place-items-center rounded-full px-1 text-[10px] font-black lg:hidden",
                    optimisticActive === item.key ? "bg-lime text-black" : "bg-black text-lime",
                  )}>
                    {restockCount}
                  </span>
                ) : null}
              </span>
              <span className="relative z-10 min-w-0 truncate lg:flex-1">{item.label}</span>
              {item.key === "restock" && restockCount > 0 ? (
                <span className={cn(
                  "relative z-10 ml-auto hidden min-w-6 place-items-center rounded-full px-2 py-0.5 text-xs font-black lg:grid",
                  optimisticActive === item.key ? "bg-lime text-black" : "bg-black text-lime",
                )}>
                  {restockCount}
                </span>
              ) : null}
            </Link>
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
  );
}

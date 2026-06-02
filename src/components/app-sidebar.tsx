"use client";

import Image from "next/image";
import { startTransition, useCallback, useEffect, useMemo, useOptimistic } from "react";
import { useRouter } from "next/navigation";
import { BarChart3, Box, Eye, Package, RotateCcw } from "lucide-react";
import { motion } from "motion/react";

import aeroLogo from "../../design/logoword.png";
import { cn } from "@/lib/utils";

const navItems = [
  { label: "Stock", href: "/", icon: Box, key: "stock" },
  { label: "Restock", href: "/restock", icon: RotateCcw, key: "restock" },
  { label: "SKUs", href: "/sku", icon: Package, key: "skus" },
  { label: "Reports", href: "/reports", icon: BarChart3, key: "reports" },
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
  active: "stock" | "restock" | "skus" | "reports";
  role?: "admin" | "staff";
  showStaffToggle?: boolean;
  isViewingAsStaff?: boolean;
  onToggleStaffView?: () => void;
  restockCount?: number;
}) {
  const router = useRouter();
  const [optimisticActive, setOptimisticActive] = useOptimistic(active, (_current, next: NavKey) => next);
  const visibleNavItems = useMemo(() => (role === "admin" ? navItems : navItems.filter((item) => item.key === "stock")), [role]);

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
    <aside className="flex border-b border-border bg-white px-4 py-5 lg:fixed lg:inset-y-0 lg:left-0 lg:z-30 lg:h-screen lg:w-[242px] lg:flex-col lg:border-b-0 lg:border-r">
      <div className="hidden w-full flex-col items-center gap-4 pt-6 lg:flex">
        <Image src={aeroLogo} alt="Aero" className="h-auto w-32" priority />
      </div>

      <nav className="flex w-full gap-2 overflow-x-auto lg:mt-16 lg:flex-col lg:gap-4 lg:overflow-visible">
        {visibleNavItems.map((item) => {
          const Icon = item.icon;

          return (
            <button
              key={item.label}
              type="button"
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
                  optimisticActive === item.key ? "bg-lime text-black" : "bg-orange text-white",
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
  );
}

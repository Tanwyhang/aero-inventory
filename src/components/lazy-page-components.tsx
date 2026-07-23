"use client";

import dynamic from "next/dynamic";

function FullPageFallback() {
  return (
    <main aria-busy="true" className="min-h-screen animate-pulse bg-white p-4 text-black lg:pl-[270px] lg:pt-8">
      <div className="h-10 w-48 rounded-2xl bg-zinc-200" />
      <div className="mt-3 h-4 w-80 max-w-full rounded-full bg-zinc-100" />
      <div className="mt-8 grid gap-3 sm:grid-cols-3">
        {Array.from({ length: 3 }, (_, index) => <div key={index} className="h-28 rounded-3xl bg-zinc-100" />)}
      </div>
      <div className="mt-6 h-[28rem] rounded-[2rem] bg-zinc-100" />
    </main>
  );
}

function InlinePanelFallback() {
  return <div aria-busy="true" className="mt-6 h-72 animate-pulse rounded-[2rem] bg-zinc-100" />;
}

export const LazyInventoryDashboard = dynamic(
  () => import("@/components/inventory-dashboard").then((module) => module.InventoryDashboard),
  { loading: FullPageFallback },
);

export const LazyRestockQueue = dynamic(
  () => import("@/components/inventory-dashboard").then((module) => module.RestockQueue),
  { loading: InlinePanelFallback },
);

export const LazyAdminSkuManager = dynamic(
  () => import("@/components/admin-sku-manager").then((module) => module.AdminSkuManager),
  { loading: FullPageFallback },
);

export const LazyPartnerShareManager = dynamic(
  () => import("@/components/partner-share-manager").then((module) => module.PartnerShareManager),
  { loading: FullPageFallback },
);

export const LazyReportsAreaChart = dynamic(
  () => import("@/components/reports-area-chart").then((module) => module.ReportsAreaChart),
  { loading: InlinePanelFallback },
);

export const LazyReportsActivityLists = dynamic(
  () => import("@/components/reports-activity-lists").then((module) => module.ReportsActivityLists),
  { loading: InlinePanelFallback },
);

export const LazyAeroSuperAdminDashboard = dynamic(
  () => import("@/components/aero-super-admin-dashboard").then((module) => module.AeroSuperAdminDashboard),
  { loading: FullPageFallback },
);

export const LazyTutorialPage = dynamic(
  () => import("@/components/tutorial/tutorial-page").then((module) => module.TutorialPage),
  { loading: FullPageFallback },
);

export const LazyTutorialEmbed = dynamic(
  () => import("@/components/tutorial/tutorial-embed").then((module) => module.TutorialEmbed),
  { loading: FullPageFallback },
);

"use client";

import { AppSidebar } from "@/components/app-sidebar";
import { AdminSkuManager } from "@/components/admin-sku-manager";
import { FluidEntrySurface } from "@/components/fluid-entry-surface";
import { InventoryDashboard, RestockQueue } from "@/components/inventory-dashboard";
import { PartnerShareManager } from "@/components/partner-share-manager";
import { ReportsActivityLists } from "@/components/reports-activity-lists";
import { ReportsAreaChart } from "@/components/reports-area-chart";
import { TutorialGuideOverlay } from "@/components/tutorial/tutorial-guide-overlay";
import { getLesson, type TutorialLessonId } from "@/components/tutorial/tutorial-lessons";
import {
  demoAdminRows,
  demoCategories,
  demoMembership,
  demoPartnerShareDetails,
  demoPartnerSharePageData,
  demoReportAudits,
  demoReportChart,
  demoReportMovements,
  demoReportRestocks,
  demoRestockRequests,
  demoSkuRows,
  demoStaffRows,
} from "@/components/tutorial/tutorial-demo-data";

function stopRealInteraction(event: React.SyntheticEvent<HTMLElement>) {
  const target = event.target as HTMLElement | null;
  if (target?.closest("[data-tutorial-control]")) return;

  event.preventDefault();
  event.stopPropagation();
}

function TutorialReplicaFrame({ children }: { children: React.ReactNode }) {
  return (
    <div
      className="relative min-h-screen bg-white"
      onClickCapture={stopRealInteraction}
      onSubmitCapture={stopRealInteraction}
      onPointerDownCapture={(event) => {
        const target = event.target as HTMLElement | null;
        if (!target?.closest("input, textarea, select")) stopRealInteraction(event);
      }}
    >
      {children}
    </div>
  );
}

function ReportsReplica() {
  return (
    <main className="min-h-screen overflow-x-hidden bg-white pb-[calc(6rem+env(safe-area-inset-bottom))] text-black lg:pb-0">
      <div className="min-h-screen lg:pl-[242px]">
        <AppSidebar active="reports" role="admin" restockCount={demoRestockRequests.length} />
        <section className="px-3 py-4 sm:px-8 sm:py-8 lg:px-7 xl:px-8">
          <h1 className="text-2xl font-black tracking-[-0.055em] sm:text-[44px]">Reports</h1>
          <p className="mt-1.5 text-sm font-semibold text-zinc-500 sm:text-base">Operational stock, restock, and audit trail.</p>
          <div data-tutorial="reports-chart">
            <ReportsAreaChart data={demoReportChart} />
          </div>
          <div data-tutorial="reports-lists">
            <ReportsActivityLists movements={demoReportMovements} restocks={demoReportRestocks} audits={demoReportAudits} />
          </div>
        </section>
      </div>
    </main>
  );
}

function RolesReplica({ role }: { role: "admin" | "staff" }) {
  return (
    <main className="min-h-screen overflow-x-hidden bg-white pb-[calc(6rem+env(safe-area-inset-bottom))] text-black lg:pb-0">
      <div className="min-h-screen lg:pl-[242px]">
        <AppSidebar active="tutorial" role={role} restockCount={role === "admin" ? demoRestockRequests.length : 0} showStaffToggle={role === "admin"} isViewingAsStaff={false} />
        <section className="px-3 py-4 sm:px-8 sm:py-8 lg:px-7 xl:px-8">
          <header>
            <h1 className="text-2xl font-black tracking-[-0.055em] sm:text-[44px]">Admin vs Staff</h1>
            <p className="mt-1.5 max-w-2xl text-sm font-semibold text-zinc-500 sm:text-base">Learn what each role can access before working in the live system.</p>
          </header>
          <div className="mt-6 grid gap-4 md:grid-cols-2">
            <FluidEntrySurface data-tutorial="role-badge" className="rounded-3xl border border-white/50 bg-white/70 backdrop-blur-2xl" contentClassName="p-5">
              <div className="text-xs font-black uppercase tracking-[0.14em] text-zinc-400">Current training role</div>
              <div className="mt-2 text-3xl font-black capitalize tracking-[-0.06em]">{role}</div>
              <p className="mt-2 text-sm font-semibold text-zinc-500">Admins manage SKUs, suppliers, restock, reports, and can view staff-safe mode. Staff focus on warehouse-safe workflows.</p>
            </FluidEntrySurface>
            <FluidEntrySurface data-tutorial="tutorial-safety" className="rounded-3xl border border-lime/50 bg-lime/15 backdrop-blur-2xl" contentClassName="p-5">
              <div className="text-xs font-black uppercase tracking-[0.14em] text-black/50">Safe training mode</div>
              <div className="mt-2 text-3xl font-black tracking-[-0.06em]">Demo-only</div>
              <p className="mt-2 text-sm font-semibold text-zinc-700">The fake cursor can point, click, and type in this iframe, but production buttons are blocked and no Supabase write action runs.</p>
            </FluidEntrySurface>
          </div>
        </section>
      </div>
    </main>
  );
}

function LessonReplica({ lessonId, role }: { lessonId: TutorialLessonId; role: "admin" | "staff" }) {
  if (lessonId === "stock") {
    return <InventoryDashboard membership={demoMembership(role)} adminRows={demoAdminRows} staffRows={demoStaffRows} restockRequests={role === "admin" ? demoRestockRequests : []} />;
  }

  if (lessonId === "partner") {
    return <PartnerShareManager membership={demoMembership(role)} pageData={demoPartnerSharePageData} details={demoPartnerShareDetails} inventoryRows={role === "admin" ? demoAdminRows : demoStaffRows} restockCount={role === "admin" ? demoRestockRequests.length : 0} />;
  }

  if (lessonId === "restock") {
    return (
      <main className="min-h-screen overflow-x-hidden bg-white pb-[calc(6rem+env(safe-area-inset-bottom))] text-black lg:pb-0">
        <div className="min-h-screen lg:pl-[242px]">
          <AppSidebar active="restock" role="admin" restockCount={demoRestockRequests.length} />
          <section className="px-3 py-4 sm:px-8 sm:py-8 lg:px-7 xl:px-8">
            <header>
              <h1 className="text-2xl font-black tracking-[-0.055em] sm:text-[44px]">Restock</h1>
              <p className="mt-1.5 max-w-xl text-xs font-semibold text-zinc-500 sm:mt-2 sm:text-sm">Contact suppliers and clear active restock requests from one dedicated workflow.</p>
            </header>
            <div data-tutorial="restock-request">
              <RestockQueue requests={demoRestockRequests} rows={demoAdminRows} />
            </div>
          </section>
        </div>
      </main>
    );
  }

  if (lessonId === "skus") {
    return <AdminSkuManager membership={demoMembership("admin")} rows={demoSkuRows} categories={demoCategories} restockCount={demoRestockRequests.length} />;
  }

  if (lessonId === "reports") return <ReportsReplica />;

  return <RolesReplica role={role} />;
}

export function TutorialEmbed({ lessonId, role }: { lessonId: string; role: "admin" | "staff" }) {
  const lesson = getLesson(lessonId, role);

  return (
    <>
      <TutorialReplicaFrame>
        <LessonReplica lessonId={lesson.id} role={role} />
      </TutorialReplicaFrame>
      <TutorialGuideOverlay key={lesson.id} lesson={lesson} />
    </>
  );
}

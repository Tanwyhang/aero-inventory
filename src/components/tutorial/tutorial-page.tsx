"use client";

import { useMemo, useState } from "react";
import { BookOpen, Download, Monitor, ShieldCheck } from "lucide-react";

import { AppSidebar } from "@/components/app-sidebar";
import { Button } from "@/components/ui/button";
import { StoreIdentityEditor } from "@/components/store-identity-editor";
import { getVisibleLessons, type TutorialLessonId } from "@/components/tutorial/tutorial-lessons";
import { cn } from "@/lib/utils";
import type { Membership } from "@/types/database";

export function TutorialPage({ membership }: { membership: Membership }) {
  const [lessonId, setLessonId] = useState<TutorialLessonId>("stock");
  const [frameSize, setFrameSize] = useState<"desktop" | "mobile">("desktop");
  const tutorialRole = membership.role === "admin" ? "admin" : "staff";
  const lessons = useMemo(() => getVisibleLessons(tutorialRole), [tutorialRole]);
  const selectedLesson = lessons.find((lesson) => lesson.id === lessonId) ?? lessons[0];
  const frameSrc = `/tutorial/embed?lesson=${selectedLesson.id}&role=${tutorialRole}`;

  function downloadSelectedLesson() {
    const lessonUrl = new URL(frameSrc, window.location.origin).toString();
    const lessonSlug = selectedLesson.label.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "");
    const html = `<!doctype html>
<html lang="en">
<head>
  <meta charset="utf-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1" />
  <title>Aero Tutorial - ${selectedLesson.label}</title>
  <style>
    html, body { margin: 0; height: 100%; background: #09090b; color: #fff; font-family: Arial, sans-serif; }
    body { display: grid; grid-template-rows: auto 1fr; }
    header { display: flex; justify-content: space-between; gap: 12px; align-items: center; padding: 16px 20px; background: #111827; }
    h1 { margin: 0; font-size: 18px; }
    p { margin: 4px 0 0; font-size: 13px; color: #a1a1aa; }
    a { color: #bef264; }
    iframe { width: 100%; height: 100%; border: 0; background: #fff; }
  </style>
</head>
<body>
  <header>
    <div>
      <h1>${selectedLesson.label}</h1>
      <p>If the embedded tutorial does not load, open it directly: <a href="${lessonUrl}">${lessonUrl}</a></p>
    </div>
  </header>
  <iframe src="${lessonUrl}" title="${selectedLesson.label} tutorial"></iframe>
</body>
</html>`;
    const blob = new Blob([html], { type: "text/html" });
    const url = window.URL.createObjectURL(blob);
    const anchor = document.createElement("a");
    anchor.href = url;
    anchor.download = `aero-tutorial-${lessonSlug}.html`;
    anchor.click();
    window.URL.revokeObjectURL(url);
  }

  return (
    <main className="min-h-screen overflow-x-hidden bg-white pb-[calc(6rem+env(safe-area-inset-bottom))] text-black lg:pb-0">
      <div className="min-h-screen lg:pl-[242px]">
        <AppSidebar active="tutorial" role={membership.role} workspaceName={membership.organization_name} />
        <section className="px-3 py-4 sm:px-8 sm:py-8 lg:px-7 xl:px-8">
          <header className="flex flex-col gap-5 xl:flex-row xl:items-start xl:justify-between">
            <div>
              <StoreIdentityEditor initialName={membership.organization_name} initialIcon={membership.organization_icon} workspaceId={membership.organization_id} readOnly={membership.role !== "admin"} />
              <div className="mt-3 inline-flex items-center gap-2 rounded-full bg-zinc-100 px-4 py-2 text-sm font-bold text-zinc-600">
                <ShieldCheck className="size-4" />
                Safe tutorial mode: demo data only
              </div>
              <h1 className="mt-5 text-3xl font-black tracking-[-0.055em] sm:text-[48px]">Tutorial</h1>
              <p className="mt-2 max-w-2xl text-sm font-semibold text-zinc-500 sm:text-base">Guided, visual walkthroughs for every tab. The embedded frame renders the real Aero UI with demo data, then a fake cursor teaches each step.</p>
            </div>
            <div className="grid gap-2 rounded-3xl border border-zinc-200 bg-white p-2 shadow-sm xl:w-[320px]">
              <Button type="button" variant="outline" onClick={downloadSelectedLesson} className="h-11 rounded-2xl bg-white font-black hover:bg-white">
                <Download className="size-4" />Download Tutorial
              </Button>
              <div className="grid gap-2 sm:grid-cols-2">
              <Button type="button" variant={frameSize === "desktop" ? "default" : "outline"} onClick={() => setFrameSize("desktop")} className={cn("h-11 rounded-2xl font-black", frameSize === "desktop" ? "bg-black text-lime hover:bg-black" : "bg-white hover:bg-white")}>Desktop</Button>
              <Button type="button" variant={frameSize === "mobile" ? "default" : "outline"} onClick={() => setFrameSize("mobile")} className={cn("h-11 rounded-2xl font-black", frameSize === "mobile" ? "bg-black text-lime hover:bg-black" : "bg-white hover:bg-white")}>Mobile</Button>
              </div>
            </div>
          </header>

          <div className="mt-6 grid gap-3 lg:grid-cols-[280px_1fr] xl:grid-cols-[320px_1fr]">
            <div className="grid gap-2 self-start rounded-3xl border border-zinc-200 bg-zinc-50 p-2 lg:sticky lg:top-6">
              {lessons.map((lesson) => (
                <button
                  key={lesson.id}
                  type="button"
                  onClick={() => setLessonId(lesson.id)}
                  className={cn(
                    "rounded-2xl p-3 text-left transition",
                    selectedLesson.id === lesson.id ? "bg-black text-white shadow-lg shadow-black/15" : "bg-white text-black hover:bg-zinc-100",
                  )}
                >
                  <div className="flex items-center gap-2 text-sm font-black">
                    <BookOpen className="size-4" />
                    {lesson.label}
                  </div>
                  <p className={cn("mt-1.5 text-xs font-semibold leading-relaxed", selectedLesson.id === lesson.id ? "text-zinc-300" : "text-zinc-500")}>{lesson.description}</p>
                </button>
              ))}
            </div>

            <div className="min-w-0 rounded-[2rem] border border-zinc-200 bg-zinc-950 p-2 shadow-2xl shadow-black/20 sm:p-3">
              <div className="flex items-center justify-between gap-3 px-2 pb-2 text-white sm:px-3">
                <div className="flex min-w-0 items-center gap-2">
                  <Monitor className="size-4 shrink-0 text-lime" />
                  <div className="truncate text-sm font-black">{selectedLesson.label} walkthrough</div>
                </div>
                <div className="shrink-0 text-xs font-bold text-zinc-400">1:1 component replica</div>
              </div>
              <div className={cn("rounded-[1.45rem] bg-white", frameSize === "desktop" ? "overflow-auto" : "overflow-hidden")}>
                <iframe
                  key={`${selectedLesson.id}-${tutorialRole}-${frameSize}`}
                  title={`${selectedLesson.label} tutorial`}
                  src={frameSrc}
                  loading="lazy"
                  className={cn(
                    "mx-auto block border-0 bg-white transition-all",
                    frameSize === "desktop" ? "h-[760px] w-full min-w-[1120px]" : "h-[760px] w-[390px]",
                  )}
                />
              </div>
            </div>
          </div>
        </section>
      </div>
    </main>
  );
}

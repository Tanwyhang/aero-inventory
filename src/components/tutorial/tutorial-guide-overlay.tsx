"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { MousePointer2, Pause, Play, RotateCcw, SkipForward } from "lucide-react";

import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import type { TutorialLesson, TutorialStep } from "@/components/tutorial/tutorial-lessons";

type Rect = { top: number; left: number; width: number; height: number };
type Point = { x: number; y: number };

function sleep(ms: number) {
  return new Promise((resolve) => window.setTimeout(resolve, ms));
}

function targetCenter(rect: Rect): Point {
  return { x: rect.left + rect.width / 2, y: rect.top + rect.height / 2 };
}

function setNativeValue(element: HTMLInputElement | HTMLTextAreaElement, value: string) {
  const descriptor = Object.getOwnPropertyDescriptor(Object.getPrototypeOf(element), "value");
  descriptor?.set?.call(element, value);
  element.dispatchEvent(new Event("input", { bubbles: true }));
  element.dispatchEvent(new Event("change", { bubbles: true }));
}

function TypewriterText({ text }: { text: string }) {
  const [visible, setVisible] = useState("");

  useEffect(() => {
    let index = 0;
    const timer = window.setInterval(() => {
      index += 1;
      setVisible(text.slice(0, index));
      if (index >= text.length) window.clearInterval(timer);
    }, 15);

    return () => window.clearInterval(timer);
  }, [text]);

  return <span>{visible}</span>;
}

export function TutorialGuideOverlay({ lesson }: { lesson: TutorialLesson }) {
  const [stepIndex, setStepIndex] = useState(0);
  const [targetRect, setTargetRect] = useState<Rect | null>(null);
  const [cursor, setCursor] = useState<Point>({ x: 96, y: 96 });
  const [isRunning, setIsRunning] = useState(true);
  const [pulseKey, setPulseKey] = useState(0);
  const runId = useRef(0);
  const step = lesson.steps[stepIndex];
  const progress = `${stepIndex + 1}/${lesson.steps.length}`;
  const cardPosition = useMemo(() => {
    if (typeof window === "undefined") return { left: 24, top: 24 };
    if (!targetRect) return { left: 24, top: 24 };
    const hasRoomBelow = targetRect.top + targetRect.height + 180 < window.innerHeight;
    const top = hasRoomBelow ? targetRect.top + targetRect.height + 18 : Math.max(18, targetRect.top - 178);
    const left = Math.min(Math.max(18, targetRect.left), Math.max(18, window.innerWidth - 378));
    return { left, top };
  }, [targetRect]);

  const findTarget = useCallback((currentStep: TutorialStep) => {
    return document.querySelector<HTMLElement>(currentStep.target);
  }, []);

  const measureTarget = useCallback((currentStep: TutorialStep) => {
    const target = findTarget(currentStep);
    if (!target) return null;

    target.scrollIntoView({ behavior: "smooth", block: "center", inline: "center" });
    const rect = target.getBoundingClientRect();

    return {
      top: rect.top,
      left: rect.left,
      width: rect.width,
      height: rect.height,
    };
  }, [findTarget]);

  const typeIntoTarget = useCallback(async (currentStep: TutorialStep) => {
    const target = findTarget(currentStep);
    if (!(target instanceof HTMLInputElement || target instanceof HTMLTextAreaElement) || currentStep.value === undefined) return;

    target.focus({ preventScroll: true });
    setNativeValue(target, "");

    for (let index = 1; index <= currentStep.value.length; index += 1) {
      setNativeValue(target, currentStep.value.slice(0, index));
      await sleep(75);
    }
  }, [findTarget]);

  const nextStep = useCallback(() => {
    setStepIndex((current) => (current + 1) % lesson.steps.length);
  }, [lesson.steps.length]);

  function restart() {
    runId.current += 1;
    setStepIndex(0);
    setIsRunning(true);
  }

  useEffect(() => {
    if (!step) return;
    const id = ++runId.current;
    let resizeTimer: number | undefined;

    async function runStep() {
      await sleep(220);
      if (id !== runId.current) return;

      const measured = measureTarget(step);
      if (!measured) {
        setTargetRect(null);
        return;
      }

      setTargetRect(measured);
      setCursor(targetCenter(measured));
      await sleep(520);
      if (id !== runId.current) return;

      if (step.action === "click") {
        setPulseKey((current) => current + 1);
        await sleep(450);
      }

      if (step.action === "type") {
        await typeIntoTarget(step);
      }

      if (isRunning) {
        await sleep(step.duration ?? 3100);
        if (id === runId.current) nextStep();
      }
    }

    runStep();

    function handleResize() {
      window.clearTimeout(resizeTimer);
      resizeTimer = window.setTimeout(() => {
        const measured = measureTarget(step);
        if (measured) {
          setTargetRect(measured);
          setCursor(targetCenter(measured));
        }
      }, 120);
    }

    window.addEventListener("resize", handleResize);
    return () => {
      window.removeEventListener("resize", handleResize);
      window.clearTimeout(resizeTimer);
    };
  }, [isRunning, measureTarget, nextStep, step, typeIntoTarget]);

  if (!step) return null;

  return (
    <div className="pointer-events-none fixed inset-0 z-[999] text-black">
      <div className="absolute inset-0 bg-black/10" />
      {targetRect ? (
        <div
          className="absolute rounded-[22px] border-2 border-lime shadow-[0_0_0_9999px_rgba(0,0,0,0.24),0_0_0_8px_rgba(199,255,36,0.2)] transition-all duration-500"
          style={{ top: targetRect.top - 8, left: targetRect.left - 8, width: targetRect.width + 16, height: targetRect.height + 16 }}
        />
      ) : null}
      {targetRect ? (
        <div key={pulseKey} className="absolute size-10 rounded-full border-2 border-lime/80 opacity-0 animate-ping" style={{ top: cursor.y - 20, left: cursor.x - 20 }} />
      ) : null}
      <div className="absolute transition-all duration-700 ease-out" style={{ top: cursor.y + 8, left: cursor.x + 8 }}>
        <MousePointer2 className="size-9 fill-black text-lime drop-shadow-[0_8px_18px_rgba(0,0,0,0.35)]" />
      </div>
      <div
        data-tutorial-control
        className="pointer-events-auto absolute w-[min(360px,calc(100vw-36px))] rounded-3xl border border-white/70 bg-white/95 p-4 shadow-2xl shadow-black/25 backdrop-blur-xl transition-all duration-500"
        style={cardPosition}
      >
        <div className="flex items-start justify-between gap-3">
          <div>
            <div className="text-[10px] font-black uppercase tracking-[0.16em] text-zinc-400">{lesson.label} Guide · {progress}</div>
            <h2 className="mt-1 text-xl font-black tracking-[-0.05em]">{step.title}</h2>
          </div>
          <span className={cn("rounded-full px-2.5 py-1 text-[10px] font-black uppercase tracking-[0.1em]", step.action === "type" ? "bg-lime text-black" : "bg-black text-lime")}>{step.action ?? "point"}</span>
        </div>
        <p className="mt-2 min-h-12 text-sm font-semibold leading-relaxed text-zinc-600">
          <TypewriterText key={stepIndex} text={step.body} />
        </p>
        <div className="mt-4 flex items-center justify-between gap-2">
          <Button type="button" variant="outline" size="sm" className="rounded-xl bg-white text-xs font-black hover:bg-white" onClick={restart}>
            <RotateCcw className="size-3.5" />
            Replay
          </Button>
          <div className="flex gap-2">
            <Button type="button" variant="outline" size="sm" className="rounded-xl bg-white px-3 text-xs font-black hover:bg-white" onClick={() => setIsRunning((current) => !current)}>
              {isRunning ? <Pause className="size-3.5" /> : <Play className="size-3.5" />}
              {isRunning ? "Pause" : "Play"}
            </Button>
            <Button type="button" size="sm" className="rounded-xl bg-black px-3 text-xs font-black text-white hover:bg-black" onClick={nextStep}>
              <SkipForward className="size-3.5" />
              Next
            </Button>
          </div>
        </div>
      </div>
    </div>
  );
}

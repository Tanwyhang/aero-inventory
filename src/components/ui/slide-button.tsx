"use client";

import { forwardRef, useCallback, useMemo, useRef, useState, type JSX } from "react";
import { AnimatePresence, motion, useMotionValue, useSpring, useTransform, type PanInfo } from "motion/react";
import { Check, ChevronRight, Loader2, X } from "lucide-react";

import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";

const DRAG_CONSTRAINTS = { left: 0, right: 155 };
const DRAG_THRESHOLD = 0.9;
const BUTTON_STATES = {
  initial: { width: "16rem" },
  completed: { width: "10rem" },
};
const ANIMATION_CONFIG = {
  spring: {
    type: "spring" as const,
    stiffness: 400,
    damping: 40,
    mass: 0.8,
  },
};

const DOT_MATRIX_POINTS = [
  { x: 0, y: 0, delay: 0 },
  { x: 1, y: 0, delay: 0.08 },
  { x: 2, y: 0, delay: 0.16 },
  { x: 1, y: 1, delay: 0.24 },
  { x: 2, y: 1, delay: 0.32 },
  { x: 3, y: 1, delay: 0.4 },
  { x: 2, y: 2, delay: 0.48 },
] as const;

function DotMatrixIcon() {
  return (
    <div className="grid h-4 w-4 grid-cols-4 grid-rows-3 place-items-center" aria-hidden="true">
      {DOT_MATRIX_POINTS.map((point) => (
        <motion.span
          key={`${point.x}-${point.y}`}
          className="block h-1 w-1 rounded-full bg-current"
          style={{ gridColumnStart: point.x + 1, gridRowStart: point.y + 1 }}
          animate={{ opacity: [0.35, 1, 0.35], scale: [0.85, 1.15, 0.85] }}
          transition={{ duration: 1.1, repeat: Number.POSITIVE_INFINITY, ease: "easeInOut", delay: point.delay }}
        />
      ))}
    </div>
  );
}

function StatusIcon({ status }: { status: "loading" | "success" | "error" }) {
  const iconMap: Record<typeof status, JSX.Element> = useMemo(
    () => ({
      loading: <Loader2 className="animate-spin" size={20} />,
      success: <Check size={20} />,
      error: <X size={20} />,
    }),
    [],
  );

  return (
    <motion.div key={status} initial={{ opacity: 0, scale: 0.5 }} animate={{ opacity: 1, scale: 1 }} exit={{ opacity: 0 }}>
      {iconMap[status]}
    </motion.div>
  );
}

export interface SlideButtonProps extends Omit<React.ComponentProps<"button">, "onComplete"> {
  onComplete?: () => void | Promise<void>;
}

export const SlideButton = forwardRef<HTMLButtonElement, SlideButtonProps>(function SlideButton({ className, onComplete, disabled, ...props }, ref) {
  const [isDragging, setIsDragging] = useState(false);
  const [completed, setCompleted] = useState(false);
  const [status, setStatus] = useState<"idle" | "loading" | "success" | "error">("idle");
  const dragHandleRef = useRef<HTMLDivElement | null>(null);
  const dragX = useMotionValue(0);
  const springX = useSpring(dragX, ANIMATION_CONFIG.spring);
  const dragProgress = useTransform(springX, [0, DRAG_CONSTRAINTS.right], [0, 1]);
  const adjustedWidth = useTransform(springX, (x: number) => x + 10);

  const handleSubmit = useCallback(async () => {
    setStatus("loading");
    try {
      await onComplete?.();
      setStatus("success");
    } catch {
      setStatus("error");
      setCompleted(false);
      dragX.set(0);
    }
  }, [dragX, onComplete]);

  function complete() {
    if (completed || disabled) return;
    setCompleted(true);
    void handleSubmit();
  }

  function handleDragEnd() {
    if (completed || disabled) return;
    setIsDragging(false);

    if (dragProgress.get() >= DRAG_THRESHOLD) complete();
    else dragX.set(0);
  }

  function handleDrag(_event: MouseEvent | TouchEvent | PointerEvent, info: PanInfo) {
    if (completed || disabled) return;
    dragX.set(Math.max(0, Math.min(info.offset.x, DRAG_CONSTRAINTS.right)));
  }

  return (
    <motion.div
      animate={completed ? BUTTON_STATES.completed : BUTTON_STATES.initial}
      transition={ANIMATION_CONFIG.spring}
      className="shadow-button-inset relative flex h-16 items-center justify-center rounded-full bg-zinc-100"
    >
      {!completed ? <motion.div style={{ width: adjustedWidth }} className="absolute inset-y-0 left-0 z-0 rounded-full bg-lime" /> : null}
      <AnimatePresence>
        {!completed ? (
          <motion.div
            ref={dragHandleRef}
            drag="x"
            dragConstraints={DRAG_CONSTRAINTS}
            dragElastic={0.05}
            dragMomentum={false}
            onDragStart={() => !disabled && setIsDragging(true)}
            onDragEnd={handleDragEnd}
            onDrag={handleDrag}
            style={{ x: springX }}
              className="absolute -left-5 z-10 flex cursor-grab items-center justify-start active:cursor-grabbing"
          >
            <Button
              ref={ref}
              type="button"
              disabled={disabled || status === "loading"}
              aria-label="Slide to confirm"
              onKeyDown={(event) => {
                if (event.key === "Enter" || event.key === " ") complete();
              }}
              {...props}
              size="icon"
              className={cn("shadow-button size-16 rounded-full bg-black text-lime drop-shadow-xl hover:bg-black", isDragging && "scale-105 transition-transform", className)}
            >
              <DotMatrixIcon />
            </Button>
          </motion.div>
        ) : null}
      </AnimatePresence>
      <AnimatePresence>
        {completed ? (
          <motion.div className="absolute inset-0 flex items-center justify-center" initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}>
            <Button disabled={status === "loading"} className={cn("size-full rounded-full bg-black text-lime transition-all duration-300 hover:bg-black", className)}>
              <AnimatePresence mode="wait">{status !== "idle" ? <StatusIcon status={status} /> : null}</AnimatePresence>
            </Button>
          </motion.div>
        ) : null}
      </AnimatePresence>
      {!completed ? (
        <span className="pointer-events-none absolute inset-0 flex items-center justify-center gap-2 pl-12 text-sm font-black uppercase tracking-[0.14em] text-black/65">
          Confirm
          <span className="flex items-center text-black/45">
            <ChevronRight className="size-4" />
            <ChevronRight className="-ml-2 size-4" />
            <ChevronRight className="-ml-2 size-4" />
          </span>
        </span>
      ) : null}
    </motion.div>
  );
});

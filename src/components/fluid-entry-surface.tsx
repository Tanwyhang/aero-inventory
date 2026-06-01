"use client";

import {
  forwardRef,
  useLayoutEffect,
  useRef,
  useState,
  type ComponentPropsWithoutRef,
  type ForwardedRef,
  type ReactNode,
} from "react";
import { motion, useReducedMotion, type HTMLMotionProps } from "motion/react";

import { cn } from "@/lib/utils";

const MORPH_EASE = [0.22, 1, 0.36, 1] as const;

interface FluidEntrySurfaceProps extends Omit<ComponentPropsWithoutRef<"div">, "children"> {
  children: ReactNode;
  contentClassName?: string;
  wrapperClassName?: string;
  collapsedWidth?: number;
  collapsedRadius?: number;
  entryDelay?: number;
  radius?: number;
}

function assignRefs<T>(node: T | null, ...refs: Array<ForwardedRef<T> | undefined>) {
  refs.forEach((ref) => {
    if (!ref) return;
    if (typeof ref === "function") {
      ref(node);
      return;
    }
    ref.current = node;
  });
}

export const FluidEntrySurface = forwardRef<HTMLDivElement, FluidEntrySurfaceProps>(function FluidEntrySurface(
  {
    children,
    className,
    contentClassName,
    wrapperClassName,
    collapsedWidth = 48,
    collapsedRadius = 999,
    entryDelay = 0,
    radius = 24,
    style,
    ...props
  },
  forwardedRef,
) {
  const shouldReduceMotion = useReducedMotion();
  const wrapperRef = useRef<HTMLDivElement>(null);
  const containerRef = useRef<HTMLDivElement>(null);
  const [targetWidth, setTargetWidth] = useState<number | null>(null);

  useLayoutEffect(() => {
    const wrapper = wrapperRef.current;
    const container = containerRef.current;
    if (!wrapper || !container) return;

    const updateWidth = () => {
      const maxWidth = window.getComputedStyle(container).maxWidth;
      const maxWidthValue = maxWidth === "none" ? Number.POSITIVE_INFINITY : parseFloat(maxWidth);
      const measuredWidth = wrapper.clientWidth || wrapper.getBoundingClientRect().width;
      const nextWidth = Math.ceil(Math.min(measuredWidth, maxWidthValue));

      if (nextWidth <= 1) {
        requestAnimationFrame(updateWidth);
        return;
      }

      setTargetWidth((currentWidth) => (currentWidth === nextWidth ? currentWidth : nextWidth));
    };

    updateWidth();

    const observer = new ResizeObserver(updateWidth);
    observer.observe(wrapper);

    return () => observer.disconnect();
  }, []);

  const width = targetWidth ?? collapsedWidth;

  return (
    <div ref={wrapperRef} className={cn("w-full", wrapperClassName)}>
      <motion.div
        ref={(node) => assignRefs(node, containerRef, forwardedRef)}
        initial={shouldReduceMotion ? false : { width: collapsedWidth, opacity: 0, borderRadius: collapsedRadius }}
        animate={{ width, opacity: targetWidth === null ? 0 : 1, borderRadius: radius }}
        transition={
          shouldReduceMotion
            ? { duration: 0 }
            : {
                width: { duration: 1.2, ease: MORPH_EASE, delay: entryDelay },
                opacity: { duration: 0.2, ease: "easeOut", delay: entryDelay },
                borderRadius: { duration: 1.2, ease: MORPH_EASE, delay: entryDelay },
              }
        }
        className={cn("mx-auto overflow-hidden", className)}
        style={{ ...style, willChange: "width, opacity, border-radius" }}
        {...(props as HTMLMotionProps<"div">)}
      >
        <motion.div
          initial={shouldReduceMotion ? false : { opacity: 0, x: 12, filter: "blur(6px)" }}
          animate={{
            opacity: targetWidth === null ? 0 : 1,
            x: targetWidth === null ? 12 : 0,
            filter: targetWidth === null ? "blur(6px)" : "blur(0px)",
          }}
          transition={shouldReduceMotion ? { duration: 0 } : { duration: 0.34, ease: MORPH_EASE, delay: entryDelay + 0.24 }}
          className={cn("min-h-full", contentClassName)}
          style={{ width: targetWidth ?? undefined, willChange: "transform, opacity, filter" }}
        >
          {children}
        </motion.div>
      </motion.div>
    </div>
  );
});

FluidEntrySurface.displayName = "FluidEntrySurface";

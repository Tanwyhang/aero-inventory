"use client";

import {
  forwardRef,
  type ComponentPropsWithoutRef,
  type ReactNode,
} from "react";
import { motion, useReducedMotion, type HTMLMotionProps } from "motion/react";

import { cn } from "@/lib/utils";

const MORPH_EASE = [0.16, 1, 0.3, 1] as const;

interface FluidEntrySurfaceProps extends Omit<ComponentPropsWithoutRef<"div">, "children"> {
  children: ReactNode;
  contentClassName?: string;
  wrapperClassName?: string;
  entryDelay?: number;
}

export const FluidEntrySurface = forwardRef<HTMLDivElement, FluidEntrySurfaceProps>(function FluidEntrySurface(
  {
    children,
    className,
    contentClassName,
    wrapperClassName,
    entryDelay = 0,
    style,
    ...props
  },
  forwardedRef,
) {
  const shouldReduceMotion = useReducedMotion();

  return (
    <div className={cn("w-full", wrapperClassName)}>
      <motion.div
        ref={forwardedRef}
        initial={shouldReduceMotion ? false : { opacity: 0, y: 8 }}
        animate={shouldReduceMotion ? undefined : { opacity: 1, y: 0 }}
        transition={shouldReduceMotion ? { duration: 0 } : { duration: 0.22, ease: MORPH_EASE, delay: entryDelay }}
        className={cn("mx-auto overflow-hidden", className)}
        style={style}
        {...(props as HTMLMotionProps<"div">)}
      >
        <div className={cn("min-h-full", contentClassName)}>
          {children}
        </div>
      </motion.div>
    </div>
  );
});

FluidEntrySurface.displayName = "FluidEntrySurface";

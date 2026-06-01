"use client";

import { type HTMLAttributes } from "react";
import { motion } from "motion/react";

import { cn } from "@/lib/utils";

type GlowingBadgeVariant =
  | "default"
  | "success"
  | "warning"
  | "error"
  | "info"
  | "neutral";

interface GlowingBadgeProps extends HTMLAttributes<HTMLSpanElement> {
  variant?: GlowingBadgeVariant;
  pulse?: boolean;
  dot?: boolean;
}

const variantStyles: Record<
  GlowingBadgeVariant,
  { badge: string; glow: string; dot: string }
> = {
  default: {
    badge: "bg-foreground text-background",
    glow: "bg-foreground/30",
    dot: "bg-background",
  },
  neutral: {
    badge: "border-muted bg-muted text-foreground",
    glow: "bg-foreground/30",
    dot: "bg-foreground",
  },
  success: {
    badge: "bg-lime text-black",
    glow: "bg-lime",
    dot: "bg-black",
  },
  warning: {
    badge: "bg-orange text-white",
    glow: "bg-orange",
    dot: "bg-white",
  },
  error: {
    badge: "bg-red-500 text-white",
    glow: "bg-red-500",
    dot: "bg-white",
  },
  info: {
    badge: "bg-blue-500 text-blue-50",
    glow: "bg-blue-500",
    dot: "bg-blue-50",
  },
};

function GlowingBadge({
  variant = "default",
  pulse = true,
  dot = true,
  children,
  className,
  ...props
}: GlowingBadgeProps) {
  const styles = variantStyles[variant];

  return (
    <span className="relative inline-flex">
      <span
        className={cn(
          "relative inline-flex items-center gap-1.5 rounded-md px-3 py-1 text-xs font-bold",
          styles.badge,
          className,
        )}
        {...props}
      >
        {dot ? (
          <span className="relative flex size-1.5 shrink-0">
            {pulse ? (
              <motion.span
                className={cn("absolute inline-flex size-full rounded-full", styles.dot)}
                animate={{ scale: [1, 2.5, 1], opacity: [0.75, 0, 0.75] }}
                transition={{ duration: 2, repeat: Infinity, ease: "easeInOut" }}
              />
            ) : null}
            <span className={cn("relative inline-flex size-1.5 rounded-full", styles.dot)} />
          </span>
        ) : null}
        {children}
      </span>
    </span>
  );
}

export { GlowingBadge };
export type { GlowingBadgeProps, GlowingBadgeVariant };

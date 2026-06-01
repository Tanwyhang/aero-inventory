"use client";

import * as React from "react";
import { motion, type TargetAndTransition, type Transition } from "motion/react";
import { type VariantProps } from "class-variance-authority";

import { Button, buttonVariants } from "@/components/ui/button";
import { cn } from "@/lib/utils";

type ButtonProps = React.ComponentPropsWithoutRef<"button"> &
  VariantProps<typeof buttonVariants> & { asChild?: boolean };

type GlowMode = "rotate" | "pulse" | "breathe" | "colorShift" | "flowHorizontal" | "static";
type GlowBlur =
  | number
  | "softest"
  | "soft"
  | "medium"
  | "strong"
  | "stronger"
  | "strongest"
  | "none";

const blurPresets: Record<string, string> = {
  softest: "blur-xs",
  soft: "blur-sm",
  medium: "blur-md",
  strong: "blur-lg",
  stronger: "blur-xl",
  strongest: "blur-2xl",
  none: "blur-none",
};

function blurClass(blur: GlowBlur) {
  if (typeof blur === "number") return `blur-[${blur}px]`;
  return blurPresets[blur] ?? "blur-md";
}

interface GlowEffectInnerProps {
  colors?: string[];
  mode?: GlowMode;
  blur?: GlowBlur;
  scale?: number;
  duration?: number;
  transition?: Transition;
  className?: string;
}

function GlowEffectLayer({
  colors = ["#a7f900", "#c4ff00", "#8cff00", "#edff00"],
  mode = "rotate",
  blur = "strong",
  scale = 1,
  duration = 5,
  transition,
  className,
}: GlowEffectInnerProps) {
  const base: Transition = { repeat: Infinity, duration, ease: "linear" };
  const animations: Record<GlowMode, TargetAndTransition> = {
    rotate: {
      background: [
        `conic-gradient(from 0deg at 50% 50%, ${colors.join(", ")})`,
        `conic-gradient(from 360deg at 50% 50%, ${colors.join(", ")})`,
      ],
      transition: transition ?? base,
    },
    pulse: {
      background: colors.map((color) => `radial-gradient(circle at 50% 50%, ${color} 0%, transparent 100%)`),
      scale: [scale, scale * 1.1, scale],
      opacity: [0.5, 0.8, 0.5],
      transition: transition ?? { ...base, repeatType: "mirror" },
    },
    breathe: {
      background: colors.map((color) => `radial-gradient(circle at 50% 50%, ${color} 0%, transparent 100%)`),
      scale: [scale, scale * 1.05, scale],
      transition: transition ?? { ...base, repeatType: "mirror" },
    },
    colorShift: {
      background: colors.map((color, index) => {
        const next = colors[(index + 1) % colors.length];
        return `conic-gradient(from 0deg at 50% 50%, ${color} 0%, ${next} 50%, ${color} 100%)`;
      }),
      transition: transition ?? { ...base, repeatType: "mirror" },
    },
    flowHorizontal: {
      background: colors.map((color, index) => {
        const next = colors[(index + 1) % colors.length];
        return `linear-gradient(to right, ${color}, ${next})`;
      }),
      transition: transition ?? { ...base, repeatType: "mirror" },
    },
    static: {
      background: `linear-gradient(to right, ${colors.join(", ")})`,
    },
  };

  return (
    <motion.div
      animate={animations[mode]}
      style={{ "--scale": scale, willChange: "transform" } as React.CSSProperties}
      className={cn(
        "pointer-events-none absolute inset-0 size-full scale-[var(--scale)] transform-gpu",
        blurClass(blur),
        className,
      )}
    />
  );
}

export interface GlowButtonProps extends ButtonProps {
  mode?: GlowMode;
  colors?: string[];
  blur?: GlowBlur;
  duration?: number;
  glowScale?: number;
  wrapperClassName?: string;
}

export function GlowButton({
  mode = "rotate",
  colors = ["#a7f900", "#d8ff00", "#95ff00", "#f6ff00"],
  blur = "strong",
  duration = 5,
  glowScale = 1,
  children,
  className,
  wrapperClassName,
  disabled,
  variant,
  size,
  asChild,
  ...props
}: GlowButtonProps) {
  return (
    <motion.div
      className={cn("relative inline-flex", disabled && "pointer-events-none opacity-50", wrapperClassName)}
      initial="idle"
      whileHover="hovered"
    >
      <motion.div
        className="absolute inset-0"
        variants={{ idle: { scale: glowScale }, hovered: { scale: glowScale * 1.05 } }}
        transition={{ type: "spring", stiffness: 300, damping: 20 }}
      >
        <GlowEffectLayer colors={colors} mode={mode} blur={blur} duration={duration} />
      </motion.div>
      <Button
        variant={variant}
        size={size}
        asChild={asChild}
        disabled={disabled}
        className={cn("relative", className)}
        {...props}
      >
        {children}
      </Button>
    </motion.div>
  );
}

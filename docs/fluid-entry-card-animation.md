# Fluid Entry Cards, No-Shadow Frontend Pattern

This document describes the Workflo fluid card entry animation and no-shadow card style so other AI agents can reproduce it exactly.

This is intended to be self-contained. If an agent copies the prerequisites, CSS, component, and usage rules below, it should be able to reproduce the effect without needing extra project context.

## Required Stack And Dependencies

The canonical implementation assumes:

- React 18+ or React 19.
- Next.js App Router or any React environment that supports client components.
- TypeScript.
- Tailwind CSS utility classes.
- `framer-motion` for `motion` and `useReducedMotion`.
- A `cn()` class merge helper.
- Browser support for `ResizeObserver`.

Install dependency:

```bash
npm install framer-motion
```

If the codebase does not already have a `cn()` helper, add this:

```ts
// lib/utils.ts
import { clsx, type ClassValue } from "clsx";
import { twMerge } from "tailwind-merge";

export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs));
}
```

Install helper dependencies if needed:

```bash
npm install clsx tailwind-merge
```

If you do not want `clsx` and `tailwind-merge`, use this minimal fallback instead:

```ts
export function cn(...inputs: Array<string | false | null | undefined>) {
  return inputs.filter(Boolean).join(" ");
}
```

## Required Global CSS

Add these variables and utilities to the global stylesheet. In Workflo this lives in `app/globals.css`.

```css
:root {
  --ease-morph-entry: cubic-bezier(0.22, 1, 0.36, 1);
  --duration-morph-entry: 900ms;
  --ease-resize: cubic-bezier(0.22, 1, 0.36, 1);
  --duration-resize: 360ms;
}

@keyframes morphEntry {
  0% {
    opacity: 0;
    transform: translateY(8px);
  }
  62%,
  100% {
    opacity: 1;
    transform: translateY(0);
  }
}

.liquid-width-enter {
  animation: morphEntry var(--duration-morph-entry) var(--ease-morph-entry) both;
  will-change: transform, opacity;
}

body :where(script, style, template, svg, svg *, [hidden]) {
  animation: none;
  opacity: revert;
  will-change: auto;
}

@media (prefers-reduced-motion: reduce) {
  *, * > * {
    animation: none !important;
    transition: none !important;
    opacity: 1;
    -webkit-mask-image: none !important;
    mask-image: none !important;
  }
}
```

The `body :where(...)` rule prevents accidental animation leakage onto non-visual or hidden elements. The reduced-motion rule is intentionally broad in Workflo; if another app has stricter requirements, scope it to the animated card subtree.

## Tailwind Assumptions

The examples use Tailwind utilities such as:

- `rounded-2xl`, `rounded-3xl`
- `border`, `border-white/30`, `dark:border-slate-800/40`
- `bg-white/60`, `dark:bg-slate-900/40`
- `backdrop-blur-lg`, `backdrop-blur-2xl`
- `transition-all`, `hover:border-gray-300`
- `text-slate-*`, `dark:text-slate-*`

If another codebase is not using Tailwind, reproduce these as plain CSS:

```css
.fluid-card-shell {
  overflow: hidden;
  border-radius: 24px;
  border: 1px solid rgba(255, 255, 255, 0.3);
  background: rgba(255, 255, 255, 0.6);
  backdrop-filter: blur(40px);
  box-shadow: none;
}

@media (prefers-color-scheme: dark) {
  .fluid-card-shell {
    border-color: rgba(30, 41, 59, 0.4);
    background: rgba(15, 23, 42, 0.4);
  }
}
```

## Visual Goal

Create cards and panels that feel like they are expanding into place instead of popping in. The surface should feel soft, liquid, and modern without relying on drop shadows.

Use this pattern for workspace panels, AI config cards, side panels, and dashboard-like cards where the UI should feel premium but not heavy.

## Core Principles

- Animate *width and border radius* for the outer shell.
- Fade and lightly blur-slide content after the shell begins expanding.
- Prefer borders, translucent fills, and backdrop blur over shadows.
- Avoid `shadow-lg`, `shadow-xl`, `shadow-2xl`, and neumorphic shadows for this variant.
- Use the same easing everywhere: `cubic-bezier(0.22, 1, 0.36, 1)`.
- Respect `prefers-reduced-motion`.
- Never rely on `height: auto` animation for the primary effect. Width/radius is the signature.
- Do not animate `box-shadow`; this pattern intentionally avoids shadow-driven depth.

## Timing

Use these exact values:

```css
--ease-morph-entry: cubic-bezier(0.22, 1, 0.36, 1);
--duration-morph-entry: 900ms;
```

Outer shell:

```ts
transition={shouldReduceMotion ? { duration: 0 } : {
  width: { duration: 0.9, ease: [0.22, 1, 0.36, 1] },
  opacity: { duration: 0.2, ease: "easeOut" },
  borderRadius: { duration: 0.9, ease: [0.22, 1, 0.36, 1] },
}}
```

Inner content:

```ts
transition={shouldReduceMotion ? { duration: 0 } : {
  duration: 0.34,
  ease: [0.22, 1, 0.36, 1],
  delay: 0.24,
}}
```

## Existing Implementation

The reusable implementation lives in `components/morph-surface.tsx`.

It works like this:

- A wrapper measures the real available width with `ResizeObserver`.
- The animated outer `motion.div` starts collapsed at `48px` wide with a pill radius.
- The outer shell expands to the measured width over `900ms`.
- Content fades in after `240ms`, moving from `x: 12` and `blur(6px)` to normal.
- The inner content gets an explicit measured `width` while revealing. This avoids content reflow jitter during the shell width animation.

## Canonical Component

Use this component shape when recreating the pattern in another codebase:

```tsx
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
import { motion, useReducedMotion, type HTMLMotionProps } from "framer-motion";

import { cn } from "@/lib/utils";

const MORPH_EASE = [0.22, 1, 0.36, 1] as const;

interface FluidEntrySurfaceProps extends Omit<ComponentPropsWithoutRef<"div">, "children"> {
  children: ReactNode;
  contentClassName?: string;
  wrapperClassName?: string;
  collapsedWidth?: number;
  collapsedRadius?: number;
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

export const FluidEntrySurface = forwardRef<HTMLDivElement, FluidEntrySurfaceProps>(function FluidEntrySurface({
  children,
  className,
  contentClassName,
  wrapperClassName,
  collapsedWidth = 48,
  collapsedRadius = 999,
  radius = 24,
  style,
  ...props
}, forwardedRef) {
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

      setTargetWidth((currentWidth) => currentWidth === nextWidth ? currentWidth : nextWidth);
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
        initial={shouldReduceMotion ? false : {
          width: collapsedWidth,
          opacity: 0,
          borderRadius: collapsedRadius,
        }}
        animate={{
          width,
          opacity: targetWidth === null ? 0 : 1,
          borderRadius: radius,
        }}
        transition={shouldReduceMotion ? { duration: 0 } : {
          width: { duration: 0.9, ease: MORPH_EASE },
          opacity: { duration: 0.2, ease: "easeOut" },
          borderRadius: { duration: 0.9, ease: MORPH_EASE },
        }}
        className={cn("overflow-hidden", className)}
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
          transition={shouldReduceMotion ? { duration: 0 } : {
            duration: 0.34,
            ease: MORPH_EASE,
            delay: 0.24,
          }}
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
```

Important implementation details:

- The file must be a client component because it uses layout measurement, `ResizeObserver`, and Framer Motion.
- Use `useLayoutEffect`, not `useEffect`, to reduce first-frame measurement flicker.
- The wrapper must be `w-full` so the component can measure intended layout width.
- The animated element must be `overflow-hidden` so content does not leak while collapsed.
- Keep `willChange` on the animated shell and content, but do not overuse it elsewhere.
- Keep `requestAnimationFrame(updateWidth)` for zero-width first paint cases.

## No-Shadow Card Recipe

Use this for cards inside the fluid surface:

```tsx
<FluidEntrySurface
  className="rounded-3xl border border-white/30 bg-white/60 backdrop-blur-2xl dark:border-slate-800/40 dark:bg-slate-900/40"
  contentClassName="h-full p-4"
>
  <div className="space-y-3">
    {/* card content */}
  </div>
</FluidEntrySurface>
```

Important styling rules:

- Use `border border-white/30` in light glassy contexts.
- Use `dark:border-slate-800/40` in dark mode.
- Use `bg-white/60` or `bg-white/40`, not opaque white unless the surrounding page needs it.
- Use `dark:bg-slate-900/40` or `dark:bg-slate-800/30`.
- Use `backdrop-blur-2xl` for main panels and `backdrop-blur-lg` for smaller cards.
- Use `rounded-2xl`, `rounded-3xl`, or explicit `radius={24}`.
- Do not add `shadow-*` classes for the no-shadow version.
- If visual separation is weak, increase border opacity or background opacity before adding shadows.
- If a shadow is absolutely required for product reasons, use a tiny hairline shadow only, not a large blurred shadow. That is no longer the pure no-shadow variant.

Recommended no-shadow main panel classes:

```txt
rounded-3xl border border-white/30 bg-white/60 backdrop-blur-2xl dark:border-slate-800/40 dark:bg-slate-900/40
```

Recommended no-shadow inner card classes:

```txt
rounded-xl border border-white/20 bg-white/40 backdrop-blur-lg dark:border-slate-700/40 dark:bg-slate-800/30
```

Recommended selected state classes:

```txt
border-indigo-500 bg-indigo-50 dark:bg-indigo-950/30
```

Recommended idle state classes:

```txt
border-gray-200 bg-white/30 hover:border-gray-300 hover:bg-white/40 dark:border-slate-700 dark:bg-slate-900/20 dark:hover:bg-slate-800/40
```

## Inner Card Style

For small option cards inside a panel:

```tsx
<button
  type="button"
  className={cn(
    "rounded-xl border-2 p-3 transition-all",
    isSelected
      ? "border-indigo-500 bg-indigo-50 dark:bg-indigo-950/30"
      : "border-gray-200 hover:border-gray-300 dark:border-slate-700"
  )}
>
  Content
</button>
```

Rules:

- Use border changes for state, not shadow changes.
- Keep hover subtle: `hover:border-gray-300`, `hover:bg-white/40`, or `hover:bg-slate-800/40`.
- Use colored backgrounds at low opacity for selected state.
- Keep radius high enough to feel soft: `rounded-xl` minimum.

## CSS Utility Variant

The project also has a simpler CSS-only entry utility:

```css
@keyframes morphEntry {
  0% {
    opacity: 0;
    transform: translateY(8px);
  }
  62%,
  100% {
    opacity: 1;
    transform: translateY(0);
  }
}

.liquid-width-enter {
  animation: morphEntry var(--duration-morph-entry) var(--ease-morph-entry) both;
  will-change: transform, opacity;
}
```

Use `liquid-width-enter` only for inner content or secondary blocks. For primary panels/cards, use the width-morph component.

Do not use `liquid-width-enter` on the same element that is being width-morphed by Framer Motion. Use it on an inner child only, otherwise the two animations can produce double opacity/transform effects.

## Example Layout

```tsx
<div className="grid gap-4 md:grid-cols-3">
  <FluidEntrySurface
    className="rounded-3xl border border-white/30 bg-white/60 backdrop-blur-2xl dark:border-slate-800/40 dark:bg-slate-900/40"
    contentClassName="p-5"
  >
    <div className="liquid-width-enter space-y-3">
      <p className="text-xs font-medium uppercase tracking-[0.12em] text-slate-500">Overview</p>
      <h3 className="text-lg font-semibold text-slate-900 dark:text-slate-100">Fluid card</h3>
      <p className="text-sm text-slate-500 dark:text-slate-400">
        This card enters by expanding its shell first, then revealing content.
      </p>
    </div>
  </FluidEntrySurface>
</div>
```

## Exact Workflo Usage Pattern

For a two-panel workspace layout, use this structure:

```tsx
<div className="flex h-full p-4 md:p-6">
  <div className="flex flex-1 overflow-hidden bg-background">
    <FluidEntrySurface
      wrapperClassName="w-80 shrink-0"
      className="h-full bg-background"
      contentClassName="h-full flex flex-col"
    >
      Left panel content
    </FluidEntrySurface>

    <FluidEntrySurface
      wrapperClassName="ml-4 min-w-0 flex-1"
      className="h-full min-w-0 overflow-hidden rounded-3xl border border-white/30 bg-white/60 backdrop-blur-2xl dark:border-slate-800/40 dark:bg-slate-900/40"
      contentClassName="h-full flex min-w-0 flex-col overflow-hidden"
    >
      Main panel content
    </FluidEntrySurface>
  </div>
</div>
```

For a right-side configuration panel that expands from a collapsed rail, use this variant. It animates only the left radii because the panel is docked to the right edge:

```tsx
const CONFIG_PANEL_COLLAPSED_WIDTH = 48;
const CONFIG_PANEL_OPEN_RADIUS = 24;
const CONFIG_PANEL_COLLAPSED_RADIUS = 999;
const MORPH_EASE = [0.22, 1, 0.36, 1] as const;

<motion.div
  initial={shouldReduceMotion ? false : {
    width: CONFIG_PANEL_COLLAPSED_WIDTH,
    opacity: 0,
    borderTopLeftRadius: CONFIG_PANEL_COLLAPSED_RADIUS,
    borderBottomLeftRadius: CONFIG_PANEL_COLLAPSED_RADIUS,
  }}
  animate={{
    width: configPanelWidth ?? CONFIG_PANEL_COLLAPSED_WIDTH,
    opacity: configPanelWidth === null ? 0 : 1,
    borderTopLeftRadius: CONFIG_PANEL_OPEN_RADIUS,
    borderBottomLeftRadius: CONFIG_PANEL_OPEN_RADIUS,
  }}
  transition={shouldReduceMotion ? { duration: 0 } : {
    width: { duration: 0.9, ease: MORPH_EASE },
    opacity: { duration: 0.2, ease: "easeOut" },
    borderTopLeftRadius: { duration: 0.9, ease: MORPH_EASE },
    borderBottomLeftRadius: { duration: 0.9, ease: MORPH_EASE },
  }}
  className="shrink-0 overflow-hidden rounded-l-2xl border-l border-white/30 bg-white/60 backdrop-blur-2xl dark:border-slate-800/40 dark:bg-slate-900/40"
>
  <motion.div
    initial={shouldReduceMotion ? false : { opacity: 0, x: 12, filter: "blur(6px)" }}
    animate={{
      opacity: configPanelWidth === null ? 0 : 1,
      x: configPanelWidth === null ? 12 : 0,
      filter: configPanelWidth === null ? "blur(6px)" : "blur(0px)",
    }}
    transition={shouldReduceMotion ? { duration: 0 } : { duration: 0.34, ease: MORPH_EASE, delay: 0.24 }}
    className="h-full w-[clamp(380px,40vw,560px)] flex flex-col"
  >
    Panel content
  </motion.div>
</motion.div>
```

## Complete Minimal Page Example

This is a full working example assuming `FluidEntrySurface`, `cn`, Tailwind, and global CSS are installed.

```tsx
"use client";

import { FluidEntrySurface } from "@/components/fluid-entry-surface";
import { cn } from "@/lib/utils";

const OPTIONS = ["Reactive", "Balanced", "Proactive"];

export function FluidCardDemo() {
  const selected = "Balanced";

  return (
    <section className="min-h-screen bg-slate-100 p-6 text-slate-950 dark:bg-slate-950 dark:text-slate-50">
      <div className="mx-auto grid max-w-5xl gap-4 md:grid-cols-[320px_1fr]">
        <FluidEntrySurface
          className="rounded-3xl border border-white/30 bg-white/60 backdrop-blur-2xl dark:border-slate-800/40 dark:bg-slate-900/40"
          contentClassName="p-5"
        >
          <div className="liquid-width-enter space-y-3">
            <p className="text-xs font-medium uppercase tracking-[0.12em] text-slate-500">Controls</p>
            {OPTIONS.map((option) => {
              const isSelected = option === selected;
              return (
                <button
                  key={option}
                  type="button"
                  className={cn(
                    "w-full rounded-xl border p-3 text-left text-sm transition-all",
                    isSelected
                      ? "border-indigo-500 bg-indigo-50 dark:bg-indigo-950/30"
                      : "border-gray-200 bg-white/30 hover:border-gray-300 hover:bg-white/40 dark:border-slate-700 dark:bg-slate-900/20 dark:hover:bg-slate-800/40",
                  )}
                >
                  {option}
                </button>
              );
            })}
          </div>
        </FluidEntrySurface>

        <FluidEntrySurface
          className="rounded-3xl border border-white/30 bg-white/60 backdrop-blur-2xl dark:border-slate-800/40 dark:bg-slate-900/40"
          contentClassName="p-6"
        >
          <div className="liquid-width-enter space-y-4">
            <p className="text-xs font-medium uppercase tracking-[0.12em] text-slate-500">Preview</p>
            <h1 className="text-2xl font-semibold">No-shadow fluid entry card</h1>
            <p className="max-w-xl text-sm leading-6 text-slate-500 dark:text-slate-400">
              The shell expands from a small rounded rail into its measured width. Content waits briefly,
              then resolves from a blurred offset into place.
            </p>
          </div>
        </FluidEntrySurface>
      </div>
    </section>
  );
}
```

## Design Tokens To Preserve

Preserve these values for a faithful replica:

| Token | Value | Purpose |
| --- | --- | --- |
| Easing | `[0.22, 1, 0.36, 1]` / `cubic-bezier(0.22, 1, 0.36, 1)` | Liquid deceleration |
| Shell duration | `0.9s` / `900ms` | Main expansion |
| Content duration | `0.34s` / `340ms` | Reveal timing |
| Content delay | `0.24s` / `240ms` | Lets shell lead content |
| Collapsed width | `48px` | Rail/pill start width |
| Collapsed radius | `999px` | Pill start shape |
| Open radius | `24px` | Final panel/card radius |
| Content offset | `x: 12px` | Slight directional resolve |
| Content blur | `blur(6px)` | Soft focus reveal |

## Common Failure Modes

- If content flashes before the shell expands, ensure content opacity depends on `targetWidth === null` and has a `0.24s` delay.
- If width animates to `0`, ensure the wrapper has a real layout width and keep the `requestAnimationFrame(updateWidth)` retry.
- If content wraps during animation, ensure the inner content has `style={{ width: targetWidth ?? undefined }}`.
- If the card feels heavy, remove `shadow-*` and increase border/background opacity instead.
- If animation feels generic, check the easing. Most anomalies come from using default `ease` or a `0.2s` duration.
- If reduced-motion users still see animation, verify both Framer `useReducedMotion()` and CSS `prefers-reduced-motion` are wired.
- If layout jumps after async content loads, keep `ResizeObserver` attached to the wrapper so the target width updates.
- If nested cards look too flat, use selected/hover border states and subtle translucent backgrounds, not shadows.

## Do Not Do This

Avoid these patterns when reproducing this effect:

```tsx
// Too generic and heavy
<div className="rounded-xl bg-white shadow-xl animate-in fade-in slide-in-from-bottom-4" />

// Wrong easing and too fast
<motion.div initial={{ opacity: 0, y: 20 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: 0.2 }} />

// Shadow-based visual hierarchy instead of border/glass hierarchy
<div className="rounded-2xl bg-white shadow-2xl" />
```

## Checklist For Agents

- Use `MorphSurface` or the `FluidEntrySurface` equivalent for primary cards.
- Keep the collapsed width at `48px` and collapsed radius at `999px` unless there is a strong reason not to.
- Use `900ms` for shell width/radius animation.
- Use `340ms` for content reveal with `240ms` delay.
- Use `[0.22, 1, 0.36, 1]` easing.
- Remove card shadows for the no-shadow variant.
- Use borders, low-opacity backgrounds, and backdrop blur for depth.
- Confirm reduced-motion users get no animation.
- Include `framer-motion`, `cn`, CSS variables, keyframes, and Tailwind/glass classes before claiming the effect is replicated.

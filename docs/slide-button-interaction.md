# SlideButton Drag-To-Confirm Interaction

This document is a self-contained implementation spec for the Workflo `SlideButton` interaction. It includes all source code, dependencies, styling assumptions, behavior rules, and integration examples needed for another AI agent to reproduce the component without gaps.

## Visual Goal

Create a compact drag-to-confirm button that requires deliberate horizontal sliding before executing a sensitive action. The interaction should feel tactile and spring-loaded:

- A rounded pill track sits behind the control.
- A circular drag handle starts slightly outside the left edge.
- Dragging fills the track with an accent color.
- Releasing before the threshold springs the handle back.
- Releasing past the threshold collapses the track width, shows a loading state, then a success or error icon.
- The handle uses a small animated dot-matrix mark instead of text.

Use this for irreversible or high-friction actions such as enabling autopilot, confirming outbound sends, logout confirmation, destructive confirmation, or privileged operations.

## Required Stack And Dependencies

The canonical implementation assumes:

- React 18+ or React 19.
- TypeScript.
- Tailwind CSS.
- `framer-motion` for drag, springs, transforms, and `AnimatePresence`.
- `lucide-react` for status icons.
- A shadcn-style `Button` primitive.
- A `cn()` class merge helper.

Install dependencies:

```bash
npm install framer-motion lucide-react clsx tailwind-merge class-variance-authority @radix-ui/react-slot
```

If the target codebase already has `framer-motion`, `lucide-react`, shadcn `Button`, and `cn`, do not reinstall duplicates.

## Required `cn()` Helper

```ts
// lib/utils.ts
import { clsx, type ClassValue } from "clsx";
import { twMerge } from "tailwind-merge";

export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs));
}
```

Minimal fallback if `clsx` and `tailwind-merge` are not available:

```ts
export function cn(...inputs: Array<string | false | null | undefined>) {
  return inputs.filter(Boolean).join(" ");
}
```

## Required Button Primitive

The Workflo implementation uses this shadcn-compatible button. If the app already has one, use the existing version.

```tsx
// components/ui/button.tsx
import * as React from "react";
import { Slot } from "@radix-ui/react-slot";
import { cva, type VariantProps } from "class-variance-authority";

import { cn } from "@/lib/utils";

const buttonVariants = cva(
  "inline-flex items-center justify-center gap-2 whitespace-nowrap rounded-md text-sm font-medium transition-colors focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring disabled:pointer-events-none disabled:opacity-50 [&_svg]:pointer-events-none [&_svg]:size-4 [&_svg]:shrink-0",
  {
    variants: {
      variant: {
        default: "bg-primary text-primary-foreground shadow hover:bg-primary/90",
        destructive: "bg-destructive text-destructive-foreground shadow-sm hover:bg-destructive/90",
        outline: "border border-input bg-background shadow-sm hover:bg-accent hover:text-accent-foreground",
        secondary: "bg-secondary text-secondary-foreground shadow-sm hover:bg-secondary/80",
        ghost: "hover:bg-accent hover:text-accent-foreground",
        link: "text-primary underline-offset-4 hover:underline",
      },
      size: {
        default: "h-9 px-4 py-2",
        sm: "h-8 rounded-md px-3 text-xs",
        lg: "h-10 rounded-md px-8",
        icon: "h-9 w-9",
      },
    },
    defaultVariants: {
      variant: "default",
      size: "default",
    },
  },
);

export interface ButtonProps
  extends React.ButtonHTMLAttributes<HTMLButtonElement>,
    VariantProps<typeof buttonVariants> {
  asChild?: boolean;
}

const Button = React.forwardRef<HTMLButtonElement, ButtonProps>(
  ({ className, variant, size, asChild = false, ...props }, ref) => {
    const Comp = asChild ? Slot : "button";
    return (
      <Comp
        className={cn(buttonVariants({ variant, size, className }))}
        ref={ref}
        {...props}
      />
    );
  },
);

Button.displayName = "Button";

export { Button, buttonVariants };
```

## Required Styling Tokens

The component uses these Tailwind classes:

- `bg-gray-200`, `dark:bg-gray-800` for the track.
- `bg-accent` for the fill.
- `rounded-full` for track and handle.
- `drop-shadow-xl`, `shadow-button`, `shadow-button-inset`, `dark:shadow-button-inset-dark` for the tactile look.

Workflo currently references custom shadow class names (`shadow-button`, `shadow-button-inset`, `shadow-button-inset-dark`). If the target Tailwind config does not define them, add equivalent CSS utilities:

```css
.shadow-button {
  box-shadow:
    0 10px 22px rgba(15, 23, 42, 0.18),
    inset 0 1px 0 rgba(255, 255, 255, 0.22);
}

.shadow-button-inset {
  box-shadow:
    inset 0 1px 2px rgba(255, 255, 255, 0.7),
    inset 0 -2px 5px rgba(15, 23, 42, 0.12);
}

.dark .dark\:shadow-button-inset-dark {
  box-shadow:
    inset 0 1px 2px rgba(255, 255, 255, 0.08),
    inset 0 -2px 5px rgba(0, 0, 0, 0.45);
}
```

If the target project uses Tailwind v4 with CSS-first utilities, include those in a global stylesheet. If it uses Tailwind v3, define equivalent `boxShadow` values in `tailwind.config` instead.

## Interaction Constants

Preserve these values for a faithful replica:

```ts
const DRAG_CONSTRAINTS = { left: 0, right: 155 };
const DRAG_THRESHOLD = 0.9;

const BUTTON_STATES = {
  initial: { width: "12rem" },
  completed: { width: "8rem" },
};

const ANIMATION_CONFIG = {
  spring: {
    type: "spring" as const,
    stiffness: 400,
    damping: 40,
    mass: 0.8,
  },
};
```

Behavior derived from these constants:

- Track starts at `12rem` wide.
- Drag handle can move `155px` to the right.
- Completion threshold is `90%` of the drag range.
- Completed track shrinks to `8rem`.
- Spring is stiff and controlled, not bouncy.

## Complete Source Code

Copy this into `components/ui/slide-button.tsx`.

```tsx
"use client";

import React, {
  forwardRef,
  useCallback,
  useMemo,
  useRef,
  useState,
  type JSX,
} from "react";
import {
  AnimatePresence,
  motion,
  useMotionValue,
  useSpring,
  useTransform,
  type PanInfo,
} from "framer-motion";
import { Check, Loader2, X } from "lucide-react";

import { cn } from "@/lib/utils";
import { Button, type ButtonProps } from "@/components/ui/button";

const DRAG_CONSTRAINTS = { left: 0, right: 155 };
const DRAG_THRESHOLD = 0.9;

const BUTTON_STATES = {
  initial: { width: "12rem" },
  completed: { width: "8rem" },
};

const ANIMATION_CONFIG = {
  spring: {
    type: "spring" as const,
    stiffness: 400,
    damping: 40,
    mass: 0.8,
  },
};

type StatusIconProps = {
  status: string;
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
    <div
      className="grid h-4 w-4 grid-cols-4 grid-rows-3 place-items-center"
      aria-hidden="true"
    >
      {DOT_MATRIX_POINTS.map((point) => (
        <motion.span
          key={`${point.x}-${point.y}`}
          className="block h-1 w-1 rounded-full bg-current"
          style={{
            gridColumnStart: point.x + 1,
            gridRowStart: point.y + 1,
          }}
          animate={{
            opacity: [0.35, 1, 0.35],
            scale: [0.85, 1.15, 0.85],
          }}
          transition={{
            duration: 1.1,
            repeat: Number.POSITIVE_INFINITY,
            ease: "easeInOut",
            delay: point.delay,
          }}
        />
      ))}
    </div>
  );
}

const StatusIcon: React.FC<StatusIconProps> = ({ status }) => {
  const iconMap: Record<StatusIconProps["status"], JSX.Element> = useMemo(
    () => ({
      loading: <Loader2 className="animate-spin" size={20} />,
      success: <Check size={20} />,
      error: <X size={20} />,
    }),
    [],
  );

  if (!iconMap[status]) return null;

  return (
    <motion.div
      key={status}
      initial={{ opacity: 0, scale: 0.5 }}
      animate={{ opacity: 1, scale: 1 }}
      exit={{ opacity: 0 }}
    >
      {iconMap[status]}
    </motion.div>
  );
};

const useButtonStatus = (
  resolveTo: "success" | "error",
  onComplete?: () => void,
) => {
  const [status, setStatus] = useState<"idle" | "loading" | "success" | "error">("idle");

  const handleSubmit = useCallback(() => {
    setStatus("loading");
    setTimeout(() => {
      setStatus(resolveTo);
      onComplete?.();
    }, 2000);
  }, [resolveTo, onComplete]);

  return { status, handleSubmit };
};

export interface SlideButtonProps extends ButtonProps {
  onComplete?: () => void;
}

export const SlideButton = forwardRef<HTMLButtonElement, SlideButtonProps>(
  ({ className, onComplete, ...props }, ref) => {
    const [isDragging, setIsDragging] = useState(false);
    const [completed, setCompleted] = useState(false);
    const dragHandleRef = useRef<HTMLDivElement | null>(null);
    const { status, handleSubmit } = useButtonStatus("success", onComplete);

    const dragX = useMotionValue(0);
    const springX = useSpring(dragX, ANIMATION_CONFIG.spring);
    const dragProgress = useTransform(
      springX,
      [0, DRAG_CONSTRAINTS.right],
      [0, 1],
    );

    const handleDragStart = useCallback(() => {
      if (completed) return;
      setIsDragging(true);
    }, [completed]);

    const handleDragEnd = () => {
      if (completed) return;
      setIsDragging(false);

      const progress = dragProgress.get();
      if (progress >= DRAG_THRESHOLD) {
        setCompleted(true);
        handleSubmit();
      } else {
        dragX.set(0);
      }
    };

    const handleDrag = (
      _event: MouseEvent | TouchEvent | PointerEvent,
      info: PanInfo,
    ) => {
      if (completed) return;
      const newX = Math.max(0, Math.min(info.offset.x, DRAG_CONSTRAINTS.right));
      dragX.set(newX);
    };

    const adjustedWidth = useTransform(springX, (x: number) => x + 10);

    return (
      <motion.div
        animate={completed ? BUTTON_STATES.completed : BUTTON_STATES.initial}
        transition={ANIMATION_CONFIG.spring}
        className="shadow-button-inset dark:shadow-button-inset-dark relative flex h-9 items-center justify-center rounded-full bg-gray-200 dark:bg-gray-800"
      >
        {!completed ? (
          <motion.div
            style={{ width: adjustedWidth }}
            className="absolute inset-y-0 left-0 z-0 rounded-full bg-accent"
          />
        ) : null}

        <AnimatePresence>
          {!completed ? (
            <motion.div
              ref={dragHandleRef}
              drag="x"
              dragConstraints={DRAG_CONSTRAINTS}
              dragElastic={0.05}
              dragMomentum={false}
              onDragStart={handleDragStart}
              onDragEnd={handleDragEnd}
              onDrag={handleDrag}
              style={{ x: springX }}
              className="absolute -left-4 z-10 flex cursor-grab items-center justify-start active:cursor-grabbing"
            >
              <Button
                ref={ref}
                disabled={status === "loading"}
                {...props}
                size="icon"
                className={cn(
                  "shadow-button rounded-full drop-shadow-xl",
                  isDragging && "scale-105 transition-transform",
                  className,
                )}
              >
                <DotMatrixIcon />
              </Button>
            </motion.div>
          ) : null}
        </AnimatePresence>

        <AnimatePresence>
          {completed ? (
            <motion.div
              className="absolute inset-0 flex items-center justify-center"
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
            >
              <Button
                ref={ref}
                disabled={status === "loading"}
                {...props}
                className={cn(
                  "size-full rounded-full transition-all duration-300",
                  className,
                )}
              >
                <AnimatePresence mode="wait">
                  <StatusIcon status={status} />
                </AnimatePresence>
              </Button>
            </motion.div>
          ) : null}
        </AnimatePresence>
      </motion.div>
    );
  },
);

SlideButton.displayName = "SlideButton";

export function SlideButtonDemo() {
  return (
    <div className="flex justify-center p-4">
      <SlideButton />
    </div>
  );
}
```

## Exact Workflo Source Notes

The Workflo source at `components/ui/slide-button.tsx` currently uses `crypto.randomUUID()` in a few `key` props. For a clean replica, prefer stable keys such as `key={status}` or no explicit key on `AnimatePresence` wrappers. Random keys force remounts and can create unnecessary animation churn.

The interaction effect itself is unchanged by this cleanup.

## Behavior Timeline

1. Initial state: track is `12rem` wide, handle is visible at `-left-4`.
2. User starts drag: `isDragging` becomes `true`; handle scales to `scale-105`.
3. During drag: `dragX` updates directly from pointer offset, clamped between `0` and `155`.
4. Spring smoothing: `springX` follows `dragX` using the `400/40/0.8` spring.
5. Fill track: `adjustedWidth = springX + 10`, so the accent fill slightly leads from the left edge.
6. Release before threshold: `dragX.set(0)` and spring returns the handle/fill to start.
7. Release after threshold: `completed = true`, track animates to `8rem`, handle disappears, status button fades in.
8. Loading state: status becomes `loading` immediately and shows spinning `Loader2`.
9. Resolution: after `2000ms`, status becomes `success` or `error`, and `onComplete()` runs.

## Usage Examples

Basic usage:

```tsx
<SlideButton onComplete={() => console.log("confirmed")} />
```

With custom visual style:

```tsx
<SlideButton
  onComplete={handleConfirm}
  className="bg-emerald-600 text-white hover:bg-emerald-500"
/>
```

In a confirmation dialog:

```tsx
<div className="flex items-center justify-end gap-3">
  <Button variant="ghost" onClick={() => setOpen(false)}>
    Cancel
  </Button>
  <SlideButton onComplete={handleDangerousAction} />
</div>
```

In Workflo chat flows, it is used for actions like:

```tsx
<SlideButton onComplete={handleConfirmColdOutbound} />
<SlideButton onComplete={handleConfirmAutoPilot} />
```

## Accessibility Requirements

The canonical drag behavior is pointer-first. For a production-grade replica, add keyboard support if the action must be accessible without a pointer.

Recommended keyboard support:

- Press `Enter` or `Space` on the handle to trigger completion.
- Add an `aria-label`, e.g. `aria-label="Slide to confirm"`.
- Keep disabled state wired during loading.

Example accessible usage:

```tsx
<SlideButton
  aria-label="Slide to confirm autopilot"
  onComplete={handleConfirmAutoPilot}
/>
```

## Mobile And Touch Notes

- `framer-motion` drag handles mouse, touch, and pointer events.
- Keep `dragMomentum={false}` so the handle does not coast after release.
- Keep `dragElastic={0.05}` for a tiny elastic edge feel without allowing overshoot.
- The button should be at least `h-9`; do not make it smaller for touch flows.

## Reduced Motion

The canonical component does not call `useReducedMotion()`. If strict reduced-motion support is required, add it and disable the dot animation and spring transitions.

Minimal adaptation:

```tsx
import { useReducedMotion } from "framer-motion";

const shouldReduceMotion = useReducedMotion();

const springX = useSpring(dragX, shouldReduceMotion ? { stiffness: 1000, damping: 100, mass: 1 } : ANIMATION_CONFIG.spring);
```

Also disable dot animation:

```tsx
animate={shouldReduceMotion ? { opacity: 1, scale: 1 } : {
  opacity: [0.35, 1, 0.35],
  scale: [0.85, 1.15, 0.85],
}}
```

## Customization Hooks

Only customize these values if the target layout requires it:

- `DRAG_CONSTRAINTS.right`: increase for wider tracks, decrease for shorter tracks.
- `DRAG_THRESHOLD`: keep between `0.85` and `0.95` for deliberate confirmation.
- `BUTTON_STATES.initial.width`: track width before completion.
- `BUTTON_STATES.completed.width`: final status pill width.
- `resolveTo`: use `success` or `error` depending on the expected async result.
- `setTimeout(..., 2000)`: replace with real async completion logic for production workflows.

Production async variant concept:

```tsx
const handleSubmit = useCallback(async () => {
  setStatus("loading");
  try {
    await onComplete?.();
    setStatus("success");
  } catch {
    setStatus("error");
  }
}, [onComplete]);
```

If using the async variant, change `onComplete` type to `() => void | Promise<void>`.

## Common Failure Modes

- Handle does not move: ensure the draggable element has `drag="x"` and `style={{ x: springX }}`.
- Fill does not follow handle: ensure `adjustedWidth = useTransform(springX, (x) => x + 10)` and bind it to the fill width.
- Completion triggers too early: increase `DRAG_THRESHOLD` or reduce `DRAG_CONSTRAINTS.right` mismatch.
- Handle flies past the track: keep `dragConstraints={DRAG_CONSTRAINTS}`, clamp `info.offset.x`, and set `dragMomentum={false}`.
- Status icon remounts too often: avoid random keys on `AnimatePresence` and icon wrappers.
- Button looks flat: add the shadow utilities or define equivalent CSS.
- Button looks too heavy: reduce `drop-shadow-xl` or soften `.shadow-button` opacity.
- Touch target feels small: do not reduce `h-9` or `size="icon"` below the canonical values.

## Verification Checklist

- Track starts at `12rem` and is `h-9`.
- Handle starts at `-left-4` and is circular.
- Dot matrix animates in a diagonal/stepped pattern.
- Dragging right fills the track with `bg-accent`.
- Releasing below `90%` returns the handle to start.
- Releasing above `90%` shrinks track to `8rem` and shows loading.
- Loading shows a spinning `Loader2`.
- Success shows a `Check` icon.
- Error support exists via the status icon map.
- `onComplete()` fires only after the completion delay or async resolution.
- Drag momentum is disabled.
- No random key remount churn if using the cleaned replica code.

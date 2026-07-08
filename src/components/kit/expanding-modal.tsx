"use client";

import * as React from "react";
import * as DialogPrimitive from "@radix-ui/react-dialog";
import { cn } from "@/lib/utils";

export interface ExpandingModalRect {
  top: number;
  left: number;
  width: number;
  height: number;
}

interface ExpandingModalContextValue {
  /** Starts the reverse (closing) animation; no-op while `closeDisabled`. */
  requestClose: () => void;
  /** True once the surface has finished expanding to its target geometry —
   *  content can use this to fade itself in instead of popping in early. */
  opened: boolean;
}

const ExpandingModalContext =
  React.createContext<ExpandingModalContextValue | null>(null);

/** Access the close trigger / opened state from anywhere inside an
 * `ExpandingModal`'s children (e.g. a header back button). */
export function useExpandingModal(): ExpandingModalContextValue {
  const ctx = React.useContext(ExpandingModalContext);
  if (!ctx) {
    throw new Error("useExpandingModal must be used inside an ExpandingModal");
  }
  return ctx;
}

export interface ExpandingModalProps {
  open: boolean;
  /** Rect of the card/button that triggered the open (captured via
   * `e.currentTarget.getBoundingClientRect()`). `null` means "deep link" —
   * no visual origin, the surface fades+scales in centered instead. */
  originRect: ExpandingModalRect | null;
  /** Called once the closing animation fully finishes — clear caller state here. */
  onClosed: () => void;
  /** Blocks Escape/backdrop-click/close-button while true (e.g. mid-edit). */
  closeDisabled?: boolean;
  /** Accessible title (visually hidden — the visible header is rendered by children). */
  title: string;
  maxWidth?: number;
  maxHeight?: number;
  margin?: number;
  className?: string;
  children: React.ReactNode;
}

type Phase = "opening" | "open" | "closing";

function computeTargetRect(
  maxWidth: number,
  maxHeight: number,
  margin: number,
): ExpandingModalRect {
  const vw = window.innerWidth;
  const vh = window.innerHeight;
  const width = Math.min(maxWidth, vw - margin * 2);
  const height = Math.min(maxHeight, vh - margin * 2);
  return { top: (vh - height) / 2, left: (vw - width) / 2, width, height };
}

const CLOSE_FALLBACK_MS = 460;

/**
 * Generic "shared element" shell: expands from a source rect (a clicked card
 * or button) into a large centered surface, and reverses on close. Built on
 * raw Radix Dialog primitives (forceMount, no built-in animation) so focus
 * trap / Escape / outside-click / portal come for free while geometry is
 * driven entirely by hand across three phases: opening → open → closing.
 */
export function ExpandingModal({
  open,
  originRect,
  onClosed,
  closeDisabled = false,
  title,
  maxWidth = 1120,
  maxHeight = 760,
  margin = 40,
  className,
  children,
}: ExpandingModalProps) {
  const [mounted, setMounted] = React.useState(open);
  const [phase, setPhase] = React.useState<Phase>("opening");
  // Frozen for the lifetime of one open/close cycle — `originRect` may go
  // stale once the caller's own selection state changes mid-animation.
  const [origin, setOrigin] = React.useState<ExpandingModalRect | null>(originRect);
  const surfaceRef = React.useRef<HTMLDivElement>(null);
  const closeTimeoutRef = React.useRef<ReturnType<typeof setTimeout> | null>(
    null,
  );

  // Mirrors the `open` prop into the FLIP phase machine (mount → opening →
  // open, or → closing → unmount). The "adjust state during render"
  // alternative to this effect was tried first but produced a rare stuck
  // state when combined with Radix's dismissable-layer timing — a plain
  // effect is the correct tool here regardless (this *is* synchronizing
  // with an external system: the animation timeline), so the lint rule is
  // deliberately suppressed rather than worked around.
  React.useEffect(() => {
    if (open) {
      // eslint-disable-next-line react-hooks/set-state-in-effect -- starting the open/close animation is a legitimate effect, not a derived-state mirror.
      setOrigin(originRect);
      setPhase("opening");
      setMounted(true);
    } else {
      setPhase((p) => (p === "closing" ? p : "closing"));
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps -- originRect is intentionally only read at the moment `open` flips true.
  }, [open]);

  const finishClosing = React.useCallback(() => {
    if (closeTimeoutRef.current) clearTimeout(closeTimeoutRef.current);
    closeTimeoutRef.current = null;
    setMounted(false);
    onClosed();
  }, [onClosed]);

  const requestClose = React.useCallback(() => {
    if (closeDisabled) return;
    setPhase((p) => (p === "closing" ? p : "closing"));
  }, [closeDisabled]);

  // Flush the origin geometry for one paint, then animate to the target.
  React.useLayoutEffect(() => {
    if (!mounted || phase !== "opening") return;
    let raf2 = 0;
    const raf1 = requestAnimationFrame(() => {
      raf2 = requestAnimationFrame(() => setPhase("open"));
    });
    return () => {
      cancelAnimationFrame(raf1);
      cancelAnimationFrame(raf2);
    };
  }, [mounted, phase]);

  React.useEffect(() => {
    if (!mounted) return;
    const prevOverflow = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    return () => {
      document.body.style.overflow = prevOverflow;
    };
  }, [mounted]);

  // Fallback in case the `width` transitionend never fires (e.g. tab backgrounded).
  React.useEffect(() => {
    if (!mounted || phase !== "closing") return;
    closeTimeoutRef.current = setTimeout(finishClosing, CLOSE_FALLBACK_MS);
    return () => {
      if (closeTimeoutRef.current) clearTimeout(closeTimeoutRef.current);
    };
  }, [mounted, phase, finishClosing]);

  function handleTransitionEnd(e: React.TransitionEvent<HTMLDivElement>) {
    if (e.target !== surfaceRef.current) return;
    if (e.propertyName !== "width") return;
    if (phase === "closing") finishClosing();
  }

  if (!mounted) return null;

  const target = computeTargetRect(maxWidth, maxHeight, margin);
  const opened = phase === "open";
  const geometry = opened ? target : (origin ?? target);
  const isDeepLink = origin === null;

  return (
    <ExpandingModalContext.Provider value={{ requestClose, opened }}>
      <DialogPrimitive.Root open onOpenChange={() => undefined}>
        <DialogPrimitive.Portal forceMount>
          <DialogPrimitive.Overlay
            forceMount
            className={cn(
              "fixed inset-0 z-40 bg-black/40 transition-opacity duration-[420ms] ease-out",
              opened ? "opacity-100" : "opacity-0",
            )}
            onClick={requestClose}
          />
          <DialogPrimitive.Content
            forceMount
            ref={surfaceRef}
            aria-describedby={undefined}
            onTransitionEnd={handleTransitionEnd}
            onEscapeKeyDown={(e) => {
              e.preventDefault();
              requestClose();
            }}
            onPointerDownOutside={(e) => {
              e.preventDefault();
              requestClose();
            }}
            onInteractOutside={(e) => {
              e.preventDefault();
            }}
            style={{
              position: "fixed",
              top: geometry.top,
              left: geometry.left,
              width: geometry.width,
              height: geometry.height,
              borderRadius: opened ? 10 : 8,
              opacity: isDeepLink && !opened ? 0 : 1,
              transform: isDeepLink && !opened ? "scale(0.97)" : "scale(1)",
              transitionProperty:
                "top, left, width, height, border-radius, opacity, transform",
              transitionDuration: "420ms",
              transitionTimingFunction: "cubic-bezier(0.32,0.72,0,1)",
              willChange: "top, left, width, height",
            }}
            className={cn(
              "z-40 flex flex-col overflow-hidden border bg-background shadow-2xl focus:outline-none",
              className,
            )}
          >
            <DialogPrimitive.Title className="sr-only">
              {title}
            </DialogPrimitive.Title>
            <div
              className={cn(
                "flex h-full min-h-0 flex-col opacity-0 transition-opacity duration-200 ease-out",
                opened && "opacity-100 delay-100 duration-300",
              )}
            >
              {children}
            </div>
          </DialogPrimitive.Content>
        </DialogPrimitive.Portal>
      </DialogPrimitive.Root>
    </ExpandingModalContext.Provider>
  );
}

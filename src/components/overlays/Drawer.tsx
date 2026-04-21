"use client";

// ---------------------------------------------------------------------------
// <Drawer> — stack-aware right-side sheet primitive built on Radix Dialog.
//
// AMMC v1 Slice 3 (crystalline-drifting-dusk §C.1 #1). Core building block for
// the admin Drawer-Stack pattern where a picker drawer can host a Quick-Create
// drawer that slides further right, and Esc / backdrop click close only the
// topmost drawer.
//
// Design notes:
// - Built on Radix Dialog (@radix-ui/react-dialog). Radix handles focus-trap,
//   ARIA wiring (aria-modal, aria-labelledby, aria-describedby), and the
//   portal. We layer stack-awareness on top via a React context.
// - Stack context tracks an ordered list of open drawer ids. Each <Drawer>
//   registers itself on mount-when-open and unregisters on close. "Topmost"
//   is the last id in the list.
// - Esc / backdrop click → Radix fires onEscapeKeyDown / onInteractOutside.
//   Our handler checks whether THIS drawer is topmost; if not, it calls
//   preventDefault() and the event bubbles up to the outer drawer, which
//   evaluates the same predicate. Only the topmost drawer's close path fires.
// - z-index: base z-40, increments by 10 per depth level so nested drawers
//   render above their parents and above the Next.js app shell.
// - Visual stacking offset: each level offsets the panel by 24px to the
//   left of its parent so the user sees the stack depth.
// - Width prop maps to tailwind max-width classes: md = 480px, lg = 640px,
//   xl = 800px.
//
// Props: { open, onClose, title, width?, description?, children }.
// ---------------------------------------------------------------------------

import * as Dialog from "@radix-ui/react-dialog";
import { X } from "lucide-react";
import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useId,
  useMemo,
  useRef,
  useState,
  type ReactNode,
} from "react";
import { cn } from "@/lib/cn";

// ---------------------------------------------------------------------------
// Stack context — tracks open drawers in insertion order.
// ---------------------------------------------------------------------------

interface DrawerStackContextValue {
  /** Ordered list of currently-open drawer ids (oldest first). */
  openIds: string[];
  /** Register an open drawer. Called from a useEffect when open flips true. */
  register: (id: string) => void;
  /** Unregister a closed drawer. */
  unregister: (id: string) => void;
  /** Depth of the given drawer id (0-based). Returns -1 if not registered. */
  depthOf: (id: string) => number;
  /** True if the given id is the topmost (last) open drawer. */
  isTopmost: (id: string) => boolean;
}

const DrawerStackContext = createContext<DrawerStackContextValue | null>(null);

/**
 * <DrawerStackProvider> — wrap once near the app root. If omitted, <Drawer>
 * falls back to a private local stack (single-drawer apps still work, but
 * nested stack behavior is unavailable).
 */
export function DrawerStackProvider({ children }: { children: ReactNode }) {
  const value = useDrawerStackValue();
  return (
    <DrawerStackContext.Provider value={value}>
      {children}
    </DrawerStackContext.Provider>
  );
}

function useDrawerStackValue(): DrawerStackContextValue {
  const [openIds, setOpenIds] = useState<string[]>([]);

  const register = useCallback((id: string) => {
    setOpenIds((prev) => (prev.includes(id) ? prev : [...prev, id]));
  }, []);

  const unregister = useCallback((id: string) => {
    setOpenIds((prev) => prev.filter((x) => x !== id));
  }, []);

  const depthOf = useCallback(
    (id: string) => openIds.indexOf(id),
    [openIds],
  );

  const isTopmost = useCallback(
    (id: string) => openIds.length > 0 && openIds[openIds.length - 1] === id,
    [openIds],
  );

  return useMemo(
    () => ({ openIds, register, unregister, depthOf, isTopmost }),
    [openIds, register, unregister, depthOf, isTopmost],
  );
}

/**
 * Internal hook — return the active stack context, or a minimal fallback
 * that treats every drawer as topmost (safe for single-drawer apps that
 * forget to wrap in <DrawerStackProvider>).
 */
function useDrawerStack(): DrawerStackContextValue {
  const ctx = useContext(DrawerStackContext);
  // Local fallback: track this drawer's own id only. `useState` here means
  // we respect hook rules regardless of whether a provider is mounted.
  const [localIds, setLocalIds] = useState<string[]>([]);
  const localRegister = useCallback((id: string) => {
    setLocalIds((prev) => (prev.includes(id) ? prev : [...prev, id]));
  }, []);
  const localUnregister = useCallback((id: string) => {
    setLocalIds((prev) => prev.filter((x) => x !== id));
  }, []);
  const localDepthOf = useCallback(
    (id: string) => localIds.indexOf(id),
    [localIds],
  );
  const localIsTopmost = useCallback(
    (id: string) =>
      localIds.length > 0 && localIds[localIds.length - 1] === id,
    [localIds],
  );
  const fallback = useMemo<DrawerStackContextValue>(
    () => ({
      openIds: localIds,
      register: localRegister,
      unregister: localUnregister,
      depthOf: localDepthOf,
      isTopmost: localIsTopmost,
    }),
    [
      localIds,
      localRegister,
      localUnregister,
      localDepthOf,
      localIsTopmost,
    ],
  );
  return ctx ?? fallback;
}

/**
 * Read the stack snapshot's live openIds at handler-call time rather than
 * via a render-bound closure value. See explanation in <Drawer> below.
 */
function isCurrentlyTopmost(
  stack: DrawerStackContextValue,
  id: string,
): boolean {
  const ids = stack.openIds;
  if (ids.length === 0) return true;
  return ids[ids.length - 1] === id;
}

// ---------------------------------------------------------------------------
// Width mapping — exported for test discovery.
// ---------------------------------------------------------------------------

export const DRAWER_WIDTH_CLASS: Record<
  NonNullable<DrawerProps["width"]>,
  string
> = {
  md: "max-w-[480px]",
  lg: "max-w-[640px]",
  xl: "max-w-[800px]",
};

// ---------------------------------------------------------------------------
// <Drawer> props + component.
// ---------------------------------------------------------------------------

export interface DrawerProps {
  /** Controlled — true renders the drawer. */
  open: boolean;
  /** Fired when the user closes via Esc / backdrop / close button. */
  onClose: () => void;
  /** Drawer title; shown in the header. */
  title: string;
  /** Optional subheader description. */
  description?: string;
  /** Max-width token: md=480, lg=640, xl=800. Defaults to 'md'. */
  width?: "md" | "lg" | "xl";
  /** Drawer body. */
  children: ReactNode;
  /**
   * Test hook — override stack id so tests can assert topmost behavior
   * deterministically without depending on React's internal useId output.
   */
  testId?: string;
}

export function Drawer({
  open,
  onClose,
  title,
  description,
  width = "md",
  children,
  testId,
}: DrawerProps): JSX.Element {
  const reactId = useId();
  const id = testId ?? reactId;
  const stack = useDrawerStack();

  // Register/unregister with the stack based on open state.
  useEffect(() => {
    if (open) {
      stack.register(id);
      return () => {
        stack.unregister(id);
      };
    }
    return undefined;
    // stack.register/unregister are stable (useCallback); id is stable.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open, id]);

  const depth = stack.depthOf(id);
  // When the stack hasn't registered yet on first render, treat this drawer
  // as topmost so its own Esc still works.
  const topmost = depth === -1 ? true : stack.isTopmost(id);
  // Mirror the stack snapshot into a ref. Radix invokes onInteractOutside
  // inside the same user-click frame as a nested drawer's open transition,
  // which is BEFORE this component re-renders with fresh openIds — so
  // reading `stack.openIds` from a closure captured at the previous render
  // is stale. A ref synced on every render gives the handler access to the
  // live openIds at call time.
  const stackRef = useRef(stack);
  stackRef.current = stack;

  // Esc / backdrop handlers — only close if topmost.
  //
  // When topmost, we preventDefault() so Radix does NOT run its own close
  // path; then we fire onClose() ourselves exactly once. When not topmost,
  // preventDefault() alone is enough to suppress the close and let the
  // event bubble up to the outer drawer (which evaluates the same
  // predicate). This eliminates the double-fire that would otherwise occur
  // through Radix's onOpenChange(false) → Dialog.Root → our onClose path.
  // Radix fires onInteractOutside synchronously in the same user-click frame
  // as any nested Dialog.Root state transition — BEFORE this component
  // re-renders with an updated stack snapshot. To avoid acting on a stale
  // topmost value, defer the close decision to a microtask so the pending
  // re-render (and its stack-ref update) has a chance to commit first.
  //
  // Esc is comparatively safe to evaluate synchronously (no nested-open race
  // can precede an Esc keypress), but we use the same microtask path for
  // symmetry and future-proofing.
  const handleEscapeKeyDown = (e: KeyboardEvent) => {
    e.preventDefault();
    queueMicrotask(() => {
      if (isCurrentlyTopmost(stackRef.current, id)) onClose();
    });
  };
  const handleInteractOutside = (e: Event) => {
    e.preventDefault();
    queueMicrotask(() => {
      if (isCurrentlyTopmost(stackRef.current, id)) onClose();
    });
  };

  // z-index increment per depth — base 40 matches Next.js app-shell overlays.
  const safeDepth = depth === -1 ? 0 : depth;
  const zClass = Z_CLASS_BY_DEPTH[Math.min(safeDepth, Z_CLASS_BY_DEPTH.length - 1)];

  // Visual offset — 24px per depth level. Applied as right-margin on the panel
  // so the previous drawer peeks out on the left when a new one opens.
  const offsetPx = safeDepth * 24;

  return (
    <Dialog.Root
      open={open}
      // Intentionally do NOT wire onOpenChange → onClose. Radix may fire
      // onOpenChange(false) for reasons that are not "user wants this
      // drawer closed" (e.g. internal focus-trap handoff when a nested
      // Dialog.Root opens). The authoritative close paths in a stack
      // setting are the explicit Esc / interact-outside / close-button
      // handlers below, each of which is gated on topmost.
      onOpenChange={() => {
        /* controlled externally via explicit handlers */
      }}
    >
      <Dialog.Portal>
        <Dialog.Overlay
          className={cn(
            "fixed inset-0 bg-black/40 backdrop-blur-[1px] transition-opacity duration-200",
            // Each nested overlay dims the area a bit more than its parent.
            zClass.overlay,
          )}
        />
        <Dialog.Content
          onEscapeKeyDown={handleEscapeKeyDown}
          onInteractOutside={handleInteractOutside}
          className={cn(
            "fixed right-0 top-0 flex h-full w-full flex-col bg-bg-raised shadow-xl",
            "border-l border-border/70",
            "duration-200 data-[state=open]:animate-in data-[state=closed]:animate-out",
            "data-[state=closed]:slide-out-to-right data-[state=open]:slide-in-from-right",
            DRAWER_WIDTH_CLASS[width],
            zClass.content,
          )}
          style={offsetPx > 0 ? { marginRight: `${offsetPx}px` } : undefined}
          data-drawer-depth={safeDepth}
        >
          <div className="flex items-start justify-between gap-4 border-b border-border/70 bg-gradient-to-b from-bg-raised to-bg/40 px-5 py-4">
            <div className="min-w-0">
              <Dialog.Title className="text-base font-semibold tracking-tightish text-fg-strong">
                {title}
              </Dialog.Title>
              {description ? (
                <Dialog.Description className="mt-1 text-xs leading-relaxed text-fg-muted">
                  {description}
                </Dialog.Description>
              ) : (
                // Radix warns if a Dialog has no Description; emit a visually-hidden
                // one so the component is always a11y-complete without polluting UI.
                // Intentionally does NOT duplicate the title so getByText(title)
                // in tests remains unambiguous.
                <Dialog.Description className="sr-only">
                  Dialog content
                </Dialog.Description>
              )}
            </div>
            <button
              type="button"
              className="btn btn-ghost btn-sm -my-1 h-8 w-8 shrink-0 justify-center p-0"
              aria-label="Close drawer"
              onClick={() => {
                if (topmost) onClose();
              }}
            >
              <X className="h-4 w-4" strokeWidth={2} />
            </button>
          </div>
          <div className="flex-1 overflow-y-auto p-5">{children}</div>
        </Dialog.Content>
      </Dialog.Portal>
    </Dialog.Root>
  );
}

// ---------------------------------------------------------------------------
// z-index ladder — pre-generated so Tailwind's JIT picks them up statically.
// ---------------------------------------------------------------------------

const Z_CLASS_BY_DEPTH: Array<{ overlay: string; content: string }> = [
  { overlay: "z-40", content: "z-40" },
  { overlay: "z-50", content: "z-50" },
  { overlay: "z-[60]", content: "z-[60]" },
  { overlay: "z-[70]", content: "z-[70]" },
  { overlay: "z-[80]", content: "z-[80]" },
];

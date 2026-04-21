"use client";

// ---------------------------------------------------------------------------
// <Wizard> — AMMC v1 Slice 7 (crystalline-drifting-dusk §C.1 #5 + §G.7).
//
// Generic stepper + form-state accumulator. Built on top of existing workflow
// primitives (WorkflowHeader, SectionCard, ValidationSummary, FormActionsBar).
// No new visual primitives — wizard is a coordination layer.
//
// Shape:
//   <Wizard
//     id="new-product"
//     steps={[{ id, title, subtitle?, Component, canSkip?, validate? }, ...]}
//     initialState={{ ... }}
//     onComplete={(state) => Promise<void>}
//     onSaveDraft={(state) => Promise<void>}
//   />
//
// Each step Component receives WizardStepProps:
//   { state, patch(delta), next(), back(), markBlocker(key, msg), clearBlocker(key) }
//
// Behavior:
//   - Horizontal stepper header (step titles with active/done/pending visuals)
//   - "Next" fires step.validate; blocks advance on ok=false + renders issues
//     via <ValidationSummary>
//   - "Back" moves one step left without validation
//   - Last step renders "Publish" (primary) instead of "Next"; onComplete fires
//   - "Save as draft" is available on every step; calls onSaveDraft(state)
//   - URL syncs ?step=<id> for deep-link / refresh resilience
//   - Draft state persists to localStorage keyed by wizard `id`; restored on
//     re-entry unless initialState overrides
//
// NOT in scope for this primitive:
//   - Server persistence of partial state (handled by onSaveDraft callback)
//   - Per-step field validation (step's own form owns that; validate() is a
//     final gate before advancing)
//   - Role gating (caller wraps the page in its own gate)
// ---------------------------------------------------------------------------

import {
  useCallback,
  useEffect,
  useMemo,
  useState,
  type ReactNode,
} from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { Check, ChevronLeft, ChevronRight, Save } from "lucide-react";
import { WorkflowHeader } from "./WorkflowHeader";
import { FormActionsBar } from "./FormActionsBar";
import {
  ValidationSummary,
  type ValidationIssue,
} from "./ValidationSummary";
import { cn } from "@/lib/cn";

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export interface WizardStepProps<TState = Record<string, unknown>> {
  /** Current accumulated state across all steps. */
  state: TState;
  /** Apply a shallow merge to state. */
  patch: (delta: Partial<TState>) => void;
  /** Imperatively advance to next step (skips validate gate). */
  next: () => void;
  /** Imperatively go back one step. */
  back: () => void;
  /** Record a per-step blocker by stable key (rendered at the step header). */
  markBlocker: (key: string, message: string) => void;
  /** Clear a previously marked blocker. */
  clearBlocker: (key: string) => void;
}

export interface WizardStepDef<TState = Record<string, unknown>> {
  /** Stable identifier — appears in the URL `?step=<id>`. */
  id: string;
  /** Header label. */
  title: string;
  /** Optional subheading. */
  subtitle?: string;
  /** Step body component — receives {@link WizardStepProps}. */
  Component: React.ComponentType<WizardStepProps<TState>>;
  /**
   * Optional predicate that, when true, makes this step skippable from the
   * UI (Next button still fires validate; if validate returns ok=true with
   * no issues, we advance). Used for conditional flow (e.g. skip BOM step
   * for BOUGHT_FINISHED items).
   */
  canSkip?: (state: TState) => boolean;
  /**
   * Optional final validation gate fired on "Next" click. If ok=false, the
   * wizard refuses to advance and renders issues via ValidationSummary.
   */
  validate?: (
    state: TState,
  ) => Promise<{ ok: boolean; issues?: ValidationIssue[] }>;
}

export interface WizardProps<TState = Record<string, unknown>> {
  /**
   * Stable wizard id — used for localStorage draft persistence keying and for
   * URL ?step tracking. Each distinct wizard-on-page must use a unique id.
   */
  id: string;
  /** Step list, in order. At least one step required. */
  steps: WizardStepDef<TState>[];
  /** Fired when user clicks "Publish" on the final step after validate passes. */
  onComplete: (state: TState) => Promise<void> | void;
  /** Optional — when provided, a "Save as draft" button renders on every step. */
  onSaveDraft?: (state: TState) => Promise<void> | void;
  /** Initial state; defaults to empty object cast to TState. */
  initialState?: TState;
  /** Optional wizard title override (defaults to current step title). */
  title?: string;
  /** Optional eyebrow shown in the header (e.g. "Admin - new product"). */
  eyebrow?: string;
  /** Optional description under the header title. */
  description?: string;
  /** Extra meta chips next to the header title. */
  meta?: ReactNode;
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

const LS_KEY_PREFIX = "wizard-draft:";

function readDraft<TState>(id: string): TState | null {
  if (typeof window === "undefined") return null;
  try {
    const raw = window.localStorage.getItem(LS_KEY_PREFIX + id);
    if (!raw) return null;
    return JSON.parse(raw) as TState;
  } catch {
    return null;
  }
}

function writeDraft<TState>(id: string, state: TState): void {
  if (typeof window === "undefined") return;
  try {
    window.localStorage.setItem(LS_KEY_PREFIX + id, JSON.stringify(state));
  } catch {
    /* quota or private mode — silently drop */
  }
}

function clearDraft(id: string): void {
  if (typeof window === "undefined") return;
  try {
    window.localStorage.removeItem(LS_KEY_PREFIX + id);
  } catch {
    /* ignore */
  }
}

// ---------------------------------------------------------------------------
// <Wizard>
// ---------------------------------------------------------------------------

export function Wizard<TState extends Record<string, unknown>>({
  id,
  steps,
  onComplete,
  onSaveDraft,
  initialState,
  title,
  eyebrow,
  description,
  meta,
}: WizardProps<TState>): JSX.Element {
  if (steps.length === 0) {
    throw new Error("<Wizard> requires at least one step");
  }

  const router = useRouter();
  const searchParams = useSearchParams();
  const urlStepId = searchParams?.get("step") ?? null;

  // --- State --------------------------------------------------------------

  // Initial state: prefer caller-supplied initialState, then saved draft,
  // then empty.
  const [state, setState] = useState<TState>(() => {
    if (initialState) return initialState;
    const draft = readDraft<TState>(id);
    if (draft) return draft;
    return {} as TState;
  });

  // Find current step index from URL, else default to 0.
  const initialIndex = useMemo(() => {
    if (urlStepId) {
      const idx = steps.findIndex((s) => s.id === urlStepId);
      if (idx >= 0) return idx;
    }
    return 0;
  }, [urlStepId, steps]);

  const [currentIndex, setCurrentIndex] = useState<number>(initialIndex);
  const [validationIssues, setValidationIssues] = useState<ValidationIssue[]>(
    [],
  );
  const [blockers, setBlockers] = useState<Record<string, string>>({});
  const [busy, setBusy] = useState<"idle" | "validating" | "publishing" | "saving-draft">(
    "idle",
  );
  const [publishError, setPublishError] = useState<string | null>(null);

  const currentStep = steps[currentIndex];
  const isLastStep = currentIndex === steps.length - 1;

  // --- Effects ------------------------------------------------------------

  // Persist draft on any state change.
  useEffect(() => {
    writeDraft(id, state);
  }, [id, state]);

  // Sync URL ?step=<id> on step change.
  useEffect(() => {
    const target = steps[currentIndex]?.id;
    if (!target) return;
    if (urlStepId === target) return;
    const params = new URLSearchParams(searchParams?.toString() ?? "");
    params.set("step", target);
    router.replace(`?${params.toString()}`, { scroll: false });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [currentIndex]);

  // Honor back/forward nav that changes ?step outside our control.
  useEffect(() => {
    if (!urlStepId) return;
    const idx = steps.findIndex((s) => s.id === urlStepId);
    if (idx >= 0 && idx !== currentIndex) {
      setCurrentIndex(idx);
      setValidationIssues([]);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [urlStepId]);

  // --- Handlers -----------------------------------------------------------

  const patch = useCallback((delta: Partial<TState>) => {
    setState((prev) => ({ ...prev, ...delta }) as TState);
  }, []);

  const next = useCallback(() => {
    setValidationIssues([]);
    setCurrentIndex((prev) => Math.min(prev + 1, steps.length - 1));
  }, [steps.length]);

  const back = useCallback(() => {
    setValidationIssues([]);
    setCurrentIndex((prev) => Math.max(prev - 1, 0));
  }, []);

  const markBlocker = useCallback((key: string, message: string) => {
    setBlockers((prev) => ({ ...prev, [key]: message }));
  }, []);

  const clearBlocker = useCallback((key: string) => {
    setBlockers((prev) => {
      if (!(key in prev)) return prev;
      const copy = { ...prev };
      delete copy[key];
      return copy;
    });
  }, []);

  const handleNextClick = useCallback(async () => {
    setPublishError(null);
    setValidationIssues([]);
    const step = steps[currentIndex];
    if (step.validate) {
      setBusy("validating");
      try {
        const result = await step.validate(state);
        if (!result.ok) {
          setValidationIssues(result.issues ?? []);
          return;
        }
      } catch (err) {
        setValidationIssues([
          {
            level: "blocker",
            message:
              err instanceof Error
                ? err.message
                : "Step validation threw an unexpected error.",
          },
        ]);
        return;
      } finally {
        setBusy("idle");
      }
    }
    next();
  }, [steps, currentIndex, state, next]);

  const handlePublishClick = useCallback(async () => {
    setPublishError(null);
    setValidationIssues([]);
    const step = steps[currentIndex];
    if (step.validate) {
      setBusy("validating");
      try {
        const result = await step.validate(state);
        if (!result.ok) {
          setValidationIssues(result.issues ?? []);
          setBusy("idle");
          return;
        }
      } catch (err) {
        setValidationIssues([
          {
            level: "blocker",
            message:
              err instanceof Error
                ? err.message
                : "Final validation threw an unexpected error.",
          },
        ]);
        setBusy("idle");
        return;
      }
    }
    setBusy("publishing");
    try {
      await onComplete(state);
      // On success, clear the saved draft so re-entry starts fresh.
      clearDraft(id);
    } catch (err) {
      setPublishError(
        err instanceof Error ? err.message : "Publish failed with unknown error.",
      );
    } finally {
      setBusy("idle");
    }
  }, [steps, currentIndex, state, onComplete, id]);

  const handleSaveDraftClick = useCallback(async () => {
    if (!onSaveDraft) return;
    setBusy("saving-draft");
    try {
      await onSaveDraft(state);
    } finally {
      setBusy("idle");
    }
  }, [onSaveDraft, state]);

  // --- Render -------------------------------------------------------------

  const StepComponent = currentStep.Component;
  const blockerEntries = Object.entries(blockers);

  return (
    <>
      <WorkflowHeader
        eyebrow={eyebrow ?? "Wizard"}
        title={title ?? currentStep.title}
        description={description ?? currentStep.subtitle}
        meta={meta}
      >
        <WizardStepper
          steps={steps}
          currentIndex={currentIndex}
          onJump={(idx) => {
            // Allow jumping backward only — forward jumps must pass validate.
            if (idx < currentIndex) {
              setValidationIssues([]);
              setCurrentIndex(idx);
            }
          }}
        />
      </WorkflowHeader>

      {blockerEntries.length > 0 ? (
        <ValidationSummary
          title="Step blockers"
          issues={blockerEntries.map(([key, message]) => ({
            level: "blocker",
            field: key,
            message,
          }))}
        />
      ) : null}

      {validationIssues.length > 0 ? (
        <ValidationSummary issues={validationIssues} />
      ) : null}

      {publishError ? (
        <div
          className="rounded-md border border-danger/40 bg-danger-softer p-3 text-sm text-danger-fg"
          data-testid="wizard-publish-error"
        >
          {publishError}
        </div>
      ) : null}

      <div data-testid={`wizard-step-body-${currentStep.id}`}>
        <StepComponent
          state={state}
          patch={patch}
          next={next}
          back={back}
          markBlocker={markBlocker}
          clearBlocker={clearBlocker}
        />
      </div>

      <FormActionsBar
        hint={`Step ${currentIndex + 1} of ${steps.length}`}
        leading={
          onSaveDraft ? (
            <button
              type="button"
              className="btn btn-ghost btn-sm inline-flex items-center gap-1.5"
              onClick={() => {
                void handleSaveDraftClick();
              }}
              disabled={busy !== "idle"}
              data-testid="wizard-save-draft"
            >
              <Save className="h-3.5 w-3.5" strokeWidth={2} />
              {busy === "saving-draft" ? "Saving…" : "Save as draft"}
            </button>
          ) : undefined
        }
        secondary={
          <button
            type="button"
            className="btn btn-ghost inline-flex items-center gap-1.5"
            onClick={back}
            disabled={currentIndex === 0 || busy !== "idle"}
            data-testid="wizard-back"
          >
            <ChevronLeft className="h-3.5 w-3.5" strokeWidth={2} />
            Back
          </button>
        }
        primary={
          isLastStep ? (
            <button
              type="button"
              className="btn-primary inline-flex items-center gap-1.5"
              onClick={() => {
                void handlePublishClick();
              }}
              disabled={
                busy !== "idle" || Object.keys(blockers).length > 0
              }
              data-testid="wizard-publish"
            >
              {busy === "publishing" ? "Publishing…" : "Publish"}
              <Check className="h-3.5 w-3.5" strokeWidth={2.5} />
            </button>
          ) : (
            <button
              type="button"
              className="btn-primary inline-flex items-center gap-1.5"
              onClick={() => {
                void handleNextClick();
              }}
              disabled={busy !== "idle"}
              data-testid="wizard-next"
            >
              {busy === "validating" ? "Checking…" : "Next"}
              <ChevronRight className="h-3.5 w-3.5" strokeWidth={2.5} />
            </button>
          )
        }
      />
    </>
  );
}

// ---------------------------------------------------------------------------
// <WizardStepper> — thin visual row of step indicators.
// ---------------------------------------------------------------------------

interface WizardStepperProps<TState> {
  steps: WizardStepDef<TState>[];
  currentIndex: number;
  onJump: (index: number) => void;
}

function WizardStepper<TState>({
  steps,
  currentIndex,
  onJump,
}: WizardStepperProps<TState>): JSX.Element {
  return (
    <ol
      className="flex flex-wrap items-center gap-2 text-xs"
      role="list"
      data-testid="wizard-stepper"
    >
      {steps.map((step, idx) => {
        const isActive = idx === currentIndex;
        const isDone = idx < currentIndex;
        const clickable = idx < currentIndex;
        return (
          <li key={step.id} className="flex items-center gap-2">
            <button
              type="button"
              className={cn(
                "flex items-center gap-2 rounded-full border px-3 py-1 transition-colors",
                isActive &&
                  "border-accent bg-accent-soft text-accent font-semibold",
                !isActive &&
                  isDone &&
                  "border-success/50 bg-success-softer text-success-fg hover:bg-success-soft",
                !isActive &&
                  !isDone &&
                  "border-border/60 bg-bg-subtle/40 text-fg-muted",
                clickable ? "cursor-pointer" : "cursor-default",
              )}
              disabled={!clickable}
              onClick={() => onJump(idx)}
              data-testid={`wizard-step-${step.id}`}
              data-step-state={
                isActive ? "active" : isDone ? "done" : "pending"
              }
              aria-current={isActive ? "step" : undefined}
            >
              <span
                className={cn(
                  "flex h-4 w-4 items-center justify-center rounded-full text-3xs font-mono font-semibold",
                  isActive && "bg-accent text-white",
                  !isActive && isDone && "bg-success text-white",
                  !isActive && !isDone && "bg-bg-raised text-fg-muted",
                )}
                aria-hidden
              >
                {isDone ? (
                  <Check className="h-2.5 w-2.5" strokeWidth={3} />
                ) : (
                  idx + 1
                )}
              </span>
              <span className="whitespace-nowrap">{step.title}</span>
            </button>
            {idx < steps.length - 1 ? (
              <span className="h-px w-6 bg-border/50" aria-hidden />
            ) : null}
          </li>
        );
      })}
    </ol>
  );
}

import { z } from "zod";
import {
  ADJUSTMENT_DIRECTIONS,
  ADJUSTMENT_REASONS,
  UOMS,
} from "@/lib/contracts/enums";

/**
 * Shared zod schema for the Waste / Adjustment form.
 *
 * Lives in a non-client module so it can be unit-tested by Vitest
 * without mounting the RSC/client component tree. The page file
 * (`src/app/(operator)/ops/waste-adjustments/page.tsx`) imports
 * this schema directly.
 *
 * The superRefine encodes the two cross-field rules that the shell
 * must enforce on the client before submit:
 *
 *  1. `notes` are required when `direction === "positive"`. Positive
 *     adjustments must feel exceptional — blank notes = no context
 *     for the planner who has to approve it later.
 *  2. `notes` are required when `reason_code === "other"`. "Other"
 *     without context is useless audit signal.
 *
 * These are pure client-side gates. The real server must still
 * enforce them (and may add more, like threshold-based approval
 * routing — that is not part of this schema).
 */
export const wasteAdjustmentSchema = z
  .object({
    event_at: z.string().min(1),
    direction: z.enum(ADJUSTMENT_DIRECTIONS),
    item_id: z.string().min(1, "Choose an item"),
    quantity: z.coerce.number().positive("Quantity must be positive"),
    unit: z.enum(UOMS),
    reason_code: z.enum(ADJUSTMENT_REASONS, { message: "Reason is required" }),
    notes: z.string().optional(),
  })
  .superRefine((v, ctx) => {
    if (v.direction === "positive" && !v.notes) {
      ctx.addIssue({
        code: "custom",
        path: ["notes"],
        message: "Notes are required for positive corrections.",
      });
    }
    if (v.reason_code === "other" && !v.notes) {
      ctx.addIssue({
        code: "custom",
        path: ["notes"],
        message: "Notes are required when reason is 'other'.",
      });
    }
  });

export type WasteAdjustmentFormValues = z.infer<typeof wasteAdjustmentSchema>;

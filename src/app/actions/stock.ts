"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";

import { requireMembership } from "@/lib/auth";
import { safeActionError } from "@/lib/action-error";
import { revalidateWorkspaceData } from "@/lib/cached-data";
import { STOCK_ADJUSTMENT_REASONS } from "@/lib/stock-reasons";
import { createClient } from "@/lib/supabase/server";

const stockAdjustmentSchema = z.object({
  skuId: z.string().uuid(),
  locationId: z.string().uuid(),
  movement: z.coerce.number().int().min(-100000).max(100000).refine((value) => value !== 0),
  expectedQuantity: z.coerce.number().int().min(0).max(100000000).optional(),
  reason: z.enum(STOCK_ADJUSTMENT_REASONS),
  note: z.string().max(500).optional(),
});

export async function adjustStockAction(input: z.infer<typeof stockAdjustmentSchema>) {
  const membership = await requireMembership();

  if (membership.role === "viewer") {
    return { ok: false, error: "Viewer access is read-only." };
  }

  const parsed = stockAdjustmentSchema.safeParse(input);

  if (!parsed.success) {
    return { ok: false, error: "Enter a valid stock quantity." };
  }

  const supabase = await createClient();
  const { error } = await supabase.rpc("adjust_stock", {
    p_organization_id: membership.organization_id,
    p_sku_id: parsed.data.skuId,
    p_location_id: parsed.data.locationId,
    p_delta: parsed.data.movement,
    p_reason: parsed.data.reason,
    p_note: parsed.data.note || null,
    p_expected_quantity: parsed.data.expectedQuantity ?? null,
  });

  if (error) {
    return { ok: false, error: safeActionError(error, "adjustStockAction.rpc", "Stock could not be updated.") };
  }

  revalidateWorkspaceData(membership.organization_id);
  revalidatePath("/");
  revalidatePath("/sku");
  revalidatePath("/reports");

  return { ok: true };
}

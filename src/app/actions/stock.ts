"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";

import { requireMembership } from "@/lib/auth";
import { STOCK_ADJUSTMENT_REASONS } from "@/lib/stock-reasons";
import { createClient } from "@/lib/supabase/server";

const stockAdjustmentSchema = z.object({
  skuId: z.string().uuid(),
  locationId: z.string().uuid(),
  movement: z.coerce.number().int().min(-100000).max(100000).refine((value) => value !== 0),
  reason: z.enum(STOCK_ADJUSTMENT_REASONS),
  note: z.string().max(500).optional(),
});

export async function adjustStockAction(input: z.infer<typeof stockAdjustmentSchema>) {
  const membership = await requireMembership();
  const parsed = stockAdjustmentSchema.safeParse(input);

  if (!parsed.success) {
    return { ok: false, error: "Enter a valid stock quantity." };
  }

  const supabase = await createClient();
  const { data: inventoryRow, error: inventoryError } = await supabase
    .from("inventory_levels")
    .select("id")
    .eq("organization_id", membership.organization_id)
    .eq("sku_id", parsed.data.skuId)
    .eq("location_id", parsed.data.locationId)
    .maybeSingle();

  if (inventoryError || !inventoryRow) {
    return { ok: false, error: "Inventory row is not available in the selected workspace." };
  }

  const { error } = await supabase.rpc("adjust_stock", {
    p_sku_id: parsed.data.skuId,
    p_location_id: parsed.data.locationId,
    p_delta: parsed.data.movement,
    p_reason: parsed.data.reason,
    p_note: parsed.data.note || null,
  });

  if (error) {
    return { ok: false, error: error.message };
  }

  revalidatePath("/");
  revalidatePath("/sku");

  return { ok: true };
}

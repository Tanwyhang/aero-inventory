"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";

import { requireMembership } from "@/lib/auth";
import { STOCK_ADJUSTMENT_REASONS } from "@/lib/stock-reasons";
import { createClient } from "@/lib/supabase/server";

const stockAdjustmentSchema = z.object({
  skuId: z.string().uuid(),
  locationId: z.string().uuid(),
  direction: z.enum(["add", "deduct"]),
  quantity: z.coerce.number().int().positive().max(100000),
  reason: z.enum(STOCK_ADJUSTMENT_REASONS),
  note: z.string().max(500).optional(),
});

export async function adjustStockAction(input: z.infer<typeof stockAdjustmentSchema>) {
  await requireMembership();
  const parsed = stockAdjustmentSchema.safeParse(input);

  if (!parsed.success) {
    return { ok: false, error: "Enter a valid stock quantity." };
  }

  const supabase = await createClient();
  const delta = parsed.data.direction === "add" ? parsed.data.quantity : -parsed.data.quantity;
  const { error } = await supabase.rpc("adjust_stock", {
    p_sku_id: parsed.data.skuId,
    p_location_id: parsed.data.locationId,
    p_delta: delta,
    p_reason: parsed.data.reason,
    p_note: parsed.data.note || null,
  });

  if (error) {
    return { ok: false, error: error.message };
  }

  revalidatePath("/");

  return { ok: true };
}

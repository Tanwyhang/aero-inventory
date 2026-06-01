"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";

import { requireMembership } from "@/lib/auth";
import { createClient } from "@/lib/supabase/server";
import type { RestockStatus } from "@/types/database";

const createRestockRequestSchema = z.object({
  skuId: z.string().uuid(),
  locationId: z.string().uuid(),
  requestedQty: z.coerce.number().int().positive().max(100000).optional().or(z.literal("").transform(() => undefined)),
  note: z.string().max(500).optional(),
});

const updateRestockStatusSchema = z.object({
  requestId: z.string().uuid(),
  status: z.enum(["open", "acknowledged", "ordered", "resolved", "cancelled"]),
  comment: z.string().max(500).optional(),
});

export async function createRestockRequestAction(input: z.input<typeof createRestockRequestSchema>) {
  await requireMembership();
  const parsed = createRestockRequestSchema.safeParse(input);

  if (!parsed.success) {
    return { ok: false, error: "Enter a valid request." };
  }

  const supabase = await createClient();
  const { error } = await supabase.rpc("create_restock_request", {
    p_sku_id: parsed.data.skuId,
    p_location_id: parsed.data.locationId,
    p_requested_qty: parsed.data.requestedQty ?? null,
    p_note: parsed.data.note || null,
  });

  if (error) {
    return { ok: false, error: error.message };
  }

  revalidatePath("/");
  revalidatePath("/reports");

  return { ok: true };
}

export async function updateRestockStatusAction(input: { requestId: string; status: RestockStatus; comment?: string }) {
  const membership = await requireMembership();

  if (membership.role !== "admin") {
    return { ok: false, error: "Admin access required." };
  }

  const parsed = updateRestockStatusSchema.safeParse(input);

  if (!parsed.success) {
    return { ok: false, error: "Enter a valid status update." };
  }

  const supabase = await createClient();
  const { error } = await supabase.rpc("update_restock_request_status", {
    p_request_id: parsed.data.requestId,
    p_status: parsed.data.status,
    p_comment: parsed.data.comment || null,
  });

  if (error) {
    return { ok: false, error: error.message };
  }

  revalidatePath("/");
  revalidatePath("/reports");

  return { ok: true };
}

"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";

import { requireMembership } from "@/lib/auth";
import { safeActionError } from "@/lib/action-error";
import { normalizeWhatsAppNumber } from "@/lib/phone";
import { createClient } from "@/lib/supabase/server";
import type { PartnerShareStatus } from "@/types/database";

const partnerSchema = z.object({
  partnerId: z.string().uuid().optional(),
  name: z.string().trim().min(1).max(160),
  contactName: z.string().trim().max(120).optional(),
  phoneRaw: z.string().trim().max(60).optional(),
  notes: z.string().trim().max(500).optional(),
});

const sheetSchema = z.object({
  partnerId: z.string().uuid(),
  locationId: z.string().uuid(),
  shareDate: z.string().trim().min(1).max(20),
});

const addItemSchema = z.object({
  sheetId: z.string().uuid(),
  skuId: z.string().uuid(),
  shareQty: z.coerce.number().int().positive().max(100000),
  remark: z.string().trim().max(500).optional(),
});

const updateItemSchema = z.object({
  itemId: z.string().uuid(),
  shareQty: z.coerce.number().int().positive().max(100000),
  remark: z.string().trim().max(500).optional(),
});

const statusSchema = z.object({
  sheetId: z.string().uuid(),
  status: z.enum(["draft", "confirmed", "sent", "completed"]),
});

const autoSyncSchema = z.object({
  sheetId: z.string().uuid(),
  autoSyncWithMainStore: z.boolean(),
});

const outputSchema = z.object({
  sheetId: z.string().uuid(),
  outputType: z.enum(["whatsapp_copy", "excel_export"]),
});

function revalidatePartnerShare() {
  revalidatePath("/");
  revalidatePath("/partner-share");
  revalidatePath("/reports");
}

function requireAdmin(role: string) {
  return role === "admin" ? null : { ok: false as const, error: "Admin access required." };
}

async function existsInSelectedWorkspace(
  table: "partners" | "partner_share_sheets" | "partner_share_items" | "skus" | "locations",
  id: string,
  organizationId: string,
) {
  const supabase = await createClient();
  const { data, error } = await supabase.from(table).select("id").eq("id", id).eq("organization_id", organizationId).maybeSingle();
  if (error) safeActionError(error, `partner-share.${table}.workspace-check`, "Unable to verify this record.");
  return !error && Boolean(data);
}

export async function savePartnerAction(input: z.input<typeof partnerSchema>) {
  const membership = await requireMembership();
  const adminError = requireAdmin(membership.role);
  if (adminError) return adminError;

  const parsed = partnerSchema.safeParse(input);
  if (!parsed.success) return { ok: false, error: "Enter valid partner details." };

  const supabase = await createClient();
  if (parsed.data.partnerId && !(await existsInSelectedWorkspace("partners", parsed.data.partnerId, membership.organization_id))) {
    return { ok: false, error: "Partner is not available in the selected workspace." };
  }

  const whatsapp = parsed.data.phoneRaw ? normalizeWhatsAppNumber("MY", parsed.data.phoneRaw) : "";
  const rpcName = parsed.data.partnerId ? "admin_update_partner" : "admin_create_partner";
  const args = parsed.data.partnerId
    ? {
        p_partner_id: parsed.data.partnerId,
        p_name: parsed.data.name,
        p_contact_name: parsed.data.contactName || null,
        p_phone_raw: parsed.data.phoneRaw || null,
        p_whatsapp_number: whatsapp || null,
        p_notes: parsed.data.notes || null,
      }
    : {
        p_organization_id: membership.organization_id,
        p_name: parsed.data.name,
        p_contact_name: parsed.data.contactName || null,
        p_phone_raw: parsed.data.phoneRaw || null,
        p_whatsapp_number: whatsapp || null,
        p_notes: parsed.data.notes || null,
      };
  const { data, error } = await supabase.rpc(rpcName, args);

  if (error) return { ok: false, error: safeActionError(error, "partner-share.save-partner", "Partner could not be saved.") };
  revalidatePartnerShare();
  return { ok: true, partnerId: data };
}

export async function archivePartnerAction(partnerId: string) {
  const membership = await requireMembership();
  const adminError = requireAdmin(membership.role);
  if (adminError) return adminError;

  const parsed = z.string().uuid().safeParse(partnerId);
  if (!parsed.success) return { ok: false, error: "Choose a valid partner." };

  const supabase = await createClient();
  if (!(await existsInSelectedWorkspace("partners", parsed.data, membership.organization_id))) {
    return { ok: false, error: "Partner is not available in the selected workspace." };
  }

  const { error } = await supabase.rpc("admin_archive_partner", { p_partner_id: parsed.data });
  if (error) return { ok: false, error: safeActionError(error, "partner-share.archive-partner", "Partner could not be archived.") };
  revalidatePartnerShare();
  return { ok: true };
}

export async function createPartnerShareSheetAction(input: z.input<typeof sheetSchema>) {
  const membership = await requireMembership();
  const adminError = requireAdmin(membership.role);
  if (adminError) return adminError;

  const parsed = sheetSchema.safeParse(input);
  if (!parsed.success) return { ok: false, error: "Enter valid sheet details." };

  const supabase = await createClient();
  const [partnerExists, locationExists] = await Promise.all([
    existsInSelectedWorkspace("partners", parsed.data.partnerId, membership.organization_id),
    existsInSelectedWorkspace("locations", parsed.data.locationId, membership.organization_id),
  ]);

  if (!partnerExists || !locationExists) {
    return { ok: false, error: "Partner or location is not available in the selected workspace." };
  }

  const { data, error } = await supabase.rpc("admin_create_partner_share_sheet", {
    p_partner_id: parsed.data.partnerId,
    p_location_id: parsed.data.locationId,
    p_share_date: parsed.data.shareDate,
  });

  if (error) return { ok: false, error: safeActionError(error, "partner-share.create-sheet", "Share sheet could not be created.") };
  revalidatePartnerShare();
  return { ok: true, sheetId: data };
}

export async function addPartnerShareItemAction(input: z.input<typeof addItemSchema>) {
  const membership = await requireMembership();
  const adminError = requireAdmin(membership.role);
  if (adminError) return adminError;

  const parsed = addItemSchema.safeParse(input);
  if (!parsed.success) return { ok: false, error: "Enter valid product and share quantity." };

  const supabase = await createClient();
  const [sheetExists, skuExists] = await Promise.all([
    existsInSelectedWorkspace("partner_share_sheets", parsed.data.sheetId, membership.organization_id),
    existsInSelectedWorkspace("skus", parsed.data.skuId, membership.organization_id),
  ]);

  if (!sheetExists || !skuExists) {
    return { ok: false, error: "Sheet or product is not available in the selected workspace." };
  }

  const { error } = await supabase.rpc("admin_add_partner_share_item", {
    p_sheet_id: parsed.data.sheetId,
    p_sku_id: parsed.data.skuId,
    p_share_qty: parsed.data.shareQty,
    p_remark: parsed.data.remark || null,
  });

  if (error) return { ok: false, error: safeActionError(error, "partner-share.add-item", "Product could not be added.") };
  revalidatePartnerShare();
  return { ok: true };
}

export async function updatePartnerShareItemAction(input: z.input<typeof updateItemSchema>) {
  const membership = await requireMembership();
  const adminError = requireAdmin(membership.role);
  if (adminError) return adminError;

  const parsed = updateItemSchema.safeParse(input);
  if (!parsed.success) return { ok: false, error: "Enter valid item details." };

  const supabase = await createClient();
  if (!(await existsInSelectedWorkspace("partner_share_items", parsed.data.itemId, membership.organization_id))) {
    return { ok: false, error: "Partner share item is not available in the selected workspace." };
  }

  const { error } = await supabase.rpc("admin_update_partner_share_item", {
    p_item_id: parsed.data.itemId,
    p_share_qty: parsed.data.shareQty,
    p_remark: parsed.data.remark || null,
  });

  if (error) return { ok: false, error: safeActionError(error, "partner-share.update-item", "Share item could not be updated.") };
  revalidatePartnerShare();
  return { ok: true };
}

export async function removePartnerShareItemAction(itemId: string) {
  const membership = await requireMembership();
  const adminError = requireAdmin(membership.role);
  if (adminError) return adminError;

  const parsed = z.string().uuid().safeParse(itemId);
  if (!parsed.success) return { ok: false, error: "Choose a valid item." };

  const supabase = await createClient();
  if (!(await existsInSelectedWorkspace("partner_share_items", parsed.data, membership.organization_id))) {
    return { ok: false, error: "Partner share item is not available in the selected workspace." };
  }

  const { error } = await supabase.rpc("admin_remove_partner_share_item", { p_item_id: parsed.data });
  if (error) return { ok: false, error: safeActionError(error, "partner-share.remove-item", "Product could not be removed.") };
  revalidatePartnerShare();
  return { ok: true };
}

export async function updatePartnerShareStatusAction(input: { sheetId: string; status: PartnerShareStatus }) {
  const membership = await requireMembership();
  const adminError = requireAdmin(membership.role);
  if (adminError) return adminError;

  const parsed = statusSchema.safeParse(input);
  if (!parsed.success) return { ok: false, error: "Choose a valid status." };

  const supabase = await createClient();
  if (!(await existsInSelectedWorkspace("partner_share_sheets", parsed.data.sheetId, membership.organization_id))) {
    return { ok: false, error: "Partner share sheet is not available in the selected workspace." };
  }

  const { error } = await supabase.rpc("admin_update_partner_share_status", {
    p_sheet_id: parsed.data.sheetId,
    p_status: parsed.data.status,
  });

  if (error) return { ok: false, error: safeActionError(error, "partner-share.update-status", "Share status could not be updated.") };
  revalidatePartnerShare();
  return { ok: true };
}

export async function updatePartnerShareAutoSyncAction(input: z.input<typeof autoSyncSchema>) {
  const membership = await requireMembership();
  const adminError = requireAdmin(membership.role);
  if (adminError) return adminError;

  const parsed = autoSyncSchema.safeParse(input);
  if (!parsed.success) return { ok: false, error: "Choose a valid auto-sync setting." };

  const supabase = await createClient();
  if (!(await existsInSelectedWorkspace("partner_share_sheets", parsed.data.sheetId, membership.organization_id))) {
    return { ok: false, error: "Partner share sheet is not available in the selected workspace." };
  }

  const { error } = await supabase.rpc("admin_set_partner_share_auto_sync", {
    p_sheet_id: parsed.data.sheetId,
    p_auto_sync_with_main_store: parsed.data.autoSyncWithMainStore,
  });

  if (error) return { ok: false, error: safeActionError(error, "partner-share.auto-sync", "Auto-sync could not be updated.") };
  revalidatePartnerShare();
  return { ok: true };
}

export async function deductPartnerShareStockAction(sheetId: string) {
  const membership = await requireMembership();
  const adminError = requireAdmin(membership.role);
  if (adminError) return adminError;

  const parsed = z.string().uuid().safeParse(sheetId);
  if (!parsed.success) return { ok: false, error: "Choose a valid sheet." };

  const supabase = await createClient();
  if (!(await existsInSelectedWorkspace("partner_share_sheets", parsed.data, membership.organization_id))) {
    return { ok: false, error: "Partner share sheet is not available in the selected workspace." };
  }

  const { error } = await supabase.rpc("admin_deduct_partner_share_stock", { p_sheet_id: parsed.data });
  if (error) return { ok: false, error: safeActionError(error, "partner-share.deduct-stock", "Stock could not be deducted.") };
  revalidatePartnerShare();
  return { ok: true };
}

export async function recordPartnerShareOutputAction(input: z.input<typeof outputSchema>) {
  const membership = await requireMembership();

  const parsed = outputSchema.safeParse(input);
  if (!parsed.success) return { ok: false, error: "Choose a valid output action." };

  const supabase = await createClient();
  if (!(await existsInSelectedWorkspace("partner_share_sheets", parsed.data.sheetId, membership.organization_id))) {
    return { ok: false, error: "Partner share sheet is not available in the selected workspace." };
  }

  const { error } = await supabase.rpc("admin_record_partner_share_output", {
    p_sheet_id: parsed.data.sheetId,
    p_output_type: parsed.data.outputType,
  });

  if (error) return { ok: false, error: safeActionError(error, "partner-share.record-output", "Output could not be recorded.") };
  revalidatePartnerShare();
  return { ok: true };
}
